"""Plan 6.4-B — Ably realtime bridge tests.

Verifies: (a) graceful degradation when ABLY_API_KEY unset,
(b) below-CRITICAL risks are not pushed, (c) dedup window holds.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.routers import realtime as realtime_module

client = TestClient(app)


def _critical_payload(patient_id: str = "patient-xyz-abc-123"):
    return {
        "patient_id": patient_id,
        "risk": {
            "score": 85,
            "level": "CRITICAL",
            "trajectory": "rapidly_worsening",
            "action": "Go to emergency room now.",
            "components": {
                "symptoms": 70,
                "age_factor": 1.4,
                "comorbidities": 15,
                "vitals": 10,
            },
        },
    }


def test_push_skipped_when_ably_unconfigured(monkeypatch):
    """When ABLY_API_KEY is unset, the push call short-circuits to 'skipped'."""
    monkeypatch.delenv("ABLY_API_KEY", raising=False)
    r = client.post("/api/v1/realtime/push-critical", json=_critical_payload())
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "skipped"
    assert body["reason"] == "ably_unconfigured"


def test_push_skipped_for_non_critical_risk(monkeypatch):
    """HIGH/MODERATE/LOW risks must not trigger an Ably publish."""
    monkeypatch.setenv("ABLY_API_KEY", "fake:key")
    payload = _critical_payload(patient_id="patient-non-critical-1")
    payload["risk"]["level"] = "HIGH"
    payload["risk"]["score"] = 55
    r = client.post("/api/v1/realtime/push-critical", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "skipped"
    assert body["reason"] == "risk_below_critical"


def test_dedup_window_blocks_second_push(monkeypatch):
    """Two CRITICAL pushes within 5min for same patient: second is deduped."""
    monkeypatch.setenv("ABLY_API_KEY", "fake:key")
    # Reset the in-memory dedup map for test isolation.
    realtime_module._last_publish.clear()

    async def _fake_publish(channel, payload):
        return True

    monkeypatch.setattr(realtime_module, "_publish_to_ably", _fake_publish)

    pid = "patient-dedup-test-1"
    r1 = client.post("/api/v1/realtime/push-critical", json=_critical_payload(pid))
    assert r1.status_code == 200
    assert r1.json()["status"] == "published"

    r2 = client.post("/api/v1/realtime/push-critical", json=_critical_payload(pid))
    assert r2.status_code == 200
    assert r2.json()["status"] == "skipped"
    assert r2.json()["reason"] == "dedup_window"


def test_push_rejects_bad_patient_id():
    """patient_id min_length is 8 to discourage trivial PII like a 4-digit code."""
    payload = _critical_payload(patient_id="short")
    r = client.post("/api/v1/realtime/push-critical", json=payload)
    assert r.status_code == 422
