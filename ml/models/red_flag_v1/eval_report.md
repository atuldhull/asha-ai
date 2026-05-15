# Plan 5.2 — Red-Flag Classifier · Eval Report

_Generated: 2026-05-15T07:35:26Z_

## Honest disclosure

Trained on the synthetic dataset from `ml/datasets/red_flag_train.csv`
(seed-only OR Gemini-paraphrased depending on `GEMINI_API_KEY`).
Pre-deployment requires MBBS panel validation against real
emergency-call transcripts. Numbers below characterize the model's
behavior **on its own synthetic test split** — not on real-world data.

## Threshold + metrics (on test split)

- **Decision threshold:** 0.500 (tuned for max ER recall above min-precision=0.5)
- **Emergency recall:** 1.000
- **Emergency precision:** 0.562
- **Emergency F1:** 0.720
- **Test set size:** 21 (9 emergency / 12 routine)

## Confusion matrix

|                  | Predicted routine | Predicted emergency |
|------------------|-------------------|---------------------|
| **Actual routine**   | 5 | 7 |
| **Actual emergency** | 0 | 9 |

## Safety gate

- ✅ **ER recall = 1.0 on test split.** Safety floor preserved.

## Reproducibility

- Random seed: `20260515`
- Base model: `distilbert-base-multilingual-cased`
- Epochs: `1`
- Batch size: `8`
- Learning rate: `5e-05`
- Max sequence length: `128`

## Re-train

```
cd d:\hack\ml
# Optionally expand dataset first:
# set GEMINI_API_KEY=...
# py scripts/synthesize_red_flag_dataset.py
py train_red_flag.py
```