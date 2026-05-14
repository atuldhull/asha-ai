"""Heuristic 3-tier differential — Plan 3.0.

A patient-facing differential the verdict card can show. Three buckets:

  most_likely  — top-2 high-prior conditions matching the symptom set
  expanded     — next 3 less-likely (or duration-driven) conditions
  cant_miss    — high-severity conditions that should never be missed
                  even if their probability is low

This is hand-mapped, not learned. A proper multi-disease classifier is
Plan 4.0+. The map is keyed on token combinations and resolved in order;
the first matching key wins.

Each entry is a dict with: name (display), severity (0..1), driver (the
red-flag rule id, if any), citation_tag (snippet tag for joinable RAG).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable


@dataclass(frozen=True)
class DifferentialCondition:
    name: str
    severity: float
    driver: str | None = None
    citation_tag: str | None = None

    def as_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"name": self.name, "severity": self.severity}
        if self.driver:
            out["driver"] = self.driver
        if self.citation_tag:
            out["citation_tag"] = self.citation_tag
        return out


@dataclass
class Differential:
    most_likely: list[DifferentialCondition] = field(default_factory=list)
    expanded: list[DifferentialCondition] = field(default_factory=list)
    cant_miss: list[DifferentialCondition] = field(default_factory=list)

    def as_dict(self) -> dict[str, list[dict[str, Any]]]:
        return {
            "most_likely": [c.as_dict() for c in self.most_likely],
            "expanded": [c.as_dict() for c in self.expanded],
            "cant_miss": [c.as_dict() for c in self.cant_miss],
        }

    def is_empty(self) -> bool:
        return not (self.most_likely or self.expanded or self.cant_miss)


# Order matters — first matching rule wins. Each rule lists triggering
# symptom-token sets plus the buckets it contributes.
_RULES: list[dict[str, Any]] = [
    {
        "name": "acute_coronary_syndrome",
        "any_of": ["chest_pain"],
        "most_likely": [
            DifferentialCondition("Musculoskeletal chest pain", 0.30,
                                  citation_tag="general"),
            DifferentialCondition("Acid reflux / GERD", 0.25,
                                  citation_tag="general"),
        ],
        "expanded": [
            DifferentialCondition("Anxiety / panic", 0.20),
            DifferentialCondition("Costochondritis", 0.20),
            DifferentialCondition("Pneumonia (pleuritic)", 0.20,
                                  citation_tag="pneumonia"),
        ],
        "cant_miss": [
            DifferentialCondition("Acute coronary syndrome", 0.90,
                                  driver="R1_STEMI", citation_tag="stemi"),
            DifferentialCondition("Aortic dissection", 0.85),
            DifferentialCondition("Pulmonary embolism", 0.85),
        ],
    },
    {
        "name": "stroke_fast",
        "any_of": [
            "face_droop", "arm_weakness", "slurred_speech",
            "sudden_confusion", "sudden_vision_loss", "worst_headache_ever",
        ],
        "most_likely": [
            DifferentialCondition("Ischaemic stroke", 0.85,
                                  driver="R2_STROKE_FAST",
                                  citation_tag="stroke"),
            DifferentialCondition("Hemorrhagic stroke", 0.80,
                                  driver="R2_STROKE_FAST",
                                  citation_tag="stroke"),
        ],
        "expanded": [
            DifferentialCondition("Transient ischaemic attack", 0.55),
            DifferentialCondition("Hypoglycaemia mimic", 0.30),
            DifferentialCondition("Bell's palsy (if isolated face droop)", 0.20),
        ],
        "cant_miss": [
            DifferentialCondition("Subarachnoid hemorrhage", 0.95,
                                  citation_tag="stroke"),
        ],
    },
    {
        "name": "anaphylaxis",
        "all_of": [["rash", "hives", "swelling"],
                   ["difficulty_breathing", "throat_tightness", "wheezing"]],
        "most_likely": [
            DifferentialCondition("Anaphylaxis", 0.90,
                                  driver="R3_ANAPHYLAXIS",
                                  citation_tag="anaphylaxis"),
        ],
        "expanded": [
            DifferentialCondition("Urticaria with bronchospasm", 0.40),
            DifferentialCondition("Angioedema (drug-induced)", 0.30),
        ],
        "cant_miss": [
            DifferentialCondition("Airway obstruction", 0.95),
        ],
    },
    {
        "name": "sepsis",
        "any_of": ["high_fever", "altered_consciousness", "sudden_confusion"],
        "not_child": True,
        "most_likely": [
            DifferentialCondition("Sepsis", 0.75, driver="R4_SEPSIS",
                                  citation_tag="sepsis"),
            DifferentialCondition("Severe viral / bacterial infection", 0.50),
        ],
        "expanded": [
            DifferentialCondition("Dengue with warning signs", 0.40),
            DifferentialCondition("Pyelonephritis", 0.35),
            DifferentialCondition("Pneumonia", 0.35, citation_tag="pneumonia"),
        ],
        "cant_miss": [
            DifferentialCondition("Meningitis", 0.85),
            DifferentialCondition("Septic shock", 0.85),
        ],
    },
    {
        "name": "dka",
        "all_of": [["diabetes"],
                   ["vomiting", "abdominal_pain", "rapid_breathing",
                    "fruity_breath", "high_thirst"]],
        "most_likely": [
            DifferentialCondition("Diabetic ketoacidosis", 0.85,
                                  driver="R5_DKA", citation_tag="dka"),
        ],
        "expanded": [
            DifferentialCondition("Hyperosmolar hyperglycaemia", 0.45),
            DifferentialCondition("Gastroenteritis (mimic)", 0.20),
        ],
        "cant_miss": [
            DifferentialCondition("Severe metabolic acidosis", 0.85,
                                  citation_tag="dka"),
        ],
    },
    {
        "name": "pediatric_danger",
        "child": True,
        "any_of": ["high_fever", "lethargy", "poor_feeding",
                   "rash_non_blanching", "fontanelle_bulge"],
        "most_likely": [
            DifferentialCondition("Pediatric serious bacterial infection",
                                  0.70, driver="R6_PEDIATRIC_DANGER",
                                  citation_tag="pediatric"),
        ],
        "expanded": [
            DifferentialCondition("Severe viral illness", 0.45),
            DifferentialCondition("Dehydration", 0.40,
                                  citation_tag="dehydration"),
            DifferentialCondition("UTI in infant", 0.35),
        ],
        "cant_miss": [
            DifferentialCondition("Meningococcaemia", 0.95),
        ],
    },
    {
        "name": "severe_asthma",
        "all_of": [["asthma"],
                   ["cannot_speak_full_sentences", "wheezing",
                    "shortness_of_breath", "drowsy"]],
        "most_likely": [
            DifferentialCondition("Severe asthma exacerbation", 0.85,
                                  driver="R7_SEVERE_ASTHMA",
                                  citation_tag="asthma"),
        ],
        "expanded": [
            DifferentialCondition("Anaphylaxis-induced bronchospasm", 0.30,
                                  citation_tag="anaphylaxis"),
        ],
        "cant_miss": [
            DifferentialCondition("Imminent respiratory failure", 0.95),
        ],
    },
    {
        "name": "hemorrhage",
        "any_of": [
            "heavy_bleeding", "vomiting_blood", "coughing_blood",
            "vaginal_bleeding_pregnancy", "black_tarry_stool",
        ],
        "most_likely": [
            DifferentialCondition("Acute hemorrhage", 0.85,
                                  driver="R8_HEMORRHAGE",
                                  citation_tag="hemorrhage"),
        ],
        "expanded": [
            DifferentialCondition("Coagulopathy", 0.40),
            DifferentialCondition("Variceal bleed", 0.35),
        ],
        "cant_miss": [
            DifferentialCondition("Hypovolemic shock", 0.95,
                                  citation_tag="shock"),
        ],
    },
    {
        "name": "mental_health",
        "any_of": ["suicidal_ideation", "self_harm"],
        "most_likely": [
            DifferentialCondition("Acute suicidal crisis", 0.95,
                                  driver="R9_SUICIDAL",
                                  citation_tag="mental_health"),
        ],
        "expanded": [
            DifferentialCondition("Major depressive episode", 0.60),
        ],
        "cant_miss": [],
    },
    {
        "name": "respiratory_tb",
        "any_of": ["persistent_cough"],
        "duration_days_min": 14,
        "most_likely": [
            DifferentialCondition("Pulmonary tuberculosis (presumptive)", 0.60,
                                  citation_tag="tb"),
            DifferentialCondition("Post-viral cough", 0.40),
        ],
        "expanded": [
            DifferentialCondition("Asthma", 0.30),
            DifferentialCondition("GERD-related cough", 0.25),
        ],
        "cant_miss": [
            DifferentialCondition("Lung malignancy (older adults)", 0.50,
                                  citation_tag="tb"),
        ],
    },
    {
        "name": "uti_uncomplicated",
        "any_of": ["dysuria", "frequent_urination"],
        "most_likely": [
            DifferentialCondition("Uncomplicated UTI", 0.70,
                                  citation_tag="uti"),
        ],
        "expanded": [
            DifferentialCondition("Vaginitis / cervicitis", 0.25),
        ],
        "cant_miss": [
            DifferentialCondition("Pyelonephritis", 0.50),
        ],
    },
    {
        "name": "common_cold",
        "any_of": ["runny_nose", "sore_throat", "mild_cough"],
        "most_likely": [
            DifferentialCondition("Common cold (viral URI)", 0.85,
                                  citation_tag="common_cold"),
        ],
        "expanded": [
            DifferentialCondition("Allergic rhinitis", 0.40),
            DifferentialCondition("Streptococcal pharyngitis", 0.20),
        ],
        "cant_miss": [],
    },
    {
        "name": "tension_headache",
        "any_of": ["headache", "tension_headache"],
        "most_likely": [
            DifferentialCondition("Tension-type headache", 0.80,
                                  citation_tag="tension_headache"),
        ],
        "expanded": [
            DifferentialCondition("Migraine without aura", 0.35),
            DifferentialCondition("Refractive-error headache", 0.20),
        ],
        "cant_miss": [
            DifferentialCondition("Subarachnoid hemorrhage (if thunderclap)", 0.85,
                                  citation_tag="stroke"),
        ],
    },
    {
        "name": "back_pain",
        "any_of": ["back_pain"],
        "most_likely": [
            DifferentialCondition("Mechanical lower back pain", 0.75,
                                  citation_tag="back_pain"),
        ],
        "expanded": [
            DifferentialCondition("Lumbar disc disease", 0.35),
            DifferentialCondition("Sacroiliitis", 0.20),
        ],
        "cant_miss": [
            DifferentialCondition("Cauda equina syndrome", 0.85),
        ],
    },
]


def _matches(rule: dict[str, Any], symptoms: set[str], features: dict[str, Any]) -> bool:
    if rule.get("child") and not features.get("is_child"):
        return False
    if rule.get("not_child") and features.get("is_child"):
        return False
    duration_min = rule.get("duration_days_min")
    if duration_min:
        days = features.get("duration_days") or 0
        if days < duration_min:
            return False
    any_of = rule.get("any_of")
    if any_of and not any(s in symptoms for s in any_of):
        return False
    all_of = rule.get("all_of")
    if all_of:
        for group in all_of:
            if not any(s in symptoms for s in group):
                return False
    return True


def build_differential(
    symptoms: Iterable[str],
    features: dict[str, Any] | None = None,
) -> Differential:
    """Resolve the first matching rule and return the 3-tier differential."""
    s = set(symptoms or [])
    feat = features or {}
    diff = Differential()
    for rule in _RULES:
        if _matches(rule, s, feat):
            diff.most_likely = list(rule.get("most_likely", []))
            diff.expanded = list(rule.get("expanded", []))
            diff.cant_miss = list(rule.get("cant_miss", []))
            return diff
    return diff
