"""Plan 2.0 triage pipeline — the orchestrator.

Order of operations:
  1. Safety refusal check (drug dosing, suicidal ideation, off-topic)
  2. Featurize: extract symptom tokens, history, vitals
  3. Run the 9 deterministic red-flag rules (structured input)
  4. Run the XGBoost classifier if loaded; otherwise fall back to severity
     CSV scoring (Plan 1.0 behaviour)
  5. Apply the SAFETY PROPERTY: final_level = max(rule_layer, ml_layer)
     — rules can only escalate, never downgrade
  6. Build the TriageResponse

Plan 1.0's free-text keyword rules in `rules.py` remain as a Clinic-Visit /
Home-Care heuristic when red_flags doesn't fire and severity is in the
middle band — they describe non-emergency presentations (UTI, common cold,
persistent cough) in patient-friendly language for the verdict card.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from app.core.disclaimers import DISCLAIMER, MENTAL_HEALTH_HELPLINES
from app.core.safety import detect_refusal_category
from app.ml.classifier import featurize_for_model, get_classifier
from app.ml.featurize import extract_symptoms, featurize
from app.ml.red_flag_classifier import is_emergency as ml_red_flag_check
from app.models.risk import RiskComputeRequest, SymptomInput, VitalProxy
from app.models.triage import (
    CareLevel,
    Citation,
    DifferentialOut,
    RedFlagOut,
    TriageResponse,
)
from app.risk.scoring import compute_score, escalate_care_level
from app.rag.retriever import retrieve as rag_retrieve
from app.triage_logic.differential import build_differential
from app.triage_logic.esi import (
    esi_from_severity,
    final_care_level,
    level_from_esi,
)
from app.triage_logic.extract import parse_history, parse_vitals_string
from app.triage_logic.red_flags import Flag, RedFlagResult, get_red_flags
from app.triage_logic.rules import apply_rules as apply_freetext_rules
from app.triage_logic.severity import compute_severity, severity_to_level

logger = logging.getLogger(__name__)


@dataclass(kw_only=False)
class PipelineResult:
    response: TriageResponse
    refused: bool
    # Internals — used by the router for audit logging and verdict persistence.
    symptom_tokens: list[str]
    history_tokens: list[str]
    vitals: dict
    flags: list[Flag]
    severity_score: float
    ml_label: str | None
    ml_confidence: float | None
    ml_version: str | None
    esi: int
    final_level: str
    feature_vector: dict
    refusal_category: str | None = None  # 'drug_dosing' | 'suicidal_ideation' | 'non_medical'


def _refusal_response(category: str) -> TriageResponse:
    if category == "suicidal_ideation":
        icall = MENTAL_HEALTH_HELPLINES["iCall"]
        vandrevala = MENTAL_HEALTH_HELPLINES["Vandrevala Foundation"]
        return TriageResponse(
            level=CareLevel.ER,
            reasoning=(
                f"You are not alone — please reach out for support right now. "
                f"iCall: {icall}. Vandrevala Foundation: {vandrevala}. "
                f"If you are in immediate danger, go to an emergency room or call 112."
            ),
            red_flags=[RedFlagOut(
                rule_id="R9_SUICIDAL",
                rule_name="Suicidal ideation",
                citation="RED_FLAGS.md Rule 9",
            )],
            disclaimer=DISCLAIMER,
            esi=1,
        )
    if category == "drug_dosing":
        return TriageResponse(
            level=CareLevel.CLINIC,
            reasoning=(
                "I cannot provide medication dosing. Please consult a "
                "registered medical practitioner for any prescription or "
                "dosage questions."
            ),
            red_flags=[],
            disclaimer=DISCLAIMER,
        )
    return TriageResponse(
        level=CareLevel.CLINIC,
        reasoning="See a clinician for evaluation.",
        disclaimer=DISCLAIMER,
    )


def _flag_to_out(flag: Flag) -> RedFlagOut:
    return RedFlagOut(rule_id=flag.rule_id, rule_name=flag.rule_name, citation=flag.citation)


def _reasoning_for(level: str, flags: list[Flag], freetext_response: TriageResponse | None) -> str:
    """Pick the most user-friendly reasoning string for the final level."""
    if flags:
        return flags[0].reasoning
    if freetext_response is not None and freetext_response.level.value == level:
        return freetext_response.reasoning
    if level == "Emergency Room":
        return (
            "Symptoms include high-severity features — go to an emergency "
            "room for urgent evaluation."
        )
    if level == "Clinic Visit":
        return (
            "Symptoms don't clearly indicate home care or an emergency. "
            "See a clinician for evaluation within 24-48 hours."
        )
    return (
        "No red-flag features detected. Monitor symptoms at home; re-run "
        "triage if anything worsens."
    )


def run_pipeline(
    symptoms_text: str,
    age: int | None = None,
    sex: str | None = None,
    history: list[str] | str | None = None,
    vitals: dict | str | None = None,
) -> PipelineResult:
    # 1. Safety refusal — short-circuits the whole pipeline.
    refusal = detect_refusal_category(symptoms_text)
    if refusal:
        response = _refusal_response(refusal)
        return PipelineResult(
            response=response,
            refused=True,
            refusal_category=refusal,
            symptom_tokens=[],
            history_tokens=[],
            vitals={},
            flags=[],
            severity_score=1.0 if refusal == "suicidal_ideation" else 0.0,
            ml_label=None,
            ml_confidence=None,
            ml_version=None,
            esi=1 if refusal == "suicidal_ideation" else 4,
            final_level=response.level.value,
            feature_vector={},
        )

    # 2. Featurize.
    sym_tokens = extract_symptoms(symptoms_text)
    hist_tokens = parse_history(history)
    if isinstance(vitals, str):
        vitals_dict = parse_vitals_string(vitals)
    elif isinstance(vitals, dict):
        vitals_dict = {k: v for k, v in vitals.items() if v is not None}
    else:
        vitals_dict = parse_vitals_string(symptoms_text)

    # 3. Red-flag rules — structured.
    rf_result: RedFlagResult = get_red_flags(
        symptoms=set(sym_tokens),
        age=age,
        sex=sex,
        history=hist_tokens,
        vitals=vitals_dict,
    )

    # 4. ML / severity layer.
    feature_vector = featurize_for_model(
        symptom_tokens=sym_tokens,
        age=age,
        sex=sex,
        history=hist_tokens,
        vitals=vitals_dict,
    )
    ml_label: str | None = None
    ml_confidence: float | None = None
    ml_version: str | None = None
    clf = get_classifier()
    if clf.is_loaded:
        prediction = clf.predict(feature_vector)
        if prediction is not None:
            ml_label, ml_confidence, debug = prediction
            ml_version = debug.get("version")

    # Run severity against the raw text PLUS the canonical-token form of
    # extracted symptoms. This lets paraphrased presentations (e.g.
    # "tightness in my jaw" → radiation_jaw) score through the CSV
    # substring matcher, which only sees `radiation jaw` strings.
    _enriched_text = symptoms_text + " " + " ".join(t.replace("_", " ") for t in sym_tokens)
    severity_score, _matched = compute_severity(_enriched_text)
    esi = esi_from_severity(severity_score, vitals_dict, age)
    esi_level = level_from_esi(esi)

    # Pick the ML-or-severity layer's verdict (ML wins when present).
    ml_or_severity_level = ml_label if ml_label is not None else esi_level

    # Plan 5.2 — parallel ML red-flag classifier (DistilBERT ONNX). Runs
    # alongside the 9 rule layer; either firing escalates. Graceful
    # no-op when model isn't loaded (see app/ml/red_flag_classifier.py).
    ml_rf_is_em, _ml_rf_conf = ml_red_flag_check(symptoms_text)
    ml_red_flag_fired = bool(ml_rf_is_em)

    # 5. Apply the safety property.
    final_level = final_care_level(rf_result.flags, ml_or_severity_level)
    if ml_red_flag_fired and final_level != "Emergency Room":
        # ML layer caught a paraphrased presentation the rule layer
        # missed. Escalate per the defense-in-depth contract.
        logger.info(
            "ml_red_flag: escalating to ER (rule_layer=%s, ml_conf=%.3f)",
            final_level, _ml_rf_conf or 0.0,
        )
        final_level = "Emergency Room"

    # Soft floor: if no red flag and severity is low, prefer the Plan 1.0
    # free-text rules — they have user-friendly Home Care / Clinic Visit
    # reasoning for common presentations (UTI, cold, persistent cough).
    freetext_response: TriageResponse | None = None
    if not rf_result.flags and ml_label is None:
        freetext_response = apply_freetext_rules(symptoms_text)
        # Use the free-text rule's level only when severity gave us nothing
        # better — and never *override* an explicit ER call.
        candidates = [final_level, freetext_response.level.value]
        final_level = max(candidates, key=lambda c: {"Home Care": 0, "Clinic Visit": 1, "Emergency Room": 2}[c])

    # 6. Plan 3.0 — RAG citations + differential.
    feats_for_diff = featurize(
        symptoms_text, age=age, sex=sex,
        history=list(hist_tokens),
        vitals=vitals_dict,
    )
    diff = build_differential(symptoms=set(sym_tokens), features=feats_for_diff)
    differential_out = DifferentialOut(**diff.as_dict()) if not diff.is_empty() else None

    try:
        snippets = rag_retrieve(
            symptoms_text,
            symptom_tokens=sym_tokens,
            k=3,
        )
    except Exception:
        logger.exception("RAG retrieval failed; degrading to empty citations.")
        snippets = []
    citations_out: list[Citation | str] = [Citation(**s.to_citation()) for s in snippets]
    # Anti-pattern guardrail: every verdict has >=1 citation. If retrieval
    # returned empty, fall back to a generic decision-support citation.
    if not citations_out:
        citations_out = [
            Citation(
                id="general_advice",
                source="ASHA-AI Decision Support",
                section="§Patient-facing",
                text=(
                    "ASHA-AI provides triage support only. Always go in "
                    "person if symptoms worsen or you are unsure."
                ),
            )
        ]

    # 7. Plan 5.1 — compute dynamic risk score, then apply escalate-only
    # safety property. Risk runs AFTER red-flag layer; it can only push
    # the verdict up the ladder, never down. An existing red-flag ER is
    # protected unconditionally.
    risk_request = RiskComputeRequest(
        symptoms=[
            SymptomInput(name=t, severity=6, onset_hours_ago=12.0)
            for t in sym_tokens
        ],
        age=age if age is not None else 35,
        sex=sex or "other",
        comorbidities=sorted(hist_tokens),
        vital_proxy=VitalProxy(
            breathing_rate=vitals_dict.get("rr") if isinstance(vitals_dict.get("rr"), int) else None,
            heart_rate=vitals_dict.get("hr") if isinstance(vitals_dict.get("hr"), int) else None,
        ),
    )
    risk_assessment = compute_score(risk_request)

    has_red_flag_er = any(f.force_level == "Emergency Room" for f in rf_result.flags)
    escalated_level = escalate_care_level(
        final_level, risk_assessment, has_red_flag_er=has_red_flag_er,
    )
    risk_escalated = escalated_level != final_level
    final_level = escalated_level

    # 8. Build the response.
    reasoning = _reasoning_for(final_level, rf_result.flags, freetext_response)
    response = TriageResponse(
        level=CareLevel(final_level),
        reasoning=reasoning,
        red_flags=[_flag_to_out(f) for f in rf_result.flags],
        disclaimer=DISCLAIMER,
        esi=esi,
        confidence=ml_confidence,
        model_version=ml_version,
        citations=citations_out,
        differential=differential_out,
        risk=risk_assessment,
        risk_escalated=risk_escalated,
    )

    return PipelineResult(
        response=response,
        refused=False,
        symptom_tokens=sym_tokens,
        history_tokens=sorted(hist_tokens),
        vitals=vitals_dict,
        flags=rf_result.flags,
        severity_score=severity_score,
        ml_label=ml_label,
        ml_confidence=ml_confidence,
        ml_version=ml_version,
        esi=esi,
        final_level=final_level,
        feature_vector=feature_vector,
    )
