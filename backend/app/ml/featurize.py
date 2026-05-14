"""Turn a patient's free-text symptoms + structured fields into a feature dict.

The featurizer extracts:
  - `symptoms`: snake_case symptom tokens detected in the text. Matched
    against the keys of `symptom_severity.csv` (Role C's hand-authored
    table). Substrings of multi-word tokens are also checked.
  - `age`, `sex`, `history`, `vitals`: passed through from the request.

This dict feeds three downstream consumers:
  1. `red_flags.get_red_flags()` — checks for the presence of canonical
     symptom tokens (e.g. `chest_pain`, `face_droop`).
  2. `classifier.predict()` — multi-hot encodes the symptom list against
     the trained model's feature order. Falls back to severity-CSV
     scoring when no XGBoost model file is present.
  3. The audit log — only hashed forms are stored.
"""
from __future__ import annotations

import re
from typing import Any

from app.triage_logic.severity import _SEVERITY


_SYMPTOM_TOKENS = sorted(_SEVERITY.keys(), key=len, reverse=True)


# Phrases a patient might type that map onto a snake_case symptom token.
# Kept narrow and unambiguous; the CSV's snake_case keys handle the rest
# via the "_" → " " substitution in `extract_symptoms`.
_PHRASE_TO_TOKEN: dict[str, str] = {
    "chest pain": "chest_pain",
    "chest pressure": "chest_pain",
    "chest tightness": "chest_pain",
    "left arm": "radiation_arm",
    "right arm": "radiation_arm",
    "arm radiation": "radiation_arm",
    "radiating to my arm": "radiation_arm",
    "jaw pain": "radiation_jaw",
    "sweating": "diaphoresis",
    "sweaty": "diaphoresis",
    "cold sweat": "diaphoresis",
    "short of breath": "shortness_of_breath",
    "shortness of breath": "shortness_of_breath",
    "breathless": "shortness_of_breath",
    "difficulty breathing": "shortness_of_breath",
    "trouble breathing": "shortness_of_breath",
    "can't breathe": "shortness_of_breath",
    "cant breathe": "shortness_of_breath",
    "fainted": "syncope",
    "passed out": "syncope",
    "face droop": "face_droop",
    "facial droop": "face_droop",
    "drooping face": "face_droop",
    "one side of my face": "face_droop",
    "arm weakness": "arm_weakness",
    "weak arm": "arm_weakness",
    "leg weakness": "arm_weakness",
    "arm feels heavy": "arm_weakness",
    "left arm feels heavy": "arm_weakness",
    "right arm feels heavy": "arm_weakness",
    "arm is heavy": "arm_weakness",
    "slurred speech": "slurred_speech",
    "slurring": "slurred_speech",
    "trouble speaking": "slurred_speech",
    "suddenly confused": "sudden_confusion",
    "sudden confusion": "sudden_confusion",
    "a bit confused": "sudden_confusion",
    "bit confused": "sudden_confusion",
    "feeling confused": "sudden_confusion",
    "i'm confused": "sudden_confusion",
    "im confused": "sudden_confusion",
    "i am confused": "sudden_confusion",
    "sudden vision loss": "sudden_vision_loss",
    "lost my vision": "sudden_vision_loss",
    "worst headache": "worst_headache_ever",
    "thunderclap headache": "worst_headache_ever",
    "seizure": "seizure",
    "convulsion": "seizure",
    "unconscious": "altered_consciousness",
    "altered mental": "altered_consciousness",
    "rash": "rash",
    "hives": "rash",
    "swollen face": "swelling",
    "swollen lips": "swelling",
    "throat closing": "throat_tightness",
    "throat tight": "throat_tightness",
    "wheezing": "wheezing",
    "wheeze": "wheezing",
    "heavy bleeding": "heavy_bleeding",
    "vomiting blood": "vomiting_blood",
    "throwing up blood": "vomiting_blood",
    "coughing blood": "coughing_blood",
    "black stool": "black_tarry_stool",
    "tarry stool": "black_tarry_stool",
    "vaginal bleeding": "vaginal_bleeding_pregnancy",
    "kill myself": "suicidal_ideation",
    "end my life": "suicidal_ideation",
    "harm myself": "suicidal_ideation",
    "fever 39": "high_fever",
    "fever 40": "high_fever",
    "high fever": "high_fever",
    "lethargic": "lethargy",
    "very tired": "fatigue",
    "fontanelle": "fontanelle_bulge",
    "fruity breath": "fruity_breath",
    "rapid breathing": "rapid_breathing",
    "very thirsty": "high_thirst",
    "frequent urination": "frequent_urination",
    "burning urination": "dysuria",
    "painful urination": "dysuria",
    "can't speak full sentences": "cannot_speak_full_sentences",
    "cant speak full sentences": "cannot_speak_full_sentences",
    "can't finish sentences": "cannot_speak_full_sentences",
    "drowsy": "drowsy",
    "blue lips": "cyanosis",
    "runny nose": "runny_nose",
    "stuffy nose": "runny_nose",
    "blocked nose": "runny_nose",
    "sore throat": "sore_throat",
    "mild cough": "mild_cough",
    "tension headache": "tension_headache",
    "loose stool": "loose_motion",
    "loose motion": "loose_motion",
    "mild fever": "mild_fever",
    "low fever": "mild_fever",
}


