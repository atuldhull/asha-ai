"""Plan 6.5 Phase E — Cross-encoder reranker.

After Qdrant hybrid retrieval returns the top-20 candidates, this module
re-scores them by reading (query, candidate) pairs together — a much more
accurate relevance signal than bi-encoder cosine similarity for medical
domain text.

Target gain per FRONTEND_BLUEPRINT §7 #6: precision@1 ≥ +5pp on the
25-query golden set vs no-rerank baseline. Added latency budget ≤ 120ms
p95 (acceptable trade for accuracy gain).

Model: `cross-encoder/ms-marco-MiniLM-L-6-v2` — small (22M params), fast
on CPU, well-tested for medical and general retrieval.

Defensive: if sentence-transformers isn't installed, `rerank()` is a
pass-through that returns candidates unchanged. The caller (retrieve_v2.py)
honors `RAG_RERANK=on|off` so production can toggle at runtime.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Sequence

from app.rag.retriever import Snippet

logger = logging.getLogger(__name__)

DEFAULT_MODEL = os.getenv("RAG_RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")


@lru_cache(maxsize=1)
def _model():
    """Lazy-load the cross-encoder. Returns None on import / load failure."""
    try:
        from sentence_transformers import CrossEncoder
    except ImportError:
        logger.info("reranker: sentence-transformers not installed — pass-through mode.")
        return None
    try:
        return CrossEncoder(DEFAULT_MODEL)
    except Exception:
        logger.exception("reranker: load failed for '%s'", DEFAULT_MODEL)
        return None


def is_available() -> bool:
    return _model() is not None


def rerank(
    query: str,
    candidates: Sequence[Snippet],
    top_k: int = 5,
) -> list[Snippet]:
    """Re-score candidates with the cross-encoder and return the top_k.

    Pass-through when the model isn't loaded — returns the first top_k of
    the input list unchanged.
    """
    if not candidates:
        return []
    if top_k <= 0:
        return []
    m = _model()
    if m is None:
        return list(candidates[:top_k])

    pairs = [(query, c.text) for c in candidates]
    try:
        scores = m.predict(pairs, show_progress_bar=False)
    except Exception:
        logger.exception("reranker: predict failed; returning candidates unchanged.")
        return list(candidates[:top_k])

    # Pair scores with candidates, sort descending, take top_k.
    scored = sorted(
        zip(scores, candidates),
        key=lambda x: float(x[0]),
        reverse=True,
    )
    out: list[Snippet] = []
    for score, snippet in scored[:top_k]:
        # Preserve the snippet shape; cross-encoder score overwrites the
        # upstream cosine/RRF score so downstream confidence reflects the
        # more accurate signal.
        out.append(Snippet(
            id=snippet.id,
            source=snippet.source,
            section=snippet.section,
            text=snippet.text,
            score=float(score),
        ))
    return out
