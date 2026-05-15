"""Re-run the 50-case eval against the deployed backend.

Plan 4.0 DoD: emergency-miss rate must stay at 0 after the agentic
refactor. This script reads `D:/hack/docs/EVAL_CASES.csv`, posts each
case to `/api/v1/triage`, and prints a per-class report.

Usage:
    .venv\\Scripts\\python.exe -m scripts.run_eval \\
        --api https://asha-ai-backend-ib9p.onrender.com

For the agentic-mode re-run, set AGENTIC_MODE=on on the deployed backend
and re-run this script — compare the two reports.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parents[2]  # D:/hack
EVAL_CSV = ROOT / "docs" / "EVAL_CASES.csv"

CARE_LEVELS = {"Home Care", "Clinic Visit", "Emergency Room"}


def _normalise_expected(raw: str) -> str:
    """Eval CSV uses some non-strict labels — collapse to the 3 strings."""
    raw = (raw or "").strip()
    if raw.startswith("Emergency Room"):
        return "Emergency Room"
    if raw == "REFUSAL":
        return "Clinic Visit"  # drug dosing → Clinic Visit per refusal policy
    return raw


def _post(
    api: str,
    row: dict,
    token: str | None = None,
    max_429_retries: int = 6,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"symptoms": row.get("symptoms_text", "")}
    if row.get("age"):
        try:
            payload["age"] = int(row["age"])
        except ValueError:
            pass
    if row.get("sex") in {"M", "F", "other"}:
        payload["sex"] = row["sex"]
    if row.get("history"):
        payload["history"] = row["history"]
    if row.get("vitals"):
        payload["vitals"] = row["vitals"]

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    # Retry on 429 (rate-limited) with exponential backoff. The slowapi
    # default is 10 req/min/key, so 6 retries × up-to-12s waits buys >1 min
    # of recovery — enough for a fresh bucket.
    for attempt in range(max_429_retries + 1):
        try:
            r = httpx.post(
                f"{api}/api/v1/triage", json=payload,
                headers=headers, timeout=30.0,
            )
        except httpx.HTTPError as exc:
            return {"_error": f"network: {exc}", "_status": 0}
        if r.status_code != 429 or attempt == max_429_retries:
            break
        retry_after = r.headers.get("retry-after")
        wait = float(retry_after) if (retry_after and retry_after.replace(".", "").isdigit()) else (2 ** attempt)
        wait = min(wait, 12.0)
        sys.stderr.write(f"  rate-limited (case {row.get('case_id')}); retry in {wait:.1f}s\n")
        time.sleep(wait)

    try:
        body = r.json()
    except json.JSONDecodeError:
        body = {"_error": "non-json response"}
    body["_status"] = r.status_code
    return body


def _classify_response(body: dict, expected_raw: str) -> str:
    """What care level did the API actually return?"""
    if body.get("_status") == 422:
        return "Clinic Visit"  # non_medical refusal
    return body.get("level") or "UNKNOWN"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Run the 50-case eval against /triage.")
    p.add_argument("--api", required=True, help="Base URL of the deployed backend.")
    p.add_argument("--token", default=None, help="Optional Bearer token.")
    p.add_argument("--csv", type=Path, default=EVAL_CSV)
    p.add_argument("--out", type=Path, default=None, help="Write per-case JSON results.")
    p.add_argument(
        "--delay",
        type=float,
        default=6.5,
        help=(
            "Seconds to sleep between requests. Defaults to 6.5s to stay "
            "under the default 10 req/min rate limit. Set 0.0 if you have "
            "raised RATE_LIMIT_TRIAGE on the server."
        ),
    )
    args = p.parse_args(argv)

    if not args.csv.exists():
        sys.stderr.write(f"EVAL_CASES.csv not found at {args.csv}\n")
        return 1

    rows = list(csv.DictReader(args.csv.open(encoding="utf-8")))
    if not rows:
        sys.stderr.write("EVAL_CASES.csv is empty.\n")
        return 1

    results: list[dict[str, Any]] = []
    confusion: dict[str, Counter] = defaultdict(Counter)
    er_misses: list[dict] = []

    for idx, row in enumerate(rows):
        if idx > 0 and args.delay > 0:
            time.sleep(args.delay)
        expected = _normalise_expected(row.get("expected_level", ""))
        body = _post(args.api, row, args.token)
        predicted = _classify_response(body, expected)
        match = expected == predicted
        confusion[expected][predicted] += 1
        if expected == "Emergency Room" and not match:
            er_misses.append({
                "case_id": row.get("case_id"),
                "symptoms_text": row.get("symptoms_text"),
                "predicted": predicted,
            })
        results.append({
            "case_id": row.get("case_id"),
            "expected": expected,
            "predicted": predicted,
            "match": match,
            "category": row.get("category"),
            "red_flags_seen": [
                rf.get("rule_id") if isinstance(rf, dict) else rf
                for rf in (body.get("red_flags") or [])
            ],
        })

    total = len(results)
    correct = sum(1 for r in results if r["match"])
    er_total = confusion["Emergency Room"].total()
    er_correct = confusion["Emergency Room"].get("Emergency Room", 0)
    er_miss_rate = (er_total - er_correct) / er_total if er_total else 0.0

    print("\n==== ASHA-AI 50-case eval ====")
    print(f"Total cases:           {total}")
    print(f"Overall accuracy:      {correct / total:.1%}  ({correct}/{total})")
    print(f"Emergency-miss rate:   {er_miss_rate:.1%}  ({er_total - er_correct}/{er_total})")
    print("\nConfusion matrix (rows = expected, cols = predicted):")
    levels = ["Home Care", "Clinic Visit", "Emergency Room", "UNKNOWN"]
    print(f"  {'':<18}" + "".join(f"{c:<16}" for c in levels))
    for exp in ["Home Care", "Clinic Visit", "Emergency Room"]:
        row = f"  {exp:<18}"
        for pred in levels:
            row += f"{confusion[exp].get(pred, 0):<16}"
        print(row)

    if er_misses:
        print("\n!! EMERGENCY MISSES — release blockers !!")
        for m in er_misses:
            print(f"  case {m['case_id']}: predicted={m['predicted']!r}; text={m['symptoms_text']!r}")
    else:
        # Plain ASCII so Windows cp1252 consoles don't crash.
        print("\nEmergency-miss rate = 0 [OK]")

    if args.out:
        args.out.write_text(json.dumps(results, indent=2), encoding="utf-8")
        print(f"\nPer-case JSON written to {args.out}")

    return 0 if er_miss_rate == 0.0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
