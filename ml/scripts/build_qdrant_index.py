"""Plan 6.5 Phase D — Build the Qdrant `snomed_conditions` collection.

Pipeline:
  1. Read the existing RAG corpus from `ml/rag/corpus.jsonl` (Plan 3.0
     production source — same file that fed the BGE-M3 + ChromaDB index).
  2. (Optional) Augment with additional SNOMED clinical descriptions if
     `--extra-corpus <path>` is passed.
  3. Embed every document with `nomic-embed-text-v1.5` at 768-dim using
     the `search_document:` prefix.
  4. (Optional) Compute BM25 sparse vectors via fastembed for hybrid retrieval.
  5. Upsert into Qdrant collection `snomed_conditions` (created if absent).
  6. Smoke-test 25 golden queries from `ml/datasets/EVAL_CASES_6_5.csv`
     against the new index. Document precision@5 in `ml/_6_5_retrieval_eval.md`.

Usage (from D:\\hack\\ml):
    py scripts/build_qdrant_index.py
    py scripts/build_qdrant_index.py --batch-size 32 --no-smoke

Pre-reqs:
    cd D:\\hack\\backend
    .\\.venv\\Scripts\\Activate.ps1
    pip install -e ".[red_flag_ml]"  # nomic embedder
    pip install qdrant-client fastembed

Env vars (read by the backend client):
    QDRANT_URL=http://localhost:6333
    QDRANT_API_KEY=... (cloud Qdrant; omit for self-hosted)
    QDRANT_COLLECTION=snomed_conditions   (default)
    NOMIC_MODEL=nomic-ai/nomic-embed-text-v1.5   (default)
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
import time
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]  # d:\hack\ml
DEFAULT_CORPUS = ROOT / "rag" / "corpus.jsonl"
GOLDEN_EVAL = ROOT / "datasets" / "EVAL_CASES_6_5.csv"
OUT_REPORT = ROOT / "_6_5_retrieval_eval.md"

logger = logging.getLogger("build_qdrant_index")


def _load_corpus(path: Path) -> list[dict]:
    """Read a JSONL file, return a list of documents. Each doc must have
    `id` + `text` at minimum. `source` + `section` + `metadata` optional."""
    if not path.is_file():
        sys.stderr.write(f"FATAL: corpus file not found at {path}\n")
        sys.exit(1)
    docs: list[dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                sys.stderr.write(
                    f"WARNING: corpus line {line_num} not valid JSON: {e}\n"
                )
                continue
            if "text" not in row:
                sys.stderr.write(
                    f"WARNING: corpus line {line_num} missing 'text' field, skipping\n"
                )
                continue
            docs.append(row)
    return docs


def _smoke_eval(client_path_query: callable, k: int = 5) -> dict | None:
    """Run the 25-query golden set, report precision@k against the
    hand-labeled `expected_snippet_ids` column in EVAL_CASES_6_5.csv.

    Returns None if the golden set doesn't have hand-labeled IDs (which is
    the case until Role D + MBBS author them — graceful skip).
    """
    if not GOLDEN_EVAL.is_file():
        sys.stderr.write(
            f"WARNING: golden eval not at {GOLDEN_EVAL}; skipping smoke-test\n"
        )
        return None
    rows: list[dict] = []
    with GOLDEN_EVAL.open("r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return None

    has_labels = bool(rows[0].get("expected_snippet_ids", "").strip())
    if not has_labels:
        sys.stderr.write(
            "WARNING: EVAL_CASES_6_5.csv has no 'expected_snippet_ids' labels "
            "yet — smoke run will report retrieved IDs only.\n"
        )

    results: list[dict] = []
    hits_at_k = 0
    for row in rows:
        query = (row.get("query") or row.get("text") or "").strip()
        if not query:
            continue
        retrieved = client_path_query(query)
        retrieved_ids = [str(r.id) for r in (retrieved or [])][:k]
        expected_raw = (row.get("expected_snippet_ids") or "").strip()
        expected_ids = [s.strip() for s in expected_raw.split(",") if s.strip()]
        hit = bool(expected_ids) and any(rid in expected_ids for rid in retrieved_ids)
        if hit:
            hits_at_k += 1
        results.append({
            "query": query[:100],
            "retrieved_ids": retrieved_ids,
            "expected_ids": expected_ids,
            "hit": hit,
        })

    return {
        "total_queries": len(results),
        "hits_at_k": hits_at_k,
        "precision_at_k": (hits_at_k / len(results)) if results else 0.0,
        "k": k,
        "had_labels": has_labels,
        "details": results,
    }


def _write_report(eval_result: dict | None, total_docs: int, args) -> None:
    lines: list[str] = []
    lines.append("# Plan 6.5 Phase D — Qdrant Retrieval Eval Report")
    lines.append("")
    lines.append(f"_Generated: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}_")
    lines.append("")
    lines.append("## Index")
    lines.append("")
    lines.append(f"- Collection: `snomed_conditions`")
    lines.append(f"- Documents indexed: {total_docs}")
    lines.append(f"- Embedding model: `{args.embed_model}` (768-dim)")
    lines.append("- Sparse: BM25 via Qdrant/bm25 (when fastembed available)")
    lines.append("")
    lines.append("## Smoke eval (golden 25-query set)")
    lines.append("")
    if eval_result is None:
        lines.append(
            "Skipped — `ml/datasets/EVAL_CASES_6_5.csv` not found. "
            "Run with `--no-smoke` to suppress this warning."
        )
    elif not eval_result.get("had_labels"):
        lines.append(
            f"Retrieved {eval_result['total_queries']} queries; no "
            "`expected_snippet_ids` labels in EVAL_CASES_6_5.csv yet. "
            "MBBS labeling is the next step before we can report precision@k."
        )
    else:
        p_at_k = eval_result["precision_at_k"]
        marker = "✅" if p_at_k >= 0.5 else "⚠️"
        lines.append(
            f"- **precision@{eval_result['k']}:** {p_at_k:.3f} "
            f"({eval_result['hits_at_k']} / {eval_result['total_queries']}) {marker}"
        )
        lines.append("")
        lines.append("Per FRONTEND_BLUEPRINT §7 #6+#7 acceptance gate:")
        lines.append("- Bare hybrid (no rerank, no HyDE): ≥ baseline")
        lines.append("- With rerank (Phase E): precision@1 ≥ +5pp")
        lines.append("- With rerank + HyDE (Phase F): precision@5 ≥ +8pp combined")
    lines.append("")
    lines.append("## Reproduce")
    lines.append("")
    lines.append("```")
    lines.append("cd d:\\hack\\ml")
    lines.append("py scripts/build_qdrant_index.py")
    lines.append("```")
    OUT_REPORT.write_text("\n".join(lines), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    p = argparse.ArgumentParser(description="Plan 6.5 Phase D · build Qdrant index")
    p.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    p.add_argument("--extra-corpus", type=Path, default=None,
                   help="Additional JSONL corpus to merge into the index")
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--embed-model", type=str,
                   default="nomic-ai/nomic-embed-text-v1.5")
    p.add_argument("--no-smoke", action="store_true",
                   help="Skip the smoke eval after upsert")
    p.add_argument("--recreate", action="store_true",
                   help="DROP + recreate the collection first (destructive)")
    args = p.parse_args(argv)

    # Path hack — let us import backend modules from this script.
    BACKEND = ROOT.parent / "backend"
    sys.path.insert(0, str(BACKEND))

    try:
        from app.rag.qdrant_client import (
            COLLECTION_NAME, ensure_collection, hybrid_search, upsert_documents,
        )
    except Exception as e:
        sys.stderr.write(
            f"FATAL: cannot import qdrant_client. Run "
            f"`cd backend && pip install -e \".[red_flag_ml]\"` + install "
            f"qdrant-client + fastembed first.\n"
            f"Underlying error: {e}\n"
        )
        return 2

    # Optionally recreate (destructive).
    if args.recreate:
        try:
            from qdrant_client import QdrantClient
            import os as _os
            url = _os.getenv("QDRANT_URL", "http://localhost:6333")
            api_key = _os.getenv("QDRANT_API_KEY") or None
            QdrantClient(url=url, api_key=api_key).delete_collection(COLLECTION_NAME)
            sys.stdout.write(f"Dropped collection: {COLLECTION_NAME}\n")
        except Exception as e:
            sys.stderr.write(f"WARNING: recreate failed (continuing): {e}\n")

    status = ensure_collection()
    if status.error:
        sys.stderr.write(f"FATAL: ensure_collection: {status.error}\n")
        return 1
    sys.stdout.write(
        f"Collection ready: {COLLECTION_NAME} "
        f"(existing vectors: {status.vector_count})\n"
    )

    sys.stdout.write(f"Loading corpus from {args.corpus} ...\n")
    docs = _load_corpus(args.corpus)
    if args.extra_corpus:
        docs.extend(_load_corpus(args.extra_corpus))
    sys.stdout.write(f"  Loaded {len(docs)} documents\n")

    if not docs:
        sys.stderr.write("FATAL: empty corpus\n")
        return 1

    sys.stdout.write("Embedding + upserting ...\n")
    inserted = upsert_documents(docs, batch_size=args.batch_size)
    sys.stdout.write(f"  Upserted {inserted}/{len(docs)} documents\n")

    if inserted == 0:
        sys.stderr.write(
            "FATAL: 0 documents indexed. Likely nomic embedder unavailable. "
            "Install via `pip install sentence-transformers einops` and "
            "ensure trust_remote_code=True path works.\n"
        )
        return 1

    # Smoke-test
    eval_result = None
    if not args.no_smoke:
        sys.stdout.write("Running smoke-eval against golden set ...\n")
        eval_result = _smoke_eval(lambda q: hybrid_search(q, n=5), k=5)
        if eval_result:
            sys.stdout.write(
                f"  precision@{eval_result['k']} = "
                f"{eval_result['precision_at_k']:.3f} "
                f"({eval_result['hits_at_k']}/{eval_result['total_queries']})\n"
            )

    _write_report(eval_result, total_docs=inserted, args=args)
    sys.stdout.write(f"\nReport written to {OUT_REPORT}\n")
    sys.stdout.write(
        "\nNext: flip RAG_BACKEND=qdrant_hybrid in backend/.env and restart, then\n"
        "run the full Plan 4.0 eval to verify no regression "
        "(py -m pytest tests/test_eval_p4.py -q from backend/).\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
