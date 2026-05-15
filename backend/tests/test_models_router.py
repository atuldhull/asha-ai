"""Plan 6.4-B — edge-manifest endpoint tests."""
from __future__ import annotations

import os

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_edge_manifest_returns_200():
    r = client.get("/api/v1/models/edge-manifest")
    assert r.status_code == 200
    body = r.json()
    assert "gemma2_2b_q4" in body
    assert "regions_yaml" in body
    assert body["manifest_version"] == "0.6.4"


def test_edge_manifest_artifacts_null_when_env_unset(monkeypatch):
    """When env vars aren't set, artifact urls are null (mobile falls back)."""
    monkeypatch.delenv("EDGE_LLM_GEMMA2_Q4_URL", raising=False)
    monkeypatch.delenv("EDGE_REGIONS_YAML_URL", raising=False)
    r = client.get("/api/v1/models/edge-manifest")
    body = r.json()
    assert body["gemma2_2b_q4"]["url"] is None
    assert body["regions_yaml"]["url"] is None


def test_edge_manifest_reads_env_when_set(monkeypatch):
    monkeypatch.setenv("EDGE_LLM_GEMMA2_Q4_URL", "https://huggingface.co/test/asha-edge-q4")
    monkeypatch.setenv("EDGE_LLM_GEMMA2_Q4_SHA256", "abc123")
    monkeypatch.setenv("EDGE_LLM_GEMMA2_Q4_SIZE_MB", "1580")
    monkeypatch.setenv("EDGE_LLM_GEMMA2_Q4_VERSION", "v1.0")
    r = client.get("/api/v1/models/edge-manifest")
    body = r.json()
    assert body["gemma2_2b_q4"]["url"] == "https://huggingface.co/test/asha-edge-q4"
    assert body["gemma2_2b_q4"]["sha256"] == "abc123"
    assert body["gemma2_2b_q4"]["size_mb"] == 1580.0
