"""Plan 6.1 — emit `frontend/lib/body-map/regions.yaml` from the canonical TS.

Two-step pipeline:
  1. Backend's [`scripts/sync_regions.py`](../../backend/scripts/sync_regions.py)
     parses [`regions.ts`](../lib/body-map/regions.ts) → `backend/app/data/regions.json`
     (regex-extraction; no Node required).
  2. THIS script reads that JSON and emits a human-readable YAML grouped by
     `view` (front / back / left / right / interior), preserving Hindi +
     Kannada strings unescaped via PyYAML's `allow_unicode=True`.

Why YAML at all: the mobile shell (Plan 6.4) downloads regions from a
HuggingFace static URL — see [docs/PENDING_USER_ACTIONS.md](../../docs/PENDING_USER_ACTIONS.md)
item 6.4.A.regions-yaml. JSON works for the backend's in-process load,
YAML is what the mobile build / Hub publication target prefers.

Usage (from repo root):
    py frontend/scripts/build-regions-yaml.py

Re-run after every regions.ts edit (after `sync_regions.py` regenerates
the JSON). Idempotent — overwrites the destination YAML.

Pre-req: PyYAML (already in the user's local Python env; not a backend
runtime dep — pure build-time conversion).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # D:/hack
SRC_JSON = ROOT / "backend" / "app" / "data" / "regions.json"
DST_YAML = ROOT / "frontend" / "lib" / "body-map" / "regions.yaml"


def main() -> int:
    try:
        import yaml
    except ImportError:
        sys.stderr.write(
            "PyYAML not installed. Install with: py -m pip install pyyaml\n"
        )
        return 2

    if not SRC_JSON.is_file():
        sys.stderr.write(
            f"{SRC_JSON} not found. Run backend/scripts/sync_regions.py first.\n"
        )
        return 1

    regions = json.loads(SRC_JSON.read_text(encoding="utf-8"))
    if not regions:
        sys.stderr.write("regions.json is empty — nothing to write.\n")
        return 1

    by_view: dict[str, list[dict[str, str]]] = {}
    for r in regions:
        by_view.setdefault(r.get("view", "unknown"), []).append(r)

    payload = {
        "version": "1.5",
        "count": len(regions),
        "regions_by_view": by_view,
    }

    DST_YAML.parent.mkdir(parents=True, exist_ok=True)
    with DST_YAML.open("w", encoding="utf-8") as f:
        yaml.safe_dump(payload, f, sort_keys=False, allow_unicode=True, indent=2)

    print(f"Wrote {len(regions)} regions to {DST_YAML.relative_to(ROOT)}")
    print(f"  views: {sorted(by_view.keys())}")
    print(f"  with fma_id: {sum(1 for r in regions if r.get('fma_id'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
