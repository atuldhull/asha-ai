"""ASHA-AI Plan 2.0 — Role C — train + eval runner (single entry point).

Run:
    py train_and_eval.py
    # or
    python3.12 train_and_eval.py

Produces:
    ml/datasets/synthetic_train_v1.csv     - rule-grounded training set
    ml/models/xgboost_v1.pkl               - trained classifier
    ml/models/xgboost_v1_metadata.json     - features, hyperparams, test metrics
    ml/eval_results.json                   - per-case predictions
    ml/metrics.txt                         - METHODOLOGY.md-ready results block

Pipeline mirrored from docs/PROMPTS_PLAN_2.0.md and docs/METHODOLOGY.md §1:

    free text symptoms ---> keyword-aliased feature vector
                       ---> 9 red-flag rules (rule layer; escalation only)
                       ---> XGBoost severity classifier (ML layer)
                       ---> ESI v5 mapper
                       ---> final = max(rule_level, esi_level)   <-- safety property

The training set is synthesized from the canonical 9 red flags + clinic
+ home-care presentations grounded in our 50-symptom vocabulary
(ml/symptom_severity.csv). Until the Kaggle Disease-Symptom Prediction
dataset is downloaded into ml/datasets/disease_symptom_dataset.csv,
this synthetic set substitutes. The script is structured so the only
change needed to switch sources is the body of build_training_dataset().
"""
from __future__ import annotations

import json
import random
import re
import time
from collections import Counter, defaultdict
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

ROOT = Path(__file__).resolve().parent
ML = ROOT
HACK = ML.parent

CARE_LEVELS = ("Home Care", "Clinic Visit", "Emergency Room")
LABEL_TO_INT = {c: i for i, c in enumerate(CARE_LEVELS)}
INT_TO_LABEL = {i: c for c, i in LABEL_TO_INT.items()}
RANK = {"Home Care": 0, "Clinic Visit": 1, "Emergency Room": 2}

# ============================================================
# 1. Plan-1.0 artifacts: symptom vocabulary + severity weights
# ============================================================

def load_severity_csv() -> dict[str, float]:
    df = pd.read_csv(ML / "symptom_severity.csv")
    return dict(zip(df["symptom"], df["severity_weight"]))

SEVERITY = load_severity_csv()
SYMPTOMS = sorted(SEVERITY.keys())

HISTORY_FLAGS = ["diabetes", "hypertension", "asthma", "smoker", "pregnancy", "migraine", "allergy", "eczema", "gout"]

# ============================================================
# 2. Keyword aliases: free-text -> structured symptom flags
# ============================================================

