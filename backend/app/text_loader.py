from __future__ import annotations

import uuid
from pathlib import Path

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .models import ChunkPayload


def read_text_files(directory: Path) -> list[Path]:
    """Return a sorted list of text files in the directory."""
    return sorted(path for path in directory.glob("**/*.txt") if path.is_file())


def build_chunks(paths: list[Path], *, max_chars: int = 20000) -> list[ChunkPayload]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=max_chars,
        chunk_overlap=min(200, max_chars // 10),
        separators=["\n\n", "\n", "。", "、", " "],
    )

    chunks: list[ChunkPayload] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        documents = splitter.split_documents(
            [Document(page_content=text, metadata={"source_path": str(path)})]
        )
        for order, document in enumerate(documents):
            chunk_id = f"{path.stem}-{order}-{uuid.uuid4().hex[:6]}"
            chunks.append(
                ChunkPayload(
                    identifier=chunk_id,
                    path=path,
                    order=order,
                    text=document.page_content,
                )
            )
    return chunks
