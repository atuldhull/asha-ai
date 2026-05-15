"""Auth Pydantic + enum models — Plan 6.6 Phase A."""
from __future__ import annotations

import enum
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class UserRole(str, enum.Enum):
    """4 roles per [PROMPTS_PLAN_6.6.md Phase A](../../docs/PROMPTS_PLAN_6.6.md).

    The `patient` role is the default for anonymous-friendly `/triage` access.
    `chw` / `doctor` / `admin` require explicit grant via the admin dashboard
    (post-MVP — currently set via the seeded admin user only).
    """

    PATIENT = "patient"
    CHW = "chw"
    DOCTOR = "doctor"
    ADMIN = "admin"


# Hierarchy used by `require_role` — admin can do anything CHW/doctor can do;
# doctor can do anything patient can do; etc.
ROLE_LEVEL: dict[UserRole, int] = {
    UserRole.PATIENT: 0,
    UserRole.CHW: 10,
    UserRole.DOCTOR: 20,
    UserRole.ADMIN: 99,
}


class OTPRequestBody(BaseModel):
    phone: str = Field(..., description="E.164 phone number, e.g. +9198XXXXXXXX")

    @field_validator("phone")
    @classmethod
    def _validate_phone(cls, v: str) -> str:
        v = v.strip().replace(" ", "").replace("-", "")
        if not v.startswith("+") or not v[1:].isdigit() or len(v) < 10 or len(v) > 16:
            raise ValueError("phone must be in E.164 format, e.g. +9198XXXXXXXX")
        return v


class OTPVerifyBody(BaseModel):
    phone: str
    otp: str = Field(..., min_length=4, max_length=8)


class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in: int  # seconds


class CurrentUser(BaseModel):
    """The user context attached to every authenticated request.

    The `patient_id` is the canonical patient identifier — opaque uuid, never
    a phone number or any DPDP-protected identifier in this token.
    """

    user_id: str
    role: UserRole
    phone_hash: str  # SHA-256 hash, NEVER the raw phone number
    issued_at: datetime
    expires_at: datetime
    organization_id: str | None = None  # for CHW / doctor / admin scoped to an org


class RefreshBody(BaseModel):
    refresh_token: str