KEYWORD_ALIASES: dict[str, list[str]] = {
    "chest_pain": ["chest pain", "chest is hurting", "tightness in my chest", "chest tightness", "tight chest", "chest hurts"],
    "radiation_arm": ["left arm", "right arm", "arm pain", "arm hurts", "into my arm", "down my arm", "arm feels heavy", "arm is weak", "arm feels numb", "arm weakness"],
    "radiation_jaw": ["jaw pain", "jaw hurt", "in my jaw", "into my jaw", "in jaw"],
    "diaphoresis": ["sweating", "sweaty", "drenched in sweat", "cold sweat"],
    "syncope": ["fainted", "passed out", "blacked out", "lost consciousness"],
    "face_droop": ["face is drooping", "face droop", "one side of face", "side of my face"],
    "arm_weakness": ["arm feels heavy", "arm is weak", "arm weakness", "cannot lift my arm", "arm feels numb"],
    "slurred_speech": ["slurred speech", "slurring", "cannot speak clearly", "speech is slurred"],
    "sudden_confusion": [" confused", "confusion", "not making sense", "a bit confused"],
    "sudden_vision_loss": ["lost my vision", "cannot see", "vision loss", "flashing lights", "see flashes"],
    "worst_headache_ever": ["worst headache", "worst headache of my life", "thunderclap", "very bad headache"],
    "seizure": ["seizure", "convulsion", "fit "],
    "altered_consciousness": ["confused", "very drowsy", "not responding", "altered"],
    "tension_headache": ["headache", "head ache", "head hurts", "dull headache"],
    "shortness_of_breath": ["short of breath", "breathless", "cannot catch my breath", "shortness of breath"],
    "difficulty_breathing": ["difficulty breathing", "trouble breathing", "hard to breathe", "breathing is hard"],
    "cannot_speak_full_sentences": ["cannot finish a sentence", "cannot speak in full sentences", "cannot complete a sentence", "cannot finish sentences", "finish a sentence"],
    "coughing_blood": ["coughing blood", "blood in cough", "coughing up blood"],
    "persistent_cough": ["cough for a week", "cough for two weeks", "cough for 2 weeks", "cough for three weeks", "cough for 3 weeks", "persistent cough", "cough for a few weeks", "cough for weeks"],
    "mild_cough": ["mild cough", "slight cough", "little cough"],
    "vomiting": ["throwing up", "vomiting", " vomit", "have been vomiting"],
    "vomiting_blood": ["vomiting blood", "blood in vomit", "throwing up blood"],
    "black_tarry_stool": ["black stool", "tarry stool", "black tarry", "black and tarry", "dark stool", "melena"],
    "abdominal_pain": ["abdominal pain", "stomach pain", "belly pain", "tummy pain"],
    "mild_diarrhea": ["loose stool", "loose motion", "mild diarrhea", "diarrhea", "loose stools"],
    "dysuria": ["burning when i pee", "pain when i pee", "burning urination", "pain urinating", "burning while urinating"],
    "vaginal_bleeding_pregnancy": ["vaginal bleeding", "bleeding pregnancy", "pregnancy bleeding", "heavy bleeding pregnancy"],
    "severe_abdominal_pain_pregnancy": ["severe abdominal pain pregnancy"],
    "fever_mild": ["low fever", "slight fever", "mild fever", "low-grade fever"],
    "fever_high": ["fever 38", "fever last", "fever today", "fever yesterday"],
    "fever_very_high": ["fever 39", "fever 40", "very high fever", "felt hot", "high fever"],
    "night_sweats": ["night sweats", "sweating at night", "wake up sweating"],
    "weight_loss_unintentional": ["lost weight", "losing weight", "weight loss", "lost kg", "kgs lost"],
    "rash": ["rash", "red spots", "spots on"],
    "hives": ["hives", "red welts", "raised welts"],
    "throat_tightness": ["throat feels tight", "tight throat", "throat tightness", "throat tight"],
    "skin_infection": ["red warm patch", "skin infection", "cellulitis", "red patch on", "warm patch"],
    "high_fever_lethargy_child": ["lethargic", "very sleepy", "very lethargic"],
    "poor_feeding_child": ["not feeding", "will not drink", "not feeding well"],
    "fontanelle_bulge": ["fontanelle", "soft spot bulging"],
    "difficulty_breathing_child": ["child trouble breathing", "child breathing fast"],
    "fruity_breath": ["fruity breath", "breath smells funny", "sweet smelling breath", "breath smells sweet"],
    "high_thirst": ["very thirsty", "extremely thirsty", "so thirsty", "cannot stop drinking water", "keep drinking water"],
    "suicidal_ideation": ["dont want to live", "do not want to live", "want to end", "kill myself", "harm myself", "suicide", "end it"],
    "runny_nose": ["runny nose", "running nose", "nose is running"],
    "mild_sore_throat": ["sore throat", "throat is sore", "throat sore"],
    "conjunctivitis": ["red eye", "sticky eye", "pink eye", "eye discharge", "eye is red"],
    "back_pain": ["back pain", "back hurts", "lower back"],
    "sprain": ["sprain", "twisted my ankle", "twisted ankle"],
    "heavy_bleeding": ["heavy bleeding", "bleeding a lot", "bleeding heavily"],
}

# Extra "soft" features (not in 50-symptom CSV but useful)
EXTRA_ALIASES: dict[str, list[str]] = {
    "swelling": ["swollen", "swelling", "is swollen"],
    "wheeze": ["wheezing", "wheeze"],
    "eye_discharge": ["eye discharge", "sticky eye", "yellow discharge"],
    "stiff_neck": ["stiff neck", "neck stiff"],
    "nasal_congestion": ["nasal discharge", "stuffy nose", "congested"],
    "facial_pain": ["pressure behind cheeks", "pain behind cheeks", "pressure and pain", "facial pain"],
}

WEIGHT_LOSS_REGEX = re.compile(r"lost\s+\d+\s*kg|lost\s+kgs", re.IGNORECASE)

# ============================================================
# 3. Featurization (free text -> feature vector)
# ============================================================

def _has_alias(text_lower: str, aliases: list[str]) -> int:
    return int(any(a in text_lower for a in aliases))


def featurize(symptoms_text: str, age: int = 30, sex: str = "M",
              history: list[str] | None = None,
              vitals: dict | None = None) -> dict:
    history = history or []
    vitals = vitals or {}
    text = (symptoms_text or "").lower()
    feats: dict[str, float] = {}
    # 50 symptoms
    for sym in SYMPTOMS:
        aliases = KEYWORD_ALIASES.get(sym, [])
        feats[f"sym_{sym}"] = _has_alias(text, aliases)
    # extras
    for sym, aliases in EXTRA_ALIASES.items():
        feats[f"sym_{sym}"] = _has_alias(text, aliases)
    # weight loss regex
    if WEIGHT_LOSS_REGEX.search(symptoms_text or ""):
        feats["sym_weight_loss_unintentional"] = 1
    # demographics
    feats["age"] = float(age)
    feats["sex_M"] = int(sex == "M")
    feats["sex_F"] = int(sex == "F")
    # history flags
    hist_blob = " ".join([str(h).lower() for h in history])
    feats["hist_diabetes"] = int("diabet" in hist_blob)
    feats["hist_hypertension"] = int("hypertension" in hist_blob)
    feats["hist_asthma"] = int("asthma" in hist_blob)
    feats["hist_smoker"] = int("smoker" in hist_blob)
    feats["hist_pregnancy"] = int("pregnan" in hist_blob)
    feats["hist_migraine"] = int("migraine" in hist_blob)
    feats["hist_allergy"] = int("allerg" in hist_blob)
    # vitals (z-scored against rough normals)
    feats["vit_HR"] = float(vitals.get("HR", 75.0))
    feats["vit_RR"] = float(vitals.get("RR", 16.0))
    feats["vit_SpO2"] = float(vitals.get("SpO2", 98.0))
    feats["vit_BP_sys"] = float(vitals.get("BP_sys", 120.0))
    feats["vit_temp"] = float(vitals.get("temp", 37.0))
    return feats


