from __future__ import annotations

import operator
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class CharacterProfile(TypedDict):
    name: str
    description: str


class SceneSummary(TypedDict):
    title: str
    summary: str


class ChunkAnalysis(TypedDict):
    chunk_id: str
    source_path: str
    characters: list[CharacterProfile]
    scenes: list[SceneSummary]


class AnalysisResult(TypedDict):
    characters: list[CharacterProfile]
    scenes: list[SceneSummary]
    generated_at: str


class StepItem(TypedDict):
    name: str
    status: str  # "running" | "completed"


class AnalysisState(TypedDict, total=False):
    """LangGraph state shared by all nodes."""

    messages: Annotated[list[BaseMessage], add_messages]
    tools: list
    chunk_inputs: list[ChunkPayload]
    expected_chunks: int
    chunk_results: Annotated[list[ChunkAnalysis], operator.add]
    approval: dict | None
    aggregated: AnalysisResult | None
    output_path: str | None
    characters: list[CharacterProfile]
    scenes: list[SceneSummary]
    steps: list[StepItem]  # ← UI 進捗表示用


@dataclass
class ChunkPayload:
    identifier: str
    path: Path
    order: int
    text: str

    @property
    def metadata(self) -> dict:
        return {
            "chunk_id": self.identifier,
            "source_path": str(self.path),
            "order": self.order,
            "length": len(self.text),
        }


class ApprovalRequest(TypedDict):
    type: str
    chunkCount: int
    totalCharacters: int
    files: list[str]


class ApprovalResponse(TypedDict, total=False):
    approved: bool
