"""
ASHA-AI — Plan 2.0 Eval runner
===============================

Runs the full triage pipeline (rule engine + ML severity + ESI mapper +
safety property) against docs/EVAL_CASES.csv. Publishes:

  ml/eval/eval_results.json       row-level results + summary
  ml/eval/eval_metrics.txt        the block we paste into METHODOLOGY.md
  ml/eval/confusion_matrix.csv    3x3 confusion matrix

The single metric that gates Plan 2.0:  emergency_miss_rate == 0.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from pipeline import (CARE_LEVELS, ML_DIR, FEATURE_ORDER, triage)

ROOT = ML_DIR.parent
EVAL_CSV = ROOT / "docs" / "EVAL_CASES.csv"
MODEL_PKL = ML_DIR / "models" / "xgboost_v1.pkl"
OUT_DIR = ML_DIR / "eval"
OUT_DIR.mkdir(exist_ok=True)


def normalize_expected(level: str) -> str | None:
    """Map raw expected_level strings to one of the 3 canonical levels, or
    None for refusal-only rows that aren't scored on triage accuracy."""
    if level is None:
        return None
    s = level.strip()
    if "REFUSAL" in s.upper() and "Emergency Room" not in s:
        return None  # case 9 (drug dosing) — refusal-only, exclude from triage metrics
    if "Emergency Room" in s:
        return "Emergency Room"
    if s in CARE_LEVELS:
        return s
    return None


def run() -> dict:
    df = pd.read_csv(EVAL_CSV)
    if MODEL_PKL.exists():
        model = joblib.load(MODEL_PKL)
        print(f"[eval] loaded model {MODEL_PKL}")
    else:
        model = None
        print(f"[eval] WARNING: no model at {MODEL_PKL} — running rules + severity-weight fallback only")

    rows: list[dict] = []
    for _, c in df.iterrows():
        expected = normalize_expected(c.expected_level)
        verdict = triage(
            symptoms_text=str(c.symptoms_text),
            age=int(c.age) if not pd.isna(c.age) else 30,
            sex=str(c.sex) if not pd.isna(c.sex) else "",
            history_raw=str(c.history) if not pd.isna(c.history) else "",
            vitals_raw=str(c.vitals) if not pd.isna(c.vitals) else "",
            model=model,
        )
        rows.append(dict(
            case_id=int(c.case_id),
            category=str(c.category),
            expected_raw=str(c.expected_level),
            expected_normalized=expected,
            predicted=verdict.level,
            match=(expected == verdict.level) if expected else None,
            red_flags=[f.rule_id for f in verdict.red_flags],
            severity=round(verdict.severity, 3),
            esi=verdict.esi,
            symptoms_extracted=verdict.symptoms_extracted,
        ))

    res = pd.DataFrame(rows)
    scored = res[res.expected_normalized.notna()].copy()
    refusal_only = res[res.expected_normalized.isna()]

    # Headline metric: emergency-miss rate
    er = scored[scored.expected_normalized == "Emergency Room"]
    er_correct = int((er.predicted == "Emergency Room").sum())
    er_missed  = int(len(er) - er_correct)
    emergency_recall = er_correct / max(len(er), 1)
    emergency_miss_rate = er_missed / max(len(er), 1)

    # Overall accuracy
    overall_acc = float((scored.predicted == scored.expected_normalized).mean())

    # Per-class precision / recall / F1
    per_class = {}
    for c in CARE_LEVELS:
        actual = scored[scored.expected_normalized == c]
        predicted = scored[scored.predicted == c]
        tp = int(((scored.expected_normalized == c) & (scored.predicted == c)).sum())
        fp = int(((scored.expected_normalized != c) & (scored.predicted == c)).sum())
        fn = int(((scored.expected_normalized == c) & (scored.predicted != c)).sum())
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0
        per_class[c] = dict(precision=round(precision, 3), recall=round(recall, 3),
                             f1=round(f1, 3), support=int(len(actual)))
    macro_f1 = round(np.mean([per_class[c]["f1"] for c in CARE_LEVELS]), 3)

    # Confusion matrix 3x3 (rows=actual, cols=predicted)
    cm = pd.crosstab(scored.expected_normalized, scored.predicted,
                      rownames=["actual"], colnames=["pred"]).reindex(
        index=list(CARE_LEVELS), columns=list(CARE_LEVELS), fill_value=0)

    # Per-rule trigger accuracy
    per_rule = {}
    for rule_id in ["R1_STEMI", "R2_STROKE_FAST", "R3_ANAPHYLAXIS", "R4_SEPSIS",
                     "R5_DKA", "R6_PEDIATRIC_DANGER", "R7_SEVERE_ASTHMA",
                     "R8_HEMORRHAGE", "R9_SUICIDAL"]:
        # We score a rule on the cases whose category/notes mention it,
        # but the cleaner gauge: any ER case where the rule should have
        # fired given the symptoms_text. Approximate via predicted flags.
        fired = scored[scored.red_flags.apply(lambda fs: rule_id in fs or rule_id.replace("_", "") in [f.replace("_", "") for f in fs])]
        per_rule[rule_id] = int(len(fired))

    summary = dict(
        n_total_cases=int(len(res)),
        n_triage_cases=int(len(scored)),
        n_refusal_only_cases=int(len(refusal_only)),
        overall_accuracy=round(overall_acc, 3),
        emergency_recall=round(emergency_recall, 3),
        emergency_miss_rate=round(emergency_miss_rate, 3),
        emergencies_correct=er_correct,
        emergencies_missed=er_missed,
        emergency_total=int(len(er)),
        macro_f1=macro_f1,
        per_class=per_class,
        confusion_matrix=cm.to_dict(),
        per_rule_trigger_counts=per_rule,
        misses=[
            dict(case_id=r.case_id, expected=r.expected_normalized,
                 predicted=r.predicted, category=r.category,
                 symptoms_extracted=r.symptoms_extracted,
                 red_flags=r.red_flags)
            for _, r in scored[scored.match == False].iterrows()
        ],
    )

    # ---- Outputs ----
    (OUT_DIR / "eval_results.json").write_text(json.dumps(
        dict(summary=summary, rows=rows), indent=2))
    cm.to_csv(OUT_DIR / "confusion_matrix.csv")

    metrics_txt = format_metrics_block(summary, cm)
    (OUT_DIR / "eval_metrics.txt").write_text(metrics_txt)
    print(metrics_txt)
    return summary


