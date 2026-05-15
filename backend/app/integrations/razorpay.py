"""Razorpay client — Plan 6.6 Phase H.

For the Second Opinion Bridge (₹50–99 fees) per docs/PROMPTS_PLAN_6.6.md
Phase H. Test mode is the default; live mode requires explicit `RAZORPAY_LIVE=true`
in .env AND KYC clearance.

Defensive: when not configured, returns a `RazorpayError` instead of raising
so the doctor-cockpit can degrade gracefully (consultation request created
but unpaid — flagged for manual reconciliation).
"""
from __future__ import annotations

import base64
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any
from urllib import error as urlerror
from urllib import request as urlreq

logger = logging.getLogger(__name__)


@dataclass
class RazorpayOk:
    data: dict[str, Any]


@dataclass
class RazorpayError:
    code: str
    message: str
    http_status: int | None = None


RazorpayResult = RazorpayOk | RazorpayError


@dataclass
class RazorpayClient:
    base_url: str = "https://api.razorpay.com/v1"
    key_id: str = field(default_factory=lambda: os.getenv("RAZORPAY_KEY_ID", ""))
    key_secret: str = field(default_factory=lambda: os.getenv("RAZORPAY_KEY_SECRET", ""))
    live: bool = field(default_factory=lambda: os.getenv("RAZORPAY_LIVE", "false").strip().lower() == "true")
    timeout_seconds: float = 12.0

    @property
    def is_configured(self) -> bool:
        return bool(self.key_id and self.key_secret)

    def _auth_header(self) -> str:
        creds = f"{self.key_id}:{self.key_secret}"
        return "Basic " + base64.b64encode(creds.encode()).decode()

    def _request(self, method: str, path: str, body: dict | None = None) -> RazorpayResult:
        if not self.is_configured:
            return RazorpayError(
                code="not_configured",
                message="Razorpay not configured. Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET.",
            )
        url = f"{self.base_url}{path}"
        data: bytes | None = None
        headers = {
            "Authorization": self._auth_header(),
            "Content-Type": "application/json",
        }
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        req = urlreq.Request(url, data=data, headers=headers, method=method.upper())
        try:
            with urlreq.urlopen(req, timeout=self.timeout_seconds) as r:
                raw = r.read()
                return RazorpayOk(data=json.loads(raw) if raw else {})
        except urlerror.HTTPError as e:
            try:
                parsed = json.loads(e.read())
            except Exception:
                parsed = {}
            return RazorpayError(
                code=f"http_{e.code}",
                message=parsed.get("error", {}).get("description", "Razorpay error"),
                http_status=e.code,
            )
        except (urlerror.URLError, TimeoutError) as e:
            return RazorpayError(code="network", message=str(e))
        except Exception as e:
            logger.exception("Razorpay request failed")
            return RazorpayError(code="unexpected", message=str(e))

    def create_order(self, amount_inr: int, receipt: str, notes: dict | None = None) -> RazorpayResult:
        """Create an order. Amount is in PAISE (₹50 = 5000 paise)."""
        if amount_inr < 5000 or amount_inr > 99900:  # ₹50–₹999 sane bounds for SOB
            return RazorpayError(
                code="invalid_amount",
                message="amount_inr (paise) must be 5000–99900",
            )
        body = {
            "amount": amount_inr,
            "currency": "INR",
            "receipt": receipt,
            "notes": notes or {},
            "payment_capture": 1,
        }
        return self._request("POST", "/orders", body=body)

    def verify_webhook_signature(self, payload: bytes, signature: str, webhook_secret: str) -> bool:
        """HMAC-SHA256 verification per Razorpay docs."""
        import hashlib
        import hmac
        expected = hmac.new(webhook_secret.encode(), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)


# ──────────── Public convenience ────────────


def create_consultation_order(
    consultation_id: str,
    amount_inr_paise: int = 9900,  # default ₹99 — within SOB band
    patient_phone_hash: str | None = None,
) -> RazorpayResult:
    """Create a Razorpay order for a Second Opinion Bridge consultation.

    Notes include `consultation_id` + `phone_hash` (NEVER raw phone) for the
    webhook handler to reconcile. The webhook updates `consultation_requested`
    → `consultation_paid` in postgres so the doctor cockpit picks it up.
    """
    client = RazorpayClient()
    if not client.live:
        logger.info("Razorpay TEST MODE — production live requires RAZORPAY_LIVE=true after KYC.")
    notes = {"consultation_id": consultation_id}
    if patient_phone_hash:
        notes["phone_hash"] = patient_phone_hash
    return client.create_order(
        amount_inr=amount_inr_paise,
        receipt=f"consult-{consultation_id}",
        notes=notes,
    )
