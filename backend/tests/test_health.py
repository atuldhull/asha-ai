from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_200_with_ok_status():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["version"] == "0.3.0"


def test_root_returns_disclaimer():
    r = client.get("/")
    assert r.status_code == 200
    assert "professional medical diagnosis" in r.json()["disclaimer"]
