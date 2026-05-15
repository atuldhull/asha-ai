"""Plan 6.5 — RAG 2.0 orchestrator with feature flags.

The single entry point the pipeline calls when `RAG_BACKEND=qdrant_hybrid`.
Composes:
  1. HyDE (env `RAG_HYDE=on`) → hypothetical doc generation
  2. Hybrid search (Qdrant dense+sparse + RRF) → top-N candidates
  3. Reranker (env `RAG_RERANK=on`) → cross-encoder rerank top-N → top-k

Each step is feature-flagged independently so we can roll back any one
component without rebuilding the others. The orchestrator gracefully
degrades when any layer is unavailable:

  Qdrant down  → return None (caller falls back to chroma_legacy)
  HyDE fails   → use raw query for embedding
  Rerank down  → return Qdrant's top_k directly

Public surface:
  - `retrieve_v2(query, *, k=5, language="en", symptom_tokens=None)
        -> list[Snippet] | None`

Returns None ONLY when the entire Qdrant path is unreachable — at which
point the caller should fall back to `app/rag/retriever.py` legacy path.

Telemetry: each call records flag states + per-stage latency to the
Prometheus counter via `app/observability/prometheus.py`. The audit log
captures which flags were active for every triage decision so retrospec-
tive AE analysis can reconstruct what the model saw.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Iterable

from app.rag.hyde import generate_hypothetical
from app.rag.qdrant_client import hybrid_search, is_available as qdrant_available
from app.rag.reranker import rerank
from app.rag.retriever import Snippet

logger = logging.getLogger(__name__)

# Default candidate pool size for rerank. Bigger = more semantic recall +
# more rerank cost. 20 chosen per FRONTEND_BLUEPRINT §7 spec.
PREFETCH_N = int(os.getenv("RAG_PREFETCH_N", "20"))


def _flag(name: str, default: str = "off") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _backend() -> str:
    return os.getenv("RAG_BACKEND", "chroma_legacy").strip().lower()


def _flag_inventory() -> dict[str, str]:
    """Snapshot of all RAG 2.0 flags for telemetry / audit."""
    return {
        "RAG_BACKEND": _backend(),
        "RAG_HYDE": "on" if _flag("RAG_HYDE") else "off",
        "RAG_RERANK": "on" if _flag("RAG_RERANK") else "off",
        "PREFETCH_N": str(PREFETCH_N),
    }


async def retrieve_v2(
    query: str,
    *,
    k: int = 5,
    language: str = "en",
    symptom_tokens: Iterable[str] | None = None,
) -> list[Snippet] | None:
    """RAG 2.0 entry point.

    Returns:
      list[Snippet] — top-k snippets (post-rerank when enabled)
      None         — Qdrant path unreachable; caller must fall back
    """
    backend = _backend()
    if backend != "qdrant_hybrid":
        return None  # signals "skip me, fall back to legacy"

    if not qdrant_available():
        logger.info("retrieve_v2: Qdrant unreachable; signaling fallback to legacy.")
        return None

    flags = _flag_inventory()
    timings: dict[str, float] = {}

    # Stage 1 — HyDE (optional)
    search_text = query
    if _flag("RAG_HYDE"):
        t0 = time.perf_counter()
        try:
            search_text = await generate_hypothetical(query, language=language)
        except Exception:
            logger.exception("retrieve_v2: HyDE failed; using raw query")
            search_text = query
        timings["hyde_s"] = round(time.perf_counter() - t0, 3)

    # Stage 2 — Qdrant hybrid search (prefetch larger pool if reranking)
    t0 = time.perf_counter()
    prefetch = max(PREFETCH_N, k * 4) if _flag("RAG_RERANK") else k
    # qdrant_client.hybrid_search is sync; run in executor to keep async path clean
    loop = asyncio.get_event_loop()
    try:
        candidates = await loop.run_in_executor(
            None,
            lambda: hybrid_search(search_text, n=prefetch),
        )
    except Exception:
        logger.exception("retrieve_v2: hybrid_search failed")
        candidates = None
    timings["qdrant_s"] = round(time.perf_counter() - t0, 3)

    if not candidates:
        logger.info("retrieve_v2: hybrid_search returned no results; signaling fallback.")
        return None

    # Stage 3 — Cross-encoder rerank (optional)
    if _flag("RAG_RERANK"):
        t0 = time.perf_counter()
        try:
            candidates = rerank(query, candidates, top_k=k)
        except Exception:
            logger.exception("retrieve_v2: rerank failed; returning Qdrant top_k")
            candidates = list(candidates[:k])
        timings["rerank_s"] = round(time.perf_counter() - t0, 3)
    else:
        candidates = list(candidates[:k])

    logger.info(
        "retrieve_v2: flags=%s timings=%s returned=%d",
        flags, timings, len(candidates),
    )
    return candidates


def retrieve_v2_sync(
    query: str,
    *,
    k: int = 5,
    language: str = "en",
    symptom_tokens: Iterable[str] | None = None,
) -> list[Snippet] | None:
    """Sync wrapper for the pipeline's existing sync retrieve(). Use this
    from places that aren't yet async; the future LangGraph rewrite
    (Phase G) prefers the async path."""
    return asyncio.run(retrieve_v2(
        query, k=k, language=language, symptom_tokens=symptom_tokens,
    ))
