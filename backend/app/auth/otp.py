"""OTP provider abstraction — Plan 6.6 Phase A.

Pluggable provider via `OTP_PROVIDER` env var:
  - `msg91` (default · India-specific · cheaper than Twilio · 1 paise/SMS)
  - `twilio` (international shim)
  - `mock` (CI / local dev — accepts `000000` as valid OTP)

Public surface:
  - `send_otp(phone) -> bool` — provider-dispatched send
  - `verify_otp(phone, otp) -> bool` — stateless verify against the in-store OTP

OTP storage: Valkey (TTL 5 min · per-phone deduplication · max 5 attempts).
Pattern: `otp:<phone_hash>` → `{"otp": "123456", "attempts": 0, "created_at": <ts>}`.

PHI discipline: the raw phone number is hashed (SHA-256) before any Redis /
log emission. The cleartext phone leaves this module only to the SMS gateway.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import time
from typing import Protocol

logger = logging.getLogger(__name__)

OTP_TTL_SECONDS = 300  # 5 minutes
OTP_MAX_ATTEMPTS = 5
OTP_LENGTH = 6


def hash_phone(phone: str) -> str:
    """SHA-256 of the E.164 phone. The raw phone never lands in any DB column,
    log line, audit row, or Sentry payload. The hash is the join key."""
    return hashlib.sha256(phone.encode("utf-8")).hexdigest()


# ──────────── Provider protocol ────────────


class OTPSender(Protocol):
    def send(self, phone: str, otp: str) -> bool: ...


class _MSG91Sender:
    """MSG91 — India's default. Docs: https://docs.msg91.com/otp"""

    def __init__(self) -> None:
        self.auth_key = os.getenv("MSG91_AUTH_KEY", "").strip()
        self.template_id = os.getenv("MSG91_OTP_TEMPLATE_ID", "").strip()
        self.sender = os.getenv("MSG91_SENDER", "ASHAAI")

    def send(self, phone: str, otp: str) -> bool:
        if not self.auth_key or not self.template_id:
            logger.warning(
                "MSG91 not configured (auth key / template id missing) — "
                "skipping send. Set MSG91_AUTH_KEY + MSG91_OTP_TEMPLATE_ID."
            )
            return False
        try:
            import urllib.request
            payload = json.dumps({
                "template_id": self.template_id,
                "mobile": phone.lstrip("+"),
                "authkey": self.auth_key,
                "otp": otp,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://control.msg91.com/api/v5/otp",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "authkey": self.auth_key,
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                body = json.loads(r.read())
                ok = (body.get("type") or "").lower() == "success"
                if not ok:
                    logger.warning("MSG91 send returned non-success: %s", body)
                return bool(ok)
        except Exception as exc:
            logger.exception("MSG91 send failed: %s", exc)
            return False


class _TwilioSender:
    """Twilio shim — for testing internationally."""

    def __init__(self) -> None:
        self.sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        self.token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        self.from_number = os.getenv("TWILIO_FROM_NUMBER", "").strip()

    def send(self, phone: str, otp: str) -> bool:
        if not (self.sid and self.token and self.from_number):
            logger.warning(
                "Twilio not configured — skipping send. Set TWILIO_ACCOUNT_SID, "
                "TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER."
            )
            return False
        try:
            from twilio.rest import Client  # type: ignore
        except ImportError:
            logger.warning("twilio package not installed — install `twilio>=8.0`.")
            return False
        try:
            client = Client(self.sid, self.token)
            client.messages.create(
                to=phone,
                from_=self.from_number,
                body=f"Your ASHA-AI verification code is: {otp}. Valid for 5 minutes.",
            )
            return True
        except Exception as exc:
            logger.exception("Twilio send failed: %s", exc)
            return False


class _MockSender:
    """CI / local-dev sender — does not actually send. Always succeeds.
    Verification accepts `000000` as a universal test OTP via `verify_otp`."""

    def send(self, phone: str, otp: str) -> bool:
        logger.info(
            "MockSender · phone=%s otp=%s (NOT actually sent — dev mode)",
            hash_phone(phone)[:8], otp,
        )
        return True


def _pick_sender() -> OTPSender:
    provider = os.getenv("OTP_PROVIDER", "msg91").strip().lower()
    if provider == "msg91":
        return _MSG91Sender()
    if provider == "twilio":
        return _TwilioSender()
    if provider in {"mock", "dev", "test"}:
        return _MockSender()
    logger.warning("Unknown OTP_PROVIDER=%s — falling back to mock.", provider)
    return _MockSender()


# ──────────── Valkey-backed OTP store ────────────


def _redis_client():
    """Returns a redis.Redis (also speaks Valkey wire protocol) or None.

    Defensive: if redis lib isn't installed or REDIS_URL isn't set, callers
    fall back to in-process memory (NOT suitable for prod multi-worker) and a
    warning is logged.
    """
    try:
        import redis  # type: ignore
    except ImportError:
        return None
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        return None
    try:
        return redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
    except Exception:
        logger.exception("Redis/Valkey client init failed.")
        return None


# In-process fallback for environments without a Redis/Valkey connection.
# NOT for production with multiple workers — Phase D infra ships Valkey.
_inproc_store: dict[str, dict] = {}


def _store_otp(phone: str, otp: str) -> None:
    key = f"otp:{hash_phone(phone)}"
    record = {"otp": otp, "attempts": 0, "created_at": int(time.time())}
    r = _redis_client()
    if r is not None:
        try:
            r.setex(key, OTP_TTL_SECONDS, json.dumps(record))
            return
        except Exception:
            logger.exception("Redis SETEX failed — falling back to in-process.")
    _inproc_store[key] = {**record, "expires_at": time.time() + OTP_TTL_SECONDS}


def _load_otp(phone: str) -> dict | None:
    key = f"otp:{hash_phone(phone)}"
    r = _redis_client()
    if r is not None:
        try:
            raw = r.get(key)
            if not raw:
                return None
            return json.loads(raw)
        except Exception:
            logger.exception("Redis GET failed — falling back to in-process.")
    record = _inproc_store.get(key)
    if record and record.get("expires_at", 0) >= time.time():
        return record
    _inproc_store.pop(key, None)
    return None


def _update_otp(phone: str, record: dict) -> None:
    key = f"otp:{hash_phone(phone)}"
    r = _redis_client()
    if r is not None:
        try:
            ttl = max(1, int(record.get("expires_at", time.time() + OTP_TTL_SECONDS) - time.time()))
            r.setex(key, ttl, json.dumps({k: v for k, v in record.items() if k != "expires_at"}))
            return
        except Exception:
            logger.exception("Redis SETEX failed — falling back to in-process.")
    _inproc_store[key] = record


def _delete_otp(phone: str) -> None:
    key = f"otp:{hash_phone(phone)}"
    r = _redis_client()
    if r is not None:
        try:
            r.delete(key)
        except Exception:
            pass
    _inproc_store.pop(key, None)


# ──────────── Public API ────────────


def generate_otp() -> str:
    """Cryptographically-secure numeric OTP. `secrets.randbelow` is sufficient
    here — we don't need uniform distribution since brute-force is rate-limited
    by `OTP_MAX_ATTEMPTS` and `OTP_TTL_SECONDS`."""
    return "".join(str(secrets.randbelow(10)) for _ in range(OTP_LENGTH))


def send_otp(phone: str) -> bool:
    """Generate + store + send. Returns True iff the SMS gateway accepted.

    Note: storing the OTP locally (Valkey) is part of the same operation as
    sending. If send fails we don't store, so verify_otp will return False
    and the client can re-request.
    """
    otp = generate_otp()
    sender = _pick_sender()
    if not sender.send(phone, otp):
        return False
    _store_otp(phone, otp)
    logger.info("OTP issued · phone_hash=%s · 6-digit code", hash_phone(phone)[:8])
    return True


def verify_otp(phone: str, otp: str) -> bool:
    """Constant-time compare. Increments attempt counter on failure.

    Universal test OTP `000000` works only when OTP_PROVIDER=mock.
    """
    if os.getenv("OTP_PROVIDER", "msg91").strip().lower() in {"mock", "dev", "test"}:
        if otp == "000000":
            _delete_otp(phone)
            return True

    record = _load_otp(phone)
    if not record:
        return False
    if record.get("attempts", 0) >= OTP_MAX_ATTEMPTS:
        _delete_otp(phone)
        return False
    expected = str(record.get("otp", ""))
    matched = secrets.compare_digest(expected, str(otp))
    if matched:
        _delete_otp(phone)
        return True
    record["attempts"] = int(record.get("attempts", 0)) + 1
    _update_otp(phone, record)
    return False
