"""ASHA-AI FastAPI entrypoint — Plan 3.0.

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

from app.core.rate_limit import limiter
from app.routers import (
    explain,
    health,
    mental_health,
    messages,
    profile,
    sessions,
    triage,
    voice,
)

load_dotenv()

app = FastAPI(
    title="ASHA-AI Backend",
    version="0.3.0",
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


@app.get("/")
async def root() -> dict[str, str]:
    return {
        "service": "asha-ai-backend",
        "version": "0.3.0",
        "docs": "/docs",
        "health": "/api/v1/health",
        "disclaimer": "This is not a replacement for professional medical diagnosis.",
    }
