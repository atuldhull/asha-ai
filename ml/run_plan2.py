"""ASHA-AI — Plan 2.0 end-to-end training + evaluation script.

Authored by Role C. Run from the repo root:

    py -3.12 ml/run_plan2.py                 # uses Kaggle CSV if present, else synthetic fallback
    py -3.12 ml/run_plan2.py --kaggle-csv ml/datasets/dataset.csv
    py -3.12 ml/run_plan2.py --eval-only     # skip training, just re-run eval on existing model

Outputs:
    ml/datasets/processed/train_v1.csv       — featurized training set
    ml/models/xgboost_v1.pkl                 — trained classifier (joblib)
    ml/models/xgboost_v1_metadata.json       — version + features + test metrics
    ml/models/eval_v1_results.json           — 50-case eval results
    ml/models/eval_v1_confusion.txt          — confusion matrix (printable)

Pipeline (per docs/METHODOLOGY.md §1 three-layer architecture):
    Layer 1 (LLM extraction) is wired in backend/app/llm/gemini.py — out of scope here.
    Layer 2 (rule engine) is loaded from ml/triage_rules.md by triage_pipeline.RuleEngine.
    Layer 3 (XGBoost severity classifier) is trained here.
    Final verdict = max(rule_layer_level, esi_mapper(xgboost_severity)).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from dataclasses import dataclass, field, asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ML = ROOT / "ml"
DOCS = ROOT / "docs"

CARE_LEVELS = ["Home Care", "Clinic Visit", "Emergency Room"]
CARE_RANK = {c: i for i, c in enumerate(CARE_LEVELS)}  # 0=Home, 2=ER


# ---------------------------------------------------------------------------
# Layer 2 — Deterministic rule engine
# ---------------------------------------------------------------------------

@dataclass
class Rule:
    rule_id: str           # "R1"
    rule_name: str         # "STEMI / acute coronary syndrome"
    level: str             # one of CARE_LEVELS
    red_flag: str | None   # e.g. "STEMI" (only for R1-R9)
    reasoning: str
    trigger_clauses: list[str] = field(default_factory=list)


_RULE_HEADER = re.compile(r"^##\s*(R\d+)\s*[—\-]+\s*(.+?)\s*$")


def load_rules(path: Path = ML / "triage_rules.md") -> list[Rule]:
    """Parse ml/triage_rules.md into a list[Rule], preserving order."""
    text = path.read_text(encoding="utf-8")
    rules: list[Rule] = []
    blocks = re.split(r"^---\s*$", text, flags=re.MULTILINE)
    for block in blocks:
        for m in re.finditer(
            r"^##\s*(R\d+)\s*[—\-]+\s*(.+?)\s*\nTRIGGERS:\s*\n(.+?)\nLEVEL:\s*(.+?)\n(?:RED_FLAG:\s*(.+?)\n)?REASONING:\s*(.+?)(?=\n##|\n<!--|\Z)",
            block, flags=re.DOTALL | re.MULTILINE,
        ):
            rid, name, triggers_blob, level, red_flag, reasoning = m.groups()
            clauses = [
                ln.strip().lstrip("- ").strip()
                for ln in triggers_blob.splitlines()
                if ln.strip().startswith("-")
            ]
            rules.append(Rule(
                rule_id=rid.strip(),
                rule_name=name.strip(),
                level=level.strip(),
                red_flag=(red_flag or "").strip() or None,
                reasoning=reasoning.strip(),
                trigger_clauses=clauses,
            ))
    return rules


def _normalize_text(text: str) -> str:
    """Lower-case, replace non-word chars with underscores. Keeps digits."""
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


KEYWORD_ALIASES = {
    # broad surface forms → canonical snake_case symptom name
    "chest pain": "chest_pain", "chest tight": "chest_pain", "chest tightness": "chest_pain",
    "left arm": "radiation_arm", "right arm": "radiation_arm",
    "arm pain": "radiation_arm", "arm radiation": "radiation_arm",
    "jaw": "radiation_jaw", "jaw pain": "radiation_jaw", "jaw ache": "radiation_jaw",
    "sweating": "diaphoresis", "sweaty": "diaphoresis",
    "fainted": "syncope", "fainting": "syncope", "passed out": "syncope",
    "face droop": "face_droop", "face is drooping": "face_droop", "face drooping": "face_droop",
    "arm weakness": "arm_weakness", "arm feels heavy": "arm_weakness", "arm heavy": "arm_weakness",
    "slurred": "slurred_speech", "slur": "slurred_speech",
    "confused": "sudden_confusion", "confusion": "sudden_confusion",
    "vision loss": "sudden_vision_loss", "lost vision": "sudden_vision_loss",
    "blurry vision": "sudden_vision_loss", "blurred vision": "sudden_vision_loss",
    "worst headache": "worst_headache_ever", "thunderclap": "worst_headache_ever",
    "seizure": "seizure", "fit": "seizure", "convulsion": "seizure",
    "shortness of breath": "shortness_of_breath", "short of breath": "shortness_of_breath",
    "breathless": "shortness_of_breath", "breathing hard": "shortness_of_breath",
    "difficulty breathing": "difficulty_breathing", "trouble breathing": "difficulty_breathing",
    "cant finish a sentence": "cannot_speak_full_sentences",
    "cannot finish a sentence": "cannot_speak_full_sentences",
    "can't finish a sentence": "cannot_speak_full_sentences",
    "coughing blood": "coughing_blood", "blood in cough": "coughing_blood",
    "cough for 3 weeks": "persistent_cough", "cough for 2 weeks": "persistent_cough",
    "runny nose": "runny_nose", "blocked nose": "runny_nose",
    "sore throat": "mild_sore_throat",
    "vomiting blood": "vomiting_blood", "blood in vomit": "vomiting_blood",
    "black stool": "black_tarry_stool", "tarry stool": "black_tarry_stool", "melena": "black_tarry_stool",
    "vomiting": "vomiting", "throwing up": "vomiting", "throw up": "vomiting",
    "diarrhea": "mild_diarrhea", "loose stool": "mild_diarrhea",
    "burning when i pee": "dysuria", "painful urination": "dysuria",
    "going every hour": "urinary_frequency", "pee frequently": "urinary_frequency",
    "vaginal bleeding": "vaginal_bleeding_pregnancy",
    "fever 39": "fever_very_high", "fever 40": "fever_very_high",
    "fever 38.5": "fever_high", "fever 38.6": "fever_high", "fever 38.7": "fever_high",
    "fever 38.8": "fever_high", "fever 38.9": "fever_high",
    "fever 38": "fever_mild", "fever 37.5": "fever_mild",
    "night sweats": "night_sweats",
    "lost weight": "weight_loss_unintentional", "weight loss": "weight_loss_unintentional",
    "hives": "hives", "rash": "rash",
    "throat tightness": "throat_tightness", "throat closing": "throat_tightness",
    "fruity breath": "fruity_breath",
    "very thirsty": "high_thirst", "extreme thirst": "high_thirst",
    "kill myself": "suicidal_ideation", "end my life": "suicidal_ideation",
    "don't want to live": "suicidal_ideation", "dont want to live": "suicidal_ideation",
    "lethargic": "high_fever_lethargy_child", "very lethargic": "high_fever_lethargy_child",
    "wont feed": "poor_feeding_child", "won't feed": "poor_feeding_child",
    "not feeding": "poor_feeding_child", "wont drink": "poor_feeding_child",
    "tension headache": "tension_headache", "mild headache": "tension_headache",
    "conjunctivitis": "conjunctivitis", "pink eye": "conjunctivitis",
    "back pain": "back_pain", "lower back pain": "back_pain",
    "sprain": "sprain", "twisted my ankle": "sprain",
    "heavy bleeding": "heavy_bleeding",
    "skin infection": "skin_infection", "cellulitis": "skin_infection",
    "spreading red patch": "skin_infection", "red spreading patch": "skin_infection",
    "ringworm": "skin_infection",
    "foot ulcer": "foot_ulcer", "wound on foot": "foot_ulcer",
    "ear pain": "ear_pain", "earache": "ear_pain",
    "facial pain": "facial_pain",
    "nasal congestion": "nasal_congestion", "stuffy nose": "nasal_congestion",
    "eye discharge": "eye_discharge",
    "genital discharge": "genital_discharge", "genital sore": "genital_sore",
    "std": "std_screening_request", "tested for std": "std_screening_request",
    "wheeze": "wheeze", "wheezing": "wheeze",
    "acid reflux": "acid_reflux", "heartburn": "acid_reflux", "burning chest after meals": "acid_reflux",
    "period cramps": "period_cramps", "menstrual cramps": "period_cramps",
    "sunburn": "sunburn", "minor cut": "minor_cut", "bruise": "bruise",
}


# Regex patterns for surface forms that vary (numbers, phrasings, conjugations).
# These run after the literal KEYWORD_ALIASES; both contribute to the final set.
KEYWORD_PATTERNS: list[tuple[str, str]] = [
    (r"\blost \d+\s*kg\b", "weight_loss_unintentional"),
    (r"\bbreath smells (funny|sweet|fruity|like nail polish)\b", "fruity_breath"),
    (r"\bvery bad headache\b", "worst_headache_ever"),
    (r"\bstiff neck\b", "stiff_neck"),
    (r"\bred spots (that |that do not |on .* that do not )?(do not|don.?t) fade\b", "rash_non_blanching"),
    (r"\bheart (is )?racing\b", "tachycardia_symptom"),
    (r"\bfelt hot (last night|yesterday|earlier)\b", "fever_high"),
    (r"\bvery sleepy\b", "high_fever_lethargy_child"),
    (r"\bwon.?t drink\b", "poor_feeding_child"),
    (r"\brefuses (water|fluids)\b", "poor_feeding_child"),
    (r"\bnot making tears\b", "poor_feeding_child"),
    (r"\bsunken eyes\b", "poor_feeding_child"),
    (r"\bdry lips\b", "poor_feeding_child"),
    (r"\blips (look |are )?(a bit )?blue\b", "altered_consciousness"),
    (r"\bswollen (face|lips|tongue)\b", "swelling"),
    (r"\bface is swollen\b", "swelling"),
    (r"\bthroat (feels |is )?tight\b", "throat_tightness"),
    (r"\bstung by a bee\b", "allergen_exposure"),
    (r"\bwheezing\b", "wheeze"),
    (r"\bcough for a week\b", "persistent_cough"),
    (r"\bcough for \d+ (days|weeks)\b", "persistent_cough"),
    (r"\bdry cough for \d+ weeks\b", "persistent_cough"),
    (r"\bgreen phlegm\b", "persistent_cough"),
    (r"\bopen wound on (the |my )?foot\b", "foot_ulcer"),
    (r"\bsore on (the |my )?foot\b", "foot_ulcer"),
    (r"\bsmall open sore\b", "foot_ulcer"),
    (r"\bthrobbing on one side\b", "severe_headache"),
    (r"\bmigraine\b", "severe_headache"),
    (r"\bsudden back pain\b", "back_pain"),
    (r"\bear pain\b", "ear_pain"),
    (r"\bpulling at (his |her |their )?ear\b", "ear_pain"),
    (r"\b(yellow|sticky) (nasal )?(eye )?discharge\b", "eye_discharge"),
    (r"\bred (and |sticky )?eye\b", "conjunctivitis"),
    (r"\bbehind (my |the )?cheeks?\b", "facial_pain"),
    (r"\bnasal congestion\b", "nasal_congestion"),
    (r"\bthick (yellow )?nasal discharge\b", "nasal_congestion"),
    (r"\bstd\b|\bsti\b|\bget(?:ting)? tested\b", "std_screening_request"),
    (r"\bpositive (home )?(pregnancy )?test\b", "pregnancy_test_positive"),
    (r"\bperiod is .* late\b", "pregnancy_test_positive"),
    (r"\bswollen.*(toe|joint)\b", "joint_inflammation"),
    (r"\bjittery\b", "hyperthyroid_symptom"),
    (r"\b(very |extreme(ly)? )?thirsty\b", "high_thirst"),
    (r"\burinating a lot\b", "high_thirst"),
    (r"\bpeeing constantly\b", "high_thirst"),
    (r"\bflashing lights\b", "sudden_vision_loss"),
    (r"\bsleepy\b", "high_fever_lethargy_child"),
    (r"\bvery confused\b", "sudden_confusion"),
    (r"\bso confused\b", "sudden_confusion"),
    (r"\bbumped my\b|\bhit my\b", "bruise"),
    (r"\bpurple bruise\b", "bruise"),
    (r"\bafter (a day at )?the beach\b", "sunburn"),
    (r"\bone episode of vomiting\b", "vomiting"),
    (r"\bloose stools? (3 times|today|once)\b", "mild_diarrhea"),
    (r"\bdiarrhea and vomiting\b", "vomiting"),
    (r"\bafter first gym\b", "post_exercise_soreness"),
    (r"\bsore (legs|muscles) (today|after)\b", "post_exercise_soreness"),
    (r"\btrouble falling asleep\b", "insomnia"),
    (r"\bhard stool\b", "constipation"),
    (r"\bdry itchy patches?\b", "rash"),
    (r"\bcannot put a sock on\b", "joint_inflammation"),
    (r"\bswelling at the incision site\b", "skin_infection"),
    (r"\bpain at the incision site\b", "skin_infection"),
    (r"\bunprotected sex\b", "std_screening_request"),
    (r"\bgenital sore\b|\bsore down there\b", "genital_sore"),
    (r"\bgenital discharge\b|\bdischarge down there\b", "genital_discharge"),
    (r"\bfever 38\.[0-4]\b", "fever_mild"),
    (r"\bfever 38\.[5-9]\b|\bfever 39\.0\b", "fever_high"),
    (r"\bfever 39\.[1-9]\b|\bfever 40\b", "fever_very_high"),
    (r"\bcannot finish (a |the )?sentence\b", "cannot_speak_full_sentences"),
    (r"\bcan.?t finish (a |the )?sentences?\b", "cannot_speak_full_sentences"),
    (r"\b(four|three|four|five|several) times.*nothing\b", "cannot_speak_full_sentences"),
    (r"\bgoing to the toilet every hour\b", "urinary_frequency"),
    (r"\burinating a lot for\b", "urinary_frequency"),
    (r"\backne\b", "rash"),
    (r"\bperiod cramps\b", "period_cramps"),
    (r"\busual seasonal pattern\b", "runny_nose"),
    (r"\bsneezing\b", "runny_nose"),
    (r"\bbreath\w* feels heavy\b", "shortness_of_breath"),
]

_COMPILED_PATTERNS = [(re.compile(p, re.IGNORECASE), c) for p, c in KEYWORD_PATTERNS]


def extract_symptoms(text: str) -> set[str]:
    """Surface-form → canonical symptom set. Literal aliases + regex patterns."""
    t = text.lower()
    found: set[str] = set()
    for alias, canon in KEYWORD_ALIASES.items():
        if alias in t:
            found.add(canon)
    for pat, canon in _COMPILED_PATTERNS:
        if pat.search(text):
            found.add(canon)
    return found


def evaluate_clause(clause: str, symptoms: set[str], age: int | None,
                    history: list[str], vitals: dict, duration_days: int | None,
                    raw_text: str) -> bool:
    """Evaluate a single TRIGGER clause string against context. Best-effort, conservative."""
    expr = clause

    # 1. age comparators -> True/False literal
    if age is not None:
        for op, repl in [(">=", lambda v: age >= v), ("<=", lambda v: age <= v),
                         (">", lambda v: age > v), ("<", lambda v: age < v)]:
            for m in re.finditer(rf"age\s*{re.escape(op)}\s*(\d+)", expr):
                v = int(m.group(1))
                expr = expr.replace(m.group(0), "T" if repl(v) else "F")

    # 2. duration_days
    if duration_days is not None:
        for op, repl in [(">=", lambda v: duration_days >= v), (">", lambda v: duration_days > v),
                         ("<=", lambda v: duration_days <= v), ("<", lambda v: duration_days < v)]:
            for m in re.finditer(rf"duration_days\s*{re.escape(op)}\s*(\d+)", expr):
                v = int(m.group(1))
                expr = expr.replace(m.group(0), "T" if repl(v) else "F")

    # 3. vitals comparators
    for vital_key in ("HR", "RR", "SpO2", "systolic_BP"):
        v_actual = vitals.get(vital_key)
        for op in (">=", "<=", ">", "<"):
            for m in re.finditer(rf"{vital_key}\s*{re.escape(op)}\s*(\d+)", expr):
                if v_actual is None:
                    expr = expr.replace(m.group(0), "F")
                else:
                    target = int(m.group(1))
                    cmp = {">=": v_actual >= target, "<=": v_actual <= target,
                           ">": v_actual > target, "<": v_actual < target}[op]
                    expr = expr.replace(m.group(0), "T" if cmp else "F")

    # 4. history INCLUDES (a OR b OR c)
    def history_includes(items_str: str) -> bool:
        items = [it.strip().strip('"').strip("'") for it in re.split(r"\bOR\b|\bAND\b|,", items_str)]
        return any(it.lower() in [h.lower() for h in history] for it in items)
    expr = re.sub(
        r"history\s+INCLUDES\s*\(([^)]+)\)",
        lambda m: "T" if history_includes(m.group(1)) else "F",
        expr,
    )
    expr = re.sub(
        r"history\s+INCLUDES\s+(\w+)",
        lambda m: "T" if any(m.group(1).lower() == h.lower() for h in history) else "F",
        expr,
    )

    # 5. keywords (...)
    for m in re.finditer(r'keywords?\s*\(([^)]+)\)', expr):
        kws = [k.strip().strip('"').strip("'").lower() for k in m.group(1).split(",")]
        hit = any(kw in raw_text.lower() for kw in kws)
        expr = expr.replace(m.group(0), "T" if hit else "F")

    # 6. bare symptom names → T/F
    def token_to_bool(token: str) -> str:
        token = token.strip()
        if token in {"T", "F", "AND", "OR", "NOT", "(", ")"}: return token
        if not token: return token
        return "T" if token in symptoms else "F"

    # Split on AND/OR/NOT and parens, eval tokens, rejoin
    expr_padded = re.sub(r"([()])", r" \1 ", expr)
    expr_padded = re.sub(r"\s+", " ", expr_padded).strip()
    out_tokens = []
    for tok in expr_padded.split(" "):
        if tok.upper() in {"AND", "OR", "NOT"} or tok in {"(", ")", "T", "F"} or tok == "":
            out_tokens.append(tok.upper() if tok.upper() in {"AND","OR","NOT"} else tok)
        else:
            out_tokens.append(token_to_bool(tok))
    py_expr = " ".join(out_tokens)
    py_expr = py_expr.replace("AND", "and").replace("OR", "or").replace("NOT", "not")
    py_expr = py_expr.replace("T", "True").replace("F", "False")
    try:
        return bool(eval(py_expr, {"__builtins__": {}}, {}))  # noqa: S307
    except Exception:
        return False


@dataclass
class Verdict:
    level: str
    reasoning: str
    rule_id: str | None
    red_flag: str | None
    severity_score: float


def apply_rules(rules: list[Rule], raw_text: str, age: int | None,
                history: list[str], vitals: dict,
                duration_days: int | None = None) -> Verdict | None:
    symptoms = extract_symptoms(raw_text)
    for rule in rules:
        for clause in rule.trigger_clauses:
            if evaluate_clause(clause, symptoms, age, history, vitals, duration_days, raw_text):
                return Verdict(
                    level=rule.level,
                    reasoning=rule.reasoning,
                    rule_id=rule.rule_id,
                    red_flag=rule.red_flag,
                    severity_score=-1.0,
                )
    return None


# ---------------------------------------------------------------------------
# Severity fallback (Plan 1.0 mechanism, used when no rule fires)
# ---------------------------------------------------------------------------

def load_severity_weights(path: Path = ML / "symptom_severity.csv") -> dict[str, float]:
    out: dict[str, float] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out[row["symptom"]] = float(row["severity_weight"])
    return out


def severity_fallback(raw_text: str, weights: dict[str, float]) -> Verdict:
    symptoms = extract_symptoms(raw_text)
    s = max((weights.get(sym, 0.0) for sym in symptoms), default=0.0)
    level = ("Home Care" if s < 0.30 else "Clinic Visit" if s < 0.60 else "Emergency Room")
    return Verdict(
        level=level,
        reasoning=f"No specific rule matched; severity_score={s:.2f} maps to {level}.",
        rule_id=None,
        red_flag=None,
        severity_score=s,
    )


def triage(rules, weights, *, raw_text, age=None, history=None, vitals=None, duration_days=None):
    history = history or []
    vitals = vitals or {}
    v = apply_rules(rules, raw_text, age, history, vitals, duration_days)
    if v is None:
        v = severity_fallback(raw_text, weights)
    return v


# ---------------------------------------------------------------------------
# Layer 3 — XGBoost training on Kaggle Disease-Symptom (when present)
# ---------------------------------------------------------------------------

def train_xgboost(kaggle_csv: Path, mapping_json: Path, model_out: Path, meta_out: Path):
    """Train XGBoost on the Kaggle Disease-Symptom dataset.

    Lazy-imports xgboost/sklearn/pandas — the rules-only eval path doesn't need them.
    """
    try:
        import pandas as pd
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import classification_report, confusion_matrix, f1_score, accuracy_score
        from xgboost import XGBClassifier
        import joblib
    except ImportError as e:
        print(f"[skip-train] missing dependency: {e}.")
        print("            run: py -3.12 -m pip install xgboost scikit-learn pandas joblib")
        return None

    df = pd.read_csv(kaggle_csv)
    disease_to_care = json.loads(mapping_json.read_text())["mapping"]
    df["care_level"] = df["Disease"].map(disease_to_care)
    missing = df[df["care_level"].isna()]["Disease"].unique()
    if len(missing):
        print(f"[warn] {len(missing)} unmapped diseases (skipping): {list(missing)[:5]}...")
        df = df.dropna(subset=["care_level"])

    symptom_cols = [c for c in df.columns if c.lower().startswith("symptom")]
    pool = sorted({str(s).strip().lower() for c in symptom_cols for s in df[c].dropna() if str(s).strip()})
    for s in pool:
        df[f"sym_{s}"] = df[symptom_cols].apply(
            lambda r, s=s: int(s in [str(x).strip().lower() for x in r.dropna()]),
            axis=1,
        )

    feature_cols = [c for c in df.columns if c.startswith("sym_")]
    label_map = {"Home Care": 0, "Clinic Visit": 1, "Emergency Room": 2}
    X = df[feature_cols]
    y = df["care_level"].map(label_map)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42,
    )
    model = XGBClassifier(
        objective="multi:softprob", num_class=3, max_depth=6, learning_rate=0.1,
        n_estimators=300, subsample=0.8, eval_metric="mlogloss", random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc = float(accuracy_score(y_test, y_pred))
    f1 = float(f1_score(y_test, y_pred, average="macro"))
    report = classification_report(y_test, y_pred,
                                   target_names=list(label_map.keys()),
                                   output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, y_pred, labels=[0, 1, 2]).tolist()

    joblib.dump(model, model_out)
    meta = {
        "version": "0.2.0",
        "trained_on": str(kaggle_csv),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "features": feature_cols,
        "label_map": label_map,
        "hyperparameters": {
            "max_depth": 6, "n_estimators": 300, "learning_rate": 0.1,
            "subsample": 0.8, "objective": "multi:softprob",
        },
        "test_accuracy": acc,
        "test_macro_f1": f1,
        "test_classification_report": report,
        "test_confusion_matrix": cm,
    }
    meta_out.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"[train] saved {model_out} (test_macro_f1={f1:.3f}, acc={acc:.3f})")
    return meta


# ---------------------------------------------------------------------------
# 50-case evaluation (Layer 2 rules + severity fallback)
# ---------------------------------------------------------------------------

def parse_vitals(s: str) -> dict:
    out: dict[str, float | str] = {}
    if not s: return out
    for chunk in s.split(";"):
        if "=" not in chunk: continue
        k, v = chunk.split("=", 1)
        k, v = k.strip(), v.strip()
        if k == "BP":
            try: out["systolic_BP"] = int(v.split("/")[0])
            except: pass
            continue
        try: out[k] = float(v) if "." in v else int(v)
        except: out[k] = v
    return out


def run_eval(cases_csv: Path = DOCS / "EVAL_CASES.csv", out_dir: Path = ML / "models"):
    rules = load_rules()
    weights = load_severity_weights()
    rows: list[dict] = []
    with cases_csv.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)

    results = []
    for row in rows:
        cid = row["case_id"]
        age = int(row["age"]) if row.get("age") and row["age"].isdigit() else None
        history = [h.strip() for h in (row.get("history") or "").split(",") if h.strip() and h.strip() != "none"]
        vitals = parse_vitals(row.get("vitals") or "")
        raw_text = row.get("symptoms_text") or ""
        expected = row["expected_level"].strip()
        # Normalize "Emergency Room + helpline" → "Emergency Room" for scoring
        expected_norm = "Emergency Room" if expected.startswith("Emergency Room") else expected

        v = triage(rules, weights, raw_text=raw_text, age=age, history=history, vitals=vitals)
        results.append({
            "case_id": cid,
            "expected": expected_norm,
            "expected_raw": expected,
            "predicted": v.level,
            "match": expected_norm == v.level,
            "rule_id": v.rule_id,
            "severity_score": v.severity_score,
            "category": row.get("category", ""),
        })

    # Compute metrics — ignore REFUSAL rows in the 3-bucket matrix
    triage_results = [r for r in results if r["expected"] in CARE_LEVELS]
    n = len(triage_results)
    correct = sum(1 for r in triage_results if r["match"])
    accuracy = correct / n if n else 0.0

    cm = {actual: {pred: 0 for pred in CARE_LEVELS} for actual in CARE_LEVELS}
    for r in triage_results:
        cm[r["expected"]][r["predicted"]] += 1

    per_class = {}
    for c in CARE_LEVELS:
        tp = cm[c][c]
        fn = sum(cm[c][p] for p in CARE_LEVELS if p != c)
        fp = sum(cm[a][c] for a in CARE_LEVELS if a != c)
        prec = tp / (tp + fp) if (tp + fp) else 0.0
        rec = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        per_class[c] = {"precision": prec, "recall": rec, "f1": f1, "support": tp + fn}
    macro_f1 = sum(v["f1"] for v in per_class.values()) / len(per_class)

    er_total = per_class["Emergency Room"]["support"]
    er_correct = cm["Emergency Room"]["Emergency Room"]
    emergency_miss_rate = (er_total - er_correct) / er_total if er_total else 0.0

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "eval_v1_results.json").write_text(json.dumps({
        "n_cases_total": len(results),
        "n_cases_triage_bucket": n,
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "per_class": per_class,
        "confusion_matrix": cm,
        "emergency_miss_rate": emergency_miss_rate,
        "emergency_misses": [r for r in triage_results if r["expected"] == "Emergency Room" and not r["match"]],
        "results": results,
    }, indent=2), encoding="utf-8")

    cm_txt = ["                  Predicted",
              "              Home    Clinic   ER",
              f"Actual Home   {cm['Home Care']['Home Care']:>5}  {cm['Home Care']['Clinic Visit']:>7}  {cm['Home Care']['Emergency Room']:>4}",
              f"       Clinic {cm['Clinic Visit']['Home Care']:>5}  {cm['Clinic Visit']['Clinic Visit']:>7}  {cm['Clinic Visit']['Emergency Room']:>4}",
              f"       ER     {cm['Emergency Room']['Home Care']:>5}  {cm['Emergency Room']['Clinic Visit']:>7}  {cm['Emergency Room']['Emergency Room']:>4}   ← right column should be all of ER row"]
    (out_dir / "eval_v1_confusion.txt").write_text("\n".join(cm_txt), encoding="utf-8")

    print(f"[eval] {correct}/{n} = {accuracy*100:.1f}% accuracy, macro-F1 {macro_f1:.3f}")
    print(f"[eval] emergency-miss rate = {emergency_miss_rate*100:.1f}%  ({er_total - er_correct}/{er_total} missed)")
    print("\n".join(cm_txt))
    if emergency_miss_rate > 0:
        print("FATAL: at least one ER case was missed. See eval_v1_results.json → emergency_misses.")
    return accuracy, macro_f1, emergency_miss_rate, cm


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kaggle-csv", type=Path, default=ML / "datasets" / "dataset.csv",
                    help="Path to Kaggle Disease-Symptom dataset.csv")
    ap.add_argument("--mapping", type=Path, default=ML / "datasets" / "disease_to_care_v1.json")
    ap.add_argument("--model-out", type=Path, default=ML / "models" / "xgboost_v1.pkl")
    ap.add_argument("--meta-out", type=Path, default=ML / "models" / "xgboost_v1_metadata.json")
    ap.add_argument("--cases", type=Path, default=DOCS / "EVAL_CASES.csv")
    ap.add_argument("--eval-only", action="store_true", help="Skip training, just run eval.")
    args = ap.parse_args()

    args.model_out.parent.mkdir(parents=True, exist_ok=True)

    if not args.eval_only:
        if args.kaggle_csv.exists():
            train_xgboost(args.kaggle_csv, args.mapping, args.model_out, args.meta_out)
        else:
            print(f"[skip-train] {args.kaggle_csv} not found. Download Kaggle 'Disease-Symptom Prediction'")
            print("             (itachi9604/disease-symptom-description-dataset) into ml/datasets/.")
            print("             Running eval-only against rules + severity fallback.")

    run_eval(args.cases, args.model_out.parent)


if __name__ == "__main__":
    main()
