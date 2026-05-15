"""WhatsApp Business API client — Plan 6.6 Phase H.

For Chronicle Mode daily check-ins + outbreak alerts to CHWs. Uses Meta's
Cloud API (graph.facebook.com/v20.0). Templates must be pre-approved by
Meta before sending — that's a PENDING_USER_ACTIONS item.

Defensive: when not configured, returns False + log warning. The Chronicle
Mode scheduler (Celery beat) tolerates this gracefully.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v20.0"


def _config() -> tuple[str, str] | None:
    """Returns (phone_id, access_token) or None if unconfigured."""
    phone_id = os.getenv("WHATSAPP_PHONE_ID", "").strip()
    access_token = os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip()
    if not phone_id or not access_token:
        return None
    return phone_id, access_token


def _send_template(
    to_phone: str,
    template_name: str,
    language_code: str,
    parameters: list[str] | None = None,
) -> bool:
    """Low-level template send. Parameters are positional template variables."""
    cfg = _config()
    if cfg is None:
        logger.warning(
            "WhatsApp not configured — set WHATSAPP_PHONE_ID + WHATSAPP_ACCESS_TOKEN."
        )
        return False
    phone_id, access_token = cfg

    components: list[dict[str, Any]] = []
    if parameters:
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": p} for p in parameters],
        })

    body = {
        "messaging_product": "whatsapp",
        "to": to_phone.lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
            "components": components,
        },
    }

    try:
        import urllib.request
        req = urllib.request.Request(
            f"{GRAPH_BASE}/{phone_id}/messages",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
            messages = data.get("messages", [])
            return len(messages) > 0
    except Exception:
        logger.exception("WhatsApp template send failed.")
        return False


# ──────────── Public templates ────────────


def send_chronicle_checkin(
    to_phone: str,
    patient_first_name: str,
    language_code: str = "en",  # 'en' | 'hi' | 'kn' — Meta-approved per language
) -> bool:
    """Send the Chronicle Mode daily check-in template.

    Template name must be pre-approved by Meta as `asha_chronicle_checkin_v1`
    with 1 variable (first name). Approval lead time: 24–72h per template.

    Body (approved copy):
      "Hi {{1}}, this is ASHA-AI. How are you feeling today compared to
       yesterday — better, same, or worse? Reply with your answer."
    """
    return _send_template(
        to_phone=to_phone,
        template_name="asha_chronicle_checkin_v1",
        language_code=language_code,
        parameters=[patient_first_name],
    )


def send_outbreak_alert(
    to_phone: str,
    chw_first_name: str,
    district: str,
    cluster_count: int,
    language_code: str = "en",
) -> bool:
    """Send an outbreak-alert template to a CHW.

    Template name: `asha_outbreak_alert_v1` with 3 variables (name · district ·
    cluster_count). For HIGH-confidence HDBSCAN clusters only (per
    docs/INTEGRATION_6.3.md Stage 2 #19 cluster_confidence ≥ 0.6).

    Body (approved copy):
      "Dear {{1}}, ASHA-AI has detected a possible outbreak cluster in
       {{2}}: {{3}} cases in the last 24h. Please verify with the PHC and
       report your findings via the app. Not a replacement for professional
       medical diagnosis."
    """
    return _send_template(
        to_phone=to_phone,
        template_name="asha_outbreak_alert_v1",
        language_code=language_code,
        parameters=[chw_first_name, district, str(cluster_count)],
    )


# ──────────── Inbound webhook helper ────────────


def parse_inbound_webhook(payload: dict) -> list[dict]:
    """Parse Meta's inbound webhook payload into a flat list of
    `{from_phone, text, timestamp, message_id}` records.

    Meta's webhook contract: graph.facebook.com/{phone_id}/webhooks → POST.
    Each call may batch multiple entries; each entry has multiple changes.
    """
    out: list[dict] = []
    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value", {}) or {}
            for msg in value.get("messages", []) or []:
                if msg.get("type") != "text":
                    continue
                out.append({
                    "from_phone": "+" + msg.get("from", "").lstrip("+"),
                    "text": msg.get("text", {}).get("body", ""),
                    "timestamp": msg.get("timestamp"),
                    "message_id": msg.get("id"),
                })
    return out
