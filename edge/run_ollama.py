"""
ASHA-AI — Ollama edge-mode smoke test (Plan 3.0)
=================================================

Pre-flight script for the unplug demo. Run from repo root:

    py -3.12 edge/run_ollama.py
    py -3.12 edge/run_ollama.py --model gemma2:2b
    py -3.12 edge/run_ollama.py --strict   # fail-fast; exits non-zero on any issue

What it checks (in order):
  1. Ollama daemon is reachable on localhost:11434
  2. Configured model is installed locally (no network needed at demo time)
  3. Provider abstraction returns OllamaProvider when LLM_PROVIDER=ollama
  4. Four canonical triage extractions complete within the latency budget
  5. Safety property: the chest-pain case must surface chest_pain + (radiation_arm | diaphoresis)

Outputs:
  edge/last_smoke.json   — machine-readable results for CI / hook integration
  stdout                 — green/red verdict per check, p50 + p95 latencies
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

LATENCY_BUDGET_S = float(os.getenv("EDGE_LATENCY_BUDGET_S", "20.0"))
# 20 s is the realistic edge-mode default for a CPU-only laptop running
# gemma2:9b (Q4_0). Override with EDGE_LATENCY_BUDGET_S or `-Budget` for
# tighter targets: 5 s on GPU-laptop, 8 s on CPU-laptop with gemma2:2b,
# 12 s on Raspberry Pi 5 16 GB with gemma2:2b.

SAMPLES = [
    # (label, text, expected substrings in symptom names)
    ("acs_typical",
     "severe chest pain radiating to my left arm and i am sweating",
     {"chest_pain", "radiation_arm"}),
    ("vague_stroke",
     "my left arm feels heavy and i am a bit confused, started 30 minutes ago",
     {"arm_weakness"}),
    ("common_cold",
     "runny nose and mild sore throat for 2 days, no fever",
     {"runny_nose"}),
    ("suicidal",
     "I dont want to live anymore",
     {"suicidal_ideation"}),
]


async def run_smoke(model: str | None) -> dict:
    os.environ["LLM_PROVIDER"] = "ollama"
    if model:
        os.environ["OLLAMA_MODEL"] = model

    try:
        from app.llm import get_provider, reset_provider  # type: ignore
        from app.llm.ollama import OllamaProvider  # type: ignore
    except ImportError as exc:
        return {"ok": False, "stage": "import", "error": repr(exc)}

    reset_provider()
    provider = get_provider()

    out: dict = {
        "ok": True,
        "provider": provider.name,
        "version": provider.version,
        "is_offline": provider.is_offline,
        "checks": [],
        "latencies_s": [],
    }

    if not isinstance(provider, OllamaProvider):
        return {**out, "ok": False, "stage": "factory",
                "error": f"factory returned {type(provider).__name__}, expected OllamaProvider"}

    # daemon liveness + installed model
    health = await provider.healthcheck()
    out["checks"].append({"name": "daemon", **health})
    if not health.get("available"):
        return {**out, "ok": False, "stage": "daemon"}
    if not health.get("model_present"):
        out["checks"].append({
            "name": "model_present", "ok": False,
            "hint": f"run: ollama pull {provider.model}",
        })
        return {**out, "ok": False, "stage": "model_present"}

    # actual extractions
    failures = 0
    for label, text, must_contain in SAMPLES:
        t0 = time.perf_counter()
        try:
            res = await provider.extract_symptoms(text, language="en")
        except Exception as exc:
            failures += 1
            out["checks"].append({
                "name": f"extract_{label}", "ok": False, "error": repr(exc),
            })
            continue
        dt = time.perf_counter() - t0
        out["latencies_s"].append(dt)

        names = {s.name for s in res.symptoms}
        missing = must_contain - names
        ok = not missing and dt <= LATENCY_BUDGET_S
        out["checks"].append({
            "name": f"extract_{label}",
            "ok": ok,
            "latency_s": round(dt, 3),
            "symptoms": sorted(names),
            "needs_followup": res.needs_followup,
            "missing_expected": sorted(missing),
        })
        if not ok:
            failures += 1

    if out["latencies_s"]:
        out["p50_latency_s"] = round(median(out["latencies_s"]), 3)
        out["p95_latency_s"] = round(
            sorted(out["latencies_s"])[
                max(0, int(len(out["latencies_s"]) * 0.95) - 1)
            ], 3)

    if failures:
        out["ok"] = False
        out["stage"] = "extractions"
    return out


def render(out: dict) -> str:
    lines = [f"=== ASHA-AI edge smoke test ===",
             f"provider:    {out.get('provider')} ({out.get('version')})",
             f"is_offline:  {out.get('is_offline')}",
             ""]
    for c in out.get("checks", []):
        icon = "[ok]" if c.get("ok", c.get("available")) else "[!! ]"
        rest = " ".join(f"{k}={v}" for k, v in c.items()
                        if k not in {"name", "ok", "available"})
        lines.append(f"{icon} {c.get('name', '?')}  {rest}")
    if "p50_latency_s" in out:
        lines.append("")
        lines.append(f"latency  p50={out['p50_latency_s']}s  p95={out['p95_latency_s']}s "
                     f"  budget={LATENCY_BUDGET_S}s")
    lines.append("")
    lines.append("verdict:  " + ("GREEN -- ready for unplug demo" if out.get("ok")
                                  else "RED -- DO NOT DEMO; fix the failures above"))
    return "\n".join(lines)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--model", help="override OLLAMA_MODEL (e.g. gemma2:2b)")
    p.add_argument("--strict", action="store_true",
                   help="exit non-zero on any check failure")
    args = p.parse_args()

    out = asyncio.run(run_smoke(args.model))
    (Path(__file__).parent / "last_smoke.json").write_text(
        json.dumps(out, indent=2))
    print(render(out))
    if args.strict and not out.get("ok"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
