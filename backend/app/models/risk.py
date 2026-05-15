"""Pydantic v2 models for Plan 5.1 — Dynamic Risk Scoring.

Field names mirror `frontend/lib/types.ts` exactly so JSON crosses the
wire without mapping. The score is a continuous 0–100 — used by the
doctor cockpit to break ties between same-ESI cases.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskTrajectory(str, Enum):
    RAPIDLY_WORSENING = "rapidly_worsening"
    WORSENING = "worsening"
    STABLE = "stable"
    IMPROVING = "improving"
    INSUFFICIENT_DATA = "insufficient_data"


class SymptomInput(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str = Field(..., min_length=1, max_length=64)
    severity: int = Field(..., ge=1, le=10)
    onset_hours_ago: float = Field(..., ge=0.0, le=24 * 365)


class VitalProxy(BaseModel):
    model_config = ConfigDict(extra="ignore")
    breathing_rate: int | None = Field(default=None, ge=0, le=80)
    heart_rate: int | None = Field(default=None, ge=0, le=300)


class RiskHistoryPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ts: str
    score: float = Field(..., ge=0.0, le=100.0)


class RiskComponents(BaseModel):
    symptoms: int
    age_factor: float
    comorbidities: int
    vitals: int | None = None


class RiskAssessment(BaseModel):
    score: int = Field(..., ge=0, le=100)
    level: RiskLevel
    trajectory: RiskTrajectory
    action: str
    components: RiskComponents
    computed_at: str | None = None


class RiskComputeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    symptoms: list[SymptomInput] = Field(default_factory=list)
    age: int = Field(..., ge=0, le=120)
    sex: str = Field(default="other", pattern=r"^(M|F|other)$")
    comorbidities: list[str] = Field(default_factory=list)
    vital_proxy: VitalProxy | None = None
    history: list[RiskHistoryPoint] = Field(default_factory=list)


__all__ = [
    "RiskLevel", "RiskTrajectory",
    "SymptomInput", "VitalProxy",
    "RiskHistoryPoint", "RiskComponents",
    "RiskAssessment", "RiskComputeRequest",
]
