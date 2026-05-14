"""Safety refusal patterns — these run before triage logic.

Plan 1.0 covers three categories that appear in EVAL_CASES:
  - drug_dosing: refuse to give dosage; redirect to clinician
  - suicidal_ideation: escalate to Emergency Room + show helplines
  - non_medical: refuse off-topic queries
"""
from __future__ import annotations

import re
from typing import Literal

RefusalCategory = Literal["drug_dosing", "suicidal_ideation", "non_medical"]

_DRUG_DOSING = re.compile(
    r"\b(give|prescribe|dose|dosage|how much|how many)\b.*\b("
    r"mg|ml|tablet|pill|capsule|alprazolam|xanax|diazepam|valium|"
    r"opioid|tramadol|morphine|codeine|paracetamol|acetaminophen|"
    r"ibuprofen|aspirin|antibiotic|amoxicillin|metformin|insulin"
    r")\b",
    re.IGNORECASE,
)

_SUICIDAL = re.compile(
    r"\b("
    r"kill myself|killing myself|end my life|ending my life|"
    r"don'?t want to live|want to die|"
    r"harm myself|harming myself|self[-\s]?harm|"
    r"suicide|suicidal"
    r")\b",
    re.IGNORECASE,
)

_NON_MEDICAL = re.compile(
    r"\b("
    r"capital of|weather in|how do i cook|recipe for|"
    r"what is the meaning of|translate|write a poem|"
    r"who won|stock price|movie review"
    r")\b",
    re.IGNORECASE,
)


def detect_refusal_category(text: str) -> RefusalCategory | None:
    """Return the first matching refusal category, or None if input is medical."""
    # Suicidal ideation is checked first — it must never be missed.
    if _SUICIDAL.search(text):
        return "suicidal_ideation"
    if _DRUG_DOSING.search(text):
        return "drug_dosing"
    if _NON_MEDICAL.search(text):
        return "non_medical"
    return None
