"""Helpers to parse free-text vitals and history strings into structured form.

Symptom-token extraction lives in [app/ml/featurize.py](../ml/featurize.py)
— that module owns the canonical phrase→token map and is shared with the
ML feature path.

This module handles two narrower jobs the router needs:

  - `parse_vitals_string("HR=110;SpO2=94;BP=160/100;temp=39.5")` →
    `{"hr": 110, "spo2": 94, "bp_sys": 160, "bp_dia": 100, "temp_c": 39.5}`
    — matches the format used in `docs/EVAL_CASES.csv`.

  - `parse_history("diabetes, hypertension, asthma")` →
    `{"diabetes", "hypertension", "asthma"}` — accepts comma-separated or
    free-text and emits snake_case tokens for `red_flags.get_red_flags`.
"""
from __future__ import annotations

import re

_VITALS_PATTERNS: list[tuple[re.Pattern[str], str, type | None]] = [
    (re.compile(r"\bhr\s*[:=]?\s*(\d{2,3})\b", re.IGNORECASE), "hr", int),
    (re.compile(r"\bspo2\s*[:=]?\s*(\d{2,3})\b", re.IGNORECASE), "spo2", int),
    (re.compile(r"\brr\s*[:=]?\s*(\d{1,3})\b", re.IGNORECASE), "rr", int),
    (re.compile(r"\bbp\s*[:=]?\s*(\d{2,3})\s*/\s*(\d{2,3})\b", re.IGNORECASE), "bp", None),
    (re.compile(r"\btemp(?:erature)?\s*[:=]?\s*(\d{2}(?:\.\d)?)\b", re.IGNORECASE), "temp_c", float),
    (re.compile(r"\bfever\s+(?:of\s+)?(\d{2}(?:\.\d)?)\b", re.IGNORECASE), "temp_c", float),
    (re.compile(r"\bglucose\s*[:=]?\s*(\d{2,3})\b", re.IGNORECASE), "glucose", int),
]


_HISTORY_NORMALISE: dict[str, str] = {
    "diabetic": "diabetes",
    "diabetes mellitus": "diabetes",
    "type 1": "type_1_diabetes",
    "type 1 diabetes": "type_1_diabetes",
    "type 2": "type_2_diabetes",
    "type 2 diabetes": "type_2_diabetes",
    "high blood pressure": "hypertension",
    "htn": "hypertension",
    "smoking": "smoker",
    "asthmatic": "asthma",
    "pregnant": "pregnancy",
    "weeks pregnant": "pregnancy",
    "allergic to": "known_allergy",
    "food allergy": "food_allergy",
    "drug allergy": "drug_allergy",
}

_HISTORY_KNOWN_TOKENS = {
    "diabetes", "type_1_diabetes", "type_2_diabetes",
    "hypertension", "smoker", "asthma", "pregnancy",
    "known_allergy", "food_allergy", "drug_allergy",
    "infection", "uti", "pneumonia",
}


def parse_vitals_string(text: str | None) -> dict[str, float | int]:
    """Parse 'HR=110;SpO2=94;BP=160/100;temp=39.5' → dict."""
    if not text:
        return {}
    out: dict[str, float | int] = {}
    for pattern, key, cast in _VITALS_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        if key == "bp":
            out["bp_sys"] = int(match.group(1))
            out["bp_dia"] = int(match.group(2))
        elif cast is not None:
            try:
                out[key] = cast(match.group(1))
            except (ValueError, TypeError):
                continue
    return out


def parse_history(value: str | list[str] | None) -> set[str]:
    """Accept list[str] or comma-separated string; emit snake_case tokens."""
    if value is None:
        return set()
    if isinstance(value, str):
        parts = [p.strip().lower() for p in value.split(",") if p.strip()]
    else:
        parts = [str(p).strip().lower() for p in value if str(p).strip()]

    out: set[str] = set()
    for part in parts:
        if part in {"none", "nil", "n/a", "no", "-"}:
            continue
        # Direct snake_case match
        snake = part.replace(" ", "_").replace("-", "_")
        if snake in _HISTORY_KNOWN_TOKENS:
            out.add(snake)
            continue
        # Phrase normalisation
        for phrase, token in _HISTORY_NORMALISE.items():
            if phrase in part:
                out.add(token)
                break
        else:
            # Unknown but kept — useful for downstream extension
            if snake:
                out.add(snake)
    return out
