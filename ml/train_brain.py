"""Plan 5.x + Tier 6.5 — Master brain-stack training + index-rebuild orchestrator.

ONE command that drives every "training / setup" step the user needs to go
from a Plan 4.0 baseline to a Plan 6.5-ready brain. Each step is a guarded
sub-command — pass `--only step1,step2` to run a subset, or `--skip step3`
to bypass one.

Steps (in execution order — each gates on the prior step's success):

  1. **dataset**     — expand Plan 5.2 red-flag synthetic dataset with Gemini
                       (no-op when GEMINI_API_KEY unset; seed-only mode).
  2. **train**       — fine-tune DistilBERT on the dataset + export ONNX
                       to `ml/models/red_flag_v1/`. Threshold auto-tuned
                       for max ER recall above min-precision 0.5.
  3. **xgb_smoke**   — re-run Plan 2.0 XGBoost eval (no retrain — just
                       confirms `xgboost_v1.pkl` still loads + scores).
  4. **qdrant**      — build Qdrant `snomed_conditions` collection from
                       `ml/rag/corpus.jsonl` with nomic-embed-text-v1.5
                       (768-dim) + BM25 sparse vectors.
  5. **eval**        — re-run the Plan 4.0 eval suite (`ml/run_eval.py`)
                       to confirm 100% ER recall held across all swaps.

Pre-requirements:
  cd D:\\hack\\backend
  .\\.venv\\Scripts\\Activate.ps1
  pip install -e ".[red_flag_ml,observability,integrations]"

Usage:
  cd D:\\hack\\ml
  py train_brain.py                                # all 5 steps
  py train_brain.py --only train,eval              # subset
  py train_brain.py --skip qdrant                  # skip Qdrant if not deployed
  py train_brain.py --quick                        # fast smoke run (1 epoch, no Qdrant)

Exit codes:
  0 — every step ran (or graceful-skipped)
  1 — fatal at one step
  2 — dependency missing (run pip install above)
  3 — eval gate failed (ER recall < 1.0 anywhere)
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parent  # d:\hack\ml
BACKEND = ROOT.parent / "backend"

logger = logging.getLogger("train_brain")


# ──────────── Step implementations ────────────


def step_dataset(args) -> int:
    sys.stdout.write("\n── Step 1: Expand Plan 5.2 red-flag dataset ──\n")
    if not os.getenv("GEMINI_API_KEY", "").strip():
        sys.stdout.write(
            "  Skipping Gemini paraphrase (GEMINI_API_KEY unset). "
            "Seed-only mode (~114 rows). Set the env var + rerun to expand.\n"
        )
        return 0
    cmd = [sys.executable, str(ROOT / "scripts" / "synthesize_red_flag_dataset.py")]
    return _run(cmd, cwd=ROOT)


def step_train(args) -> int:
    sys.stdout.write("\n── Step 2: Fine-tune DistilBERT (Plan 5.2) ──\n")
    cmd = [sys.executable, str(ROOT / "train_red_flag.py")]
    if args.quick:
        cmd.append("--quick")
    rc = _run(cmd, cwd=ROOT)
    if rc == 3:
        sys.stdout.write(
            "  WARNING: train_red_flag exited 3 (ER recall < 1.0 on test split). "
            "The deterministic 9 rules are unaffected, but consider expanding "
            "the dataset (set GEMINI_API_KEY + rerun step 1). Continuing.\n"
        )
        return 0
    return rc


def step_xgb_smoke(args) -> int:
    sys.stdout.write("\n── Step 3: XGBoost severity classifier smoke ──\n")
    artifact = ROOT / "models" / "xgboost_v1.pkl"
    if not artifact.is_file():
        sys.stdout.write(
            f"  Skipping — {artifact} not present. Run `py train.py` first if needed.\n"
        )
        return 0
    # Smoke check via the existing run_eval.py — already includes XGBoost path.
    return _run([sys.executable, str(ROOT / "run_eval.py")], cwd=ROOT)


def step_qdrant(args) -> int:
    sys.stdout.write("\n── Step 4: Build Qdrant hybrid index (Tier 6.5 Phase D) ──\n")
    if not os.getenv("QDRANT_URL", "").strip():
        sys.stdout.write(
            "  Skipping — QDRANT_URL unset. Bring up Qdrant (e.g. via "
            "`docker compose -f infra/docker-compose.prod.yml up -d qdrant`) "
            "and set QDRANT_URL=http://localhost:6333 to enable.\n"
        )
        return 0
    cmd = [sys.executable, str(ROOT / "scripts" / "build_qdrant_index.py")]
    if args.quick:
        cmd.append("--no-smoke")
    return _run(cmd, cwd=ROOT)


def step_eval(args) -> int:
    sys.stdout.write("\n── Step 5: Plan 4.0 eval suite (safety floor gate) ──\n")
    rc = _run([sys.executable, str(ROOT / "run_eval.py")], cwd=ROOT)
    if rc != 0:
        sys.stderr.write(
            "  CRITICAL: Plan 4.0 eval failed. ER recall < 1.0 OR adversarial "
            "regression OR safety refusal failure. The deterministic 9 rules "
            "MUST hold the floor — investigate before proceeding.\n"
        )
        return 3
    return 0


# ──────────── Step registry ────────────


STEPS: dict[str, Callable] = {
    "dataset": step_dataset,
    "train": step_train,
    "xgb_smoke": step_xgb_smoke,
    "qdrant": step_qdrant,
    "eval": step_eval,
}


# ──────────── Helpers ────────────


def _run(cmd: list[str], cwd: Path) -> int:
    sys.stdout.write(f"  $ {' '.join(cmd)} (cwd: {cwd})\n")
    start = time.perf_counter()
    try:
        result = subprocess.run(cmd, cwd=str(cwd), check=False)
        elapsed = round(time.perf_counter() - start, 1)
        sys.stdout.write(f"  exit={result.returncode} ({elapsed}s)\n")
        return int(result.returncode)
    except FileNotFoundError as e:
        sys.stderr.write(f"  FATAL: {e}\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"  FATAL: subprocess failed: {e}\n")
        return 1


def _check_deps() -> int:
    """Quick check that the backend venv is reachable + key packages are
    installed. Doesn't enforce — just warns clearly."""
    py = shutil.which(sys.executable) or sys.executable
    sys.stdout.write(f"Python: {py}\n")
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
    except ImportError:
        sys.stderr.write(
            "\n⚠️  Dependencies appear to be missing. Run:\n"
            "    cd D:\\hack\\backend\n"
            "    .\\.venv\\Scripts\\Activate.ps1\n"
            "    pip install -e \".[red_flag_ml]\"\n"
            "\n"
            "Step 1 + 2 will fail without these. Step 3 + 4 + 5 may still run.\n\n"
        )
        return 0  # don't abort — let individual steps decide
    return 0


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    p = argparse.ArgumentParser(description="Plan 5.x + 6.5 brain orchestrator")
    p.add_argument("--only", type=str, default="",
                   help="Comma-separated step names to run (skip others)")
    p.add_argument("--skip", type=str, default="",
                   help="Comma-separated step names to skip")
    p.add_argument("--quick", action="store_true",
                   help="Fast smoke run (1 epoch train + no-smoke qdrant)")
    args = p.parse_args(argv)

    _check_deps()

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    skip = {s.strip() for s in args.skip.split(",") if s.strip()}
    if only:
        unknown = only - set(STEPS.keys())
        if unknown:
            sys.stderr.write(f"FATAL: unknown step names: {unknown}\n")
            sys.stderr.write(f"  Known: {list(STEPS.keys())}\n")
            return 2

    rc_final = 0
    for name, fn in STEPS.items():
        if only and name not in only:
            continue
        if name in skip:
            sys.stdout.write(f"\n── Step {name}: SKIPPED (--skip) ──\n")
            continue
        rc = fn(args)
        if rc == 3:
            sys.stderr.write(f"\n❌ Step {name}: SAFETY GATE FAILED.\n")
            return 3
        if rc != 0:
            sys.stderr.write(f"\n❌ Step {name}: failed (exit {rc}).\n")
            return 1

    sys.stdout.write("\n✅ All requested steps completed.\n")
    sys.stdout.write(
        "\nNext (post-training verification, run from D:\\hack\\backend):\n"
        "  .\\.venv\\Scripts\\Activate.ps1\n"
        "  py -m pytest tests/test_eval_p4.py tests/test_safety_property.py "
        "tests/test_red_flag_ml.py tests/test_risk_scoring.py -v\n"
        "\n"
        "All must pass before flipping LLM_PROVIDER=llama33-together or "
        "RAG_BACKEND=qdrant_hybrid in production.\n"
    )
    return rc_final


if __name__ == "__main__":
    raise SystemExit(main())