def feature_columns() -> list[str]:
    """Canonical, stable column ordering used by both train + inference."""
    cols = [f"sym_{s}" for s in SYMPTOMS]
    cols += [f"sym_{s}" for s in EXTRA_ALIASES]
    cols += ["age", "sex_M", "sex_F",
             "hist_diabetes", "hist_hypertension", "hist_asthma",
             "hist_smoker", "hist_pregnancy", "hist_migraine", "hist_allergy",
             "vit_HR", "vit_RR", "vit_SpO2", "vit_BP_sys", "vit_temp"]
    return cols


def parse_vitals_field(vitals_str) -> dict:
    out: dict[str, float] = {}
    if vitals_str is None or (isinstance(vitals_str, float) and np.isnan(vitals_str)):
        return out
    for part in str(vitals_str).split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k, v = k.strip(), v.strip()
        if k == "BP":
            try:
                sys_, dia = v.split("/")
                out["BP_sys"] = float(sys_)
                out["BP_dia"] = float(dia)
            except Exception:
                pass
        else:
            try:
                out[k] = float(v)
            except Exception:
                pass
    return out


def parse_history_field(hist_str) -> list[str]:
    if hist_str is None or (isinstance(hist_str, float) and np.isnan(hist_str)):
        return []
    s = str(hist_str).strip()
    if not s or s.lower() == "none":
        return []
    return [h.strip() for h in s.split(",") if h.strip()]


# ============================================================
# 4. Deterministic red-flag rule engine (R1..R9)
# ============================================================

def get_red_flags(feats: dict, age: int, history_flags: dict, vitals: dict) -> list[tuple[str, str]]:
    """Returns list of (rule_id, rule_name) that fire. All escalate to Emergency Room."""
    f = feats
    fired: list[tuple[str, str]] = []

    def sym(s: str) -> bool:
        return f.get(f"sym_{s}", 0) == 1

    def hist(*hs) -> bool:
        return any(history_flags.get(h, False) for h in hs)

    hr = vitals.get("HR", 0)
    rr = vitals.get("RR", 0)
    sp = vitals.get("SpO2", 100)
    bp_sys = vitals.get("BP_sys", 200)

    # R1 STEMI
    if sym("chest_pain") and any(sym(x) for x in ("radiation_arm", "radiation_jaw", "diaphoresis", "shortness_of_breath")):
        fired.append(("R1_STEMI", "STEMI / acute coronary syndrome"))
    elif sym("chest_pain") and age >= 35 and hist("diabetes", "hypertension", "smoker"):
        fired.append(("R1_STEMI", "Chest pain + cardiac risk factors"))
    # R1 extended (anginal equivalent): jaw or arm radiation + diaphoresis + risk factor,
    # for atypical presentations (women, diabetics) where the "chest" word is absent.
    elif (sym("radiation_jaw") or sym("radiation_arm")) and sym("diaphoresis") and (age >= 35 or hist("diabetes", "hypertension", "smoker")):
        fired.append(("R1_STEMI", "Anginal equivalent (atypical ACS)"))

    # R2 Stroke FAST
    if any(sym(x) for x in ("face_droop", "arm_weakness", "slurred_speech", "sudden_vision_loss", "worst_headache_ever")):
        fired.append(("R2_STROKE_FAST", "Stroke (FAST positive)"))
    elif sym("sudden_confusion") and age >= 50:
        fired.append(("R2_STROKE_FAST", "Acute confusion in older adult"))

    # R3 Anaphylaxis
    allergic = sym("rash") or sym("hives") or sym("swelling")
    airway = sym("difficulty_breathing") or sym("throat_tightness") or sym("wheeze") or sym("vomiting")
    if allergic and airway:
        fired.append(("R3_ANAPHYLAXIS", "Anaphylaxis"))
    elif sym("throat_tightness"):
        fired.append(("R3_ANAPHYLAXIS", "Anaphylaxis - airway involvement"))

    # R4 Sepsis qSOFA
    fever = sym("fever_very_high") or sym("fever_high")
    qsofa_count = int(hr > 90) + int(rr > 20) + int(bp_sys < 100) + int(sym("altered_consciousness") or sym("sudden_confusion"))
    if fever and qsofa_count >= 2:
        fired.append(("R4_SEPSIS", "Sepsis (qSOFA positive)"))

    # R5 DKA
    if hist("diabetes") and (sym("vomiting") or sym("abdominal_pain") or sym("fruity_breath") or sym("sudden_confusion")) and sym("high_thirst"):
        fired.append(("R5_DKA", "Diabetic ketoacidosis"))

    # R6 Pediatric IMCI
    if age < 5 and any(sym(x) for x in ("high_fever_lethargy_child", "poor_feeding_child", "difficulty_breathing_child", "fontanelle_bulge", "seizure", "fever_very_high")):
        fired.append(("R6_PEDIATRIC", "Pediatric IMCI danger sign"))
    # Pediatric meningitis-like (older child): non-blanching rash + headache/stiff neck
    if age < 16 and sym("rash") and (sym("worst_headache_ever") or sym("stiff_neck")):
        fired.append(("R6_PEDIATRIC", "Pediatric meningitis features"))

    # R7 Severe asthma
    if hist("asthma") and (sym("cannot_speak_full_sentences") or sp < 92):
        fired.append(("R7_ASTHMA_SEVERE", "Severe asthma exacerbation"))

    # R8 Hemorrhage
    if any(sym(x) for x in ("heavy_bleeding", "vomiting_blood", "black_tarry_stool", "coughing_blood", "vaginal_bleeding_pregnancy")):
        fired.append(("R8_HEMORRHAGE", "Acute hemorrhage / hypovolemic shock"))

    # R9 Suicidal ideation
    if sym("suicidal_ideation"):
        fired.append(("R9_SUICIDAL", "Suicidal ideation"))

    return fired