def format_metrics_block(s: dict, cm: pd.DataFrame) -> str:
    lines = [
        "========================================",
        "ASHA-AI 50-Case Evaluation — Results",
        "========================================",
        f"Triage cases scored:           {s['n_triage_cases']} (+ {s['n_refusal_only_cases']} refusal-only)",
        f"Overall accuracy:              {s['overall_accuracy']*100:.1f}%",
        f"Emergency-bucket recall:       {s['emergency_recall']*100:.1f}%  ({s['emergencies_correct']}/{s['emergency_total']})",
        f"Emergency-miss rate:           {s['emergency_miss_rate']*100:.1f}%  (target: 0%)",
        f"Macro-F1:                      {s['macro_f1']:.3f}",
        "",
        "Per-class:",
    ]
    for c in CARE_LEVELS:
        pc = s["per_class"][c]
        lines.append(f"  {c:14s}  P={pc['precision']:.2f}  R={pc['recall']:.2f}  F1={pc['f1']:.2f}  n={pc['support']}")
    lines += [
        "",
        "Confusion matrix (rows=actual, cols=predicted):",
        "                       " + "  ".join(f"{c:14s}" for c in CARE_LEVELS),
    ]
    for actual in CARE_LEVELS:
        row = "  ".join(f"{cm.loc[actual, p]:14d}" for p in CARE_LEVELS)
        lines.append(f"  {actual:18s} {row}")
    lines += [
        "",
        "Per-red-flag rule trigger counts (over the 50 cases):",
    ]
    for rule, n in s["per_rule_trigger_counts"].items():
        lines.append(f"  {rule:24s}  fired on {n} case(s)")
    if s["misses"]:
        lines += ["", "Misses (cases where predicted != expected):"]
        for m in s["misses"]:
            lines.append(f"  case {m['case_id']:>2d}  expected={m['expected']:14s}  predicted={m['predicted']:14s}  ({m['category']})")
            lines.append(f"           extracted: {m['symptoms_extracted']}  flags: {m['red_flags']}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    run()
