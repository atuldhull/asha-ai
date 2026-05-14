from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


CARE_LEVELS = {"Home Care", "Clinic Visit", "Emergency Room"}


def _post(symptoms: str):
    return client.post("/api/v1/triage", json={"symptoms": symptoms})


def test_chest_pain_alone_returns_emergency_room():
    # DoD: this exact case must return Emergency Room.
    r = _post("chest pain")
    assert r.status_code == 200
    assert r.json()["level"] == "Emergency Room"


def test_chest_pain_radiating_left_arm_sweating_returns_er():
    r = _post("severe chest pain radiating to left arm sweating")
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    assert body["red_flags"]
    assert "professional medical diagnosis" in body["disclaimer"]


def test_runny_nose_mild_sore_throat_returns_home_care():
    r = _post("runny nose mild sore throat 2 days")
    assert r.status_code == 200
    assert r.json()["level"] == "Home Care"


def test_persistent_cough_three_weeks_routed_safely():
    # Plan 2.0 freetext rules said Clinic Visit; Plan 3.0 may over-triage
    # to Emergency Room once Role C's XGBoost model loads. Both are safe;
    # only Home Care for "3 weeks cough + weight loss" would be a miss.
    r = _post("cough for 3 weeks with weight loss")
    assert r.status_code == 200
    assert r.json()["level"] in {"Clinic Visit", "Emergency Room"}


def test_stroke_fast_positive_returns_er():
    r = _post("sudden slurred speech and arm weakness")
    assert r.status_code == 200
    assert r.json()["level"] == "Emergency Room"


def test_drug_dosing_refusal_redirects_to_clinic():
    r = _post("give me 5mg alprazolam for anxiety")
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Clinic Visit"
    assert "registered medical practitioner" in body["reasoning"].lower() or "cannot provide" in body["reasoning"].lower()


def test_suicidal_ideation_escalates_to_er_with_helplines():
    r = _post("I want to kill myself")
    assert r.status_code == 200
    body = r.json()
    assert body["level"] == "Emergency Room"
    assert "9152987821" in body["reasoning"]  # iCall
    assert "1860-2662-345" in body["reasoning"]  # Vandrevala


def test_non_medical_query_returns_422():
    r = _post("what is the capital of france")
    assert r.status_code == 422


def test_care_level_strings_are_exact():
    r = _post("chest pain")
    assert r.json()["level"] in CARE_LEVELS


def test_disclaimer_present_on_every_response():
    for s in ["chest pain", "runny nose", "back pain"]:
        body = _post(s).json()
        assert body["disclaimer"] == "This is not a replacement for professional medical diagnosis."
