"""
ASHA-AI — RAG corpus embedder (Plan 3.0)
========================================

Reads `ml/rag/corpus.jsonl` (30 sourced snippets authored by Role C),
embeds each `text` field with BGE-M3 (1024-dim, multilingual), and writes
`ml/rag/embeddings.jsonl` (one row per snippet with an `embedding` array).

Role B picks up `embeddings.jsonl` and upserts to Supabase pgvector
via the `rag_snippets` table — see backend/app/nlp/rag.py.

Run:
    py -3.12 ml/rag/embed.py
    # optional flags
    py -3.12 ml/rag/embed.py --model BAAI/bge-m3 --out ml/rag/embeddings.jsonl

Dependencies:
    pip install sentence-transformers
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ML_ROOT = Path(__file__).resolve().parent.parent      # D:\hack\ml
RAG_DIR = ML_ROOT / "rag"
DEFAULT_CORPUS = RAG_DIR / "corpus.jsonl"
DEFAULT_OUT = RAG_DIR / "embeddings.jsonl"
DEFAULT_MODEL = "BAAI/bge-m3"


def load_corpus(path: Path) -> list[dict]:
    rows = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as e:
            raise SystemExit(f"corpus.jsonl line {i} is invalid JSON: {e}")
    return rows


def write_embeddings(rows: list[dict], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def embed_with_bge(rows: list[dict], model_name: str) -> list[dict]:
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        raise SystemExit(
            "sentence-transformers not installed. Run:\n"
            "  py -3.12 -m pip install sentence-transformers"
        )

    print(f"[embed] loading {model_name} ...", file=sys.stderr)
    model = SentenceTransformer(model_name)
    texts = [r["text"] for r in rows]
    print(f"[embed] encoding {len(texts)} snippets ...", file=sys.stderr)
    vecs = model.encode(
        texts,
        normalize_embeddings=True,
        batch_size=8,
        show_progress_bar=False,
    )
    out = []
    for r, v in zip(rows, vecs):
        out.append({
            **r,
            "embedding_model": model_name,
            "embedding_dim": len(v),
            "embedding": [float(x) for x in v],
        })
    return out


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--model", default=DEFAULT_MODEL,
                   help="Sentence-Transformers model id "
                        "(default: BAAI/bge-m3, 1024-dim, multilingual)")
    args = p.parse_args()

    if not args.corpus.exists():
        raise SystemExit(f"corpus not found: {args.corpus}")

    rows = load_corpus(args.corpus)
    print(f"[embed] loaded {len(rows)} snippets from {args.corpus}",
          file=sys.stderr)

    enriched = embed_with_bge(rows, args.model)
    write_embeddings(enriched, args.out)

    print(f"[embed] wrote {args.out} "
          f"({len(enriched)} rows, dim={enriched[0]['embedding_dim']})",
          file=sys.stderr)
    print(f"[embed] hand to Role B for pgvector upsert "
          f"(see backend/app/nlp/rag.py)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