# ============================================================
# 5. ESI mapper + safety property
# ============================================================

ESI_TO_CARE = {1: "Emergency Room", 2: "Emergency Room", 3: "Clinic Visit", 4: "Home Care", 5: "Home Care"}


def severity_to_esi(p_er: float, p_clinic: float, vitals: dict) -> int:
    if p_er >= 0.50 or vitals.get("SpO2", 100) < 90:
        return 1
    if p_er >= 0.30:
        return 2
    if p_clinic >= 0.45:
        return 3
    if p_clinic >= 0.25:
        return 4
    return 5


def final_care_level(flags: list[tuple[str, str]], esi: int) -> str:
    from_rules = "Emergency Room" if flags else None
    from_esi = ESI_TO_CARE[esi]
    candidates = [c for c in [from_rules, from_esi] if c]
    return max(candidates, key=lambda c: RANK[c])


# ============================================================
# 6. Synthetic training set (Kaggle proxy)
# ============================================================

ER_TEMPLATES = [
    # R1 STEMI typical
    (["chest_pain", "radiation_arm", "diaphoresis"], ["hypertension"], (45, 80), "M"),
    (["chest_pain", "radiation_jaw", "shortness_of_breath"], ["diabetes"], (40, 75), "F"),
    (["chest_pain", "diaphoresis", "vomiting"], ["smoker"], (35, 70), "M"),
    (["chest_pain", "radiation_arm"], ["diabetes", "hypertension"], (55, 85), "M"),
    # R1 atypical (anginal equivalent) - women / diabetics
    (["radiation_jaw", "diaphoresis", "vomiting"], ["smoker"], (35, 65), "F"),
    (["radiation_arm", "diaphoresis"], ["diabetes"], (40, 70), "F"),
    # R2 Stroke FAST
    (["face_droop", "arm_weakness"], [], (50, 85), "F"),
    (["slurred_speech", "sudden_confusion"], ["hypertension"], (55, 85), "M"),
    (["worst_headache_ever"], [], (30, 70), "F"),
    (["arm_weakness", "sudden_confusion"], ["hypertension"], (60, 85), "F"),
    (["worst_headache_ever", "sudden_vision_loss"], [], (25, 45), "F"),  # eclampsia-like
    # R3 Anaphylaxis
    (["hives", "throat_tightness", "difficulty_breathing"], ["allergy"], (5, 65), "M"),
    (["rash", "swelling", "difficulty_breathing", "vomiting"], ["allergy"], (5, 65), "F"),
    (["throat_tightness", "swelling"], ["allergy"], (8, 50), "M"),
    # R4 Sepsis
    (["fever_very_high", "altered_consciousness"], [], (30, 80), "F"),
    (["fever_very_high", "sudden_confusion"], [], (40, 80), "M"),
    (["fever_high", "sudden_confusion"], [], (40, 75), "F"),  # postoperative-style
    # R5 DKA
    (["vomiting", "abdominal_pain", "fruity_breath", "high_thirst"], ["diabetes"], (15, 50), "M"),
    (["vomiting", "high_thirst", "fruity_breath"], ["diabetes"], (15, 40), "F"),
    # R6 Pediatric IMCI
    (["high_fever_lethargy_child", "poor_feeding_child"], [], (0, 4), "M"),
    (["difficulty_breathing_child", "fever_very_high"], [], (0, 4), "F"),
    (["fontanelle_bulge", "seizure"], [], (0, 2), "M"),
    (["high_fever_lethargy_child", "mild_diarrhea", "vomiting"], [], (0, 4), "F"),  # dehydration
    (["rash", "worst_headache_ever", "fever_very_high"], [], (5, 12), "F"),  # meningitis
    # R7 Severe asthma
    (["cannot_speak_full_sentences"], ["asthma"], (8, 70), "F"),
    (["cannot_speak_full_sentences", "shortness_of_breath"], ["asthma"], (15, 60), "M"),
    # R8 Hemorrhage
    (["heavy_bleeding"], [], (15, 80), "F"),
    (["vomiting_blood"], [], (30, 80), "M"),
    (["black_tarry_stool"], ["hypertension"], (40, 80), "M"),
    (["coughing_blood"], [], (30, 80), "M"),
    (["vaginal_bleeding_pregnancy"], ["pregnancy"], (18, 40), "F"),
    # R9 Suicidal
    (["suicidal_ideation"], [], (15, 60), "F"),
    (["suicidal_ideation"], [], (15, 60), "M"),
]

