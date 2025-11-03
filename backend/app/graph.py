from __future__ import annotations

import json
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


# -------- helpers --------
def _vm(state: AnalysisState, *, status: str) -> dict:
    """UI用VMを state から構築して返す（STATE_SNAPSHOTで常時流れる）"""
    steps: list[StepItem] = state.get("steps", [])
    result: AnalysisResult | None = state.get("aggregated") or {
        "characters": state.get("characters", []),
        "scenes": state.get("scenes", []),
        "generated_at": None,
    }
    return {
        "status": status,
        "steps": steps,
        "result": result,
        "approval": state.get("approval") if status == "awaiting-approval" else None,
        "error": state.get("error") if status == "error" else None,
    }


def _set_step(steps: list[StepItem], name: str, status: str) -> list[StepItem]:
    new = list(steps)
    for i, s in enumerate(new):
        if s["name"] == name:
            new[i] = {"name": name, "status": status}
            return new
    new.append({"name": name, "status": status})
    return new


def build_agent_graph(settings: Settings) -> StateGraph[AnalysisState]:
    llm = ChatOpenAI(model=settings.openai_model, temperature=0, api_key=settings.openai_api_key)

    chunk_chain = CHUNK_ANALYSIS_PROMPT | llm.with_structured_output(_ChunkAnalysisModel)
    aggregation_chain = AGGREGATION_PROMPT | llm.with_structured_output(_AggregatedModel)

    builder: StateGraph[AnalysisState] = StateGraph(AnalysisState)

    # ---- nodes ----
    def load_files(state: AnalysisState) -> AnalysisState:
        paths = read_text_files(settings.resolved_project_dir)
        chunks = build_chunks(paths)
        steps = _set_step(state.get("steps", []), "load_files", "completed")
        out: AnalysisState = {
            "chunk_inputs": chunks,
            "expected_chunks": len(chunks),
            "steps": steps,
            "characters": [],
            "scenes": [],
            "aggregated": {"characters": [], "scenes": [], "generated_at": None},
            "output_path": None,
        }
        # running（次フェーズへ）
        out.update(_vm({**state, **out}, status="running"))
        return out

    def request_approval(state: AnalysisState) -> AnalysisState:
        """
        Human-in-the-loop の承認は LangGraph の interrupt を素直に使う。
        ここでは STATE をいじらず、CUSTOM(on_interrupt) イベントだけでフロントに通知する。
        """
        if state.get("approval"):
            return {}

        chunk_inputs = state.get("chunk_inputs", [])
        req: ApprovalRequest = {
            "type": "analysis_approval",
            "chunkCount": len(chunk_inputs),
            "totalCharacters": sum(len(ch.text) for ch in chunk_inputs),
            "files": sorted({ch.path.name for ch in chunk_inputs}),
        }

        # フロントは CUSTOM(on_interrupt) を受けてダイアログを開く
        resp: ApprovalResponse = interrupt(req)

        # 承認結果だけ state に反映（以降の分岐用）
        if not resp.get("approved"):
            # 中止→空結果で aggregate へ
            return {"approval": {"approved": False}}
        return {"approval": resp}

    def dispatch_chunks(state: AnalysisState) -> AnalysisState:
        steps = _set_step(state.get("steps", []), "analyze", "running")
        return {"steps": steps}

    def route_dispatch(state: AnalysisState) -> list[Any]:
        approval = state.get("approval")
        if approval and not approval.get("approved", True):
            return ["to_aggregate"]

        chunk_inputs = state.get("chunk_inputs", [])
        if not chunk_inputs:
            return ["to_aggregate"]
        return [Send("analyze_chunk", {"chunk_payload": chunk}) for chunk in chunk_inputs]

    def analyze_chunk(state: AnalysisState) -> AnalysisState:
        chunk: ChunkPayload = state["chunk_payload"]
        raw = chunk_chain.invoke({"chunk": chunk.text})
        result: ChunkAnalysis = {
            "chunk_id": chunk.identifier,
            "source_path": str(chunk.path),
            "characters": [c.model_dump() for c in raw.characters],
            "scenes": [s.model_dump() for s in raw.scenes],
        }
        return {"chunk_results": [result]}

    def aggregate_results(state: AnalysisState) -> AnalysisState:
        steps = _set_step(state.get("steps", []), "analyze", "completed")
        steps = _set_step(steps, "aggregate", "running")

        chunk_results = state.get("chunk_results", [])
        if not chunk_results:
            aggregated: AnalysisResult = {
                "characters": [],
                "scenes": [],
                "generated_at": datetime.utcnow().isoformat(),
            }
        else:
            summary = aggregation_chain.invoke(
                {"partials": json.dumps(chunk_results, ensure_ascii=False, indent=2)}
            )
            aggregated = {
                "characters": [p.model_dump() for p in summary.characters],
                "scenes": [s.model_dump() for s in summary.scenes],
                "generated_at": datetime.utcnow().isoformat(),
            }
        out: AnalysisState = {
            "aggregated": aggregated,
            "characters": aggregated["characters"],
            "scenes": aggregated["scenes"],
            "steps": steps,
        }
        out.update(_vm({**state, **out}, status="running"))
        return out

    def persist(state: AnalysisState) -> AnalysisState:
        steps = _set_step(state.get("steps", []), "aggregate", "completed")
        aggregated = state.get("aggregated") or {
            "characters": [],
            "scenes": [],
            "generated_at": None,
        }
        output_path: str | None = None
        if aggregated:
            path = (
                settings.resolved_output_dir
                / f"analysis-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.json"
            )
            path.write_text(json.dumps(aggregated, ensure_ascii=False, indent=2), encoding="utf-8")
            output_path = str(path)
        out: AnalysisState = {"output_path": output_path, "steps": steps}
        out.update(_vm({**state, **out}, status="completed"))
        return out

    # ---- graph wiring ----
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
        "dispatch_chunks", route_dispatch, path_map={"to_aggregate": "aggregate_results"}
    )
    builder.add_edge("analyze_chunk", "aggregate_results")
    builder.add_edge("aggregate_results", "persist")
    builder.add_edge("persist", END)

    compiled = builder.compile(checkpointer=MemorySaver())
    return compiled


# ---- Structured output models ----
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
