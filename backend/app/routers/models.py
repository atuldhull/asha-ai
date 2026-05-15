"""GET /api/v1/models/edge-manifest — Plan 6.4 on-device model manifest.

The mobile app calls this once at install (and periodically thereafter)
to learn where to download:
  - The edge LLM GGUF (gemma2:2b Q4_K_M from Role C's Hugging Face repo)
  - The body-map regions.yaml (Role A's Plan 6.1 deliverable)

URLs + SHA256 + size are configured via env vars. When unset the endpoint
returns null for that artifact — the mobile app's "edge mode" gracefully
falls back to network triage.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["models"])


class EdgeArtifact(BaseModel):
    url: str | None = None
    sha256: str | None = None
    size_mb: float | None = None
    version: str | None = None


class EdgeManifest(BaseModel):
    gemma2_2b_q4: EdgeArtifact
    regions_yaml: EdgeArtifact
    manifest_version: str
    notes: str


def _artifact_from_env(prefix: str) -> EdgeArtifact:
    url = os.getenv(f"{prefix}_URL") or None
    sha = os.getenv(f"{prefix}_SHA256") or None
    size = os.getenv(f"{prefix}_SIZE_MB")
    version = os.getenv(f"{prefix}_VERSION") or None
    size_mb: float | None = None
    try:
        size_mb = float(size) if size else None
    except ValueError:
        size_mb = None
    return EdgeArtifact(url=url, sha256=sha, size_mb=size_mb, version=version)


@router.get("/models/edge-manifest", response_model=EdgeManifest)
async def edge_manifest() -> EdgeManifest:
    return EdgeManifest(
        gemma2_2b_q4=_artifact_from_env("EDGE_LLM_GEMMA2_Q4"),
        regions_yaml=_artifact_from_env("EDGE_REGIONS_YAML"),
        manifest_version="0.6.4",
        notes=(
            "All artifacts are optional. Mobile app falls back to "
            "network-only triage when an artifact URL is null. "
            "License terms for each artifact live in LICENSES/3RD_PARTY.md."
        ),
    )
