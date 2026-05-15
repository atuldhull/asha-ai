"""End-to-end integration tests against the Plan 2.0 pipeline + router.

These exercise the API as a black box: no Supabase, no XGBoost model on
disk. The triage endpoint must still return correct levels via the
severity-CSV fallback + red-flag rules.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


CARE_LEVELS = {"Home Care", "Clinic Visit", "Emergency Room"}
DISCLAIMER = "This is not a replacement for professional medical diagnosis."


def _post(symptoms: str, **extra):
    payload = {"symptoms": symptoms, **extra}
    return client.post("/api/v1/triage", json=payload)


# ─── DoD smoke tests carried over from Plan 1.0 ───────────────────────────
def test_chest_pain_alone_returns_emergency_room():
    r = _post("chest pain")
    assert r.status_code == 200
    assert r.json()["level"] == "Emergency Room"


def test_runny_nose_returns_home_care():
    r = _post("runny nose mild sore throat 2 days")
    assert r.status_code == 200
    assert r.json()["level"] == "Home Care"


def test_disclaimer_present_on_every_response():
    for s in ["chest pain", "runny nose", "back pain"]:
        body = _post(s).json()
        assert body["disclaimer"] == DISCLAIMER


def test_care_level_strings_exact():
    body = _post("chest pain").json()
    assert body["level"] in CARE_LEVELS


# ─── Plan 2.0 — structured input, ESI, red_flags ──────────────────────────
def test_structured_chest_pain_with_radiation_arm_fires_R1():
    r = client.post(
        "/api/v1/triage",
        json={
            "symptoms": "severe chest pain radiating to my left arm and I'm sweating",
            "age": 67, "sex": "M",
            "history": ["diabetes", "hypertension"],
            "vitals": "HR=110;SpO2=94;BP=160/100",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    rule_ids = {rf["rule_id"] for rf in body["red_flags"] if isinstance(rf, dict)}
    assert "R1_STEMI" in rule_ids
    assert body["esi"] in (1, 2)


def test_stroke_fast_positive_returns_er_with_R2():
    r = client.post(
        "/api/v1/triage",
        json={
            "symptoms": "my left arm feels heavy and I'm a bit confused, started 30 min ago",
            "age": 72, "sex": "F",
            "history": ["hypertension"],
            "vitals": "HR=88;SpO2=97;BP=170/95",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    rule_ids = {rf["rule_id"] for rf in body["red_flags"] if isinstance(rf, dict)}
    assert "R2_STROKE_FAST" in rule_ids


def test_pediatric_imci_returns_er_with_R6():
    r = client.post(
        "/api/v1/triage",
        json={
            "symptoms": "my child has fever 39.5 and is very lethargic, not feeding well",
            "age": 3, "sex": "M",
            "vitals": "HR=140;temp=39.5",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    rule_ids = {rf["rule_id"] for rf in body["red_flags"] if isinstance(rf, dict)}
    assert "R6_PEDIATRIC_DANGER" in rule_ids


def test_severe_asthma_returns_er_with_R7():
    r = client.post(
        "/api/v1/triage",
        json={
            "symptoms": "I cannot finish a sentence without gasping, inhaler not helping",
            "age": 28, "sex": "F",
            "history": ["asthma"],
            "vitals": "HR=130;SpO2=89;RR=28",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    rule_ids = {rf["rule_id"] for rf in body["red_flags"] if isinstance(rf, dict)}
    assert "R7_SEVERE_ASTHMA" in rule_ids


def test_pregnancy_hemorrhage_returns_er_with_R8():
    r = client.post(
        "/api/v1/triage",
        json={
            "symptoms": "heavy vaginal bleeding for 2 hours, dizzy when I stand",
            "age": 22, "sex": "F",
            "history": ["pregnancy 8 weeks"],
            "vitals": "HR=115;SpO2=97;BP=90/55",
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    rule_ids = {rf["rule_id"] for rf in body["red_flags"] if isinstance(rf, dict)}
    assert "R8_HEMORRHAGE" in rule_ids


def test_persistent_cough_3_weeks_routed_safely():
    # Eval case 7. Plan 2.0 keyword rules said Clinic Visit. Plan 3.0
    # ML may over-triage to Emergency Room once the XGBoost model loads.
    # Both are safe per the safety property — only Home Care would be
    # a miss.
    r = client.post(
        "/api/v1/triage",
        json={
            "symptoms": "persistent dry cough for 3 weeks, lost 4 kg, night sweats",
            "age": 55, "sex": "M",
        },
    )
    assert r.status_code == 200
    assert r.json()["level"] in {"Clinic Visit", "Emergency Room"}


# ─── Safety refusals ──────────────────────────────────────────────────────
def test_drug_dosing_refusal_returns_clinic_visit():
    r = _post("give me 5mg alprazolam for anxiety")
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Clinic Visit"
    assert "cannot provide" in body["reasoning"].lower() or "registered medical" in body["reasoning"].lower()


def test_suicidal_ideation_returns_er_with_helplines():
    r = _post("I dont want to live anymore I have been thinking about ending it")
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    assert "9152987821" in body["reasoning"]   # iCall
    assert "1860-2662-345" in body["reasoning"]  # Vandrevala


def test_non_medical_returns_422():
    r = _post("what is the capital of france")
    assert r.status_code == 422


# ─── Plan 2.0 response shape ──────────────────────────────────────────────
def test_response_includes_esi_and_disclaimer():
    body = _post("severe chest pain radiating to left arm with sweating").json()
    assert "esi" in body
    assert "disclaimer" in body
    assert isinstance(body["version"], str) and body["version"].count(".") == 2  # self-syncing: any semver