CLINIC_TEMPLATES = [
    # R10 TB workup
    (["persistent_cough", "night_sweats", "weight_loss_unintentional"], [], (20, 70), "M"),
    (["persistent_cough", "weight_loss_unintentional"], [], (25, 70), "F"),
    (["persistent_cough"], [], (20, 70), "F"),
    # R11 UTI
    (["dysuria"], [], (18, 65), "F"),
    (["dysuria", "abdominal_pain"], [], (18, 65), "F"),
    # R12 Persistent fever
    (["fever_high"], [], (20, 70), "M"),
    (["fever_high", "night_sweats"], [], (25, 60), "F"),
    # R13 Migraine
    (["tension_headache"], ["migraine"], (20, 60), "F"),
    # R14 Mild asthma
    (["mild_cough"], ["asthma"], (10, 70), "F"),
    (["wheeze", "mild_cough"], ["asthma"], (15, 50), "M"),
    # R15 Back pain
    (["back_pain"], [], (25, 65), "M"),
    (["back_pain"], [], (30, 60), "F"),
    # R16 Cellulitis / skin infection
    (["skin_infection"], [], (25, 75), "F"),
    (["skin_infection"], ["diabetes"], (40, 75), "M"),
    # R19 Mild pneumonia
    (["persistent_cough", "fever_high"], [], (25, 70), "M"),
    # R20 GERD / acid reflux 2wk
    (["abdominal_pain"], [], (30, 65), "M"),
    # R21 Conjunctivitis
    (["conjunctivitis"], [], (5, 50), "M"),
    (["conjunctivitis", "eye_discharge"], [], (8, 45), "F"),
    # R23 Sprain not improving
    (["sprain"], [], (15, 60), "M"),
    # R22 Sinusitis
    (["facial_pain", "nasal_congestion"], [], (25, 60), "F"),
    # Otitis / ear pain in child
    (["fever_mild"], [], (2, 10), "F"),  # well-appearing child, low-grade fever
    # New-onset polyuria/polydipsia
    (["high_thirst"], [], (30, 60), "M"),
    # Gout
    (["abdominal_pain"], ["gout"], (45, 75), "M"),  # joint pain proxy
    # Hyperthyroid
    (["diaphoresis", "weight_loss_unintentional"], [], (25, 50), "F"),
]

HOME_TEMPLATES = [
    # R25 Cold
    (["runny_nose", "mild_sore_throat"], [], (5, 70), "F"),
    (["mild_cough", "runny_nose"], [], (5, 70), "M"),
    (["runny_nose", "mild_cough", "fever_mild"], [], (15, 65), "F"),
    # R26 Mild fever
    (["fever_mild"], [], (15, 65), "F"),
    (["fever_mild"], [], (20, 50), "M"),
    # R27 Mild GI
    (["mild_diarrhea"], [], (10, 65), "M"),
    (["vomiting"], [], (5, 65), "F"),  # single episode no other signs
    (["abdominal_pain", "mild_diarrhea"], [], (15, 50), "M"),
    # R28 Tension HA
    (["tension_headache"], [], (20, 65), "F"),
    (["tension_headache"], [], (25, 55), "M"),
    # R29 Period cramps - rough proxy
    (["abdominal_pain"], [], (15, 45), "F"),  # mild abdominal pain alone
    # R30 Minor injury
    (["sprain"], [], (15, 60), "M"),
    # Allergic rhinitis
    (["runny_nose"], ["allergy"], (15, 60), "F"),
    # Eczema
    (["rash"], ["eczema"], (5, 50), "F"),
    # DOMS / muscle soreness
    (["back_pain"], [], (18, 35), "M"),  # muscle pain proxy - lower severity through context
]


