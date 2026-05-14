"""Plan 3.0 endpoint smoke tests.

Mental-health-check is anonymous-friendly; profile / voice / sessions /
explain require auth. None of these tests rely on Supabase being
configured — they verify the contract surface only.
"""
from __future__ import annotations

import io

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


# ─── /mental-health-check (anonymous) ────────────────────────────────────
def test_mental_health_check_returns_helplines_anonymously():
    r = client.post("/api/v1/mental-health-check")
    assert r.status_code == 200
    body = r.json()
    assert body["is_emergency"] is True
    names = {h["name"] for h in body["helplines"]}
    numbers = {h["number"] for h in body["helplines"]}
    assert "iCall" in names
    assert "9152987821" in numbers
    assert body["emergency_numbers"]["ambulance"] == "108"
    assert "professional medical diagnosis" in body["disclaimer"]


# ─── /profile/* (authed; 401 without bearer) ─────────────────────────────
def test_profile_language_requires_auth():
    r = client.patch("/api/v1/profile/language", json={"language": "hi"})
    assert r.status_code == 401


def test_profile_me_requires_auth():
    r = client.get("/api/v1/profile/me")
    assert r.status_code == 401


# ─── /voice/transcribe (authed; 401 without bearer) ──────────────────────
def test_voice_transcribe_requires_auth():
    files = {"audio": ("clip.webm", io.BytesIO(b"\x00\x00"), "audio/webm")}
    data = {"language": "hi", "session_id": "00000000-0000-0000-0000-000000000000"}
    r = client.post("/api/v1/voice/transcribe", files=files, data=data)
    assert r.status_code == 401


# ─── /triage now carries citations + differential ─────────────────────────
def test_triage_response_includes_at_least_one_citation():
    r = client.post("/api/v1/triage", json={"symptoms": "severe chest pain radiating to left arm with sweating"})
    body = r.json()
    assert r.status_code == 200
    assert body["level"] == "Emergency Room"
    citations = body.get("citations") or []
    assert citations, "Plan 3.0 contract: every verdict has >=1 citation"
    # Citation is an object with id/source.
    first = citations[0]
    assert isinstance(first, dict)
    assert "source" in first and "id" in first


def test_triage_response_includes_differential_when_known():
    r = client.post("/api/v1/triage", json={"symptoms": "severe chest pain"})
    body = r.json()
    diff = body.get("differential")
    assert diff is not None
    cant_miss_names = {c["name"] for c in diff["cant_miss"]}
    assert "Acute coronary syndrome" in cant_miss_names


def test_triage_runny_nose_has_common_cold_in_differential():
    r = client.post("/api/v1/triage", json={"symptoms": "runny nose sore throat 2 days"})
    body = r.json()
    diff = body.get("differential")
    assert diff is not None
    assert any(c["name"].startswith("Common cold") for c in diff["most_likely"])
    # Common cold returns ≥1 citation too.
    assert body.get("citations")


def test_root_advertises_v0_3_0():
    r = client.get("/")
    assert r.status_code == 200
    assert r.json()["version"] == "0.3.0"
