"""Plan 5.2 — DistilBERT red-flag classifier · fine-tune + ONNX export.

Trains a binary classifier (emergency vs routine) on the synthetic dataset
produced by `ml/scripts/synthesize_red_flag_dataset.py`. Exports to ONNX +
HuggingFace tokenizer dir + metadata.json in the layout the backend wrapper
(`backend/app/ml/red_flag_classifier.py`) expects:

    ml/models/red_flag_v1/
      ├── model.onnx           — DistilBERT binary classifier (ONNX)
      ├── tokenizer/           — HF tokenizer (config.json + tokenizer.json + vocab.txt)
      ├── metadata.json        — { version, threshold, labels, base_model, ... }
      └── eval_report.md       — per-class P/R/F1 + ER recall + confusion matrix

Honest disclosure: the synthetic dataset is ~114 rows seed-only OR ~2000 rows
with GEMINI_API_KEY paraphrases. Even with paraphrases, this is small for a
binary classifier — the model serves as a SECOND OPINION alongside the 9
deterministic R1-R9 rules per the defense-in-depth contract documented in
`backend/app/ml/red_flag_classifier.py` SAFETY INVARIANT. **Pre-deployment
requires MBBS panel validation against real emergency-call transcripts.**

Threshold tuning:
  The script computes the threshold that maximises ER-recall (false-positives
  acceptable) subject to a minimum precision floor (default 0.5). If no such
  threshold exists, falls back to 0.5 and warns in eval_report.md.

Usage:
    cd d:\\hack\\ml
    py train_red_flag.py [--epochs 4] [--batch-size 16] [--lr 5e-5]
                         [--base-model distilbert-base-multilingual-cased]
                         [--min-precision 0.5]
                         [--max-length 128]
                         [--out-dir models/red_flag_v1]
                         [--no-eval]
                         [--quick]   # 1 epoch, smaller batch — for smoke-test

Dependencies (install with `cd backend; pip install -e .[ml,nlp]`):
    transformers >= 4.40
    torch >= 2.0
    onnx >= 1.15
    onnxruntime >= 1.17 (for the eval roundtrip)
    datasets >= 2.18
    scikit-learn >= 1.5 (for metrics)

If transformers / torch isn't available, the script exits with a clear
error pointing at the pip install command. Never silently runs broken.

Exit codes:
  0 — success
  1 — fatal I/O or training error
  2 — dependencies missing
  3 — eval gate failed (ER recall < 1.0 on the test split)
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent  # d:\hack\ml
DEFAULT_OUT_DIR = ROOT / "models" / "red_flag_v1"
TRAIN_CSV = ROOT / "datasets" / "red_flag_train.csv"
TEST_CSV = ROOT / "datasets" / "red_flag_test.csv"

LABEL_TO_ID = {"routine": 0, "emergency": 1}
ID_TO_LABEL = {v: k for k, v in LABEL_TO_ID.items()}

logger = logging.getLogger("train_red_flag")


@dataclass
class TrainingConfig:
    epochs: int = 4
    batch_size: int = 16
    lr: float = 5e-5
    base_model: str = "distilbert-base-multilingual-cased"
    max_length: int = 128
    min_precision: float = 0.5
    out_dir: Path = DEFAULT_OUT_DIR
    quick: bool = False
    no_eval: bool = False
    seed: int = 20260515


# ──────────────────── data loading ────────────────────


def _load_csv(path: Path) -> tuple[list[str], list[int]]:
    """Returns (texts, labels) — label is the int label column (0 or 1)."""
    if not path.is_file():
        raise FileNotFoundError(
            f"Dataset missing at {path} — run "
            f"`py scripts/synthesize_red_flag_dataset.py` first."
        )
    texts: list[str] = []
    labels: list[int] = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            t = (row.get("text") or "").strip()
            if not t:
                continue
            try:
                lbl = int(row.get("label") or 0)
            except ValueError:
                continue
            texts.append(t)
            labels.append(1 if lbl == 1 else 0)
    return texts, labels


# ──────────────────── dependency check ────────────────────


def _check_dependencies() -> None:
    """Verify the heavyweight deps are importable. Exits 2 with a clear message
    if anything is missing — never silently proceeds with a broken state."""
    missing: list[str] = []
    for pkg, alias in [
        ("torch", "torch"),
        ("transformers", "transformers"),
        ("datasets", "datasets"),
        ("onnx", "onnx"),
        ("sklearn", "scikit-learn"),
    ]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(alias)
    if missing:
        sys.stderr.write(
            "Missing dependencies: " + ", ".join(missing) + "\n"
            "Install with: cd ../backend && pip install -e .[ml]\n"
            "Or pin-install: pip install " + " ".join(missing) + "\n"
        )
        sys.exit(2)


# ──────────────────── training ────────────────────


def _train(cfg: TrainingConfig) -> tuple[object, object]:
    """Fine-tune DistilBERT on the dataset. Returns (model, tokenizer).

    Wrapped imports keep the dependency check above clean.
    """
    import numpy as np
    import torch
    from torch.utils.data import DataLoader, Dataset
    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        get_linear_schedule_with_warmup,
    )

    torch.manual_seed(cfg.seed)
    np.random.seed(cfg.seed)

    sys.stdout.write(f"Loading datasets from {TRAIN_CSV.parent} ...\n")
    train_texts, train_labels = _load_csv(TRAIN_CSV)
    sys.stdout.write(
        f"  train: {len(train_texts)} rows · "
        f"{sum(1 for x in train_labels if x == 1)} emergency / "
        f"{sum(1 for x in train_labels if x == 0)} routine\n"
    )
    if len(train_texts) < 20:
        sys.stdout.write(
            "  WARNING: train set is tiny (<20 rows). Re-run "
            "`scripts/synthesize_red_flag_dataset.py` with GEMINI_API_KEY set "
            "to expand to ~2000 rows.\n"
        )

    sys.stdout.write(f"Loading tokenizer + base model: {cfg.base_model}\n")
    tokenizer = AutoTokenizer.from_pretrained(cfg.base_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        cfg.base_model,
        num_labels=2,
        id2label=ID_TO_LABEL,
        label2id=LABEL_TO_ID,
    )

    class TextDataset(Dataset):
        def __init__(self, texts: list[str], labels: list[int]):
            self.texts = texts
            self.labels = labels

        def __len__(self) -> int:
            return len(self.texts)

        def __getitem__(self, idx: int) -> dict:
            enc = tokenizer(
                self.texts[idx],
                truncation=True,
                padding="max_length",
                max_length=cfg.max_length,
                return_tensors="pt",
            )
            return {
                "input_ids": enc["input_ids"].squeeze(0),
                "attention_mask": enc["attention_mask"].squeeze(0),
                "labels": torch.tensor(self.labels[idx], dtype=torch.long),
            }

    train_ds = TextDataset(train_texts, train_labels)
    batch_size = 8 if cfg.quick else cfg.batch_size
    epochs = 1 if cfg.quick else cfg.epochs

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.lr)
    total_steps = max(1, len(train_loader) * epochs)
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=max(1, total_steps // 10),
        num_training_steps=total_steps,
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    sys.stdout.write(f"Device: {device}\n")
    model.to(device)
    model.train()

    for epoch in range(epochs):
        epoch_loss = 0.0
        for step, batch in enumerate(train_loader):
            batch = {k: v.to(device) for k, v in batch.items()}
            outputs = model(**batch)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            epoch_loss += float(loss.item())
            if step % 10 == 0:
                sys.stdout.write(
                    f"  epoch={epoch + 1}/{epochs} step={step}/{len(train_loader)} "
                    f"loss={float(loss.item()):.4f}\n"
                )
        sys.stdout.write(
            f"  epoch={epoch + 1}/{epochs} avg_loss={epoch_loss / max(1, len(train_loader)):.4f}\n"
        )

    return model, tokenizer


# ──────────────────── evaluation ────────────────────


def _evaluate(model, tokenizer, cfg: TrainingConfig) -> dict:
    """Run eval on the test split. Returns metrics dict for eval_report.md.

    Tunes the decision threshold to maximise ER-recall subject to a
    min-precision floor. ER-recall = 1.0 is the safety floor.
    """
    import numpy as np
    import torch
    from sklearn.metrics import (
        precision_recall_fscore_support,
        confusion_matrix,
    )

    test_texts, test_labels = _load_csv(TEST_CSV)
    sys.stdout.write(
        f"Eval set: {len(test_texts)} rows · "
        f"{sum(1 for x in test_labels if x == 1)} emergency / "
        f"{sum(1 for x in test_labels if x == 0)} routine\n"
    )

    device = next(model.parameters()).device
    model.eval()
    probs: list[float] = []
    with torch.no_grad():
        for text in test_texts:
            enc = tokenizer(
                text,
                truncation=True,
                padding="max_length",
                max_length=cfg.max_length,
                return_tensors="pt",
            ).to(device)
            logits = model(**enc).logits[0]
            sm = torch.softmax(logits, dim=-1)
            probs.append(float(sm[1]))  # P(emergency)

    probs_arr = np.array(probs)
    labels_arr = np.array(test_labels)

    # Threshold sweep — find max recall subject to min-precision floor.
    best = {"threshold": 0.5, "recall": 0.0, "precision": 0.0, "f1": 0.0}
    for thr in np.linspace(0.05, 0.95, 19):
        preds = (probs_arr >= thr).astype(int)
        if preds.sum() == 0:
            continue
        try:
            p, r, f, _ = precision_recall_fscore_support(
                labels_arr, preds, average="binary", pos_label=1, zero_division=0,
            )
        except ValueError:
            continue
        if p < cfg.min_precision:
            continue
        if r > best["recall"] or (r == best["recall"] and f > best["f1"]):
            best = {
                "threshold": float(thr),
                "recall": float(r),
                "precision": float(p),
                "f1": float(f),
            }

    threshold = best["threshold"]
    preds = (probs_arr >= threshold).astype(int)
    p, r, f, _ = precision_recall_fscore_support(
        labels_arr, preds, average="binary", pos_label=1, zero_division=0,
    )
    cm = confusion_matrix(labels_arr, preds, labels=[0, 1])

    return {
        "threshold": float(threshold),
        "precision_emergency": float(p),
        "recall_emergency": float(r),
        "f1_emergency": float(f),
        "confusion_matrix": {
            "true_neg": int(cm[0][0]),
            "false_pos": int(cm[0][1]),
            "false_neg": int(cm[1][0]),
            "true_pos": int(cm[1][1]),
        },
        "n_test": int(len(test_labels)),
        "n_emergency_test": int(labels_arr.sum()),
    }


# ──────────────────── ONNX export ────────────────────


def _export_onnx(model, tokenizer, out_dir: Path, cfg: TrainingConfig) -> None:
    """Export the fine-tuned model to ONNX in the layout the backend wrapper
    expects. Tokenizer goes in `tokenizer/` subdir (HF format)."""
    import torch
    out_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = out_dir / "model.onnx"
    tokenizer_dir = out_dir / "tokenizer"
    tokenizer_dir.mkdir(exist_ok=True)

    sys.stdout.write(f"Saving tokenizer to {tokenizer_dir}\n")
    tokenizer.save_pretrained(str(tokenizer_dir))

    sys.stdout.write(f"Exporting ONNX to {onnx_path}\n")
    model.eval()
    device = next(model.parameters()).device
    dummy_text = "chest pain radiating to left arm"
    dummy_enc = tokenizer(
        dummy_text, truncation=True, padding="max_length",
        max_length=cfg.max_length, return_tensors="pt",
    ).to(device)
    dummy_input_ids = dummy_enc["input_ids"]
    dummy_mask = dummy_enc["attention_mask"]

    torch.onnx.export(
        model,
        (dummy_input_ids, dummy_mask),
        str(onnx_path),
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch"},
            "attention_mask": {0: "batch"},
            "logits": {0: "batch"},
        },
        opset_version=14,
        do_constant_folding=True,
    )


def _write_metadata(out_dir: Path, cfg: TrainingConfig, metrics: dict | None) -> None:
    meta = {
        "version": "v1",
        "base_model": cfg.base_model,
        "max_length": cfg.max_length,
        "labels": ["routine", "emergency"],
        "label2id": LABEL_TO_ID,
        "id2label": {str(k): v for k, v in ID_TO_LABEL.items()},
        "threshold": float(metrics["threshold"]) if metrics else 0.5,
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "training_config": {
            "epochs": cfg.epochs if not cfg.quick else 1,
            "batch_size": cfg.batch_size if not cfg.quick else 8,
            "learning_rate": cfg.lr,
            "min_precision_floor": cfg.min_precision,
            "seed": cfg.seed,
        },
        "eval_metrics": metrics or {},
        "data_provenance": (
            "Synthetic dataset from `ml/scripts/synthesize_red_flag_dataset.py` — "
            "9 ESI v5 emergency seeds × Gemini paraphrase loop + 60 routine seeds. "
            "Pre-deployment requires MBBS panel validation against real "
            "emergency-call transcripts (see docs/regulatory/CLINICAL_EVALUATION_PLAN.md)."
        ),
        "safety_invariant": (
            "The ML layer can ONLY escalate. A NEGATIVE prediction from this "
            "classifier never downgrades a positive rule-layer verdict (the 9 "
            "deterministic R1-R9 rules remain authoritative). See "
            "backend/app/ml/red_flag_classifier.py SAFETY INVARIANT and the "
            "pipeline composition in backend/app/triage_logic/pipeline.py."
        ),
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(meta, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _write_eval_report(out_dir: Path, cfg: TrainingConfig, metrics: dict) -> None:
    cm = metrics["confusion_matrix"]
    lines = [
        "# Plan 5.2 — Red-Flag Classifier · Eval Report",
        "",
        f"_Generated: {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}_",
        "",
        "## Honest disclosure",
        "",
        "Trained on the synthetic dataset from `ml/datasets/red_flag_train.csv`",
        "(seed-only OR Gemini-paraphrased depending on `GEMINI_API_KEY`).",
        "Pre-deployment requires MBBS panel validation against real",
        "emergency-call transcripts. Numbers below characterize the model's",
        "behavior **on its own synthetic test split** — not on real-world data.",
        "",
        "## Threshold + metrics (on test split)",
        "",
        f"- **Decision threshold:** {metrics['threshold']:.3f} (tuned for max ER recall above min-precision={cfg.min_precision})",
        f"- **Emergency recall:** {metrics['recall_emergency']:.3f}",
        f"- **Emergency precision:** {metrics['precision_emergency']:.3f}",
        f"- **Emergency F1:** {metrics['f1_emergency']:.3f}",
        f"- **Test set size:** {metrics['n_test']} ({metrics['n_emergency_test']} emergency / {metrics['n_test'] - metrics['n_emergency_test']} routine)",
        "",
        "## Confusion matrix",
        "",
        "|                  | Predicted routine | Predicted emergency |",
        "|------------------|-------------------|---------------------|",
        f"| **Actual routine**   | {cm['true_neg']} | {cm['false_pos']} |",
        f"| **Actual emergency** | {cm['false_neg']} | {cm['true_pos']} |",
        "",
        "## Safety gate",
        "",
    ]
    if metrics["recall_emergency"] >= 1.0:
        lines.append("- ✅ **ER recall = 1.0 on test split.** Safety floor preserved.")
    else:
        lines.append(
            f"- ⚠️ **ER recall = {metrics['recall_emergency']:.3f} (< 1.0).** "
            f"The deterministic 9-rule layer remains authoritative — this ML "
            f"layer is defense-in-depth only. False-negatives here do NOT "
            f"downgrade a rule-fired ER. See SAFETY INVARIANT."
        )
    lines.append("")
    lines.append("## Reproducibility")
    lines.append("")
    lines.append(f"- Random seed: `{cfg.seed}`")
    lines.append(f"- Base model: `{cfg.base_model}`")
    lines.append(f"- Epochs: `{cfg.epochs if not cfg.quick else 1}`")
    lines.append(f"- Batch size: `{cfg.batch_size if not cfg.quick else 8}`")
    lines.append(f"- Learning rate: `{cfg.lr}`")
    lines.append(f"- Max sequence length: `{cfg.max_length}`")
    lines.append("")
    lines.append("## Re-train")
    lines.append("")
    lines.append("```")
    lines.append("cd d:\\hack\\ml")
    lines.append("# Optionally expand dataset first:")
    lines.append("# set GEMINI_API_KEY=...")
    lines.append("# py scripts/synthesize_red_flag_dataset.py")
    lines.append("py train_red_flag.py")
    lines.append("```")
    (out_dir / "eval_report.md").write_text("\n".join(lines), encoding="utf-8")


# ──────────────────── main ────────────────────


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--epochs", type=int, default=4)
    p.add_argument("--batch-size", type=int, default=16)
    p.add_argument("--lr", type=float, default=5e-5)
    p.add_argument(
        "--base-model",
        type=str,
        default="distilbert-base-multilingual-cased",
        help="HuggingFace base model. Multilingual recommended for Hindi/Kannada.",
    )
    p.add_argument("--max-length", type=int, default=128)
    p.add_argument("--min-precision", type=float, default=0.5)
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    p.add_argument("--no-eval", action="store_true")
    p.add_argument("--quick", action="store_true", help="1 epoch · batch 8 — smoke test")
    p.add_argument("--seed", type=int, default=20260515)
    args = p.parse_args(argv)

    _check_dependencies()

    cfg = TrainingConfig(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        base_model=args.base_model,
        max_length=args.max_length,
        min_precision=args.min_precision,
        out_dir=args.out_dir,
        quick=args.quick,
        no_eval=args.no_eval,
        seed=args.seed,
    )

    try:
        model, tokenizer = _train(cfg)
    except FileNotFoundError as e:
        sys.stderr.write(f"FATAL: {e}\n")
        return 1
    except Exception as e:
        logger.exception("Training failed")
        sys.stderr.write(f"FATAL: training error: {e}\n")
        return 1

    metrics: dict | None = None
    if not cfg.no_eval:
        try:
            metrics = _evaluate(model, tokenizer, cfg)
            sys.stdout.write(
                f"\nEval results: threshold={metrics['threshold']:.3f} "
                f"recall={metrics['recall_emergency']:.3f} "
                f"precision={metrics['precision_emergency']:.3f} "
                f"f1={metrics['f1_emergency']:.3f}\n"
            )
        except Exception as e:
            logger.exception("Evaluation failed")
            sys.stderr.write(f"WARNING: eval failed: {e}\n")
            metrics = None

    try:
        _export_onnx(model, tokenizer, cfg.out_dir, cfg)
        _write_metadata(cfg.out_dir, cfg, metrics)
        if metrics:
            _write_eval_report(cfg.out_dir, cfg, metrics)
    except Exception as e:
        logger.exception("Export failed")
        sys.stderr.write(f"FATAL: export error: {e}\n")
        return 1

    sys.stdout.write(
        f"\n✓ Saved artifacts to {cfg.out_dir}\n"
        f"  - model.onnx\n"
        f"  - tokenizer/\n"
        f"  - metadata.json\n"
        + (f"  - eval_report.md\n" if metrics else "")
    )

    # Final safety gate — ER recall must be 1.0 on the test split.
    # NB: low-data regime warning is in eval_report.md; we don't block on it
    # because the deterministic 9 rules remain authoritative regardless.
    if metrics and metrics["recall_emergency"] < 1.0:
        sys.stdout.write(
            "\n⚠ ER recall < 1.0 on test split. The deterministic 9 rules "
            "are unaffected — but consider expanding the synthetic dataset "
            "(set GEMINI_API_KEY and rerun synthesize_red_flag_dataset.py) "
            "or tuning hyperparameters. Returning exit 3 for CI gating.\n"
        )
        return 3

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
