"""
ASHA-AI — RAG retriever (Plan 3.0)
==================================

Layer-5 of the Plan 3.0 triage pipeline: every verdict in 3.0+ is
returned with ≥ 1 citation from the curated corpus (WHO IMCI, India
MoHFW STG, NICE CKS, WHO mhGAP).

Architecture
  authoring         → ml/rag/corpus.jsonl              (Role C, 30 snippets)
  embedding         → ml/rag/embed.py / 05_rag_embed   (Role C, BGE-M3 1024-dim)
  pgvector upsert   → upsert_corpus()                  (here, called at backend startup)
  retrieval         → retrieve(query, k=3)             (here, called inside /triage)

The retriever degrades gracefully if pgvector / Supabase / the local
BGE-M3 model are unavailable — pulling the ethernet in the unplug demo
must NOT 500 the backend. When the embedder is missing we fall back to
a keyword-overlap ranker against `tags` + `source`, so an offline edge
demo still ships at least one citation per verdict.

ENV VARS
  RAG_CORPUS_PATH=ml/rag/corpus.jsonl
  RAG_EMBEDDINGS_PATH=ml/rag/embeddings.jsonl
  RAG_EMBEDDING_MODEL=BAAI/bge-m3
  RAG_TOP_K=3
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   # for pgvector upsert
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

LOG = logging.getLogger("ashaai.nlp.rag")

REPO_ROOT = Path(__file__).resolve().parents[3]    # D:\hack
DEFAULT_CORPUS = REPO_ROOT / "ml" / "rag" / "corpus.jsonl"
DEFAULT_EMBEDDINGS = REPO_ROOT / "ml" / "rag" / "embeddings.jsonl"
DEFAULT_MODEL = os.getenv("RAG_EMBEDDING_MODEL", "BAAI/bge-m3")
DEFAULT_K = int(os.getenv("RAG_TOP_K", "3"))


# ── Data shape returned to the triage pipeline ────────────────────────
@dataclass
class Citation:
    snippet_id: str
    source: str
    section: str
    excerpt: str
    score: float                       # cosine similarity if vector path; keyword overlap fraction otherwise
    via: str = "vector"                # "vector" | "keyword_fallback"

    def to_response_dict(self) -> dict[str, Any]:
        """Public shape rendered by Member A's <CitationList /> component."""
        return {
            "source": self.source,
            "section": self.section,
            "excerpt": self.excerpt,
            "snippet_id": self.snippet_id,
            "via": self.via,
            "score": round(float(self.score), 4),
        }


@dataclass
class Snippet:
    id: str
    source: str
    section: str
    text: str
    tags: list[str] = field(default_factory=list)
    embedding: list[float] | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Snippet":
        return cls(
            id=str(d["id"]),
            source=str(d.get("source", "")),
            section=str(d.get("section", "")),
            text=str(d.get("text", "")),
            tags=list(d.get("tags") or []),
            embedding=list(d.get("embedding") or []) or None,
        )


# ── Corpus loaders ────────────────────────────────────────────────────
_CORPUS_CACHE: list[Snippet] | None = None
_EMBEDDED_CACHE: list[Snippet] | None = None


def _load_jsonl(path: Path) -> list[Snippet]:
    if not path.exists():
        LOG.warning("RAG corpus not found at %s", path)
        return []
    rows: list[Snippet] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            rows.append(Snippet.from_dict(json.loads(line)))
        except json.JSONDecodeError as e:
            LOG.error("rag corpus %s line %d invalid JSON: %s", path, i, e)
    return rows


def load_corpus(force: bool = False) -> list[Snippet]:
    """Load the un-embedded corpus (used by keyword fallback)."""
    global _CORPUS_CACHE
    if _CORPUS_CACHE is None or force:
        path = Path(os.getenv("RAG_CORPUS_PATH", str(DEFAULT_CORPUS)))
        _CORPUS_CACHE = _load_jsonl(path)
    return _CORPUS_CACHE


def load_embeddings(force: bool = False) -> list[Snippet]:
    """Load corpus + embeddings; returns [] if embeddings.jsonl is missing."""
    global _EMBEDDED_CACHE
    if _EMBEDDED_CACHE is None or force:
        path = Path(os.getenv("RAG_EMBEDDINGS_PATH", str(DEFAULT_EMBEDDINGS)))
        rows = _load_jsonl(path)
        _EMBEDDED_CACHE = [s for s in rows if s.embedding]
    return _EMBEDDED_CACHE


# ── Embedder (BGE-M3 via sentence-transformers; lazy + optional) ──────
_MODEL_CACHE: Any = None


def _get_embedder():
    global _MODEL_CACHE
    if _MODEL_CACHE is not None:
        return _MODEL_CACHE
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        LOG.info("sentence-transformers not installed — RAG will use keyword fallback")
        return None
    try:
        _MODEL_CACHE = SentenceTransformer(DEFAULT_MODEL)
    except Exception as exc:
        LOG.warning("failed to load %s: %s — keyword fallback only", DEFAULT_MODEL, exc)
        return None
    return _MODEL_CACHE


def embed_query(query: str) -> list[float] | None:
    model = _get_embedder()
    if model is None:
        return None
    vec = model.encode([query], normalize_embeddings=True)[0]
    return [float(x) for x in vec]


# ── Retrieval ─────────────────────────────────────────────────────────
def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    # both expected to be unit-norm (BGE-M3 normalize_embeddings=True)
    return float(sum(x * y for x, y in zip(a, b)))


_TOKEN_RE = re.compile(r"[a-z][a-z0-9_]+")


def _tokenize(s: str) -> set[str]:
    return set(_TOKEN_RE.findall(s.lower()))


