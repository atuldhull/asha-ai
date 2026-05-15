"""ABDM HFR + HPR + HIE-CM + Health Locker client — Plan 6.6 Phase C.

Sandbox-first: configure `ABDM_BASE_URL=https://dev.abdm.gov.in` (default) for
the developer sandbox; flip to the production URL only after NHA HFR approval
(see docs/regulatory/CDSCO_PATHWAY.md §3.2 + INTEGRATION_6.6.md Stage 3 #44).

API surfaces wrapped:
  1. **HFR (Health Facility Registry)** — register / lookup our facility
  2. **Gateway sessions** — OAuth2-style token issuance + refresh
  3. **HIE-CM (Consent Manager)** — patient consent request + status
  4. **Health Locker** — push triage sessions as FHIR R4 Bundles

Defensive: every method handles network failure gracefully + returns
discriminated-union results (`ABDMOk` / `ABDMError`) so callers can branch
without exception handling at every site.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib import error as urlerror
from urllib import request as urlreq

logger = logging.getLogger(__name__)


# ──────────── Result types ────────────


@dataclass
class ABDMOk:
    data: dict[str, Any]


@dataclass
class ABDMError:
    code: str
    message: str
    http_status: int | None = None
    raw: dict[str, Any] | None = None


ABDMResult = ABDMOk | ABDMError


# ──────────── Client ────────────


@dataclass
class ABDMClient:
    base_url: str = field(default_factory=lambda: os.getenv("ABDM_BASE_URL", "https://dev.abdm.gov.in").rstrip("/"))
    client_id: str = field(default_factory=lambda: os.getenv("ABDM_CLIENT_ID", ""))
    client_secret: str = field(default_factory=lambda: os.getenv("ABDM_CLIENT_SECRET", ""))
    timeout_seconds: float = 12.0

    # Cached gateway access token + its expiry.
    _access_token: str | None = None
    _access_expires_at: datetime | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.client_id and self.client_secret)

    def is_sandbox(self) -> bool:
        return "dev.abdm.gov.in" in self.base_url or "sandbox" in self.base_url

    # ──────────── Low-level HTTP ────────────

    def _request(
        self,
        method: str,
        path: str,
        body: dict | None = None,
        headers: dict[str, str] | None = None,
    ) -> ABDMResult:
        if not self.is_configured:
            return ABDMError(
                code="not_configured",
                message=(
                    "ABDM client not configured. Set ABDM_CLIENT_ID + ABDM_CLIENT_SECRET. "
                    "Sandbox keys: register at https://sandbox.abdm.gov.in"
                ),
            )
        url = f"{self.base_url}{path}"
        data: bytes | None = None
        hdrs = {"Content-Type": "application/json", "Accept": "application/json"}
        if headers:
            hdrs.update(headers)
        if body is not None:
            data = json.dumps(body).encode("utf-8")
        req = urlreq.Request(url, data=data, headers=hdrs, method=method.upper())
        try:
            with urlreq.urlopen(req, timeout=self.timeout_seconds) as r:
                raw = r.read()
                try:
                    parsed = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    parsed = {"raw": raw.decode("utf-8", errors="replace")}
                return ABDMOk(data=parsed)
        except urlerror.HTTPError as e:
            try:
                body_text = e.read().decode("utf-8", errors="replace")
                parsed = json.loads(body_text) if body_text else {}
            except Exception:
                parsed = {}
            return ABDMError(
                code=f"http_{e.code}",
                message=str(e.reason) or "HTTP error",
                http_status=e.code,
                raw=parsed,
            )
        except (urlerror.URLError, TimeoutError) as e:
            return ABDMError(code="network", message=str(e))
        except Exception as e:
            logger.exception("ABDM request failed unexpectedly")
            return ABDMError(code="unexpected", message=str(e))

    # ──────────── Gateway session (OAuth2-style token) ────────────

    def get_access_token(self) -> ABDMResult:
        """Returns an ABDMOk with `{"accessToken": "<jwt>"}` cached until expiry."""
        if self._access_token and self._access_expires_at and self._access_expires_at > datetime.now(timezone.utc):
            return ABDMOk(data={"accessToken": self._access_token, "cached": True})

        res = self._request(
            "POST",
            "/gateway/v0.5/sessions",
            body={"clientId": self.client_id, "clientSecret": self.client_secret},
        )
        if isinstance(res, ABDMError):
            return res
        token = res.data.get("accessToken") or res.data.get("access_token")
        if not token:
            return ABDMError(code="no_token", message="Token missing from session response", raw=res.data)
        # ABDM tokens default to 30 min; bake a 1-min buffer.
        self._access_token = str(token)
        self._access_expires_at = datetime.now(timezone.utc) + timedelta(minutes=29)
        return ABDMOk(data={"accessToken": self._access_token, "cached": False})

    def _authed(self) -> dict[str, str] | None:
        tok_res = self.get_access_token()
        if isinstance(tok_res, ABDMError):
            return None
        return {"Authorization": f"Bearer {tok_res.data['accessToken']}"}

    # ──────────── HFR — Health Facility Registry ────────────

    def hfr_lookup(self, facility_id: str) -> ABDMResult:
        """Look up our registered facility. Returns name / address / status."""
        auth = self._authed()
        if auth is None:
            return ABDMError(code="auth_failed", message="Gateway session failed.")
        return self._request("GET", f"/hfr/v1/facility/{facility_id}", headers=auth)

    # ──────────── HIE-CM — Consent Manager ────────────

    def request_consent(
        self,
        abha_address: str,
        purpose_code: str = "CAREMGT",
        hi_types: list[str] | None = None,
    ) -> ABDMResult:
        """Initiate a consent-request for the given ABHA address.

        Purpose codes per NHA: CAREMGT (care mgmt) / BTG (break-glass) / PUBHLTH /
        RSCH (research, w/ ethics-cttee approval) / SELF (self).

        Returns ABDMOk with the `requestId` to poll for status.
        """
        auth = self._authed()
        if auth is None:
            return ABDMError(code="auth_failed", message="Gateway session failed.")
        body = {
            "purpose": {"text": "Care management", "code": purpose_code},
            "patient": {"id": abha_address},
            "hiu": {"id": self.client_id},
            "requester": {"name": "ASHA-AI Triage System", "identifier": {"type": "REGNO", "value": self.client_id}},
            "hiTypes": hi_types or ["DiagnosticReport", "Prescription"],
            "permission": {
                "accessMode": "VIEW",
                "dateRange": {
                    "from": (datetime.now(timezone.utc) - timedelta(days=365)).isoformat(),
                    "to": datetime.now(timezone.utc).isoformat(),
                },
                "dataEraseAt": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                "frequency": {"unit": "HOUR", "value": 1, "repeats": 0},
            },
        }
        return self._request("POST", "/v0.5/consent-requests/init", body=body, headers=auth)

    def consent_status(self, request_id: str) -> ABDMResult:
        auth = self._authed()
        if auth is None:
            return ABDMError(code="auth_failed", message="Gateway session failed.")
        return self._request("GET", f"/v0.5/consent-requests/{request_id}/status", headers=auth)

    # ──────────── Health Locker (FHIR R4 push) ────────────

    def push_session_to_locker(
        self,
        abha_address: str,
        triage_session: dict[str, Any],
    ) -> ABDMResult:
        """Push a triage session as a FHIR R4 Bundle to the patient's ABHA Locker.

        `triage_session` must contain at minimum: session_id, timestamp, symptoms,
        verdict (one of the EXACT care-level strings), citations. The Bundle is
        constructed via `_to_fhir_bundle` per the IPS profile.
        """
        if not abha_address:
            return ABDMError(code="invalid_input", message="abha_address required")
        if not triage_session.get("session_id"):
            return ABDMError(code="invalid_input", message="triage_session.session_id required")

        auth = self._authed()
        if auth is None:
            return ABDMError(code="auth_failed", message="Gateway session failed.")

        bundle = _to_fhir_bundle(abha_address, triage_session)
        return self._request("POST", "/health-information/v1/exchange/push", body=bundle, headers=auth)


# ──────────── FHIR R4 Bundle composition ────────────


def _to_fhir_bundle(abha_address: str, session: dict[str, Any]) -> dict[str, Any]:
    """Compose a minimal FHIR R4 `Bundle` of type `document` for the session.

    Includes a `Composition` describing the triage decision and an `Observation`
    per reported symptom. The care-level recommendation is embedded as a
    `Composition.section.text` rendering of the EXACT English string — never
    paraphrased — so downstream consumers (doctors viewing the Locker) see the
    same words the patient saw.
    """
    session_id = str(session["session_id"])
    timestamp = session.get("timestamp") or datetime.now(timezone.utc).isoformat()
    verdict = str(session.get("verdict", "Clinic Visit"))  # default safe-ish
    symptoms = session.get("symptoms") or []
    citations = session.get("citations") or []

    # Care-level discipline: the verdict must be one of the EXACT strings.
    if verdict not in {"Home Care", "Clinic Visit", "Emergency Room"}:
        verdict = "Clinic Visit"  # safe default — never paraphrase upstream

    entries: list[dict] = []

    # Composition entry — the triage report.
    composition_id = f"composition-{session_id}"
    composition: dict[str, Any] = {
        "fullUrl": f"urn:uuid:{composition_id}",
        "resource": {
            "resourceType": "Composition",
            "id": composition_id,
            "status": "final",
            "type": {
                "coding": [{
                    "system": "http://snomed.info/sct",
                    "code": "371531000",
                    "display": "Report of clinical encounter (record artifact)",
                }],
                "text": "ASHA-AI Triage Report",
            },
            "subject": {"reference": f"Patient/{abha_address}"},
            "date": timestamp,
            "author": [{"reference": f"Device/asha-ai", "display": "ASHA-AI"}],
            "title": "ASHA-AI Triage — Decision Support Advisory",
            "section": [
                {
                    "title": "Recommended care level",
                    "text": {
                        "status": "additional",
                        "div": (
                            f"<div xmlns='http://www.w3.org/1999/xhtml'>"
                            f"<p><strong>{verdict}</strong></p>"
                            f"<p>This is not a replacement for professional medical diagnosis.</p>"
                            f"</div>"
                        ),
                    },
                },
            ],
        },
    }
    entries.append(composition)

    # Observation per symptom (lightweight — just symptom name + severity).
    for i, sym in enumerate(symptoms[:20]):  # cap to keep Bundles bounded
        if not isinstance(sym, dict):
            continue
        name = str(sym.get("name", sym.get("token", "symptom")))
        severity = sym.get("severity")
        obs_id = f"obs-{session_id}-{i}"
        obs: dict[str, Any] = {
            "fullUrl": f"urn:uuid:{obs_id}",
            "resource": {
                "resourceType": "Observation",
                "id": obs_id,
                "status": "final",
                "category": [{
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "exam",
                        "display": "Exam",
                    }],
                }],
                "code": {"text": name},
                "subject": {"reference": f"Patient/{abha_address}"},
                "effectiveDateTime": timestamp,
            },
        }
        if severity is not None:
            try:
                obs["resource"]["valueQuantity"] = {
                    "value": float(severity),
                    "unit": "of-10",
                    "system": "http://unitsofmeasure.org",
                    "code": "{score}",
                }
            except (TypeError, ValueError):
                pass
        entries.append(obs)

    # Citation references attached to the Composition as DocumentReferences.
    for i, cit in enumerate(citations[:5]):
        if not isinstance(cit, dict):
            continue
        ref_id = f"ref-{session_id}-{i}"
        entries.append({
            "fullUrl": f"urn:uuid:{ref_id}",
            "resource": {
                "resourceType": "DocumentReference",
                "id": ref_id,
                "status": "current",
                "type": {"text": "Clinical reference"},
                "content": [{
                    "attachment": {
                        "title": str(cit.get("title", "Reference")),
                        "url": str(cit.get("url", "")),
                    },
                }],
                "subject": {"reference": f"Patient/{abha_address}"},
            },
        })

    return {
        "resourceType": "Bundle",
        "type": "document",
        "timestamp": timestamp,
        "entry": entries,
    }
