"""Pydantic v2 models for the triage and verdict endpoints (Plan 2.0).

The CareLevel enum string values ARE the API contract — they flow into
JSON unchanged. Do not abbreviate ("ER", "home") or paraphrase.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.risk import RiskAssessment


class CareLevel(str, Enum):
    HOME = "Home Care"
    CLINIC = "Clinic Visit"
    ER = "Emergency Room"


class Sex(str, Enum):
    M = "M"
    F = "F"
    OTHER = "other"


PinBodyView = Literal["front", "back", "left", "right", "interior"]
PinQuality = Literal["burning", "stabbing", "throbbing", "pressure", "cramping"]
PinDurationBand = Literal["just_started", "few_hours", "since_yesterday", "days_or_weeks"]
PinAggravator = Literal["moving", "eating", "breathing", "pressing", "standing_up", "nothing"]
PinLayer = Literal["skin", "muscle", "skeleton", "organs"]
InputMode = Literal["text", "voice", "body_map", "body_map_3d"]


class Pin(BaseModel):
    """Symptom Cinema v1 Pin + Plan 6.1 v1.5 additive extension.

    v1 fields (required, per docs/SYMPTOM_CINEMA.md §3): body_region,
    body_view, x, y, intensity, quality, duration_band, aggravators.

    v1.5 fields (optional, per docs/PROMPTS_PLAN_6.1.md): fma_id,
    mesh_position_3d, layer_visible. Plan 4.0 / 5.x payloads without
    these still validate. The body_view union is extended for 3D
    viewports (left, right, interior).
    """

    model_config = ConfigDict(extra="ignore")

    body_region: str = Field(..., min_length=1, max_length=64)
    body_view: PinBodyView
    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    intensity: int = Field(..., ge=1, le=10)
    quality: list[PinQuality] = Field(default_factory=list)
    duration_band: PinDurationBand
    aggravators: list[PinAggravator] = Field(default_factory=list)

    # Plan 6.1 v1.5 additive — optional, never required.
    fma_id: str | None = Field(default=None, max_length=32)
    mesh_position_3d: tuple[float, float, float] | None = None
    layer_visible: PinLayer | None = None


class TriageRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    symptoms: str = Field(..., min_length=2, max_length=2000)
    session_id: UUID | None = None
    age: int | None = Field(default=None, ge=0, le=120)
    sex: Sex | None = None
    history: list[str] | str | None = None
    vitals: dict[str, float | int] | str | None = None

    # Plan 3.0+ Symptom Cinema input (optional; chat-only clients still
    # work). When present, pins are merged into the extract_symptoms
    # tool input.
    structured_symptoms: list[Pin] | None = None
    input_mode: InputMode | None = None


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
    version: str = "0.5.1"

    # Plan 2.0 additions (optional fields keep Plan 1.0 clients compatible).
    verdict_id: UUID | None = None
    esi: int | None = Field(default=None, ge=1, le=5)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    model_version: str | None = None

    # Plan 3.0 additions.
    citations: list[Citation | str] = Field(default_factory=list)
    differential: DifferentialOut | None = None
    language: str | None = None

    # Plan 5.1 additions — dynamic risk score, optional so older clients
    # stay compatible.
    risk: RiskAssessment | None = None
    risk_escalated: bool = False


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
    "Pin", "PinBodyView", "PinQuality", "PinDurationBand",
    "PinAggravator", "PinLayer", "InputMode",
]
