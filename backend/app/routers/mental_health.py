"""POST /api/v1/mental-health-check — Plan 3.0.

Explicit safety route. The frontend hits this when the user picks the
"I need mental-health help" CTA, or when the triage safety layer flags
suicidal ideation. Returns the canonical helpline directory + a
non-judgemental message.

Anonymous-friendly: works WITHOUT auth so a distressed user never sees
"sign in to get help".
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.core.disclaimers import DISCLAIMER, MENTAL_HEALTH_HELPLINES

router = APIRouter(tags=["mental_health"])


_HELPLINE_DETAIL = {
    "iCall": {
        "language": "English / Hindi / Multilingual",
        "hours": "Mon–Sat 08:00–22:00 IST",
    },
    "Vandrevala Foundation": {
        "language": "English / Hindi / multiple Indian languages",
        "hours": "24×7",
    },
}


@router.post("/mental-health-check")
async def mental_health_check() -> dict[str, Any]:
    helplines = []
    for name, number in MENTAL_HEALTH_HELPLINES.items():
        detail = _HELPLINE_DETAIL.get(name, {})
        helplines.append(
            {
                "name": name,
                "number": number,
                "language": detail.get("language", "English"),
                "hours": detail.get("hours", "24×7"),
            }
        )
    return {
        "is_emergency": True,
        "helplines": helplines,
        "emergency_numbers": {
            "ambulance": "108",
            "national_emergency": "112",
        },
        "message": (
            "Please reach out — you are not alone. If you are in immediate "
            "danger, call 108 (ambulance) or 112 (national emergency). The "
            "helplines above are free, confidential, and available right now."
        ),
        "disclaimer": DISCLAIMER,
    }
