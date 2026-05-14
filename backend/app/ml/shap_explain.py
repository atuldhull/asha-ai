"""SHAP top-K feature-attribution helper.

`top_k_attributions(features, k=5)` returns the K features that most pushed
the prediction toward the predicted class, with their SHAP values.

When the SHAP library or the trained model is not yet available, this
module returns a heuristic explanation instead — the top symptoms by
severity weight from `symptom_severity.csv`. That keeps the
`/api/v1/explain/{verdict_id}` endpoint functional through the demo
even before XGBoost/SHAP are wired in.
"""
from __future__ import annotations

import logging
from typing import Any

from app.ml.classifier import get_classifier
from app.triage_logic.severity import _SEVERITY

logger = logging.getLogger(__name__)


def _heuristic_top_k(features: dict[str, Any], k: int) -> list[dict[str, Any]]:
    """Fall-back when SHAP / model are absent.

    Picks the symptoms with the highest severity weight (Role C's CSV)
    from the symptom one-hots in `features` (keys prefixed with `sym_`).
    """
    triggered: list[tuple[str, float]] = []
    for key, value in features.items():
        if not key.startswith("sym_") or not value:
            continue
        token = key.removeprefix("sym_")
        weight = _SEVERITY.get(token, 0.1)
        triggered.append((token, weight))
    triggered.sort(key=lambda x: x[1], reverse=True)
    return [
        {
            "name": token,
            "weight": float(weight),
            "source": "severity_csv",
        }
        for token, weight in triggered[:k]
    ]


def top_k_attributions(features: dict[str, Any], k: int = 5) -> list[dict[str, Any]]:
    """Return the top-K feature attributions for the prediction.

    Tries SHAP if both the model and library are loaded; otherwise falls
    back to the heuristic above.
    """
    clf = get_classifier()
    if not clf.is_loaded:
        return _heuristic_top_k(features, k)

    try:
        import shap  # heavy import; deferred
    except ImportError:
        logger.info("SHAP not installed; returning heuristic attributions.")
        return _heuristic_top_k(features, k)

    try:
        vector = clf._build_vector(features)  # noqa: SLF001
        explainer = shap.TreeExplainer(clf.model)
        raw = explainer.shap_values([vector])
        # Multi-class: raw is list[arrays] of shape (n_samples, n_features) per class.
        if isinstance(raw, list):
            # Use the class with the largest predicted probability.
            proba = clf.model.predict_proba([vector])[0]
            cls_idx = int(max(range(len(proba)), key=lambda i: proba[i]))
            shap_vals = raw[cls_idx][0]
        else:
            shap_vals = raw[0]

        ranked = sorted(
            zip(clf.feature_order, shap_vals),
            key=lambda x: abs(float(x[1])),
            reverse=True,
        )
        return [
            {
                "name": name,
                "weight": float(value),
                "source": "shap",
            }
            for name, value in ranked[:k]
        ]
    except Exception as exc:
        logger.exception("SHAP attribution failed: %s — falling back.", exc)
        return _heuristic_top_k(features, k)
