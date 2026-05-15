"""Plan 5.1 — frontend ↔ backend risk-parity smoke.

Boots the backend on a test port, hits /api/v1/risk/compute with 5 canonical
cases, asserts each returns the expected score range + level. Catches silent
math drift between the FE mock (frontend/lib/risk.ts) and the BE scorer
(backend/app/risk/scoring.py).

Usage:  py d:/hack/scripts/smoke_5_1_parity.py
Exit 0 = parity OK. Exit 1 = drift, fix before integration.
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORT = 8909
BASE = f"http://127.0.0.1:{PORT}/api/v1/risk/compute"
BACKEND_DIR = r"d:\hack\backend"

CASES = [
    {
        "name": "Elderly cardiac (CRITICAL)",
        "body": {
            "symptoms": [{"name": "chest_pain", "severity": 9, "onset_hours_ago": 1}],
            "age": 68, "sex": "F",
            "comorbidities": ["diabetes", "hypertension"],
            "vital_proxy": {"breathing_rate": 26, "heart_rate": 118},
        },
        "expect": {"score_min": 90, "level": "CRITICAL"},
    },
    {
        "name": "Pediatric cyanosis (CRITICAL)",
        "body": {
            "symptoms": [
                {"name": "blueness_lips", "severity": 9, "onset_hours_ago": 2},
                {"name": "difficulty_breathing", "severity": 8, "onset_hours_ago": 3},
            ],
            "age": 1, "sex": "M", "comorbidities": [],
        },
        "expect": {"score_min": 90, "level": "CRITICAL"},
    },
    {
        "name": "Adult fever cluster (HIGH-MOD)",
        "body": {
            "symptoms": [
                {"name": "high_fever", "severity": 7, "onset_hours_ago": 12},
                {"name": "joint_pain", "severity": 6, "onset_hours_ago": 12},
                {"name": "rash", "severity": 4, "onset_hours_ago": 6},
            ],
            "age": 35, "sex": "F", "comorbidities": [],
        },
        "expect": {"score_min": 50, "level_in": ["HIGH", "MODERATE", "CRITICAL"]},
    },
    {
        "name": "Mild headache (LOW)",
        "body": {
            "symptoms": [{"name": "severe_headache", "severity": 3, "onset_hours_ago": 12}],
            "age": 28, "sex": "M", "comorbidities": [],
        },
        "expect": {"score_max": 35, "level_in": ["LOW", "MODERATE"]},
    },
    {
        "name": "Trajectory escalator",
        "body": {
            "symptoms": [{"name": "fever", "severity": 5, "onset_hours_ago": 24}],
            "age": 40, "sex": "F", "comorbidities": [],
            "history": [
                {"ts": "2026-05-15T00:00:00Z", "score": 20},
                {"ts": "2026-05-15T01:00:00Z", "score": 28},
                {"ts": "2026-05-15T02:00:00Z", "score": 35},
                {"ts": "2026-05-15T03:00:00Z", "score": 42},
                {"ts": "2026-05-15T04:00:00Z", "score": 48},
            ],
        },
        "expect": {"trajectory_in": ["worsening", "rapidly_worsening"]},
    },
]


def main() -> int:
    print(f"Booting backend on {PORT}...")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--port", str(PORT), "--log-level", "warning"],
        cwd=BACKEND_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )
    try:
        # Wait for boot — poll the URL instead of fixed sleep so we exit early if backend errors
        for _ in range(30):
            time.sleep(0.5)
            try:
                urllib.request.urlopen(f"http://127.0.0.1:{PORT}/api/v1/health", timeout=1)
                break
            except (urllib.error.URLError, urllib.error.HTTPError, ConnectionError):
                continue
        else:
            print("FATAL: backend did not respond on /api/v1/health after 15s")
            return 1

        failures = 0
        for c in CASES:
            print(f"  {c['name']}... ", end="", flush=True)
            try:
                req = urllib.request.Request(
                    BASE, data=json.dumps(c["body"]).encode("utf-8"),
                    headers={"Content-Type": "application/json"}, method="POST",
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    body = json.loads(r.read())
            except Exception as e:
                print(f"FAIL — HTTP error: {e}")
                failures += 1
                continue

            ok, reasons = True, []
            exp = c["expect"]
            score, level, traj = body.get("score"), body.get("level"), body.get("trajectory")

            if "score_min" in exp and score < exp["score_min"]:
                ok = False; reasons.append(f"score {score} < min {exp['score_min']}")
            if "score_max" in exp and score > exp["score_max"]:
                ok = False; reasons.append(f"score {score} > max {exp['score_max']}")
            if "level" in exp and level != exp["level"]:
                ok = False; reasons.append(f"level {level} != {exp['level']}")
            if "level_in" in exp and level not in exp["level_in"]:
                ok = False; reasons.append(f"level {level} not in {exp['level_in']}")
            if "trajectory_in" in exp and traj not in exp["trajectory_in"]:
                ok = False; reasons.append(f"trajectory {traj} not in {exp['trajectory_in']}")

            if ok:
                print(f"OK (score={score} level={level} traj={traj})")
            else:
                print(f"FAIL — {'; '.join(reasons)}")
                failures += 1

        print()
        if failures == 0:
            print(f"All {len(CASES)} parity cases passed.")
            return 0
        else:
            print(f"{failures} / {len(CASES)} parity cases FAILED.")
            return 1
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
