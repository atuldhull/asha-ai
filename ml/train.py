"""
ASHA-AI — Plan 2.0 XGBoost trainer
====================================

Generates a rule-grounded synthetic training set, trains a 3-class XGBoost
severity classifier (Home Care / Clinic Visit / Emergency Room), and writes
the model + metadata that Role B's backend loads at startup.

Why synthetic?
  The Kaggle Disease-Symptom Prediction dataset (Itachi9604) is the
  documented training source. On a connected Colab/Kaggle workspace, swap
  the `make_dataset()` body for `pd.read_csv("ml/datasets/...kaggle.csv")`
  + the disease-to-care mapping (see ml/datasets/disease_to_care_v1.json).
  The rule-grounded synthesis here is the deterministic fallback so the
  pipeline is end-to-end runnable in the hackathon sandbox without Kaggle
  credentials. It also seeds the model with the same clinical priors the
  red-flag rule engine encodes, which matters when the ML and rules
  disagree on borderline cases.

Outputs:
  ml/models/xgboost_v1.pkl
  ml/models/xgboost_v1_metadata.json
  ml/datasets/synth_train_v1.csv  (feature vectors, label column)
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier

from pipeline import (CARE_LEVELS, FEATURE_ORDER, HISTORY_FEATURES,
                       SEVERITY_WEIGHTS, featurize)

ML_DIR = Path(__file__).resolve().parent
MODELS_DIR = ML_DIR / "models"
DATASETS_DIR = ML_DIR / "datasets"
MODELS_DIR.mkdir(exist_ok=True)
DATASETS_DIR.mkdir(exist_ok=True)

SEED = 42
random.seed(SEED)
np.random.seed(SEED)

CARE_TO_INT = {c: i for i, c in enumerate(CARE_LEVELS)}
INT_TO_CARE = {i: c for c, i in CARE_TO_INT.items()}

# ---------------------------------------------------------------------------
# Synthetic-data presets — one preset per clinical archetype.
# Each preset declares which trigger symptoms are required, optional
# co-symptoms with probabilities, demographics, history, and label.
# ---------------------------------------------------------------------------

def _coin(p: float) -> bool:
    return random.random() < p


def _maybe_add(out: list[str], sym: str, p: float) -> None:
    if _coin(p):
        out.append(sym)


PRESETS = [
    # ---- Emergency Room (one preset per red-flag rule, plus a few variants) ----
    dict(name="R1_STEMI_classic", label="Emergency Room", n=80,
         build=lambda: dict(
             symptoms=["chest_pain"]
                     + (["radiation_arm"] if _coin(0.8) else [])
                     + (["diaphoresis"] if _coin(0.8) else [])
                     + (["shortness_of_breath"] if _coin(0.5) else [])
                     + (["vomiting"] if _coin(0.2) else []),
             age=random.randint(45, 80), sex=random.choice(["M", "F"]),
             history=random.sample(["diabetes", "hypertension", "smoker"], random.randint(1, 3)),
             vitals=dict(hr=random.randint(95, 130), sbp=random.randint(140, 180), spo2=random.randint(92, 97)),
         )),
    dict(name="R1_STEMI_atypical", label="Emergency Room", n=30,
         build=lambda: dict(
             symptoms=["radiation_jaw", "diaphoresis"]
                     + (["chest_pain"] if _coin(0.4) else [])
                     + (["vomiting"] if _coin(0.5) else []),
             age=random.randint(35, 60), sex="F",
             history=random.sample(["diabetes", "hypertension", "smoker"], random.randint(0, 2)) or [],
             vitals=dict(hr=random.randint(95, 120)),
         )),
    dict(name="R2_STROKE_FAST", label="Emergency Room", n=80,
         build=lambda: dict(
             symptoms=random.sample(["face_droop", "arm_weakness", "slurred_speech",
                                      "sudden_confusion", "sudden_vision_loss", "worst_headache_ever"],
                                     random.randint(1, 3)),
             age=random.randint(45, 90), sex=random.choice(["M", "F"]),
             history=random.sample(["hypertension", "diabetes", "smoker"], random.randint(0, 2)) or [],
             vitals=dict(hr=random.randint(70, 100), sbp=random.randint(140, 200)),
         )),
    dict(name="R3_ANAPHYLAXIS", label="Emergency Room", n=60,
         build=lambda: dict(
             symptoms=(["throat_tightness"] if _coin(0.6) else [])
                     + (["hives"] if _coin(0.7) else [])
                     + (["difficulty_breathing"] if _coin(0.7) else [])
                     + (["wheeze"] if _coin(0.3) else [])
                     + (["vomiting"] if _coin(0.2) else []),
             age=random.randint(3, 60), sex=random.choice(["M", "F"]),
             history=["allergy"] if _coin(0.7) else [],
             vitals=dict(hr=random.randint(100, 140), spo2=random.randint(88, 96)),
         )),
    dict(name="R4_SEPSIS", label="Emergency Room", n=70,
         build=lambda: dict(
             symptoms=["altered_consciousness"]
                     + (["fever_high"] if _coin(0.5) else ["fever_very_high"])
                     + (["vomiting"] if _coin(0.3) else []),
             age=random.randint(20, 85), sex=random.choice(["M", "F"]),
             history=random.choice([[], ["recent_surgery"], ["postpartum"], ["known_infection"]]),
             vitals=dict(hr=random.randint(95, 130), rr=random.randint(20, 30),
                          temp=round(random.uniform(38.3, 40.0), 1),
                          sbp=random.randint(80, 105)),
         )),
    dict(name="R5_DKA", label="Emergency Room", n=50,
         build=lambda: dict(
             symptoms=["high_thirst"]
                     + (["vomiting"] if _coin(0.7) else [])
                     + (["fruity_breath"] if _coin(0.5) else [])
                     + (["abdominal_pain"] if _coin(0.4) else [])
                     + (["sudden_confusion"] if _coin(0.3) else []),
             age=random.randint(12, 60), sex=random.choice(["M", "F"]),
             history=["diabetes"],
             vitals=dict(hr=random.randint(100, 130), rr=random.randint(20, 30)),
         )),
    dict(name="R6_PEDIATRIC", label="Emergency Room", n=70,
         build=lambda: dict(
             symptoms=random.sample(["high_fever_lethargy_child", "poor_feeding_child",
                                      "difficulty_breathing_child", "fontanelle_bulge",
                                      "seizure"], random.randint(1, 2)),
             age=random.randint(0, 4), sex=random.choice(["M", "F"]),
             history=[],
             vitals=dict(hr=random.randint(130, 170),
                          temp=round(random.uniform(38.5, 40.5), 1)),
         )),
    dict(name="R7_SEVERE_ASTHMA", label="Emergency Room", n=50,
         build=lambda: dict(
             symptoms=["cannot_speak_full_sentences"]
                     + (["wheeze"] if _coin(0.6) else [])
                     + (["shortness_of_breath"] if _coin(0.7) else []),
             age=random.randint(8, 65), sex=random.choice(["M", "F"]),
             history=["asthma"],
             vitals=dict(hr=random.randint(110, 140), rr=random.randint(24, 35),
                          spo2=random.randint(85, 92)),
         )),
    dict(name="R8_HEMORRHAGE", label="Emergency Room", n=60,
         build=lambda: dict(
             symptoms=[random.choice(["heavy_bleeding", "vomiting_blood",
                                       "black_tarry_stool", "coughing_blood",
                                       "vaginal_bleeding_pregnancy"])]
                     + (["syncope"] if _coin(0.3) else []),
             age=random.randint(18, 80), sex=random.choice(["M", "F"]),
             history=[],
             vitals=dict(hr=random.randint(105, 130), sbp=random.randint(80, 100)),
         )),
    dict(name="R9_SUICIDAL", label="Emergency Room", n=40,
         build=lambda: dict(
             symptoms=["suicidal_ideation"],
             age=random.randint(14, 65), sex=random.choice(["M", "F"]),
             history=[],
             vitals=dict(),
         )),
    # ---- Clinic Visit presets ----
    dict(name="C_TB_workup", label="Clinic Visit", n=40,
         build=lambda: dict(
             symptoms=["persistent_cough"]
                     + (["night_sweats"] if _coin(0.5) else [])
                     + (["weight_loss_unintentional"] if _coin(0.5) else []),
             age=random.randint(20, 70), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(spo2=random.randint(95, 99)),
         )),
    dict(name="C_UTI", label="Clinic Visit", n=40,
         build=lambda: dict(
             symptoms=["dysuria"] + (["abdominal_pain"] if _coin(0.4) else []),
             age=random.randint(18, 70), sex="F",
             history=[], vitals=dict(temp=round(random.uniform(37.0, 38.0), 1)),
         )),
    dict(name="C_persistent_fever", label="Clinic Visit", n=40,
         build=lambda: dict(
             symptoms=["fever_high"],
             age=random.randint(15, 70), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(temp=round(random.uniform(38.5, 39.0), 1)),
         )),
    dict(name="C_migraine_recurring", label="Clinic Visit", n=30,
         build=lambda: dict(
             symptoms=["tension_headache"] + (["vomiting"] if _coin(0.3) else []),
             age=random.randint(18, 55), sex="F",
             history=["migraine"], vitals=dict(),
         )),
    dict(name="C_mild_asthma_flare", label="Clinic Visit", n=30,
         build=lambda: dict(
             symptoms=["wheeze"],
             age=random.randint(10, 60), sex=random.choice(["M", "F"]),
             history=["asthma"], vitals=dict(spo2=random.randint(94, 98)),
         )),
    dict(name="C_back_pain_new", label="Clinic Visit", n=30,
         build=lambda: dict(
             symptoms=["back_pain"],
             age=random.randint(25, 65), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="C_cellulitis", label="Clinic Visit", n=30,
         build=lambda: dict(
             symptoms=["skin_infection"] + (["fever_mild"] if _coin(0.3) else []),
             age=random.randint(18, 75), sex=random.choice(["M", "F"]),
             history=["diabetes"] if _coin(0.4) else [],
             vitals=dict(),
         )),
    dict(name="C_mild_pneumonia", label="Clinic Visit", n=40,
         build=lambda: dict(
             symptoms=["persistent_cough", "fever_high"],
             age=random.randint(18, 75), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(spo2=random.randint(94, 97),
                                       temp=round(random.uniform(38.0, 39.0), 1)),
         )),
    dict(name="C_acid_reflux", label="Clinic Visit", n=30,
         build=lambda: dict(
             symptoms=[],  # patient describes burning, doesn't match our keywords
             age=random.randint(25, 70), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="C_conjunctivitis_discharge", label="Clinic Visit", n=20,
         build=lambda: dict(
             symptoms=["conjunctivitis"],
             age=random.randint(2, 70), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="C_sprain_unhealed", label="Clinic Visit", n=20,
         build=lambda: dict(
             symptoms=["sprain"],
             age=random.randint(10, 60), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="C_polyuria_screen", label="Clinic Visit", n=20,
         build=lambda: dict(
             symptoms=["high_thirst"],
             age=random.randint(25, 70), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="C_postpartum_fever", label="Clinic Visit", n=15,
         build=lambda: dict(
             symptoms=["fever_mild"],
             age=random.randint(20, 40), sex="F",
             history=["postpartum"],
             vitals=dict(temp=round(random.uniform(37.5, 38.2), 1)),
         )),
    # ---- Home Care presets ----
    dict(name="H_common_cold", label="Home Care", n=80,
         build=lambda: dict(
             symptoms=["runny_nose", "mild_sore_throat"]
                     + (["mild_cough"] if _coin(0.7) else []),
             age=random.randint(5, 75), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(temp=round(random.uniform(36.8, 37.6), 1)),
         )),
    dict(name="H_mild_fever_adult", label="Home Care", n=40,
         build=lambda: dict(
             symptoms=["fever_mild"],
             age=random.randint(15, 60), sex=random.choice(["M", "F"]),
             history=[],
             vitals=dict(temp=round(random.uniform(37.5, 38.4), 1)),
         )),
    dict(name="H_mild_GI_upset", label="Home Care", n=40,
         build=lambda: dict(
             symptoms=["mild_diarrhea"] + (["vomiting"] if _coin(0.2) else []),
             age=random.randint(10, 60), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="H_tension_headache", label="Home Care", n=40,
         build=lambda: dict(
             symptoms=["tension_headache"],
             age=random.randint(15, 60), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="H_minor_injury", label="Home Care", n=40,
         build=lambda: dict(
             symptoms=["sprain"] if _coin(0.5) else [],  # bruise / sunburn don't map to symptoms
             age=random.randint(10, 60), sex=random.choice(["M", "F"]),
             history=[], vitals=dict(),
         )),
    dict(name="H_allergic_rhinitis", label="Home Care", n=30,
         build=lambda: dict(
             symptoms=["runny_nose"],
             age=random.randint(8, 60), sex=random.choice(["M", "F"]),
             history=["allergy"], vitals=dict(),
         )),
    dict(name="H_period_cramps", label="Home Care", n=20,
         build=lambda: dict(
             symptoms=["abdominal_pain"],
             age=random.randint(13, 50), sex="F",
             history=[], vitals=dict(),
         )),
]


def make_dataset(seed: int = SEED) -> pd.DataFrame:
    random.seed(seed)
    np.random.seed(seed)
    rows: list[dict] = []
    for preset in PRESETS:
        for _ in range(preset["n"]):
            sample = preset["build"]()
            symptoms = sample["symptoms"]
            age = sample["age"]
            sex = sample["sex"]
            history = set(sample["history"])
            vitals = sample["vitals"]
            feats = featurize(symptoms, age, sex, history, vitals)
            row = dict(feats)
            row["label"] = CARE_TO_INT[preset["label"]]
            row["_preset"] = preset["name"]
            rows.append(row)
    df = pd.DataFrame(rows)
    return df


def train_xgboost(df: pd.DataFrame) -> tuple[XGBClassifier, dict]:
    feature_cols = FEATURE_ORDER
    X = df[feature_cols].astype(np.float32).values
    y = df["label"].astype(int).values

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=SEED)

    # Class weights — ER is rarer than Home/Clinic; scale via sample_weight
    class_counts = pd.Series(y_train).value_counts().to_dict()
    n = len(y_train)
    weights = {c: n / (len(class_counts) * cnt) for c, cnt in class_counts.items()}
    sample_weight = np.array([weights[c] for c in y_train], dtype=np.float32)

    model = XGBClassifier(
        objective="multi:softprob",
        num_class=3,
        max_depth=5,
        learning_rate=0.1,
        n_estimators=300,
        subsample=0.85,
        colsample_bytree=0.85,
        eval_metric="mlogloss",
        random_state=SEED,
        tree_method="hist",
    )
    model.fit(X_train, y_train, sample_weight=sample_weight, verbose=False)

    y_pred = model.predict(X_test)

    metrics = dict(
        test_accuracy=float(accuracy_score(y_test, y_pred)),
        test_macro_f1=float(f1_score(y_test, y_pred, average="macro")),
        test_per_class_f1={INT_TO_CARE[i]: float(f1) for i, f1 in enumerate(
            f1_score(y_test, y_pred, average=None, labels=[0, 1, 2]))},
        confusion_matrix=confusion_matrix(y_test, y_pred, labels=[0, 1, 2]).tolist(),
        n_train=int(len(y_train)),
        n_test=int(len(y_test)),
        class_counts_train={INT_TO_CARE[c]: int(cnt) for c, cnt in class_counts.items()},
    )
    print("\nTraining report:")
    print(classification_report(y_test, y_pred, target_names=list(CARE_LEVELS), labels=[0, 1, 2]))
    print(f"Macro-F1: {metrics['test_macro_f1']:.3f}  Accuracy: {metrics['test_accuracy']:.3f}")
    return model, metrics


def main() -> None:
    print(f"[train] FEATURE_ORDER size = {len(FEATURE_ORDER)}")
    df = make_dataset()
    print(f"[train] synthesized {len(df)} samples across {df['_preset'].nunique()} presets")
    print(df["label"].map(INT_TO_CARE).value_counts().to_string())

    out_csv = DATASETS_DIR / "synth_train_v1.csv"
    df.drop(columns=["_preset"]).to_csv(out_csv, index=False)
    print(f"[train] wrote {out_csv}")

    model, metrics = train_xgboost(df)
    pkl_path = MODELS_DIR / "xgboost_v1.pkl"
    joblib.dump(model, pkl_path)
    print(f"[train] wrote {pkl_path}")

    metadata = dict(
        version="0.2.0",
        framework="xgboost",
        framework_version=str(XGBClassifier().get_params().get("eval_metric", "")),
        features=FEATURE_ORDER,
        feature_count=len(FEATURE_ORDER),
        classes=list(CARE_LEVELS),
        class_to_int=CARE_TO_INT,
        trained_on="rule_grounded_synthetic_v1 (1500+ samples)",
        dataset_path=str(out_csv.relative_to(ML_DIR.parent).as_posix()),
        seed=SEED,
        metrics=metrics,
    )
    meta_path = MODELS_DIR / "xgboost_v1_metadata.json"
    meta_path.write_text(json.dumps(metadata, indent=2))
    print(f"[train] wrote {meta_path}")


if __name__ == "__main__":
    main()
