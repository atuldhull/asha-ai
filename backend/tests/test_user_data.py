"""Plan 6.6 Phase B — DPDP right-to-deletion endpoint tests."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.dpdp_store import reset_for_tests
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _clean_store():
    reset_for_tests()
    yield
    reset_for_tests()


def test_delete_requires_auth():
    r = client.request(
        "DELETE",
        "/api/v1/user/data",
        json={"confirm_phrase": "DELETE MY DATA"},
    )
    # 401 (auth missing) — or 503 if SUPABASE_JWT_SECRET unset
    assert r.status_code in {401, 503}


def test_delete_requires_confirm_phrase(monkeypatch):
    """Even with auth, the confirm phrase MUST be exact."""
    # Bypass auth by patching the dependency.
    from app.core.auth import User, get_current_user

    fake_user = User(id="user-deletion-test-1", phone="+919876543210")

    def _fake_current_user():
        return fake_user

    app.dependency_overrides[get_current_user] = _fake_current_user
    try:
        r = client.request(
            "DELETE",
            "/api/v1/user/data",
            json={"confirm_phrase": "yes please"},
        )
        assert r.status_code == 400
        # Verify the response references the exact phrase format.
        assert "DELETE MY DATA" in r.text
    finally:
        app.dependency_overrides.clear()


def test_delete_with_correct_phrase_returns_200_and_schedules_hard_delete():
    from app.core.auth import User, get_current_user

    fake_user = User(id="user-deletion-test-2", phone="+919876543211")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        r = client.request(
            "DELETE",
            "/api/v1/user/data",
            json={
                "confirm_phrase": "DELETE MY DATA",
                "reason": "I no longer need this service",
            },
        )
        assert r.status_code == 200
        body = r.json()
        assert body["user_id"] == fake_user.id
        assert body["audit_event"] == "dpdp_right_to_deletion"
        assert "soft_deleted_at" in body
        assert "hard_delete_after" in body
        # hard_delete_after must be later than soft_deleted_at.
        assert body["hard_delete_after"] > body["soft_deleted_at"]
        assert "sessions" in body["affected_tables"]
    finally:
        app.dependency_overrides.clear()


def test_get_deletion_status_after_request():
    from app.core.auth import User, get_current_user

    fake_user = User(id="user-deletion-test-3", phone="+919876543212")
    app.dependency_overrides[get_current_user] = lambda: fake_user
    try:
        # Pre-state: no pending deletion.
        r1 = client.get("/api/v1/user/data/status")
        assert r1.status_code == 200
        assert r1.json()["has_pending_deletion"] is False

        # Submit a deletion.
        client.request(
            "DELETE",
            "/api/v1/user/data",
            json={"confirm_phrase": "DELETE MY DATA"},
        )

        # Post-state: pending.
        r2 = client.get("/api/v1/user/data/status")
        assert r2.status_code == 200
        body = r2.json()
        assert body["has_pending_deletion"] is True
        assert body["soft_deleted_at"] is not None
        assert body["hard_delete_after"] is not None
    finally:
        app.dependency_overrides.clear()
