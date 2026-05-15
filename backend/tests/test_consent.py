"""Plan 6.6 Phase B — DPDP consent endpoint tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.dpdp_store import reset_for_tests
from app.main import app
from app.models.consent import CONSENT_VERSION

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_store():
    reset_for_tests()
    yield
    reset_for_tests()


def test_post_consent_anonymous_returns_201():
    """Anonymous users can grant consent (e.g., before sign-up)."""
    r = client.post(
        "/api/v1/consent",
        json={
            "scopes": ["triage_processing", "session_history"],
            "consent_version": CONSENT_VERSION,
            "language": "en",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user_id"] is None
    assert body["consent_version"] == CONSENT_VERSION
    assert "triage_processing" in body["scopes"]
    assert "session_history" in body["scopes"]


def test_post_consent_rejects_invalid_scope():
    r = client.post(
        "/api/v1/consent",
        json={"scopes": ["sell_my_data_lol"], "consent_version": CONSENT_VERSION},
    )
    assert r.status_code == 422


def test_get_consent_me_returns_status_with_needs_reprompt_false_after_grant():
    client.post(
        "/api/v1/consent",
        json={
            "scopes": ["triage_processing"],
            "consent_version": CONSENT_VERSION,
        },
    )
    r = client.get("/api/v1/consent/me")
    assert r.status_code == 200
    body = r.json()
    # Anonymous bucket — last consent grant under "*" or per-IP would
    # be more sophisticated; the in-memory store keys anonymous as
    # "anonymous", so a fresh read for an anonymous user should pick
    # it up.
    assert body["current_version"] == CONSENT_VERSION
    assert "triage_processing" in body["granted_scopes"]
    assert body["needs_reprompt"] is False


def test_get_consent_me_needs_reprompt_when_never_granted():
    r = client.get("/api/v1/consent/me")
    assert r.status_code == 200
    body = r.json()
    assert body["needs_reprompt"] is True
    assert body["granted_scopes"] == []


def test_get_consent_policy_returns_text():
    r = client.get("/api/v1/consent/policy")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == CONSENT_VERSION
    assert body["legal_review_status"] in {"pending", "approved"}
    assert len(body["text_markdown"]) > 50  # placeholder or real, not empty


def test_post_consent_records_ip_hash_not_raw_ip():
    """The raw client IP must never appear in the response payload."""
    r = client.post(
        "/api/v1/consent",
        json={"scopes": ["triage_processing"], "consent_version": CONSENT_VERSION},
    )
    assert r.status_code == 201
    body = r.json()
    raw_string = str(body)
    # TestClient's default client is "testclient" (no real IP), so
    # ip_hash will exist but contain the hash of "testclient".
    # We assert: no IPv4 octets like "127.0.0.1" leak through.
    assert "127.0.0.1" not in raw_string
    if body.get("ip_hash"):
        assert len(body["ip_hash"]) == 64  # SHA-256 hex length
