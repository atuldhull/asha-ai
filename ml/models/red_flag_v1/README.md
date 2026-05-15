# Red-Flag Classifier · v1 (placeholder — train to populate)

> **Status:** directory placeholder. The actual model artifacts (`model.onnx`,
> `tokenizer/`, `metadata.json`, `eval_report.md`) are produced by running
> `py train_red_flag.py` from `d:\hack\ml`. This README is committed so the
> output directory exists in git pre-training.

## What goes here after training

```
ml/models/red_flag_v1/
├── README.md              ← this file (always present)
├── model.onnx             ← DistilBERT binary classifier exported to ONNX
├── tokenizer/             ← HuggingFace tokenizer (config.json + tokenizer.json + vocab.txt)
└── metadata.json          ← { version, threshold, labels, base_model, eval_metrics, ... }
└── eval_report.md         ← per-class P/R/F1 + ER recall + confusion matrix
```

Once these exist, the backend wrapper at
[`backend/app/ml/red_flag_classifier.py`](../../backend/app/ml/red_flag_classifier.py)
auto-loads them on next process start and the pipeline begins consulting the
ML layer alongside the deterministic 9 R1-R9 rules.

## Training procedure

```powershell
cd d:\hack\ml

# 1. Optionally expand the synthetic dataset with Gemini paraphrases.
#    Without this the train set is ~93 rows (seeds only) — small but trainable.
$env:GEMINI_API_KEY = "your-key"
py scripts/synthesize_red_flag_dataset.py

# 2. Install dependencies (one-time):
cd ..\backend
pip install -e ".[red_flag_ml]"
cd ..\ml

# 3. Train + eval + export ONNX. ~5-15 minutes on CPU for the small dataset.
py train_red_flag.py

# 4. Smoke-test the backend wrapper picked up the new artifact:
cd ..\backend
py -c "from app.ml.red_flag_classifier import is_loaded, predict, reset_cache_for_tests; reset_cache_for_tests(); print('loaded:', is_loaded()); print(predict('crushing chest pain radiating to left arm'))"
py -m pytest tests/test_red_flag_ml.py -v
```

## Safety contract (do NOT remove from any model version)

The ML layer is **defense-in-depth**, not authority. From
`backend/app/ml/red_flag_classifier.py`:

> **Safety invariant:** the ML layer can ONLY escalate. A NEGATIVE prediction
> from this classifier never downgrades a positive rule-layer verdict. The 9
> deterministic R1–R9 rules in `app/triage_logic/red_flags.py` remain
> authoritative. The ML layer EXISTS to catch the long-tail of phrasings the
> rule grammar misses — not to replace the rules.

This invariant is enforced by the pipeline composition in
`app/triage_logic/pipeline.py` (verified by `tests/test_safety_property.py`).
Any model bump (v1 → v2 → …) must preserve this invariant — verify with the
full `pytest -q` regression before deploying a new model.

## Versioning

- **v1** — initial DistilBERT-multilingual-cased fine-tune on the synthetic
  dataset. Threshold auto-tuned for max ER recall above min-precision=0.5.
- **v2+** — when a new model ships, bump `metadata.json` `version` field +
  preserve the old artifacts at `red_flag_v1/`. Backend wrapper points at
  `red_flag_v1/` by default; override via `RED_FLAG_MODEL_DIR` env var to A/B
  a new version against the old one.

## Pre-deployment requirements (per [CLINICAL_EVALUATION_PLAN.md](../../docs/regulatory/CLINICAL_EVALUATION_PLAN.md))

- [ ] MBBS panel review of the synthetic dataset's clinical fidelity
- [ ] Validation against ≥ 100 real anonymized emergency-call transcripts
- [ ] Subgroup analysis: gender · age band · language · region (Hindi/Kannada/English)
- [ ] Confusion-matrix MBBS audit on the failure cases (false-negatives most critical)
- [ ] DPDP review: confirm no PHI in training data (seeds are hand-authored generic phrases)

Until those land, v1 ships behind the safety invariant above — the rule layer
covers the floor; the ML layer is honest-best-effort defense-in-depth.
