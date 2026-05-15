"""Prepare the 50-case eval as a HuggingFace dataset (Plan 4.0).

Reads `D:/hack/docs/EVAL_CASES.csv`, copies it into
`backend/dist/hf_dataset/asha-ai-50-eval/`, and writes a datasheet
README.md per the Plan 4.0 spec.

Usage:
    .venv\\Scripts\\python.exe -m scripts.publish_eval_dataset prepare
    .venv\\Scripts\\python.exe -m scripts.publish_eval_dataset upload \\
        --org <your-hf-username> [--name asha-ai-50-eval]

`prepare` requires no credentials. `upload` requires:
    pip install huggingface_hub
    huggingface-cli login    (paste your HF token)
"""
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # D:/hack
EVAL_CSV = ROOT / "docs" / "EVAL_CASES.csv"
DIST_DIR = Path(__file__).resolve().parents[1] / "dist" / "hf_dataset" / "asha-ai-50-eval"

DATASHEET = """\
---
license: mit
language: ["en"]
task_categories: ["text-classification"]
tags:
  - healthcare
  - triage
  - india
  - ESI-v5
  - AI-safety
pretty_name: "ASHA-AI 50-Case Triage Evaluation"
---

# ASHA-AI 50-Case Triage Evaluation

A hand-curated evaluation set for AI triage systems serving the Indian
primary-care context.

## What this is

50 patient vignettes spanning ER / Clinic Visit / Home Care across
adult, pediatric, geriatric, pregnancy, adversarial, and refusal
scenarios. Each row contains a free-text symptom description, structured
age/sex/history/vitals, and the expected care level.

## What this is NOT

- **Not a training dataset.** These vignettes are an evaluation suite,
  not a corpus to fine-tune a model on.
- **Not real-patient data.** All vignettes are synthetic, authored by
  the ASHA-AI project team for benchmarking purposes.
- **Not a comprehensive triage benchmark.** 50 cases is small.
  Treat it as a smoke-screen for the most safety-critical presentations.
- **Not a substitute for clinical validation.** The 3 exact care-level
  strings (`Home Care`, `Clinic Visit`, `Emergency Room`) match the
  ASHA-AI API contract; they are not formal CDSCO classifications.

## Schema

| Column | Type | Description |
|---|---|---|
| `case_id` | int | 1-50, stable identifier |
| `age` | int | Patient age in years |
| `sex` | string | `M` / `F` / `other` |
| `history` | string | Comma-separated comorbidities, or `none` |
| `symptoms_text` | string | Patient-facing free-text description |
| `vitals` | string | `KEY=value;…` form (HR, SpO2, BP, temp, RR) |
| `expected_level` | string | `Home Care`, `Clinic Visit`, `Emergency Room`, `REFUSAL`, or `Emergency Room + helpline` |
| `expected_red_flags` | string | Rule names that should fire (R1-R9), or empty |
| `category` | string | `adult`, `pediatric`, `geriatric`, `pregnancy`, `adversarial`, `refusal` |
| `notes` | string | Clinical reasoning hint for reviewers |

## Coverage

- Emergency Room: 15 cases (incl. 5 adversarial)
- Clinic Visit: 20 cases
- Home Care: 15 cases
- Refusal (drug dosing / non-medical): 2 cases
- Mental-health helpline (suicidal ideation): 1 case

## The headline metric

**Emergency-miss rate** — the fraction of `Emergency Room` cases the
system fails to triage as `Emergency Room`. The ASHA-AI design target
is **0 %**. Any miss is treated as a release blocker.

## License

MIT. Use freely for research, benchmarking, or product development.
Attribution appreciated but not required.

## Citation

If you use this dataset:

```bibtex
@misc{asha_ai_50_eval_2026,
  title  = {ASHA-AI 50-Case Triage Evaluation},
  author = {{ASHA-AI Team}},
  year   = {2026},
  note   = {Synthetic evaluation suite for AI triage systems in
            Indian primary-care contexts.},
  howpublished = {\\url{https://github.com/atuldhull/Heath}}
}
```

## How the eval was run

The ASHA-AI backend exposes `POST /api/v1/triage`. To reproduce the
reported metrics:

```python
import csv, requests
API = "https://asha-ai-backend-ib9p.onrender.com"
with open("EVAL_CASES.csv") as f:
    for row in csv.DictReader(f):
        r = requests.post(f"{API}/api/v1/triage", json={
            "symptoms": row["symptoms_text"],
            "age": int(row["age"]) if row["age"] else None,
            "sex": row["sex"],
            "history": row["history"],
            "vitals": row["vitals"],
        })
        assert r.status_code in (200, 422)
        # Compare r.json()["level"] vs row["expected_level"]
```

The full evaluator lives at `backend/scripts/run_eval.py`.

## Versions

- v1 — 10 hand-authored cases (Plan 1.0 floor)
- v2 — Expanded to 50 cases (Plan 2.0). Reviewed by Role C.
- v3 — (Plan 4.0) The same 50, used to validate the agentic refactor
  did not regress accuracy.

## Disclaimer

> This is not a replacement for professional medical diagnosis.
"""


def prepare() -> int:
    if not EVAL_CSV.exists():
        sys.stderr.write(f"EVAL_CASES.csv not found at {EVAL_CSV}\n")
        return 1
    DIST_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copy2(EVAL_CSV, DIST_DIR / "EVAL_CASES.csv")
    (DIST_DIR / "README.md").write_text(DATASHEET, encoding="utf-8")
    (DIST_DIR / ".gitattributes").write_text(
        "*.csv text\n*.md text\n", encoding="utf-8",
    )
    print(f"Prepared HF dataset bundle at:\n  {DIST_DIR}")
    print("Contents:")
    for p in sorted(DIST_DIR.iterdir()):
        print(f"  {p.name}  ({p.stat().st_size} bytes)")
    return 0


def upload(org: str, name: str = "asha-ai-50-eval") -> int:
    try:
        from huggingface_hub import HfApi, create_repo
    except ImportError:
        sys.stderr.write(
            "huggingface_hub not installed. Run:\n"
            "    pip install huggingface_hub\n"
            "    huggingface-cli login\n"
        )
        return 1
    if not DIST_DIR.exists():
        sys.stderr.write("Run `prepare` first.\n")
        return 1
    repo_id = f"{org}/{name}"
    print(f"Creating dataset repo: {repo_id}")
    create_repo(repo_id, repo_type="dataset", exist_ok=True)
    api = HfApi()
    api.upload_folder(
        folder_path=str(DIST_DIR),
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="ASHA-AI 50-Case Triage Eval v3 (Plan 4.0)",
    )
    print(f"Uploaded. Public URL:\n  https://huggingface.co/datasets/{repo_id}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Publish the ASHA-AI 50-case eval to HuggingFace.")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("prepare", help="Build the dist/ bundle (no creds).")
    up = sub.add_parser("upload", help="Push the dist/ bundle to HF Hub.")
    up.add_argument("--org", required=True, help="Your HuggingFace username/org.")
    up.add_argument("--name", default="asha-ai-50-eval")
    args = p.parse_args(argv)
    if args.cmd == "prepare":
        return prepare()
    if args.cmd == "upload":
        return upload(args.org, args.name)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