def _keyword_score(query_tokens: set[str], snippet: Snippet) -> float:
    """Lightweight fallback when no embedder is available."""
    snippet_tokens = _tokenize(
        snippet.text + " " + snippet.section + " " + " ".join(snippet.tags)
    )
    if not snippet_tokens or not query_tokens:
        return 0.0
    overlap = len(query_tokens & snippet_tokens)
    return overlap / math.sqrt(len(query_tokens) * len(snippet_tokens))


def retrieve(
    query: str,
    k: int = DEFAULT_K,
    *,
    use_pgvector: bool = False,
) -> list[Citation]:
    """Return the top-k citations for a triage query.

    Resolution order:
      1. pgvector (when `use_pgvector=True` and Supabase RPC available)
      2. local cosine over `embeddings.jsonl` (offline / edge)
      3. keyword fallback over `corpus.jsonl` (when no embedder + no DB)
    """
    if not (query or "").strip():
        return []

    if use_pgvector:
        try:
            return _retrieve_via_pgvector(query, k)
        except Exception as exc:
            LOG.warning("pgvector retrieve failed (%s); falling back", exc)

    embedded = load_embeddings()
    if embedded:
        q = embed_query(query)
        if q is not None:
            scored = sorted(
                ((_cosine(q, s.embedding or []), s) for s in embedded),
                reverse=True, key=lambda kv: kv[0])
            return [
                Citation(
                    snippet_id=s.id, source=s.source, section=s.section,
                    excerpt=_truncate(s.text), score=score, via="vector",
                )
                for score, s in scored[:k]
            ]

    # Keyword fallback
    corpus = load_corpus()
    qtok = _tokenize(query)
    scored = sorted(
        ((_keyword_score(qtok, s), s) for s in corpus),
        reverse=True, key=lambda kv: kv[0])
    out: list[Citation] = []
    for score, s in scored[:k]:
        if score <= 0:
            break
        out.append(Citation(
            snippet_id=s.id, source=s.source, section=s.section,
            excerpt=_truncate(s.text), score=score, via="keyword_fallback",
        ))
    return out


def _truncate(text: str, limit: int = 360) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",.;") + "…"


def _retrieve_via_pgvector(query: str, k: int) -> list[Citation]:
    """Call Supabase RPC `match_rag_snippets(query_embedding, match_count)`."""
    try:
        from app.core.supabase_client import get_client  # type: ignore
    except ImportError:
        raise RuntimeError("supabase client unavailable")
    q = embed_query(query)
    if q is None:
        raise RuntimeError("embedder unavailable")
    sb = get_client()
    r = sb.rpc(
        "match_rag_snippets",
        {"query_embedding": q, "match_count": k},
    ).execute()
    out: list[Citation] = []
    for row in (r.data or []):
        out.append(Citation(
            snippet_id=str(row.get("id", "")),
            source=str(row.get("source", "")),
            section=str(row.get("section", "")),
            excerpt=_truncate(str(row.get("text", ""))),
            score=float(row.get("similarity", 0.0)),
            via="vector",
        ))
    return out


# ── pgvector upsert (called once at backend startup, or via CLI) ──────
def upsert_corpus(embeddings_path: Path | None = None) -> dict[str, Any]:
    """Push `ml/rag/embeddings.jsonl` into Supabase `rag_snippets` table.

    Returns a small status dict for the /health endpoint.
    """
    try:
        from app.core.supabase_client import get_client  # type: ignore
    except ImportError:
        return {"ok": False, "reason": "supabase client unavailable"}

    path = Path(embeddings_path or os.getenv(
        "RAG_EMBEDDINGS_PATH", str(DEFAULT_EMBEDDINGS)))
    snippets = _load_jsonl(path)
    snippets = [s for s in snippets if s.embedding]
    if not snippets:
        return {"ok": False, "reason": f"no embeddings at {path}"}

    sb = get_client()
    rows = [
        {
            "id": s.id,
            "source": s.source,
            "section": s.section,
            "text": s.text,
            "tags": s.tags,
            "embedding": s.embedding,
        }
        for s in snippets
    ]
    sb.table("rag_snippets").upsert(rows).execute()
    return {"ok": True, "n_upserted": len(rows), "embedding_dim": len(snippets[0].embedding or [])}


# ── Diagnostics ───────────────────────────────────────────────────────
def healthcheck() -> dict[str, Any]:
    """Returns a small status block for /health."""
    corpus = load_corpus()
    embeddings = load_embeddings()
    return {
        "corpus_path": str(Path(os.getenv("RAG_CORPUS_PATH", str(DEFAULT_CORPUS)))),
        "corpus_snippets": len(corpus),
        "embeddings_path": str(Path(os.getenv("RAG_EMBEDDINGS_PATH", str(DEFAULT_EMBEDDINGS)))),
        "embedded_snippets": len(embeddings),
        "embedder_model": DEFAULT_MODEL,
        "embedder_loaded": _MODEL_CACHE is not None,
    }


# ── CLI smoke test ────────────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("query", nargs="?",
                   default="severe chest pain radiating to left arm in a 67yo diabetic")
    p.add_argument("--k", type=int, default=3)
    args = p.parse_args()

    print(f"corpus: {len(load_corpus())} snippets")
    print(f"embeddings: {len(load_embeddings())} snippets")
    print(f"query: {args.query!r}")
    print()
    for c in retrieve(args.query, k=args.k):
        print(f"  [{c.score:.3f} via {c.via}] {c.snippet_id}  ({c.source})")
        print(f"    §{c.section}")
        print(f"    {c.excerpt[:160]}…")
        print()
