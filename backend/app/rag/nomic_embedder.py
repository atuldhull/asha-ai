"""Plan 6.5 Phase D — nomic-embed-text-v1.5 embedder · 768-dim.

Replaces the Plan 3.0 BGE-M3 (1024-dim) embedder for the RAG 2.0 path. The
existing `app/rag/embedder.py` stays in place for the legacy ChromaDB index;
this module powers the Qdrant hybrid collection.

Key feature: **task prefixes**. nomic-embed REQUIRES one of:
  - `search_query: <text>`   for query-time embedding
  - `search_document: <text>` for indexing
  - `classification: <text>` (unused here)
  - `clustering: <text>`     (unused here)

Forgetting the prefix degrades retrieval quality measurably — this module
makes it impossible to forget by exposing `embed_for_search()` +
`embed_for_indexing()` as the only public functions.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Sequence

logger = logging.getLogger(__name__)

EMBED_DIM = 768
DEFAULT_MODEL = os.getenv("NOMIC_MODEL", "nomic-ai/nomic-embed-text-v1.5")


@lru_cache(maxsize=1)
def _model():
    """Lazy-load nomic-embed. Returns None if sentence-transformers absent."""
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        logger.info(
            "nomic_embedder: sentence-transformers not installed — "
            "RAG 2.0 retrieval will fall back to chroma_legacy via "
            "RAG_BACKEND env flag."
        )
        return None
    try:
        # trust_remote_code required by nomic; the model registers a custom
        # tokenizer + pooling head not part of stock transformers.
        return SentenceTransformer(DEFAULT_MODEL, trust_remote_code=True)
    except Exception:
        logger.exception("nomic_embedder: load failed for model '%s'", DEFAULT_MODEL)
        return None


def _embed_with_prefix(prefix: str, texts: Sequence[str]) -> list[list[float]] | None:
    m = _model()
    if m is None:
        return None
    prefixed = [f"{prefix} {t}" for t in texts]
    try:
        mat = m.encode(prefixed, normalize_embeddings=True, batch_size=16)
        return [[float(x) for x in v] for v in mat]
    except Exception:
        logger.exception("nomic_embedder: encode failed for prefix=%s", prefix)
        return None


def embed_for_search(text: str) -> list[float] | None:
    """Query-time embedding. Use this for incoming patient queries.

    Returns None when the model isn't installed — caller falls back to
    chroma_legacy or tag-based retrieval.
    """
    result = _embed_with_prefix("search_query:", [text])
    return result[0] if result else None


def embed_for_indexing(text: str) -> list[float] | None:
    """Index-time embedding. Use this for SNOMED corpus entries.

    Returns None when the model isn't installed.
    """
    result = _embed_with_prefix("search_document:", [text])
    return result[0] if result else None


def embed_documents_batch(texts: Sequence[str]) -> list[list[float]] | None:
    """Batch-embed for the Qdrant index-building script."""
    return _embed_with_prefix("search_document:", texts)


def is_available() -> bool:
    return _model() is not None
