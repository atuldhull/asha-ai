"""ESI v5 mapper + the safety property.

The safety property:
    final_care_level = max(rule_layer_level, ml_layer_level)
    where Emergency Room > Clinic Visit > Home Care

If any red-flag rule fires, the final level is locked to "Emergency Room"
regardless of what the ML model says. This is unit-tested in
tests/test_safety_property.py.
"""
from __future__ import annotations

from typing import Iterable

from app.models.triage import CareLevel
from app.triage_logic.red_flags import Flag

# DB codes ↔ exact care-level strings. Architecture stores 'home','clinic',
# 'er' in verdicts.level; the API exposes the exact strings.
DB_CODE_TO_LEVEL: dict[str, str] = {
    "home": "Home Care",
    "clinic": "Clinic Visit",
    "er": "Emergency Room",
}
LEVEL_TO_DB_CODE: dict[str, str] = {v: k for k, v in DB_CODE_TO_LEVEL.items()}

# Rank used by the safety property.
_LEVEL_RANK: dict[str, int] = {
    "Home Care": 0,
    "Clinic Visit": 1,
    "Emergency Room": 2,
}

ESI_TO_CARE: dict[int, str] = {
    1: "Emergency Room",
    2: "Emergency Room",
    3: "Clinic Visit",
    4: "Home Care",
    5: "Home Care",
}


def esi_from_severity(severity: float, vitals: dict | None = None, age: int | None = None) -> int:
    """Map a 0..1 severity score (plus optional vitals/age) to ESI 1..5."""
    vitals = vitals or {}
    spo2 = vitals.get("spo2")
    sbp = vitals.get("bp_sys")
    rr = vitals.get("rr")
    hr = vitals.get("hr")

    if severity >= 0.85:
        return 1
    if spo2 is not None and spo2 < 90:
        return 1
    if sbp is not None and sbp < 90:
        return 1
    if rr is not None and rr >= 30:
        return 1
    if severity >= 0.70:
        return 2
    if hr is not None and hr > 120:
        return 2
    if severity >= 0.50:
        return 3
    if severity >= 0.30:
        return 4
    return 5


def level_from_esi(esi: int) -> str:
    return ESI_TO_CARE.get(esi, "Clinic Visit")


def final_care_level(
    flags: Iterable[Flag] | None,
    ml_or_esi_level: str | None,
) -> str:
    """Apply the safety property.

    Picks the max(rule_layer, ml/esi_layer) where rank is
    Home Care < Clinic Visit < Emergency Room. If both inputs are None,
    falls back to "Clinic Visit" (conservative default).
    """
    candidates: list[str] = []
    flags_list = list(flags) if flags else []
    if flags_list:
        candidates.append(flags_list[0].force_level)
    if ml_or_esi_level:
        candidates.append(ml_or_esi_level)
    if not candidates:
        return "Clinic Visit"
    return max(candidates, key=lambda c: _LEVEL_RANK[c])


def to_care_level_enum(level_str: str) -> CareLevel:
    return CareLevel(level_str)
