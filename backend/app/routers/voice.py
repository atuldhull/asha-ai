"""POST /api/v1/voice/transcribe — Plan 3.0.

Accepts an audio blob (Hindi/Kannada/English), runs Bhashini ASR + NMT,
uploads the audio to a private Supabase Storage bucket, then runs the
triage pipeline on the English transcript and returns:

    {
      "transcript_source": "...",     # original-language ASR text
      "transcript_english": "...",    # English NMT (input to triage)
      "audio_request_path":  "...",   # storage path of the request audio
      "audio_response_url":  "...",   # signed URL of the TTS response
      "verdict": { TriageResponse ... }
    }

Requirements:
  - Bhashini API key (env: BHASHINI_API_KEY) — falls back to 503 otherwise
  - Supabase configured for audio storage + message persistence — 503 otherwise

Audio is PHI: bucket is private and the raw blob is never logged. Audio
retention should be set to 7 days via the Supabase lifecycle policy.
"""
from __future__ import annotations

import base64
import logging
import uuid
from typing import Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)

from app.core.auth import User, get_current_user
from app.core.disclaimers import DISCLAIMER
from app.core.supabase_client import SupabaseNotConfigured, service_client
from app.models.triage import TriageResponse
from app.nlp.bhashini import BhashiniUnavailable, is_configured as bhashini_configured
from app.nlp.bhashini import synthesize, transcribe_translate
from app.triage_logic.pipeline import run_pipeline

router = APIRouter(prefix="/voice", tags=["voice"])
logger = logging.getLogger(__name__)

_BUCKET = "voice-audio"
_SIGNED_URL_TTL_S = 3600


def _client_or_503():
    try:
        return service_client()
    except SupabaseNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


def _bhashini_or_503() -> None:
    if not bhashini_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Bhashini not configured — set BHASHINI_API_KEY in .env "
                "after PoC signup at https://bhashini.gov.in."
            ),
        )


def _verdict_payload(resp: TriageResponse) -> dict[str, Any]:
    return resp.model_dump(exclude_none=True)


@router.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("hi"),
    session_id: UUID = Form(...),
    user: User = Depends(get_current_user),
) -> dict[str, Any]:
    _bhashini_or_503()
    client = _client_or_503()

    # Read the blob (callers should keep audio < ~5 MB for the demo).
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(400, "Empty audio payload.")
    audio_b64 = base64.b64encode(audio_bytes).decode("ascii")

    # Bhashini ASR + NMT pipeline.
    try:
        transcripts = await transcribe_translate(audio_b64, src_lang=language)
    except BhashiniUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    transcript_en = transcripts.get("transcript_english", "").strip()
    transcript_src = transcripts.get("transcript_source", "").strip()
    if not transcript_en:
        raise HTTPException(422, "Bhashini returned no transcript — try again.")

    # Verify session ownership.
    sess = (
        client.table("sessions")
        .select("user_id")
        .eq("id", str(session_id))
        .single()
        .execute()
    )
    sess_row = getattr(sess, "data", None)
    if not sess_row or sess_row.get("user_id") != user.id:
        raise HTTPException(404, "Session not found")

    # Upload the request audio (best-effort — failures don't kill triage).
    request_path = f"{user.id}/{session_id}/req-{uuid.uuid4()}.webm"
    try:
        client.storage.from_(_BUCKET).upload(
            path=request_path,
            file=audio_bytes,
            file_options={"content-type": getattr(audio, "content_type", "audio/webm") or "audio/webm"},
        )
    except Exception:
        logger.exception("voice.transcribe: request-audio upload failed.")
        request_path = ""

    # Append the user message (English transcript) to the session.
    try:
        client.table("messages").insert(
            {
                "session_id": str(session_id),
                "role": "user",
                "content": transcript_en,
                "audio_url": request_path or None,
            }
        ).execute()
    except Exception:
        logger.exception("voice.transcribe: message insert failed (continuing).")

    # Run triage on the English transcript.
    pipeline = run_pipeline(symptoms_text=transcript_en)
    verdict = pipeline.response

    # Synthesize TTS response in the user's language.
    response_url: str = ""
    try:
        audio_response = await synthesize(verdict.reasoning, lang=language)
    except BhashiniUnavailable as exc:
        logger.info("voice.transcribe: TTS unavailable (%s) — text-only response.", exc)
        audio_response = None
    if audio_response is not None:
        response_path = f"{user.id}/{session_id}/resp-{uuid.uuid4()}.wav"
        try:
            client.storage.from_(_BUCKET).upload(
                path=response_path,
                file=audio_response,
                file_options={"content-type": "audio/wav"},
            )
            signed = client.storage.from_(_BUCKET).create_signed_url(response_path, _SIGNED_URL_TTL_S)
            response_url = signed.get("signedURL") or signed.get("signed_url", "") or ""
        except Exception:
            logger.exception("voice.transcribe: response-audio upload failed.")

    return {
        "transcript_source": transcript_src,
        "transcript_english": transcript_en,
        "audio_request_path": request_path,
        "audio_response_url": response_url,
        "verdict": _verdict_payload(verdict),
        "disclaimer": DISCLAIMER,
    }
