from __future__ import annotations

import math
import uuid
from pathlib import Path
from typing import Iterable, List

from .models import ChunkPayload


def read_text_files(directory: Path) -> List[Path]:
    """Return a sorted list of text files in the directory."""
    return sorted(path for path in directory.glob("**/*.txt") if path.is_file())


def chunk_text(text: str, *, max_chars: int = 20000) -> Iterable[str]:
    """Yield chunks of text limited by max_chars, splitting on paragraph boundaries when possible."""
    if len(text) <= max_chars:
        yield text
        return

    paragraphs = text.split("\n\n")
    buffer: List[str] = []
    current_len = 0

    for paragraph in paragraphs:
        paragraph_len = len(paragraph)
        if current_len + paragraph_len + 2 > max_chars and buffer:
            yield "\n\n".join(buffer)
            buffer = [paragraph]
            current_len = paragraph_len
        else:
            buffer.append(paragraph)
            current_len += paragraph_len + 2

    if buffer:
        yield "\n\n".join(buffer)


def build_chunks(paths: List[Path], *, max_chars: int = 20000) -> List[ChunkPayload]:
    chunks: List[ChunkPayload] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        for order, chunk in enumerate(chunk_text(text, max_chars=max_chars)):
            chunk_id = f"{path.stem}-{order}-{uuid.uuid4().hex[:6]}"
            chunks.append(ChunkPayload(identifier=chunk_id, path=path, order=order, text=chunk))
    return chunks