def extract_symptoms(text: str) -> list[str]:
    """Return ordered, de-duplicated snake_case symptom tokens found in text."""
    lower = text.lower()
    found: list[str] = []
    seen: set[str] = set()

    # 1. Match curated phrases first (longer phrases beat their substrings).
    for phrase in sorted(_PHRASE_TO_TOKEN.keys(), key=len, reverse=True):
        if phrase in lower and _PHRASE_TO_TOKEN[phrase] not in seen:
            tok = _PHRASE_TO_TOKEN[phrase]
            found.append(tok)
            seen.add(tok)

    # 2. Match raw snake_case tokens from the severity CSV (token with
    #    underscores replaced by spaces — e.g. "chest_pain" → "chest pain").
    for token in _SYMPTOM_TOKENS:
        if token in seen:
            continue
        spaced = token.replace("_", " ")
        if spaced in lower:
            found.append(token)
            seen.add(token)

    return found


_DURATION_LONG = re.compile(r"\b(\d+)\s*(?:week|weeks|wk|months?|years?)\b", re.IGNORECASE)
_DURATION_DAYS = re.compile(r"\b(\d+)\s*(?:day|days)\b", re.IGNORECASE)
_CHILD = re.compile(r"\b(child|infant|baby|toddler|kid|my son|my daughter)\b", re.IGNORECASE)
_AGE_TEXT = re.compile(r"\b(\d{1,3})[\s-]*(?:year|yr|y/o|years old|yo)\b", re.IGNORECASE)
_PREGNANCY = re.compile(r"\b(pregnan|miscarriage|trimester|weeks pregnant|gestation)\b", re.IGNORECASE)


def _normalise_vitals(vitals: dict[str, Any] | None) -> dict[str, float]:
    out: dict[str, float] = {}
    if not vitals:
        return out
    for k, v in vitals.items():
        try:
            out[k.lower()] = float(v)
        except (TypeError, ValueError):
            continue
    return out


def _derive_age(text: str, supplied: int | None) -> int | None:
    if supplied is not None:
        return supplied
    m = _AGE_TEXT.search(text or "")
    if m:
        try:
            return int(m.group(1))
        except ValueError:
            return None
    return None


def _derive_duration_days(text: str) -> int | None:
    days: int | None = None
    m_days = _DURATION_DAYS.search(text or "")
    if m_days:
        try:
            days = int(m_days.group(1))
        except ValueError:
            days = None
    m_long = _DURATION_LONG.search(text or "")
    if m_long:
        try:
            n = int(m_long.group(1))
            days = max(days or 0, n * 7)
        except ValueError:
            pass
    return days


def featurize(
    symptoms_text: str,
    age: int | None = None,
    sex: str | None = None,
    history: list[str] | None = None,
    vitals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a flat feature dict suitable for both rules and ML inference."""
    text = symptoms_text or ""
    tokens = extract_symptoms(text)
    derived_age = _derive_age(text, age)
    is_child = (derived_age is not None and derived_age < 5) or bool(_CHILD.search(text))
    is_pregnant = bool(_PREGNANCY.search(text)) or any(
        "pregnan" in (h or "").lower() for h in (history or [])
    )
    return {
        "symptoms": tokens,
        "raw_text": text,
        "age": derived_age,
        "sex": sex,
        "history": [h.strip().lower() for h in (history or []) if h],
        "vitals": _normalise_vitals(vitals),
        "is_child": is_child,
        "is_pregnant": is_pregnant,
        "duration_days": _derive_duration_days(text),
    }


def has(features: dict[str, Any], symptom: str) -> bool:
    return symptom in features.get("symptoms", [])


def any_of(features: dict[str, Any], symptoms: list[str]) -> bool:
    present = features.get("symptoms", [])
    return any(s in present for s in symptoms)


def history_includes(features: dict[str, Any], conditions: list[str]) -> bool:
    hist = features.get("history", [])
    text = (features.get("raw_text") or "").lower()
    for cond in conditions:
        c = cond.lower()
        if any(c in h for h in hist):
            return True
        if c in text:
            return True
    return False
