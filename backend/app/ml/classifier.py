"""XGBoost severity classifier loader.

Loads `xgboost_v1.pkl` + `xgboost_v1_metadata.json` from `MODEL_DIR`
(default: `D:/hack/ml/models/`). If either file is missing or the
xgboost / scikit-learn libraries are not installed, `predict()` returns
`None` and the triage pipeline falls back to severity-CSV scoring — the
Plan 1.0 behaviour. This keeps the backend functional while Member C is
still training the model.

Members B+C handoff contract (`xgboost_v1_metadata.json`):
  {
    "version": "0.2.0",
    "features": ["sym_chest_pain", "sym_fever", ..., "age", "spo2", ...],
    "class_order": ["Home Care", "Clinic Visit", "Emergency Room"],
    "trained_on": "Kaggle Disease-Symptom v1",
    ...
  }
"""
from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _default_model_dir() -> Path:
    env = os.getenv("MODEL_DIR")
    if env:
        return Path(env)
    # Workspace convention: D:\hack\ml\models\ (Role C's output).
    return Path(__file__).resolve().parents[3] / "ml" / "models"


class ClassifierUnavailable(RuntimeError):
    """Raised when callers explicitly require a model and none is loaded."""


class SeverityClassifier:
    def __init__(self) -> None:
        self.model: Any = None
        self.meta: dict[str, Any] = {}
        self.feature_order: list[str] = []
        self.class_order: list[str] = ["Home Care", "Clinic Visit", "Emergency Room"]
        self.version: str | None = None
        self._load()

    def _load(self) -> None:
        model_dir = _default_model_dir()
        pkl = model_dir / "xgboost_v1.pkl"
        meta_path = model_dir / "xgboost_v1_metadata.json"
        if not pkl.exists() or not meta_path.exists():
            logger.info(
                "Classifier: model files not found at %s — falling back to "
                "severity rules until Member C ships the model.",
                model_dir,
            )
            return
        try:
            import joblib  # heavy import, defer
        except ImportError:
            logger.warning("Classifier: joblib not installed; falling back.")
            return

        try:
            self.model = joblib.load(pkl)
            self.meta = json.loads(meta_path.read_text(encoding="utf-8"))
            self.feature_order = list(self.meta.get("features", []))
            self.class_order = list(self.meta.get("class_order", self.class_order))
            self.version = self.meta.get("version")
            logger.info("Classifier: loaded model v=%s with %d features.",
                        self.version, len(self.feature_order))
        except Exception as exc:
            logger.exception("Classifier: model load failed: %s", exc)
            self.model = None

    @property
    def is_loaded(self) -> bool:
        return self.model is not None and bool(self.feature_order)

    def _build_vector(self, features: dict[str, Any]) -> list[float]:
        vector: list[float] = []
        for name in self.feature_order:
            value = features.get(name)
            if value is None:
                # Two encodings: symptom multi-hot (0/1) and numeric (scalar).
                # Default to 0 for both.
                vector.append(0.0)
            else:
                try:
                    vector.append(float(value))
                except (TypeError, ValueError):
                    vector.append(0.0)
        return vector

    def predict(self, features: dict[str, Any]) -> tuple[str, float, dict[str, Any]] | None:
        """Return (predicted_level, confidence, debug) or None if no model.

        - `features` is a flat dict expected to contain the keys named in
          `self.feature_order` (multi-hot symptom flags + numeric fields).
        - The returned level is one of the three exact care-level strings.
        """
        if not self.is_loaded:
            return None
        try:
            vector = self._build_vector(features)
            proba = self.model.predict_proba([vector])[0]
            idx = int(max(range(len(proba)), key=lambda i: proba[i]))
            label = self.class_order[idx] if idx < len(self.class_order) else "Clinic Visit"
            confidence = float(proba[idx])
            return label, confidence, {
                "version": self.version,
                "probabilities": {
                    self.class_order[i]: float(proba[i])
                    for i in range(min(len(self.class_order), len(proba)))
                },
            }
        except Exception as exc:
            logger.exception("Classifier: predict failed: %s", exc)
            return None


@lru_cache(maxsize=1)
def get_classifier() -> SeverityClassifier:
    return SeverityClassifier()


def featurize_for_model(
    symptom_tokens: list[str] | set[str],
    age: int | None,
    sex: str | None,
    history: list[str] | set[str] | None,
    vitals: dict[str, float] | None,
) -> dict[str, Any]:
    """Project the structured patient state into the model's feature dict.

    Convention with Member C's metadata.json `features`:
      - symptom one-hots are named `sym_<snake_case_token>` and are 0/1
      - history one-hots are named `hist_<snake_case_token>`
      - sex one-hots are `sex_M`, `sex_F`, `sex_other`
      - numerics use bare names: `age`, `hr`, `rr`, `spo2`, `bp_sys`,
        `bp_dia`, `temp_c`, `glucose`
    """
    out: dict[str, Any] = {}
    for token in symptom_tokens or []:
        out[f"sym_{token}"] = 1
    for h in history or []:
        out[f"hist_{h}"] = 1
    if age is not None:
        out["age"] = age
    if sex:
        out[f"sex_{sex}"] = 1
    for k, v in (vitals or {}).items():
        out[k] = v
    return out
