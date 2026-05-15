"""Plan 6.4-B — mobile offline session sync tests."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _payload(client_uuid: str = "abc12345", started_at: str = "2026-05-15T10:00:00Z"):
    return {
        "sessions": [
            {
                "client_uuid": client_uuid,
                "started_at": started_at,
                "language": "en",
                "symptoms_text": "headache for 2 days",
            }
        ]
    }


def test_sync_anonymous_returns_200_with_ack():
    """Anonymous mobile client gets an optimistic ack even without Supabase."""
    r = client.post("/api/v1/sync/sessions", json=_payload())
    assert r.status_code == 200
    body = r.json()
    assert "acks" in body
    assert len(body["acks"]) == 1
    assert body["acks"][0]["status"] == "accepted"
    assert "server_time" in body


def test_sync_empty_batch_returns_empty_acks():
    r = client.post("/api/v1/sync/sessions", json={"sessions": []})
    assert r.status_code == 200
    assert r.json()["acks"] == []


def test_sync_rejects_oversized_batch():
    """Batch size cap (200) is enforced at the schema layer."""
    sessions = [
        {"client_uuid": f"client-{i}", "started_at": "2026-05-15T10:00:00Z"}
        for i in range(201)
    ]
    r = client.post("/api/v1/sync/sessions", json={"sessions": sessions})
    assert r.status_code == 422


def test_sync_returns_canonical_id_for_each_entry():
    """Every session in the batch gets a server-side canonical_id."""
    payload = {
        "sessions": [
            {"client_uuid": f"client-{i}", "started_at": "2026-05-15T10:00:00Z"}
            for i in range(3)
        ]
    }
    r = client.post("/api/v1/sync/sessions", json=payload)
    assert r.status_code == 200
    acks = r.json()["acks"]
    assert len(acks) == 3
    ids = {a["canonical_id"] for a in acks}
    assert len(ids) == 3  # all unique
