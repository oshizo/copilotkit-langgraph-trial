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
    StepItem,
)
from .prompts import AGGREGATION_PROMPT, CHUNK_ANALYSIS_PROMPT
from .text_loader import build_chunks, read_text_files


# ---- helpers -----------------------------------------------------------------
def _set_step(state: AnalysisState, name: str, status: str) -> list[StepItem]:
    """UI向けに steps を state に入れる（同名は上書き）"""
    steps = list(state.get("steps", []))
    names = [s["name"] for s in steps]
    if name in names:
        idx = names.index(name)
        steps[idx] = {"name": name, "status": status}
    else:
        steps.append({"name": name, "status": status})
    return steps


def build_agent_graph(settings: Settings) -> StateGraph[AnalysisState]:
    llm = ChatOpenAI(model=settings.openai_model, temperature=0, api_key=settings.openai_api_key)

    chunk_chain = CHUNK_ANALYSIS_PROMPT | llm.with_structured_output(_ChunkAnalysisModel)
    aggregation_chain = AGGREGATION_PROMPT | llm.with_structured_output(_AggregatedModel)

    builder: StateGraph[AnalysisState] = StateGraph(AnalysisState)

    def load_files(state: AnalysisState) -> AnalysisState:
        paths = read_text_files(settings.resolved_project_dir)
        chunks = build_chunks(paths)
        steps = _set_step(state, "load_files", "completed")
        return {
            "chunk_inputs": chunks,
            "expected_chunks": len(chunks),
            "steps": steps,
            # スナップショットに空配列でも確実に出す
            "characters": state.get("characters", []),
            "scenes": state.get("scenes", []),
            "aggregated": state.get("aggregated")
            or {
                "characters": [],
                "scenes": [],
                "generated_at": None,
            },
            "output_path": state.get("output_path"),
        }

    def request_approval(state: AnalysisState) -> AnalysisState:
        if state.get("approval"):
            return {}
        chunk_inputs = state.get("chunk_inputs", [])
        request: ApprovalRequest = {
            "type": "analysis_approval",
            "chunkCount": len(chunk_inputs),
            "totalCharacters": sum(len(chunk.text) for chunk in chunk_inputs),
            "files": sorted({chunk.path.name for chunk in chunk_inputs}),
        }
        response: ApprovalResponse = interrupt(request)
        if not response.get("approved"):
            # ユーザーが中止 → 集約のみ通して空結果を返す
            return {"approval": {"approved": False}}
        return {"approval": response}

    def dispatch_chunks(state: AnalysisState) -> AnalysisState:
        # 分析フェーズ開始（UI表示用）
        steps = _set_step(state, "analyze_chunks", "running")
        return {"steps": steps}

    def route_dispatch(state: AnalysisState) -> Iterable[Any]:
        approval = state.get("approval")
        if approval and not approval.get("approved", True):
            return ["to_aggregate"]

        chunk_inputs = state.get("chunk_inputs", [])
        if not chunk_inputs:
            return ["to_aggregate"]
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
        # analyze_chunks を completed にし、aggregate を running に
        steps = _set_step(state, "analyze_chunks", "completed")
        steps = _set_step({"steps": steps}, "aggregate", "running")

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
            "steps": steps,
        }

    def persist(state: AnalysisState) -> AnalysisState:
        # aggregate を completed に
        steps = _set_step(state, "aggregate", "completed")

        aggregated = state.get("aggregated")
        if not aggregated:
            return {"steps": steps}
        output_path = (
            settings.resolved_output_dir
            / f"analysis-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.json"
        )
        output_path.write_text(
            json.dumps(aggregated, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return {"output_path": str(output_path), "steps": steps}

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
        path_map={"to_aggregate": "aggregate_results"},
    )
    builder.add_edge("analyze_chunk", "aggregate_results")
    builder.add_edge("aggregate_results", "persist")
    builder.add_edge("persist", END)

    compiled = builder.compile(checkpointer=MemorySaver())
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
