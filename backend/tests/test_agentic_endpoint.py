"""Plan 4.0 — /triage endpoint regression tests under AGENTIC_MODE.

When AGENTIC_MODE=synthetic, /triage should still:
  - Return level in {Home Care, Clinic Visit, Emergency Room}
  - Include disclaimer
  - Include red_flags for ER cases driven by R1-R9
  - Include >= 1 citation
  - 422 on non-medical input
  - 200 with helplines for suicidal ideation
"""
from __future__ import annotations

import importlib

from fastapi.testclient import TestClient


def _client_with_agentic_mode(monkeypatch, mode: str) -> TestClient:
    monkeypatch.setenv("AGENTIC_MODE", mode)
    # Re-import the app so the env change takes effect at import time
    # (the orchestrator.is_enabled() check reads it on every request, so
    # reloading isn't strictly required — but harmless).
    import app.main as main_mod
    importlib.reload(main_mod)
    return TestClient(main_mod.app)


def test_agentic_synthetic_chest_pain_returns_er(monkeypatch):
    client = _client_with_agentic_mode(monkeypatch, "synthetic")
    r = client.post("/api/v1/triage", json={
        "symptoms": "severe chest pain radiating to left arm and sweating",
        "age": 67, "sex": "M", "history": ["diabetes"],
    })
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    assert body["red_flags"]
    rule_ids = {rf["rule_id"] for rf in body["red_flags"] if isinstance(rf, dict)}
    assert "R1_STEMI" in rule_ids
    assert body["citations"]
    assert "professional medical diagnosis" in body["disclaimer"]


def test_agentic_synthetic_runny_nose_returns_home_care(monkeypatch):
    client = _client_with_agentic_mode(monkeypatch, "synthetic")
    r = client.post("/api/v1/triage", json={
        "symptoms": "runny nose mild sore throat 2 days",
        "age": 30, "sex": "F",
    })
    assert r.status_code == 200
    assert r.json()["level"] == "Home Care"


def test_agentic_synthetic_non_medical_returns_422(monkeypatch):
    client = _client_with_agentic_mode(monkeypatch, "synthetic")
    r = client.post("/api/v1/triage", json={
        "symptoms": "what is the capital of france",
    })
    assert r.status_code == 422


def test_agentic_synthetic_suicidal_returns_er_with_helplines(monkeypatch):
    client = _client_with_agentic_mode(monkeypatch, "synthetic")
    r = client.post("/api/v1/triage", json={
        "symptoms": "I don't want to live anymore",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    assert "9152987821" in body["reasoning"]


def test_agentic_off_falls_back_to_legacy_pipeline(monkeypatch):
    """When AGENTIC_MODE=off (or unset) the legacy pipeline runs."""
    client = _client_with_agentic_mode(monkeypatch, "off")
    r = client.post("/api/v1/triage", json={"symptoms": "chest pain"})
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