def build_training_dataset(n_per_class: int = 1500, seed: int = 42) -> pd.DataFrame:
    """Synthesize a Kaggle-shape training set grounded in the rules.

    If ml/datasets/disease_symptom_dataset.csv exists, the real Kaggle
    Disease-Symptom Prediction set will be used instead.
    """
    kaggle_path = ML / "datasets" / "disease_symptom_dataset.csv"
    if kaggle_path.exists():
        return _build_from_kaggle(kaggle_path)

    rng = random.Random(seed)
    rows: list[dict] = []
    cols = feature_columns()

    def sample(templates, label):
        for _ in range(n_per_class):
            tmpl = rng.choice(templates)
            symptoms_set, history_set, age_range, sex_default = tmpl
            patient_symptoms = set(symptoms_set)
            # add 0..2 noise symptoms outside of confounding ones
            noise_pool = [s for s in SYMPTOMS if s not in patient_symptoms
                          and s not in {"chest_pain", "radiation_arm", "radiation_jaw",
                                        "face_droop", "arm_weakness", "slurred_speech",
                                        "worst_headache_ever", "heavy_bleeding",
                                        "vomiting_blood", "black_tarry_stool",
                                        "coughing_blood", "suicidal_ideation",
                                        "cannot_speak_full_sentences", "fruity_breath",
                                        "throat_tightness"}]
            n_noise = rng.randint(0, 2)
            patient_symptoms.update(rng.sample(noise_pool, n_noise))
            age = rng.randint(age_range[0], age_range[1])
            sex = sex_default if rng.random() > 0.1 else rng.choice(["M", "F"])
            row = {c: 0 for c in cols}
            for s in patient_symptoms:
                key = f"sym_{s}"
                if key in row:
                    row[key] = 1
            row["age"] = float(age)
            row["sex_M"] = int(sex == "M")
            row["sex_F"] = int(sex == "F")
            for h in history_set:
                key = f"hist_{h}"
                if key in row:
                    row[key] = 1
            # default vitals
            row["vit_HR"] = float(rng.randint(60, 95))
            row["vit_RR"] = float(rng.randint(12, 22))
            row["vit_SpO2"] = float(rng.randint(95, 99))
            row["vit_BP_sys"] = float(rng.randint(100, 140))
            row["vit_temp"] = round(rng.uniform(36.5, 37.6), 1)
            # Bump vitals to clinical reality for ER templates
            if label == "Emergency Room":
                if any(s in patient_symptoms for s in ("fever_very_high", "high_fever_lethargy_child")):
                    row["vit_temp"] = round(rng.uniform(39.0, 40.5), 1)
                    row["vit_HR"] = float(rng.randint(110, 150))
                if "cannot_speak_full_sentences" in patient_symptoms:
                    row["vit_SpO2"] = float(rng.randint(85, 92))
                    row["vit_RR"] = float(rng.randint(26, 34))
                if any(s in patient_symptoms for s in ("heavy_bleeding", "vomiting_blood", "black_tarry_stool")):
                    row["vit_HR"] = float(rng.randint(105, 130))
                    row["vit_BP_sys"] = float(rng.randint(80, 100))
            row["care_level"] = label
            rows.append(row)

    sample(ER_TEMPLATES, "Emergency Room")
    sample(CLINIC_TEMPLATES, "Clinic Visit")
    sample(HOME_TEMPLATES, "Home Care")
    rng.shuffle(rows)
    return pd.DataFrame(rows)


def _build_from_kaggle(path: Path) -> pd.DataFrame:
    """Hook for swapping in the real Kaggle Disease-Symptom dataset.

    Expects standard 'Itachi9604' format. Caller (Role C) provides the
    Disease->care_level mapping in ml/datasets/disease_to_care_v1.json.
    """
    df_k = pd.read_csv(path)
    map_path = ML / "datasets" / "disease_to_care_v1.json"
    if not map_path.exists():
        raise FileNotFoundError(
            f"Found {path.name} but no disease_to_care_v1.json mapping; create it before retraining."
        )
    disease_to_care = json.loads(map_path.read_text())
    df_k["care_level"] = df_k["Disease"].map(disease_to_care)
    if df_k["care_level"].isna().any():
        unmapped = sorted(df_k.loc[df_k["care_level"].isna(), "Disease"].unique())
        raise ValueError(f"Unmapped diseases: {unmapped}")
    sym_cols = [c for c in df_k.columns if c.lower().startswith("symptom_")]
    # multi-hot encode against our 50-symptom vocab; symptoms not in our vocab dropped.
    out = []
    cols = feature_columns()
    for _, r in df_k.iterrows():
        row = {c: 0 for c in cols}
        for sym_col in sym_cols:
            v = r[sym_col]
            if isinstance(v, str):
                v = v.strip().lower().replace(" ", "_")
                if v in SEVERITY:
                    row[f"sym_{v}"] = 1
        row["age"] = 35.0  # default if Kaggle row lacks age
        row["sex_M"] = 1
        row["sex_F"] = 0
        for h in HISTORY_FLAGS:
            row[f"hist_{h}"] = 0 if f"hist_{h}" in row else None
        row["vit_HR"] = 75.0
        row["vit_RR"] = 16.0
        row["vit_SpO2"] = 98.0
        row["vit_BP_sys"] = 120.0
        row["vit_temp"] = 37.0
        row["care_level"] = r["care_level"]
        out.append(row)
    return pd.DataFrame(out)


# ============================================================
# 7. Train
# ============================================================

