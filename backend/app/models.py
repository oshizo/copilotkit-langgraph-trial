from __future__ import annotations

import operator
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Annotated, List, Optional, Sequence, TypedDict

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
    characters: List[CharacterProfile]
    scenes: List[SceneSummary]


class AnalysisResult(TypedDict):
    characters: List[CharacterProfile]
    scenes: List[SceneSummary]
    generated_at: str


class AnalysisState(TypedDict, total=False):
    """LangGraph state shared by all nodes."""

    messages: Annotated[List[BaseMessage], add_messages]
    tools: list
    chunk_inputs: List["ChunkPayload"]
    expected_chunks: int
    chunk_results: Annotated[List[ChunkAnalysis], operator.add]
    approval: Optional[dict]
    aggregated: Optional[AnalysisResult]
    output_path: Optional[str]
    characters: List[CharacterProfile]
    scenes: List[SceneSummary]


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
    chunk_count: int
    total_characters: int
    files: List[str]


class ApprovalResponse(TypedDict, total=False):
    approved: bool
