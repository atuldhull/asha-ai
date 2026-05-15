"""Sync Role A's regions.ts → backend/app/data/regions.json.

The frontend ships [`frontend/lib/body-map/regions.ts`](../../frontend/lib/body-map/regions.ts)
as the canonical taxonomy (TypeScript object literals, MultiLOD-aware,
FMA-coded). Role B can't import TypeScript directly, so this script
parses the TS via regex extraction and writes the flattened JSON that
[`app/triage_logic/body_map.py`](../app/triage_logic/body_map.py)
loads at startup.

Idempotent: re-runs overwrite the destination JSON. Run after every
regions.ts update on the frontend side.

Usage:
    .venv\\Scripts\\python.exe -m scripts.sync_regions

Exits 0 on success, 1 if regions.ts is unreadable or no entries are
found. Prints a summary of the entries written.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # D:/hack
SRC = ROOT / "frontend" / "lib" / "body-map" / "regions.ts"
DST_DIR = Path(__file__).resolve().parents[1] / "app" / "data"
DST = DST_DIR / "regions.json"

# Each region literal looks like:
#   {
#     id: 'chest_left_anterior',
#     mesh_name: 'r-chest-left',
#     view: 'front',
#     layer: 'skin',
#     fma_id: 'FMA:43799',
#     clinical_term: 'Left anterior chest',
#     layperson_en: '...',
#     ...
#   }
#
# We match a top-level object literal one level deep, then per-field
# regex inside. This sidesteps the need for a real TS parser while
# tolerating reformatting.
_BLOCK_RE = re.compile(r"\{(?:[^{}]|\{[^{}]*\})*?\}", re.DOTALL)

# Single- or double-quoted string fields.
_STRING_FIELDS = (
    "id",
    "mesh_name",
    "view",
    "layer",
    "fma_id",
    "bodyparts3d_mesh",
    "zanatomy_layer",
    "clinical_term",
    "layperson_en",
    "layperson_hi",
    "layperson_kn",
    "icd11_anatomy",
)


def _extract_field(field: str, block: str) -> str | None:
    pattern = rf"{re.escape(field)}\s*:\s*(['\"])([^'\"]*?)\1"
    m = re.search(pattern, block)
    return m.group(2) if m else None


def parse_regions(src: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    seen_ids: set[str] = set()
    for block in _BLOCK_RE.findall(src):
        region_id = _extract_field("id", block)
        if not region_id:
            continue
        if region_id in seen_ids:
            continue  # de-dup across multiple FRONT_SURFACE / BACK_SURFACE arrays
        entry: dict[str, str] = {}
        for field in _STRING_FIELDS:
            value = _extract_field(field, block)
            if value is not None:
                entry[field] = value
        if "id" in entry:
            seen_ids.add(entry["id"])
            out.append(entry)
    return out


def main() -> int:
    if not SRC.is_file():
        sys.stderr.write(f"regions.ts not found at {SRC}\n")
        return 1
    src = SRC.read_text(encoding="utf-8")
    entries = parse_regions(src)
    if not entries:
        sys.stderr.write("No region entries parsed from regions.ts\n")
        return 1
    DST_DIR.mkdir(parents=True, exist_ok=True)
    DST.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")

    with_fma = sum(1 for e in entries if e.get("fma_id"))
    print(f"Synced {len(entries)} regions to {DST}")
    print(f"  with fma_id: {with_fma}")
    print(f"  views:       {sorted({e.get('view', '?') for e in entries})}")
    print(f"  layers:      {sorted({e.get('layer', '?') for e in entries})}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
