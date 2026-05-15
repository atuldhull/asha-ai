"""Plan 6.5 Phase D — Qdrant hybrid retrieval client.

Wraps a Qdrant collection with named vectors:
  - `dense`  · 768-dim COSINE (nomic-embed-text-v1.5)
  - `sparse` · BM25 via FastEmbed Qdrant/bm25 (~30K vocab)

Hybrid search uses **Reciprocal Rank Fusion (RRF)** to combine the two
ranked lists at query time — gives us both semantic similarity AND exact
keyword matching. Per FRONTEND_BLUEPRINT §7 #5 the hybrid path should
clear precision@5 baseline + 8pp combined with rerank + HyDE.

Graceful fallback: if `qdrant_client` or `fastembed` isn't installed, or
QDRANT_URL is unset, every function returns None and the caller falls
back to `app/rag/retriever.py` (chroma_legacy / tag retrieval).

Public surface:
  - `is_available()` — quick health check
  - `hybrid_search(query, n=10, filter_meta=None)` — returns Snippets
  - `upsert_documents(docs)` — for the build_qdrant_index.py script
  - `ensure_collection()` — idempotent collection create
"""
from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Iterable

from app.rag.nomic_embedder import EMBED_DIM, embed_documents_batch, embed_for_search
from app.rag.retriever import Snippet

# Deterministic UUID5 namespace for ASHA-AI corpus IDs. Means re-running
# the index build produces stable point IDs (idempotent upsert).
# Derived once from the literal string "asha-ai-snomed-corpus".
_NS_ASHA_CORPUS = uuid.uuid5(uuid.NAMESPACE_URL, "https://asha-ai.in/corpus/v1")


def _qdrant_point_id(raw: Any) -> str | int:
    """Qdrant accepts unsigned int or UUID. Coerce strings → UUID5(namespace, str).
    Deterministic so reruns produce stable IDs (idempotent upsert)."""
    if isinstance(raw, int):
        return raw
    s = str(raw)
    if s.isdigit():
        try:
            return int(s)
        except ValueError:
            pass
    # Try parsing as UUID directly (idempotent for already-UUID inputs).
    try:
        return str(uuid.UUID(s))
    except (ValueError, AttributeError):
        pass
    return str(uuid.uuid5(_NS_ASHA_CORPUS, s))

logger = logging.getLogger(__name__)

COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "snomed_conditions")
SPARSE_DIM = 30000


@dataclass
class CollectionStatus:
    exists: bool
    vector_count: int
    error: str | None = None


# ──────────── Lazy client ────────────


@lru_cache(maxsize=1)
def _qdrant():
    """Lazy-load qdrant-client. Returns None when not installed / not configured."""
    try:
        from qdrant_client import QdrantClient  # type: ignore
    except ImportError:
        logger.info("qdrant_client not installed — RAG 2.0 hybrid path disabled.")
        return None
    url = os.getenv("QDRANT_URL", "").strip()
    if not url:
        return None
    try:
        api_key = os.getenv("QDRANT_API_KEY") or None
        return QdrantClient(url=url, api_key=api_key, timeout=8.0)
    except Exception:
        logger.exception("qdrant_client init failed for URL=%s", url)
        return None


@lru_cache(maxsize=1)
def _sparse_model():
    """Lazy-load fastembed BM25. Returns None if not installed."""
    try:
        from fastembed import SparseTextEmbedding  # type: ignore
    except ImportError:
        logger.info("fastembed not installed — sparse vectors disabled (dense-only retrieval).")
        return None
    try:
        return SparseTextEmbedding(model_name="Qdrant/bm25")
    except Exception:
        logger.exception("fastembed BM25 init failed.")
        return None


def is_available() -> bool:
    return _qdrant() is not None


# ──────────── Collection management ────────────


def ensure_collection() -> CollectionStatus:
    """Idempotently create the collection. Safe to call repeatedly."""
    client = _qdrant()
    if client is None:
        return CollectionStatus(exists=False, vector_count=0, error="qdrant unavailable")
    try:
        from qdrant_client.models import (  # type: ignore
            Distance, SparseVectorParams, VectorParams,
        )
    except ImportError:
        return CollectionStatus(exists=False, vector_count=0, error="qdrant.models import failed")

    try:
        collections = client.get_collections().collections
        existing = {c.name for c in collections}
        if COLLECTION_NAME in existing:
            try:
                info = client.get_collection(COLLECTION_NAME)
                return CollectionStatus(
                    exists=True,
                    vector_count=int(getattr(info, "points_count", 0) or 0),
                )
            except Exception:
                return CollectionStatus(exists=True, vector_count=0)

        client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config={
                "dense": VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "sparse": SparseVectorParams(),
            },
        )
        return CollectionStatus(exists=True, vector_count=0)
    except Exception as exc:
        logger.exception("ensure_collection failed")
        return CollectionStatus(exists=False, vector_count=0, error=str(exc))


# ──────────── Indexing ────────────


