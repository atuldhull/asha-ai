"""Sessions / messages / explain endpoints require auth + Supabase.

In test env neither is configured, so the endpoints must return
401 (missing auth header) or 503 (Supabase unconfigured) rather than
500. This guards against accidental data leakage when env is unset.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_sessions_post_unauthed_returns_401():
    r = client.post("/api/v1/sessions", json={"language": "en"})
    assert r.status_code == 401


def test_sessions_list_unauthed_returns_401():
    r = client.get("/api/v1/sessions")
    assert r.status_code == 401


def test_messages_unauthed_returns_401():
    r = client.get("/api/v1/sessions/00000000-0000-0000-0000-000000000000/messages")
    assert r.status_code == 401


def test_explain_unauthed_returns_401():
    r = client.get("/api/v1/explain/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 401


def test_triage_works_without_auth_for_backwards_compat():
    # Plan 1.0 anonymous flow must still work — frontend uses it for
    # the first-pass demo before user accounts exist.
    r = client.post("/api/v1/triage", json={"symptoms": "chest pain"})
    assert r.status_code == 200
    assert r.json()["level"] == "Emergency Room"


def test_health_unaffected_by_auth():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
