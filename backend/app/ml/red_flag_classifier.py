"""Plan 5.2 — ML red-flag classifier wrapper (DistilBERT ONNX).

Role-C side ships:
  - `ml/models/red_flag_v1/model.onnx`             — DistilBERT binary
                                                      classifier exported to ONNX.
  - `ml/models/red_flag_v1/tokenizer/`             — HF tokenizer files
                                                      (config.json, tokenizer.json,
                                                      vocab.txt).
  - `ml/models/red_flag_v1/metadata.json`          — {threshold, labels, version}.

Role-B side (this module) loads them at startup and exposes a single
function `is_emergency(text) -> (label, confidence)` that the pipeline
calls as a PARALLEL safety check on top of the 9 deterministic
red-flag rules. Either layer firing → escalate.

**Graceful no-op fallback:** when any of the model files / runtime
packages (`onnxruntime`, `transformers`) are missing, `is_emergency`
returns `(None, None)` so the pipeline falls back to the deterministic
red-flag rules alone. Backend stays fully functional in that state —
the ML layer is defense-in-depth, not a hard dependency.

**Safety invariant:** the ML layer can ONLY escalate. A NEGATIVE
prediction from this classifier never downgrades a positive rule-layer
verdict. See [docs/PROMPTS_PLAN_5.1.md] for the cross-layer contract.

Threshold is tuned upstream (Role C) for recall=1.0 on the test set —
we honor whatever metadata.json specifies. False positives are
acceptable trade for not missing emergencies.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Configurable via env so tests can point at fixtures. Read DYNAMICALLY
# inside _load_once() so a monkeypatched env var takes effect after a
# reset_cache_for_tests() call.
_DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[3] / "ml" / "models" / "red_flag_v1"


def _resolve_model_dir() -> Path:
    return Path(os.getenv("RED_FLAG_MODEL_DIR", str(_DEFAULT_MODEL_DIR)))


def _is_disabled() -> bool:
    """Hard kill-switch — incident-response escape hatch."""
    return os.getenv("RED_FLAG_DISABLED", "").strip().lower() in {"1", "true", "yes"}


@dataclass
class RedFlagPrediction:
    label: str  # "emergency" | "routine"
    confidence: float  # 0.0–1.0
    threshold: float
    model_version: str | None = None


class _LoadedModel:
    def __init__(self, session: Any, tokenizer: Any, meta: dict[str, Any]):
        self.session = session
        self.tokenizer = tokenizer
        self.threshold = float(meta.get("threshold", 0.5))
        self.labels = list(meta.get("labels") or ["routine", "emergency"])
        self.version = meta.get("version")


@lru_cache(maxsize=1)
def _load_once() -> _LoadedModel | None:
    """Cached, lazy load. Returns None if anything is missing or if
    RED_FLAG_DISABLED=1 is set (incident-response kill switch)."""
    if _is_disabled():
        logger.info("red_flag_classifier: RED_FLAG_DISABLED=1 — graceful no-op.")
        return None

    model_dir = _resolve_model_dir()
    model_path = model_dir / "model.onnx"
    tokenizer_dir = model_dir / "tokenizer"
    meta_path = model_dir / "metadata.json"

    if not model_path.is_file():
        logger.info(
            "red_flag_classifier: model.onnx not present at %s — ML "
            "red-flag layer is a no-op (rule layer remains active)",
            model_path,
        )
        return None

    try:
        import onnxruntime as ort  # type: ignore[import-not-found]
    except ImportError:
        logger.info(
            "red_flag_classifier: onnxruntime not installed — ML "
            "red-flag layer is a no-op",
        )
        return None

    try:
        from transformers import AutoTokenizer  # type: ignore[import-not-found]
    except ImportError:
        logger.info(
            "red_flag_classifier: transformers not installed — ML "
            "red-flag layer is a no-op",
        )
        return None

    if not tokenizer_dir.is_dir():
        logger.warning(
            "red_flag_classifier: tokenizer dir missing at %s — falling "
            "back to base distilbert-base-uncased tokenizer", tokenizer_dir,
        )
        tokenizer_source = "distilbert-base-uncased"
    else:
        tokenizer_source = str(tokenizer_dir)

    try:
        tokenizer = AutoTokenizer.from_pretrained(tokenizer_source)
    except Exception:
        logger.exception("red_flag_classifier: tokenizer load failed")
        return None

    try:
        session = ort.InferenceSession(
            str(model_path),
            providers=["CPUExecutionProvider"],
        )
    except Exception:
        logger.exception("red_flag_classifier: ONNX session load failed")
        return None

    meta: dict[str, Any] = {}
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            logger.exception("red_flag_classifier: metadata.json parse failed")

    logger.info(
        "red_flag_classifier: loaded model=%s version=%s threshold=%s",
        model_path, meta.get("version"), meta.get("threshold"),
    )
    return _LoadedModel(session=session, tokenizer=tokenizer, meta=meta)


def is_loaded() -> bool:
    return _load_once() is not None


def _softmax(logits) -> Any:
    import numpy as np  # numpy is a transitive dep of every ML lib we use
    exp = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    return exp / np.sum(exp, axis=-1, keepdims=True)


def predict(text: str | None) -> RedFlagPrediction | None:
    """Run the DistilBERT classifier. Returns None if model isn't loaded
    or input is empty/whitespace-only.

    Output is a (label, confidence) pair — label is one of the strings
    in metadata.json's "labels" array; confidence is the softmax of the
    matched class.
    """
    model = _load_once()
    if model is None or text is None or not str(text).strip():
        return None
    try:
        encoded = model.tokenizer(
            text, truncation=True, padding="max_length",
            max_length=128, return_tensors="np",
        )
        inputs = {
            "input_ids": encoded["input_ids"].astype("int64"),
            "attention_mask": encoded["attention_mask"].astype("int64"),
        }
        outputs = model.session.run(None, inputs)
        logits = outputs[0][0]  # batch=1, take first
        probs = _softmax(logits)
        # Index of the highest-confidence class.
        cls_idx = int(probs.argmax())
        confidence = float(probs[cls_idx])
        label = (
            model.labels[cls_idx]
            if 0 <= cls_idx < len(model.labels)
            else f"class_{cls_idx}"
        )
        return RedFlagPrediction(
            label=label,
            confidence=confidence,
            threshold=model.threshold,
            model_version=model.version,
        )
    except Exception:
        logger.exception("red_flag_classifier: inference failed")
        return None


def is_emergency(text: str) -> tuple[bool | None, float | None]:
    """Convenience wrapper for the pipeline's parallel check.

    Returns:
      (True, conf)  — emergency detected above threshold
      (False, conf) — routine
      (None, None)  — model not loaded; pipeline ignores this layer
    """
    pred = predict(text)
    if pred is None:
        return (None, None)
    is_em = (pred.label == "emergency") and (pred.confidence >= pred.threshold)
    return (is_em, pred.confidence)


def reset_cache_for_tests() -> None:
    _load_once.cache_clear()
