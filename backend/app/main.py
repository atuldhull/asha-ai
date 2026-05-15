"""ASHA-AI FastAPI entrypoint — Plan 5.1.

Exposes:
  POST /api/v1/triage                         — triage decision support
  GET  /api/v1/health                         — liveness probe
  POST /api/v1/sessions                       — create session (authed)
  GET  /api/v1/sessions[/{id}]                — list/read sessions (authed)
  GET  /api/v1/sessions/{id}/messages         — list messages (authed)
  POST /api/v1/sessions/{id}/messages         — append message (authed)
  GET  /api/v1/explain/{verdict_id}           — top-5 attributions (authed)
  POST /api/v1/voice/transcribe               — ASR → NMT → triage → TTS (authed)
  POST /api/v1/mental-health-check            — helpline directory (anonymous)
  PATCH /api/v1/profile/language              — set preferred language (authed)
  GET  /api/v1/profile/me                     — current profile (authed)
  POST /api/v1/risk/compute                   — Plan 5.1 dynamic risk score (anonymous)
  POST /api/v1/sync/sessions                  — Plan 6.4 offline batch sync (anonymous-friendly)
  GET  /api/v1/models/edge-manifest           — Plan 6.4 on-device model manifest
  POST /api/v1/realtime/push-critical         — Plan 6.4 Ably bridge for CRITICAL risk
  POST /api/v1/consent                        — Plan 6.6 Phase B DPDP consent (anonymous-friendly)
  GET  /api/v1/consent/{me,policy}            — Plan 6.6 consent status + policy text
  DELETE /api/v1/user/data                    — Plan 6.6 DPDP right-to-deletion (authed)
  GET  /api/v1/user/data/status               — Plan 6.6 deletion status (authed)
  POST /api/v1/auth/otp/{request,verify}      — Plan 6.6 Phase A phone OTP + JWT issue
  POST /api/v1/auth/refresh                   — Plan 6.6 Phase A refresh-token rotation
  POST /api/v1/auth/logout[/all]              — Plan 6.6 Phase A logout (single / all sessions)
  GET  /api/v1/auth/me                        — Plan 6.6 Phase A current user context (authed)
  POST /api/v1/abdm/consent/request           — Plan 6.6 Phase C ABDM consent init (authed)
  GET  /api/v1/abdm/consent/status/{id}       — Plan 6.6 Phase C ABDM consent poll (authed)
  POST /api/v1/abdm/push/session              — Plan 6.6 Phase C push FHIR R4 Bundle to ABHA Locker (authed)
  GET  /api/v1/abdm/facility/status           — Plan 6.6 Phase C HFR registration check (admin)

CORS: allows localhost:3000 and the Vercel deploy origin (FRONTEND_ORIGIN),
plus any *.vercel.app preview via regex.

Rate limit: 10 req/min/user on /triage (slowapi). 429 responses include a
`Retry-After` header.

Auth is optional on /triage and /mental-health-check (anonymous-friendly).
Sessions / messages / explain / voice / profile require a Supabase
Bearer JWT; if Supabase isn't configured they return 503.

Plan 3.0 additions are all behind graceful-degradation paths:
  - Bhashini ASR/TTS: 503 when BHASHINI_API_KEY unset
  - RAG citations: pgvector when corpus is loaded, keyword-tag fallback
    otherwise — every verdict always carries ≥ 1 citation.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.abdm import abdm_router
from app.auth import auth_router
from app.core.rate_limit import limiter
from app.observability import init_sentry, instrument_app
from app.routers import (
    consent,
    explain,
    health,
    mental_health,
    messages,
    models as models_router,
    profile,
    realtime,
    risk,
    sessions,
    sync,
    triage,
    user_data,
    vision,
    voice,
)

load_dotenv()

# Initialise observability BEFORE the FastAPI app so Sentry captures
# startup errors. Both are no-ops when their respective env vars /
# packages are absent.
init_sentry(service="asha-ai-backend")

app = FastAPI(
    title="ASHA-AI Backend",
    version="0.6.6",
    description=(
        "Triage decision support — not a medical device. "
        "This is not a replacement for professional medical diagnosis."
    ),
)

# SlowAPI wiring: register the limiter on app.state and the 429 handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_explicit_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_frontend_origin = os.getenv("FRONTEND_ORIGIN", "").strip()
if _frontend_origin:
    _explicit_origins.append(_frontend_origin)

_preview_regex = os.getenv(
    "VERCEL_PREVIEW_ORIGIN_REGEX",
    r"^https://.*\.vercel\.app$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_explicit_origins,
    allow_origin_regex=_preview_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(triage.router, prefix="/api/v1")
app.include_router(sessions.router, prefix="/api/v1")
app.include_router(messages.router, prefix="/api/v1")
app.include_router(explain.router, prefix="/api/v1")
app.include_router(voice.router, prefix="/api/v1")
app.include_router(mental_health.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(risk.router, prefix="/api/v1")
app.include_router(sync.router, prefix="/api/v1")
app.include_router(models_router.router, prefix="/api/v1")
app.include_router(realtime.router, prefix="/api/v1")
app.include_router(consent.router, prefix="/api/v1")
app.include_router(user_data.router, prefix="/api/v1")
app.include_router(vision.router, prefix="/api/v1")  # Tier 6.5 Phase I · gated by VISION_TRIAGE=on

# Plan 6.6 Phase A + C — auth + ABDM. Both modules already have the prefix
# `/api/v1/...` baked in via their own APIRouter declarations.
app.include_router(auth_router)
app.include_router(abdm_router)

# Prometheus instrumentation. Must run AFTER all routers are
# registered so the auto-discovered route templates are accurate.
instrument_app(app)


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "asha-ai-backend",
        "version": "0.6.6",
        "docs": "/docs",
        "health": "/api/v1/health",
        "disclaimer": "This is not a replacement for professional medical diagnosis.",
    }
