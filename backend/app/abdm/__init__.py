"""Plan 6.6 Phase C — ABDM (Ayushman Bharat Digital Mission) integration.

Sandbox-first wrapper for the National Health Authority's HFR (Health Facility
Registry), HPR (Health Professional Registry), HIE-CM (Health Information
Exchange & Consent Manager), and Health Locker (FHIR R4) APIs.

Public surface:
  - `client.ABDMClient` — class wrapping the 4 ABDM API surfaces
  - `routers.abdm_router` — FastAPI router (mounted at /api/v1/abdm)

Sandbox base URL: https://dev.abdm.gov.in
Production base URL: https://abdm.gov.in (post-NHA approval per docs/regulatory/CDSCO_PATHWAY.md)
"""
from app.abdm.client import ABDMClient
from app.abdm.routers import abdm_router

__all__ = ["ABDMClient", "abdm_router"]
