"""BGE-M3 embedder — lazy import, returns None when the model isn't installed.

Role C ships:
  - The BGE-M3 model (via sentence-transformers, downloaded on first use)
  - The corpus + embeddings via app/rag/loader.py

This module is only loaded inside try-blocks in the retriever — its
absence is non-fatal. Embedding dimension is 1024 (matches the pgvector
column type in db/migrations/002_plan3_rag.sql).
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Sequence

logger = logging.getLogger(__name__)

EMBED_DIM = 1024
DEFAULT_MODEL = os.getenv("RAG_EMBED_MODEL", "BAAI/bge-m3")


@lru_cache(maxsize=1)
def _model():
    """Load the sentence-transformer once; cached for the process lifetime."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:  # noqa: F841 — kept for clarity
        logger.info(
            "sentence-transformers not installed; RAG retrieval will use "
            "the keyword-tag fallback corpus."
        )
        return None
    try:
        return SentenceTransformer(DEFAULT_MODEL)
    except Exception as exc:
        logger.warning("Failed to load embedding model '%s': %s", DEFAULT_MODEL, exc)
        return None


def embed_query(text: str) -> list[float] | None:
    """Embed a single query. Returns None when the model isn't available."""
    m = _model()
    if m is None:
        return None
    try:
        vec = m.encode([text], normalize_embeddings=True)[0]
        return [float(x) for x in vec]
    except Exception as exc:
        logger.warning("Embedding query failed: %s", exc)
        return None


def embed_batch(texts: Sequence[str]) -> list[list[float]] | None:
    """Embed a batch — used by the corpus loader."""
    m = _model()
    if m is None:
        return None
    try:
        mat = m.encode(list(texts), normalize_embeddings=True, batch_size=8)
        return [[float(x) for x in v] for v in mat]
    except Exception as exc:
        logger.warning("Embedding batch failed: %s", exc)
        return None
