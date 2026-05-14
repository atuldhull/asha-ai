"""Pydantic v2 models for the triage and verdict endpoints (Plan 2.0).

The CareLevel enum string values ARE the API contract — they flow into
JSON unchanged. Do not abbreviate ("ER", "home") or paraphrase.
"""
from __future__ import annotations

from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CareLevel(str, Enum):
    HOME = "Home Care"
    CLINIC = "Clinic Visit"
    ER = "Emergency Room"


class Sex(str, Enum):
    M = "M"
    F = "F"
    OTHER = "other"


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    symptoms: str = Field(..., min_length=2, max_length=2000)
    session_id: UUID | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    sex: Sex | None = None
    history: list[str] | str | None = None
    vitals: dict[str, float | int] | str | None = None


class RedFlagOut(BaseModel):
    rule_id: str
    rule_name: str
    citation: str | None = None


class Citation(BaseModel):
    id: str
    source: str
    section: str | None = None
    text: str | None = None
    score: float | None = None


class DifferentialOut(BaseModel):
    most_likely: list[dict] = Field(default_factory=list)
    expanded: list[dict] = Field(default_factory=list)
    cant_miss: list[dict] = Field(default_factory=list)


class TriageResponse(BaseModel):
    level: CareLevel
    reasoning: str
    red_flags: list[RedFlagOut | str] = Field(default_factory=list)
    disclaimer: str
    version: str = "0.3.0"

    # Plan 2.0 additions (optional fields keep Plan 1.0 clients compatible).
    verdict_id: UUID | None = None
    esi: int | None = Field(default=None, ge=1, le=5)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    model_version: str | None = None

    # Plan 3.0 additions.
    citations: list[Citation | str] = Field(default_factory=list)
    differential: DifferentialOut | None = None
    language: str | None = None


# ─── Verdicts / Explain ─────────────────────────────────────────────────
class Factor(BaseModel):
    name: str
    weight: float
    source: str | None = None  # 'shap' or 'severity_csv'


class ExplainResponse(BaseModel):
    verdict_id: UUID
    factors: list[Factor]
    summary: str
    citations: list[str] = Field(default_factory=list)
    disclaimer: str


# ─── Sessions / messages ────────────────────────────────────────────────
class SessionCreate(BaseModel):
    language: str = "en"


class SessionOut(BaseModel):
    id: UUID
    user_id: UUID
    started_at: str
    language: str
    llm_provider: str | None = None


class MessageIn(BaseModel):
    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=5000)


class MessageOut(BaseModel):
    id: UUID
    session_id: UUID
    role: str
    content: str
    created_at: str


# Backwards-compat alias for any code/tests that imported from Plan 1.0
__all__ = [
    "CareLevel", "Sex",
    "TriageRequest", "TriageResponse", "RedFlagOut",
    "Citation", "DifferentialOut",
    "Factor", "ExplainResponse",
    "SessionCreate", "SessionOut", "MessageIn", "MessageOut",
]
