"""Plan 6.6 Phase B — DPDP Act 2023 consent + right-to-deletion models.

The DPDP Act §6 requires *specific*, *informed*, *withdrawable* consent
before any personal data is processed. §13 grants the right to erasure
within a reasonable time. We treat 72h as the hard-delete grace window
per industry guidance (the soft-delete is immediate; the hard-delete
sweeps in a scheduled job).

`consent_version` lets us re-prompt when the policy text materially
changes. Bump it whenever the privacy-policy markdown (Role D's
[docs/MOBILE_CONSENT.md](../docs/MOBILE_CONSENT.md) and equivalent web
copy) changes. Old consent rows stay archived; users see a re-prompt.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

# Bump when the consent policy text materially changes. Anything older
# than this version should be treated as "consent required again".
CONSENT_VERSION = "2026-05-15.v1"


class ConsentScope(str, Enum):
    """The categories of consent a user can grant. All default OFF."""

    TRIAGE_PROCESSING = "triage_processing"        # required to use /triage at all
    SESSION_HISTORY = "session_history"            # store sessions across visits
    LONGITUDINAL_MEMORY = "longitudinal_memory"    # Plan 5.3 — "remember past visits"
    ABDM_HEALTH_LOCKER = "abdm_health_locker"      # Plan 6.6 Phase C — push to ABHA
    ANALYTICS_AGGREGATE = "analytics_aggregate"    # district-level outbreak analytics
    RESEARCH_PSEUDONYMIZED = "research_pseudonymized"  # pseudonymized research dataset


class ConsentRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    scopes: list[ConsentScope] = Field(
        default_factory=list,
        description="List of scope ids the user is consenting to.",
    )
    consent_version: str = Field(
        default=CONSENT_VERSION,
        description=(
            "Version of the privacy/consent policy the user accepted. "
            "Re-prompt logic compares this against the server's current "
            "CONSENT_VERSION."
        ),
    )
    language: str = Field(default="en", max_length=8)
    # Optional — useful when the call is server-to-server, but never sent
    # from the browser (browsers can't trust an IP in a request body).
    user_agent: str | None = Field(default=None, max_length=512)


class ConsentResponse(BaseModel):
    consent_id: str
    user_id: str | None
    scopes: list[ConsentScope]
    consent_version: str
    language: str
    ip_hash: str | None = None
    granted_at: str  # ISO-8601 UTC


class ConsentStatus(BaseModel):
    """Server-side view of a user's current consent posture."""

    user_id: str | None
    current_version: str = CONSENT_VERSION
    granted_scopes: list[ConsentScope] = Field(default_factory=list)
    needs_reprompt: bool = True
    last_granted_at: str | None = None
    last_granted_version: str | None = None


class DeletionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: str | None = Field(default=None, max_length=512)
    confirm_phrase: str = Field(
        ...,
        description=(
            "Must equal 'DELETE MY DATA' to confirm. Matches the DPDP "
            "guidance that withdrawal of consent should be a deliberate, "
            "specific act."
        ),
    )


class DeletionResponse(BaseModel):
    deletion_id: str
    user_id: str
    soft_deleted_at: str  # ISO-8601
    hard_delete_after: str  # ISO-8601 — 72h after soft_deleted_at
    affected_tables: list[str]
    audit_event: str


class DeletionStatus(BaseModel):
    user_id: str
    has_pending_deletion: bool
    soft_deleted_at: str | None = None
    hard_delete_after: str | None = None