def upsert_documents(docs: Iterable[dict[str, Any]], batch_size: int = 64) -> int:
    """Index documents into Qdrant. Each doc shape:
      { "id": str|int, "text": str, "source": str, "section": str, "metadata": dict }

    Returns count successfully upserted. Used by `ml/scripts/build_qdrant_index.py`.
    """
    client = _qdrant()
    if client is None:
        return 0
    try:
        from qdrant_client.models import PointStruct, SparseVector  # type: ignore
    except ImportError:
        return 0

    sparse_model = _sparse_model()
    docs_list = list(docs)
    if not docs_list:
        return 0

    total = 0
    for i in range(0, len(docs_list), batch_size):
        batch = docs_list[i : i + batch_size]
        texts = [str(d["text"]) for d in batch]

        # Dense embeddings via nomic-embed-text-v1.5 with `search_document:` prefix
        dense_vecs = embed_documents_batch(texts)
        if dense_vecs is None:
            logger.warning("upsert_documents: nomic embedder unavailable, aborting batch.")
            return total

        # Sparse embeddings via BM25 (optional)
        sparse_vecs: list[Any] = []
        if sparse_model is not None:
            try:
                for sv in sparse_model.embed(texts):
                    sparse_vecs.append(
                        SparseVector(
                            indices=sv.indices.tolist(),
                            values=sv.values.tolist(),
                        )
                    )
            except Exception:
                logger.exception("BM25 encode failed for batch starting at %d", i)
                sparse_vecs = []

        points = []
        for j, doc in enumerate(batch):
            payload = {
                "text": str(doc["text"]),
                "source": str(doc.get("source", "")),
                "section": str(doc.get("section", "")),
                "metadata": dict(doc.get("metadata", {}) or {}),
            }
            vec: dict[str, Any] = {"dense": dense_vecs[j]}
            if sparse_vecs:
                vec["sparse"] = sparse_vecs[j]
            raw_id = doc.get("id") or i + j
            # Always carry the original ID through the payload so retrieval
            # can map back to the corpus's natural key.
            payload["corpus_id"] = str(raw_id)
            points.append(
                PointStruct(id=_qdrant_point_id(raw_id), vector=vec, payload=payload)
            )

        try:
            client.upsert(collection_name=COLLECTION_NAME, points=points)
            total += len(points)
        except Exception:
            logger.exception("Qdrant upsert failed for batch starting at %d", i)

    return total


# ──────────── Hybrid query ────────────


def hybrid_search(
    query: str,
    n: int = 10,
    filter_meta: dict[str, Any] | None = None,
) -> list[Snippet] | None:
    """RRF-fused hybrid search. Returns None when Qdrant isn't reachable."""
    client = _qdrant()
    if client is None:
        return None

    dense_vec = embed_for_search(query)
    if dense_vec is None:
        return None  # nomic embedder unavailable

    sparse_vec = None
    sparse_model = _sparse_model()
    if sparse_model is not None:
        try:
            from qdrant_client.models import SparseVector  # type: ignore
            sv = next(iter(sparse_model.embed([query])))
            sparse_vec = SparseVector(
                indices=sv.indices.tolist(),
                values=sv.values.tolist(),
            )
        except Exception:
            logger.exception("BM25 sparse encode failed for query")
            sparse_vec = None

    try:
        from qdrant_client.models import (  # type: ignore
            Filter, Fusion, FusionQuery, NamedSparseVector, NamedVector, Prefetch,
        )
    except ImportError:
        return None

    qdrant_filter: Any = None
    if filter_meta:
        try:
            from qdrant_client.models import FieldCondition, MatchValue  # type: ignore
            must = [
                FieldCondition(key=f"metadata.{k}", match=MatchValue(value=v))
                for k, v in filter_meta.items()
            ]
            qdrant_filter = Filter(must=must)
        except Exception:
            qdrant_filter = None

    prefetch = [
        Prefetch(query=dense_vec, using="dense", limit=max(n * 4, 20)),
    ]
    if sparse_vec is not None:
        prefetch.append(Prefetch(query=sparse_vec, using="sparse", limit=max(n * 4, 20)))

    try:
        result = client.query_points(
            collection_name=COLLECTION_NAME,
            prefetch=prefetch,
            query=FusionQuery(fusion=Fusion.RRF),
            query_filter=qdrant_filter,
            limit=n,
            with_payload=True,
        )
    except Exception:
        logger.exception("Qdrant hybrid_search failed")
        return None

    snippets: list[Snippet] = []
    for p in getattr(result, "points", []) or []:
        payload = p.payload or {}
        # Prefer the corpus's natural ID (stored at index time) over the
        # internal UUID — keeps citation IDs human-readable.
        snippet_id = str(payload.get("corpus_id") or p.id)
        snippets.append(Snippet(
            id=snippet_id,
            source=str(payload.get("source", "")),
            section=str(payload.get("section", "")),
            text=str(payload.get("text", "")),
            score=float(getattr(p, "score", 0.0) or 0.0),
        ))
    return snippets
