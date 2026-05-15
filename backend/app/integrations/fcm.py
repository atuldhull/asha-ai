"""Firebase Cloud Messaging — Plan 6.6 Phase H (extends Tier 6.4 Ably bridge).

Push notifications for risk-CRITICAL escalations. Mobile app subscribes to
the `risk-escalation` channel; this module is the server-side push trigger.

Defensive: when FCM_SERVICE_ACCOUNT_JSON is unset, the function logs + returns
False so the Ably real-time path remains the primary delivery. Production
should set both.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger(__name__)

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"


def _service_account() -> dict | None:
    """Parse the base64-encoded service-account JSON from env. Returns None
    on any failure — caller falls back to Ably real-time delivery."""
    raw = os.getenv("FCM_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    try:
        # Allow both raw JSON and base64-encoded JSON for ergonomics.
        if raw.startswith("{"):
            return json.loads(raw)
        decoded = base64.b64decode(raw).decode("utf-8")
        return json.loads(decoded)
    except Exception:
        logger.exception("FCM_SERVICE_ACCOUNT_JSON invalid (not JSON or base64-JSON).")
        return None


def _access_token() -> str | None:
    """Mint a short-lived OAuth access token from the service-account key.

    Uses google-auth if available (preferred); falls back to a manual JWT-grant
    if google-auth isn't installed. The fallback is best-effort + cached for
    50 min (token TTL is 1h with a buffer).
    """
    sa = _service_account()
    if not sa:
        return None
    try:
        from google.oauth2 import service_account  # type: ignore
        from google.auth.transport.requests import Request  # type: ignore
        creds = service_account.Credentials.from_service_account_info(sa, scopes=[FCM_SCOPE])
        creds.refresh(Request())
        return creds.token
    except ImportError:
        # No google-auth — manual JWT grant.
        return _manual_jwt_grant(sa)
    except Exception:
        logger.exception("FCM google-auth refresh failed.")
        return None


_token_cache: dict[str, Any] = {"token": None, "expires_at": 0}


def _manual_jwt_grant(sa: dict) -> str | None:
    if _token_cache["token"] and _token_cache["expires_at"] > time.time() + 60:
        return str(_token_cache["token"])
    try:
        from jose import jwt
    except ImportError:
        logger.warning("Neither google-auth nor python-jose available; cannot mint FCM token.")
        return None
    now = int(time.time())
    payload = {
        "iss": sa["client_email"],
        "scope": FCM_SCOPE,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    try:
        assertion = jwt.encode(payload, sa["private_key"], algorithm="RS256")
    except Exception:
        logger.exception("Manual JWT signing failed.")
        return None
    try:
        import urllib.parse
        import urllib.request
        body = urllib.parse.urlencode({
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
            "assertion": assertion,
        }).encode("utf-8")
        req = urllib.request.Request(
            "https://oauth2.googleapis.com/token",
            data=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        token = data.get("access_token")
        if not token:
            return None
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + int(data.get("expires_in", 3000))
        return str(token)
    except Exception:
        logger.exception("FCM manual JWT grant failed.")
        return None


def send_risk_escalation_push(
    device_token: str,
    patient_id: str,
    session_id: str,
    risk_score: int,
    care_level: str,
) -> bool:
    """Send a push notification for a risk-CRITICAL escalation.

    Care-level string is rendered EXACT (Home Care / Clinic Visit / Emergency Room) —
    never paraphrased in the notification.
    """
    if not device_token:
        return False
    if care_level not in {"Home Care", "Clinic Visit", "Emergency Room"}:
        logger.warning("send_risk_escalation_push: invalid care_level=%s (refusing).", care_level)
        return False

    sa = _service_account()
    token = _access_token()
    if not sa or not token:
        logger.warning(
            "FCM not configured — Ably real-time channel remains primary delivery. "
            "Set FCM_SERVICE_ACCOUNT_JSON to enable push notifications."
        )
        return False

    project_id = sa.get("project_id")
    if not project_id:
        logger.warning("FCM service-account missing project_id.")
        return False

    body = {
        "message": {
            "token": device_token,
            "notification": {
                "title": "ASHA-AI · Health alert",
                "body": (
                    f"Your latest assessment recommends: {care_level}. "
                    f"Risk score {risk_score}/100. Open the app for next steps."
                ),
            },
            "data": {
                "channel": "risk-escalation",
                "patient_id": patient_id,
                "session_id": session_id,
                "risk_score": str(risk_score),
                "care_level": care_level,
            },
            "android": {
                "priority": "HIGH",
                "notification": {
                    "channel_id": "risk-escalation",
                    "click_action": "OPEN_VERDICT",
                },
            },
        },
    }
    try:
        import urllib.request
        req = urllib.request.Request(
            f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            r.read()
        return True
    except Exception:
        logger.exception("FCM send failed.")
        return False
