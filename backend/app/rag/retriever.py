"""RAG retrieval — pgvector when available, tag/keyword fallback otherwise.

Public function:
  retrieve(query, *, symptom_tokens, k=3) → list[Snippet]

Behaviour:
  1. If Supabase is configured AND the `match_rag_snippets` RPC + the
     `rag_snippets` table both exist AND BGE-M3 embeddings can be
     produced, use vector similarity against the corpus Role C loaded.
  2. Otherwise, run tag-based retrieval against the built-in
     fallback corpus in fallback_corpus.py — keyword overlap between
     the patient's symptom tokens and each snippet's tag list.

Plan 3.0 anti-pattern: every verdict must have ≥1 citation. The fallback
guarantees that floor even before Role C's corpus.jsonl + BGE-M3 land.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

from app.rag.fallback_corpus import FALLBACK_SNIPPETS, by_tags

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Snippet:
    id: str
    source: str
    section: str
    text: str
    score: float = 0.0

    def to_citation(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "section": self.section,
            "text": self.text,
        }


def _try_pgvector(query: str, k: int) -> list[Snippet] | None:
    """Attempt pgvector retrieval. Returns None on any failure path."""
    try:
        from app.core.supabase_client import SupabaseNotConfigured, service_client
    except ImportError:
        return None
    try:
        client = service_client()
    except SupabaseNotConfigured:
        return None

    try:
        from app.rag.embedder import embed_query
    except ImportError:
        return None

    try:
        q_emb = embed_query(query)
    except Exception as exc:
        logger.debug("RAG: embedder failed: %s — falling back to tags.", exc)
        return None
    if q_emb is None:
        return None

    try:
        res = client.rpc(
            "match_rag_snippets",
            {"query_embedding": list(q_emb), "match_count": k},
        ).execute()
    except Exception as exc:
        logger.debug("RAG: pgvector RPC failed: %s — falling back to tags.", exc)
        return None
    rows = getattr(res, "data", None) or []
    if not rows:
        return None
    return [
        Snippet(
            id=str(r["id"]),
            source=str(r.get("source", "")),
            section=str(r.get("section", "")),
            text=str(r.get("text", "")),
            score=float(r.get("score", 0.0) or 0.0),
        )
        for r in rows
    ]


def _tag_retrieval(symptom_tokens: Iterable[str], k: int) -> list[Snippet]:
    """Score snippets by tag overlap with the patient's symptom tokens."""
    wanted = {t.lower() for t in symptom_tokens}

    scored: list[tuple[int, dict]] = []
    for s in FALLBACK_SNIPPETS:
        tags = {t.lower() for t in s.get("tags", [])}
        overlap = len(tags & wanted)
        if overlap:
            scored.append((overlap, s))
    scored.sort(key=lambda x: x[0], reverse=True)

    out: list[Snippet] = []
    for overlap, s in scored[:k]:
        out.append(
            Snippet(
                id=s["id"], source=s["source"], section=s["section"],
                text=s["text"], score=float(overlap),
            )
        )

    # Guarantee at least one citation: fall back to the generic
    # "decision support" snippet so the response is never empty.
    if not out:
        generic = by_tags("general", "telemedicine")
        if generic:
            s = generic[0]
            out.append(
                Snippet(
                    id=s["id"], source=s["source"], section=s["section"],
                    text=s["text"], score=0.0,
                )
            )
    return out


def retrieve(
    query: str,
    *,
    symptom_tokens: Iterable[str] | None = None,
    k: int = 3,
) -> list[Snippet]:
    """Return top-k citation snippets for the given patient query."""
    tokens = list(symptom_tokens or [])
    pg = _try_pgvector(query, k)
    if pg:
        return pg
    return _tag_retrieval(tokens, k)
