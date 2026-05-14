"""One-shot loader: upserts Role C's `ml/rag/corpus.jsonl` into pgvector.

Run manually:
    python -m app.rag.loader

Refuses to run when Supabase isn't configured or the BGE-M3 model can't
be loaded — instead prints actionable guidance.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)


_DEFAULT_CORPUS_PATHS = [
    Path("D:/hack/ml/rag/corpus.jsonl"),
    Path(__file__).resolve().parents[3] / "ml" / "rag" / "corpus.jsonl",
]


def _find_corpus(explicit: Path | None) -> Path | None:
    if explicit and explicit.exists():
        return explicit
    for p in _DEFAULT_CORPUS_PATHS:
        if p.exists():
            return p
    return None


def _read_jsonl(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def load_corpus(corpus_path: Path | None = None) -> int:
    """Upsert the corpus into Supabase. Returns the number of rows written."""
    path = _find_corpus(corpus_path)
    if path is None:
        sys.stderr.write(
            "load_corpus: no corpus.jsonl found. Looked at:\n"
            + "\n".join(f"  - {p}" for p in _DEFAULT_CORPUS_PATHS)
            + "\nRole C ships this file; wait for it or pass --corpus.\n"
        )
        return 0

    try:
        from app.core.supabase_client import SupabaseNotConfigured, service_client
        client = service_client()
    except (ImportError, SupabaseNotConfigured) as exc:
        sys.stderr.write(
            f"load_corpus: Supabase not configured ({exc}). Apply\n"
            "  db/migrations/002_plan3_rag.sql in the Supabase SQL editor and\n"
            "  set SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in .env first.\n"
        )
        return 0

    from app.rag.embedder import embed_batch
    rows = _read_jsonl(path)
    if not rows:
        return 0
    texts = [r["text"] for r in rows]
    embeddings = embed_batch(texts)
    if embeddings is None:
        sys.stderr.write(
            "load_corpus: sentence-transformers (BGE-M3) isn't installed.\n"
            "  pip install -e .[ml]   # ships sentence-transformers as a peer\n"
        )
        return 0

    written = 0
    for r, emb in zip(rows, embeddings):
        payload = {
            "id": r["id"],
            "source": r.get("source", ""),
            "section": r.get("section", ""),
            "text": r["text"],
            "tags": r.get("tags", []),
            "embedding": emb,
        }
        try:
            client.table("rag_snippets").upsert(payload).execute()
            written += 1
        except Exception as exc:
            logger.warning("load_corpus: failed to upsert id=%s: %s", r.get("id"), exc)
    return written


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Load the RAG corpus into pgvector.")
    p.add_argument("--corpus", type=Path, default=None, help="Path to corpus.jsonl")
    args = p.parse_args(argv)
    n = load_corpus(args.corpus)
    print(f"Loaded {n} snippets.")
    return 0 if n else 1


if __name__ == "__main__":
    raise SystemExit(main())
