"""Plan 6.1 — body-region taxonomy validator.

Loads the region taxonomy from one of these candidate paths (in order):
  1. `backend/app/data/regions.json` (Role-B-controlled synced copy)
  2. `backend/app/data/regions.yaml` (alternative synced copy)
  3. `frontend/lib/body-map/regions.json` (Role A canonical, JSON form)
  4. `frontend/lib/body-map/regions.yaml` (Role A canonical, YAML form)

and validates that a Pin's `fma_id` matches the canonical FMA for the
supplied `body_region`.

**Graceful no-op fallback:** if none of the candidate files exist (the
frontend currently ships `regions.ts` only — see [[reference-asha-ai-project]]
for the cross-language sync open item), validation passes through with
a single warning logged at startup. Backend stays forward-compatible.

Mismatches are LOGGED, never rejected — the frontend may legitimately
be ahead of the backend during deploys.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_BACKEND_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_FRONTEND_BODY_MAP = (
    Path(__file__).resolve().parents[3] / "frontend" / "lib" / "body-map"
)


def _parse_entries(raw: Any) -> dict[str, dict[str, Any]]:
    """Normalize {list of entries with id} or {region_id: entry} → flat dict."""
    out: dict[str, dict[str, Any]] = {}
    if isinstance(raw, list):
        for entry in raw:
            if isinstance(entry, dict) and entry.get("id"):
                out[str(entry["id"])] = entry
    elif isinstance(raw, dict):
        for k, v in raw.items():
            if isinstance(v, dict):
                out[str(k)] = v
    return out


def _load_json(path: Path) -> dict[str, dict[str, Any]] | None:
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        logger.exception("body_map: failed to parse JSON at %s", path)
        return None
    return _parse_entries(raw)


def _load_yaml(path: Path) -> dict[str, dict[str, Any]] | None:
    if not path.is_file():
        return None
    try:
        import yaml  # type: ignore[import-untyped]
    except ImportError:
        logger.warning(
            "body_map: PyYAML not installed; cannot read %s", path,
        )
        return None
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    except Exception:
        logger.exception("body_map: failed to parse YAML at %s", path)
        return None
    return _parse_entries(raw)


@lru_cache(maxsize=1)
def _regions() -> dict[str, dict[str, Any]]:
    candidates: list[tuple[Path, str]] = [
        (_BACKEND_DATA_DIR / "regions.json", "json"),
        (_BACKEND_DATA_DIR / "regions.yaml", "yaml"),
        (_FRONTEND_BODY_MAP / "regions.json", "json"),
        (_FRONTEND_BODY_MAP / "regions.yaml", "yaml"),
    ]
    for path, kind in candidates:
        loader = _load_json if kind == "json" else _load_yaml
        data = loader(path)
        if data:
            logger.info("body_map: loaded %d regions from %s", len(data), path)
            return data
    logger.warning(
        "body_map: no regions.{json,yaml} found in candidate paths — "
        "fma_id validation is a no-op. Role A's regions.ts is the current "
        "frontend source of truth; export a JSON sync to enable validation.",
    )
    return {}


def validate_fma(body_region: str, fma_id: str | None) -> bool:
    """Return True when fma_id matches the canonical FMA for body_region.

    When the regions YAML isn't available, we return True (no-op) so the
    backend stays usable while Role A's regions.yaml lands. When the
    file IS available but the fma_id doesn't match, we log a warning
    and return False — the caller decides what to do (the brief says
    log only, don't reject).
    """
    if not fma_id:
        return True
    regions = _regions()
    if not regions:
        return True
    entry = regions.get(body_region)
    if not entry:
        logger.warning(
            "body_map: unknown body_region=%r (Pin v1.5 mismatch ignored)",
            body_region,
        )
        return False
    canonical = entry.get("fma_id")
    if canonical and canonical != fma_id:
        logger.warning(
            "body_map: fma_id mismatch for body_region=%s; got=%s expected=%s",
            body_region, fma_id, canonical,
        )
        return False
    return True


def clinical_term_for(body_region: str) -> str | None:
    """Return the clinical_term from regions.yaml, or None if unknown."""
    entry = _regions().get(body_region)
    if not entry:
        return None
    return entry.get("clinical_term")
