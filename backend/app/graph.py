from __future__ import annotations

import json
from collections.abc import Iterable
from datetime import datetime
from typing import Any

from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.constants import END, START
from langgraph.graph import StateGraph
from langgraph.types import Send, interrupt
from pydantic import BaseModel, Field

from .config import Settings
from .models import (
    AnalysisResult,
    AnalysisState,
    ApprovalRequest,
    ApprovalResponse,
    ChunkAnalysis,
    ChunkPayload,
)
from .prompts import AGGREGATION_PROMPT, CHUNK_ANALYSIS_PROMPT
from .text_loader import build_chunks, read_text_files


def build_agent_graph(settings: Settings) -> StateGraph[AnalysisState]:
    llm = ChatOpenAI(
        model=settings.openai_model, temperature=0, api_key=settings.openai_api_key
    )

    # OpenAI structured output で Pydantic モデルを直接返す
    chunk_chain = CHUNK_ANALYSIS_PROMPT | llm.with_structured_output(
        _ChunkAnalysisModel
    )
    aggregation_chain = AGGREGATION_PROMPT | llm.with_structured_output(
        _AggregatedModel
    )

    builder: StateGraph[AnalysisState] = StateGraph(AnalysisState)

    def load_files(_: AnalysisState) -> AnalysisState:
        paths = read_text_files(settings.resolved_project_dir)
        chunks = build_chunks(paths)
        return {
            "chunk_inputs": chunks,
            "expected_chunks": len(chunks),
        }

    def request_approval(state: AnalysisState) -> AnalysisState:
        if state.get("approval"):
            return {}

        chunk_inputs = state.get("chunk_inputs", [])
        request: ApprovalRequest = {
            "type": "analysis_approval",
            "chunk_count": len(chunk_inputs),
            "total_characters": sum(len(chunk.text) for chunk in chunk_inputs),
            "files": sorted({chunk.path.name for chunk in chunk_inputs}),
        }
        response: ApprovalResponse = interrupt(request)
        if not response.get("approved"):
            return {"approval": {"approved": False}}
        return {"approval": response}

    def dispatch_chunks(_: AnalysisState) -> AnalysisState:
        return {}

    def route_dispatch(state: AnalysisState) -> Iterable[Any]:
        approval = state.get("approval")
        if approval and not approval.get("approved", True):
            return ["aggregate_results"]

        chunk_inputs = state.get("chunk_inputs", [])
        if not chunk_inputs:
            return ["aggregate_results"]
        sends: list[Any] = [
            Send(
                "analyze_chunk",
                {
                    "chunk_payload": chunk,
                },
            )
            for chunk in chunk_inputs
        ]
        return sends

    def analyze_chunk(state: AnalysisState) -> AnalysisState:
        chunk: ChunkPayload = state["chunk_payload"]
        raw = chunk_chain.invoke({"chunk": chunk.text})
        result: ChunkAnalysis = {
            "chunk_id": chunk.identifier,
            "source_path": str(chunk.path),
            "characters": [profile.model_dump() for profile in raw.characters],
            "scenes": [scene.model_dump() for scene in raw.scenes],
        }
        return {"chunk_results": [result]}

    def aggregate_results(state: AnalysisState) -> AnalysisState:
        chunk_results = state.get("chunk_results", [])
        if not chunk_results:
            aggregated: AnalysisResult = {
                "characters": [],
                "scenes": [],
                "generated_at": datetime.utcnow().isoformat(),
            }
        else:
            summary = aggregation_chain.invoke(
                {
                    "partials": json.dumps(chunk_results, ensure_ascii=False, indent=2),
                }
            )
            aggregated = {
                "characters": [profile.model_dump() for profile in summary.characters],
                "scenes": [scene.model_dump() for scene in summary.scenes],
                "generated_at": datetime.utcnow().isoformat(),
            }
        return {
            "aggregated": aggregated,
            "characters": aggregated["characters"],
            "scenes": aggregated["scenes"],
        }

    def persist(state: AnalysisState) -> AnalysisState:
        aggregated = state.get("aggregated")
        if not aggregated:
            return {}
        output_path = (
            settings.resolved_output_dir
            / f"analysis-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.json"
        )
        output_path.write_text(
            json.dumps(aggregated, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return {"output_path": str(output_path)}

    builder.add_node("load_files", load_files)
    builder.add_node("request_approval", request_approval)
    builder.add_node("dispatch_chunks", dispatch_chunks)
    builder.add_node("analyze_chunk", analyze_chunk)
    builder.add_node("aggregate_results", aggregate_results)
    builder.add_node("persist", persist)

    builder.add_edge(START, "load_files")
    builder.add_edge("load_files", "request_approval")
    builder.add_edge("request_approval", "dispatch_chunks")
    builder.add_conditional_edges(
        "dispatch_chunks",
        route_dispatch,
        path_map={"aggregate_results": "aggregate_results"},
    )
    builder.add_edge("analyze_chunk", "aggregate_results")
    builder.add_edge("aggregate_results", "persist")
    builder.add_edge("persist", END)

    compiled = builder.compile(checkpointer=MemorySaver())
    # compiled.get_graph().print_ascii() # dev only
    return compiled


class _CharacterModel(BaseModel):
    name: str = Field(..., description="Character name")
    description: str = Field(..., description="Short profile")


class _SceneModel(BaseModel):
    title: str = Field(..., description="Scene title or anchor")
    summary: str = Field(..., description="Scene description")


class _ChunkAnalysisModel(BaseModel):
    characters: list[_CharacterModel]
    scenes: list[_SceneModel]


class _AggregatedModel(BaseModel):
    characters: list[_CharacterModel]
    scenes: list[_SceneModel]
