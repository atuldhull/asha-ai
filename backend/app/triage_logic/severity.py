"""Severity-score fallback.

Loads Role C's symptom_severity.csv when it exists. Until then, ships with a
small embedded table so the API stays functional. The fallback mapping is:

    severity < 0.30 → Home Care
    0.30 <= s < 0.60 → Clinic Visit
    severity >= 0.60 → Emergency Room
"""
from __future__ import annotations

import csv
from pathlib import Path

# Search order: Role C may publish either to ml/ (per user briefing) or to
# backend/app/data/ (per PROMPTS_PLAN_1.0 spec). Check both.
_CSV_CANDIDATES = [
    Path(__file__).resolve().parents[3] / "ml" / "symptom_severity.csv",
    Path(__file__).resolve().parents[1] / "data" / "symptom_severity.csv",
]

# Plan 1.0 placeholder severities — overridden when the CSV file ships.
# Keys use snake_case, matching the format documented for Role C.
_PLACEHOLDER_SEVERITY: dict[str, float] = {
    "chest_pain": 0.85,
    "shortness_of_breath": 0.80,
    "syncope": 0.85,
    "slurred_speech": 0.95,
    "face_droop": 0.95,
    "arm_weakness": 0.90,
    "worst_headache_ever": 0.95,
    "seizure": 0.90,
    "altered_consciousness": 0.95,
    "heavy_bleeding": 0.95,
    "vomiting_blood": 0.95,
    "coughing_blood": 0.90,
    "suicidal_ideation": 1.00,
    "severe_headache": 0.70,
    "high_fever": 0.55,
    "persistent_cough": 0.45,
    "abdominal_pain": 0.45,
    "back_pain": 0.30,
    "dysuria": 0.35,
    "fever": 0.40,
    "vomiting": 0.40,
    "diarrhea": 0.35,
    "rash": 0.30,
    "sore_throat": 0.15,
    "mild_cough": 0.15,
    "runny_nose": 0.10,
    "mild_fever": 0.20,
    "headache": 0.25,
    "body_ache": 0.20,
    "fatigue": 0.20,
}


def _load_csv() -> dict[str, float]:
    for path in _CSV_CANDIDATES:
        if path.exists():
            table: dict[str, float] = {}
            with path.open(newline="", encoding="utf-8") as fh:
                reader = csv.DictReader(fh)
                for row in reader:
                    sym = row.get("symptom", "").strip().lower()
                    try:
                        weight = float(row.get("severity_weight", "0"))
                    except ValueError:
                        continue
                    if sym:
                        table[sym] = weight
            if table:
                return table
    return dict(_PLACEHOLDER_SEVERITY)


_SEVERITY = _load_csv()


def reload() -> None:
    """Re-read the CSV (for hot-reload during dev / Role C handoff)."""
    global _SEVERITY
    _SEVERITY = _load_csv()


def compute_severity(symptoms_text: str) -> tuple[float, list[str]]:
    """Return (max_severity, matched_symptom_names) for the input text."""
    text = symptoms_text.lower()
    matched: list[tuple[str, float]] = []
    for sym, weight in _SEVERITY.items():
        token = sym.replace("_", " ")
        if token in text:
            matched.append((sym, weight))
    if not matched:
        return 0.0, []
    matched.sort(key=lambda x: x[1], reverse=True)
    return matched[0][1], [name for name, _ in matched]


def severity_to_level(score: float) -> str:
    if score >= 0.60:
        return "Emergency Room"
    if score >= 0.30:
        return "Clinic Visit"
    return "Home Care"