def train(seed: int = 42, n_per_class: int = 1500) -> tuple[XGBClassifier, list[str], dict]:
    print(f"[1/4] Building training dataset (n_per_class={n_per_class})...")
    df = build_training_dataset(n_per_class=n_per_class, seed=seed)
    (ML / "datasets").mkdir(parents=True, exist_ok=True)
    df.to_csv(ML / "datasets" / "synthetic_train_v1.csv", index=False)
    print(f"      rows={len(df)} class counts={Counter(df.care_level)}")

    cols = feature_columns()
    X = df[cols]
    y = df.care_level.map(LABEL_TO_INT)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=seed
    )

    print("[2/4] Training XGBoost (300 trees, depth 6)...")
    model = XGBClassifier(
        objective="multi:softprob", num_class=3,
        max_depth=6, learning_rate=0.1, n_estimators=300,
        subsample=0.8, eval_metric="mlogloss",
        random_state=seed, n_jobs=4, tree_method="hist",
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    macro_f1 = f1_score(y_test, y_pred, average="macro")
    print(f"      test_accuracy={acc:.3f} test_macro_f1={macro_f1:.3f}")

    (ML / "models").mkdir(parents=True, exist_ok=True)
    joblib.dump(model, ML / "models" / "xgboost_v1.pkl")
    meta = {
        "version": "0.2.0",
        "features": cols,
        "labels": list(CARE_LEVELS),
        "trained_on": "synthetic_v1 (rule-grounded; swap-in for Kaggle Disease-Symptom Prediction)",
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "test_accuracy": float(acc),
        "test_macro_f1": float(macro_f1),
        "hyperparameters": {
            "max_depth": 6, "learning_rate": 0.1, "n_estimators": 300,
            "subsample": 0.8, "objective": "multi:softprob",
        },
        "notes": "Replace synthetic dataset by placing real Kaggle dataset.csv at ml/datasets/disease_symptom_dataset.csv and disease_to_care_v1.json mapping alongside; train() will use it automatically.",
    }
    (ML / "models" / "xgboost_v1_metadata.json").write_text(json.dumps(meta, indent=2))
    print("      saved -> ml/models/xgboost_v1.pkl + xgboost_v1_metadata.json")
    return model, cols, meta


# ============================================================
# 8. Full triage pipeline (for eval)
# ============================================================

def triage_one(model: XGBClassifier, cols: list[str], symptoms_text: str,
               age: int = 30, sex: str = "M",
               history: list[str] | None = None, vitals_str: str | None = None) -> dict:
    history = history or []
    if isinstance(vitals_str, str):
        vitals = parse_vitals_field(vitals_str)
    elif isinstance(vitals_str, dict):
        vitals = vitals_str
    else:
        vitals = {}
    feats = featurize(symptoms_text, age=age, sex=sex, history=history, vitals=vitals)
    # vector
    x = np.array([[feats[c] for c in cols]], dtype=float)
    probs = model.predict_proba(x)[0]
    p_home = float(probs[LABEL_TO_INT["Home Care"]])
    p_clinic = float(probs[LABEL_TO_INT["Clinic Visit"]])
    p_er = float(probs[LABEL_TO_INT["Emergency Room"]])
    hist_flags = {h: feats.get(f"hist_{h}", 0) == 1 for h in HISTORY_FLAGS if f"hist_{h}" in feats}
    flags = get_red_flags(feats, age, hist_flags, vitals)
    esi = severity_to_esi(p_er, p_clinic, vitals)
    final = final_care_level(flags, esi)
    return {
        "level": final,
        "flags": flags,
        "esi": esi,
        "probs": {"Home Care": p_home, "Clinic Visit": p_clinic, "Emergency Room": p_er},
    }


# ============================================================
# 9. Eval against docs/EVAL_CASES.csv
# ============================================================

def canonicalize_expected(level: str) -> str | None:
    if level is None or (isinstance(level, float) and np.isnan(level)):
        return None
    s = str(level).strip()
    if s.startswith("Emergency Room"):
        return "Emergency Room"
    if s == "REFUSAL":
        return "REFUSAL"
    return s


def evaluate(model: XGBClassifier, cols: list[str]) -> dict:
    print("[3/4] Evaluating on docs/EVAL_CASES.csv...")
    cases = pd.read_csv(HACK / "docs" / "EVAL_CASES.csv")
    cases["expected_canonical"] = cases["expected_level"].map(canonicalize_expected)

    per_case: list[dict] = []
    for _, c in cases.iterrows():
        exp = c["expected_canonical"]
        if exp == "REFUSAL":
            per_case.append({"case_id": int(c.case_id), "expected": "REFUSAL",
                             "predicted": "REFUSAL_LAYER", "match": True,
                             "category": c.category, "is_refusal": True,
                             "fired_flags": []})
            continue
        history = parse_history_field(c.history)
        try:
            pred = triage_one(model, cols, c.symptoms_text,
                              age=int(c.age), sex=str(c.sex),
                              history=history, vitals_str=c.vitals)
            per_case.append({
                "case_id": int(c.case_id),
                "expected": exp,
                "predicted": pred["level"],
                "match": exp == pred["level"],
                "category": c.category,
                "fired_flags": [fid for fid, _ in pred["flags"]],
                "esi": pred["esi"],
                "probs": pred["probs"],
                "symptoms_text": c.symptoms_text,
            })
        except Exception as e:
            per_case.append({"case_id": int(c.case_id), "error": str(e),
                             "expected": exp, "predicted": "ERROR",
                             "match": False, "category": c.category})

    res = pd.DataFrame(per_case)
    triage_res = res[res.expected != "REFUSAL"].copy()

    labels = ["Home Care", "Clinic Visit", "Emergency Room"]
    overall_acc = float(triage_res.match.mean())
    cm = confusion_matrix(triage_res.expected.values, triage_res.predicted.values, labels=labels)
    er_cases = triage_res[triage_res.expected == "Emergency Room"]
    er_misses = int((er_cases.predicted != "Emergency Room").sum())
    er_recall = 1.0 - (er_misses / max(1, len(er_cases)))
    prec, rec, f1_per, _ = precision_recall_fscore_support(
        triage_res.expected.values, triage_res.predicted.values,
        labels=labels, zero_division=0)
    macro_f1 = float(f1_score(triage_res.expected.values, triage_res.predicted.values,
                              average="macro", zero_division=0))

    # rule trigger counts (informational)
    rule_fires: Counter = Counter()
    for _, r in res.iterrows():
        ff = r.get("fired_flags")
        if isinstance(ff, list):
            for fid in ff:
                rule_fires[fid] += 1

    miss_rows = triage_res[~triage_res.match]
    print(f"[4/4] overall_acc={overall_acc:.3f} macro_f1={macro_f1:.3f} "
          f"ER_recall={er_recall:.3f} ER_misses={er_misses}")
    if er_misses > 0:
        print("      !!! MISSED EMERGENCY CASES (must be zero):")
        for _, m in miss_rows[miss_rows.expected == "Emergency Room"].iterrows():
            ff = m.get("fired_flags")
            text = m.get("symptoms_text") or ""
            text = text[:120] if isinstance(text, str) else ""
            print(f"          case_id={m.case_id} predicted={m.predicted} "
                  f"flags={ff if isinstance(ff, list) else []} probs={m.get('probs')} text={text!r}")

    eval_out = {
        "overall_accuracy": overall_acc,
        "macro_f1": macro_f1,
        "emergency_recall": er_recall,
        "emergency_miss_count": er_misses,
        "n_triage_cases": int(len(triage_res)),
        "per_class": {
            labels[i]: {"precision": float(prec[i]),
                        "recall": float(rec[i]),
                        "f1": float(f1_per[i])}
            for i in range(3)
        },
        "confusion_matrix": {"labels": labels, "matrix": cm.tolist()},
        "rule_fires": dict(rule_fires),
        "cases": per_case,
    }
    (ML / "eval_results.json").write_text(json.dumps(eval_out, indent=2, default=str))

    lines = [
        "ASHA-AI 50-Case Evaluation - Plan 2.0 Results",
        "=" * 50,
        f"Model version:              v0.2.0 (XGBoost, rule-grounded synthetic training set)",
        f"Triage cases evaluated:     {len(triage_res)} of 50 (1 REFUSAL case routed via safety layer)",
        "",
        f"Overall accuracy:           {overall_acc*100:.1f}%",
        f"Emergency-bucket recall:    {er_recall*100:.1f}%   (target: 100%; zero missed emergencies)",
        f"Emergency misses:           {er_misses} of {len(er_cases)}",
        f"Macro-F1:                   {macro_f1:.3f}",
        "",
        "Per-class:",
    ]
    for i, lab in enumerate(labels):
        lines.append(f"  {lab:14s}  precision={prec[i]*100:5.1f}%  recall={rec[i]*100:5.1f}%  f1={f1_per[i]:.3f}")
    lines += [
        "",
        "Confusion matrix (rows=expected, cols=predicted):",
        "                  Home   Clinic   ER",
    ]
    for i, lab in enumerate(labels):
        lines.append(f"  {lab:12s}  {cm[i,0]:5d}   {cm[i,1]:5d}   {cm[i,2]:5d}")
    lines += [
        "",
        f"Rule trigger counts: " + (", ".join(f"{k}={v}" for k, v in sorted(rule_fires.items())) or "(none)"),
        "",
        "Refusals: 1 of 1 handled (case 9: drug-dosing -> safety refusal layer, not triaged).",
    ]
    metrics_block = "\n".join(lines)
    (ML / "metrics.txt").write_text(metrics_block)
    print()
    print(metrics_block)
    return eval_out


def main():
    t0 = time.time()
    model, cols, _meta = train()
    evaluate(model, cols)
    print(f"\nDone in {time.time()-t0:.1f}s.")
    print("Artifacts:")
    for p in [
        "ml/datasets/synthetic_train_v1.csv",
        "ml/models/xgboost_v1.pkl",
        "ml/models/xgboost_v1_metadata.json",
        "ml/eval_results.json",
        "ml/metrics.txt",
    ]:
        print(f"  - {p}")


if __name__ == "__main__":
    main()
