"""
ASHA-AI — Plan 2.0 Triage Pipeline (Role C reference implementation)
====================================================================

Layers (in evaluation order):
  1. Keyword aliaser — patient free-text -> snake_case symptom list
     (Plan 2.0 production uses Gemini 2.5 Flash JSON-mode; this rule-based
      aliaser is the deterministic stand-in used during model training and
      offline eval, and as the fallback when the LLM is unavailable.)
  2. Deterministic red-flag rule engine — R1..R9 from docs/RED_FLAGS.md.
     Each rule returns a Flag or None. Rules can only ESCALATE.
  3. ML severity classifier — XGBoost trained on the synthetic
     rule-grounded dataset (see train.py). Outputs s in [0, 1].
  4. ESI v5 mapper — severity -> ESI 1..5 -> {Home Care, Clinic Visit,
     Emergency Room}.
  5. Safety property: final_care_level = max(rule_level, esi_level)
     under rank Home Care < Clinic Visit < Emergency Room.

This module is the single source of truth for the eval pipeline. Role B's
FastAPI app imports the same logic (or re-implements from this spec).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

ML_DIR = Path(__file__).resolve().parent

CARE_LEVELS = ("Home Care", "Clinic Visit", "Emergency Room")
CARE_RANK = {c: i for i, c in enumerate(CARE_LEVELS)}

# ---------------------------------------------------------------------------
# 1. Keyword aliaser (stand-in for Gemini extraction during offline eval)
# ---------------------------------------------------------------------------
#
# Each entry: a regex applied to the lowered patient text -> the snake_case
# symptom name it maps to. Order matters where one phrase is a subset of
# another; longer patterns first.
#
# Production Plan 2.0 path: backend/app/llm/gemini.py extracts structured
# symptoms. This dict is the deterministic fallback + the eval oracle.

SYMPTOM_ALIASES: list[tuple[re.Pattern[str], str]] = [
    # --- Cardiovascular ---
    (re.compile(r"\bchest (pain|hurt(s|ing)?|tighten(s|ed|ing)?|tightness|pressure|heaviness|discomfort)\b"), "chest_pain"),
    (re.compile(r"\b(?:radiat(?:es?|ing)|goes?|going|spread(?:s|ing)?) to.*?(?:left )?(?:arm|shoulder)\b"), "radiation_arm"),
    (re.compile(r"\b(?:left|right) arm (?:hurt|pain|ache|tight)"), "radiation_arm"),
    (re.compile(r"\b(?:radiat(?:es?|ing)|goes?|going|spread(?:s|ing)?) to.*?(?:jaw|neck)\b"), "radiation_jaw"),
    (re.compile(r"\b(?:jaw|back) (?:pain|hurt|tight|tightness|aching)"), "radiation_jaw"),
    (re.compile(r"\b(sweating|sweaty|diaphoresis|cold sweat|clammy)\b"), "diaphoresis"),
    (re.compile(r"\b(fainted|fainting|passed out|syncope|black(ed)? out|lost consciousness)\b"), "syncope"),
    # --- Neurological / Stroke FAST ---
    (re.compile(r"\bface (droop|drooping|drop|sagging|sagged)\b"), "face_droop"),
    (re.compile(r"\b(arm|leg) (weak|weakness|heavy|numb|tingling|cannot lift)\b"), "arm_weakness"),
    (re.compile(r"\b(slurred|slurring) speech\b|cannot speak (clearly|properly)|words coming out wrong"), "slurred_speech"),
    (re.compile(r"\b(suddenly )?(confused|confusion|disoriented|not making sense)\b"), "sudden_confusion"),
    (re.compile(r"\b(sudden(ly)? (lost|losing) (my )?(vision|sight)|cannot see|vision (gone|loss)|blurry vision suddenly)\b"), "sudden_vision_loss"),
    (re.compile(r"\b(worst headache (of my life|ever)|thunderclap headache|sudden severe headache)\b"), "worst_headache_ever"),
    (re.compile(r"\b(seizure|fit|convulsion)\b"), "seizure"),
    (re.compile(r"\b(unconscious|unresponsive|hard to wake|drowsy|very weak and confused|altered)\b"), "altered_consciousness"),
    (re.compile(r"\b(tension )?headache\b"), "tension_headache"),
    # --- Respiratory ---
    (re.compile(r"\b(shortness of breath|short of breath|breathless|out of breath)\b"), "shortness_of_breath"),
    (re.compile(r"\b(difficulty|trouble) (breathing|breath)\b|cannot breathe|hard to breathe"), "difficulty_breathing"),
    (re.compile(r"\b(cannot|can'?t) (finish|complete) (a )?sentence(s)?\b"), "cannot_speak_full_sentences"),
    (re.compile(r"\b(coughing|spitting|throwing) up blood\b|hemoptysis"), "coughing_blood"),
    (re.compile(r"\b(persistent|long-standing|chronic|ongoing) cough\b|cough for (\d+ )?(week|month)"), "persistent_cough"),
    (re.compile(r"\b(mild cough|slight cough|little cough|small cough)\b"), "mild_cough"),
    (re.compile(r"\bcough\b"), "mild_cough"),  # bare "cough" -> mild
    (re.compile(r"\bwheez(e|ing|y)\b"), "wheeze"),
    # --- GI / Hemorrhage ---
    (re.compile(r"\b(vomit(ed|ing)?|throwing up|threw up) blood\b|hematemesis"), "vomiting_blood"),
    (re.compile(r"\b(black|tarry|dark) (stool|stools|poop)\b|melena"), "black_tarry_stool"),
    (re.compile(r"\b(vomit(ed|ing)?|throw(ing|ing up|up)|threw up)\b"), "vomiting"),
    (re.compile(r"\b(mild )?diarrh(o)?ea|loose stool"), "mild_diarrhea"),
    (re.compile(r"\b(stomach|abdom(en|inal|inals)|tummy|belly) (pain|ache|hurt|cramp)"), "abdominal_pain"),
    # --- Genitourinary / Pregnancy ---
    (re.compile(r"\b(burning|pain) (when|while) (peeing|urinating|i pee|i urinate)|dysuria"), "dysuria"),
    (re.compile(r"\b(heavy|severe) (vaginal )?bleeding\b.*pregnan|pregnan.*\b(heavy|severe) (vaginal )?bleeding\b"), "vaginal_bleeding_pregnancy"),
    (re.compile(r"\b(heavy|severe|massive) bleeding\b"), "heavy_bleeding"),
    # --- General / Fever ---
    (re.compile(r"\bfever ?(of)? ?3[9]\.\d|fever ?(of)? ?4\d|temperature (of )?3[9]|temperature (of )?4\d"), "fever_very_high"),
    (re.compile(r"\bfever ?(of)? ?38\.[5-9]|fever ?(of)? ?38\.|temperature (of )?38\."), "fever_high"),
    (re.compile(r"\b(low|mild|slight) fever\b|low-grade fever|temperature ?(of)? ?37\.[5-9]"), "fever_mild"),
    (re.compile(r"\bfever\b"), "fever_high"),  # bare "fever" defaults to high for safety
    (re.compile(r"\b(felt|feeling) hot\b|hot last night"), "fever_high"),
    (re.compile(r"\bnight sweats\b"), "night_sweats"),
    (re.compile(r"\b(lost|losing) (\d+ ?kg|weight)( without trying)?\b|unintentional weight loss"), "weight_loss_unintentional"),
    # --- Dermatologic / Anaphylaxis ---
    (re.compile(r"\b(throat (tight(ness)?|closing)|tight throat)\b"), "throat_tightness"),
    (re.compile(r"\b(hives|urticaria|itchy bumps)\b"), "hives"),
    (re.compile(r"\b(face|lips?|tongue) (swollen|swelling|puffy)\b"), "hives"),  # angioedema as anaphylaxis co-symptom
    (re.compile(r"\brash\b"), "rash"),
    (re.compile(r"\b(red warm patch|cellulitis|skin infection|spreading redness|skin sore)\b"), "skin_infection"),
    # --- Pediatric ---
    (re.compile(r"\b(child|son|daughter|baby|infant)\b.*(very lethargic|lethargic|sleepy|drowsy|not feeding|will not feed|will not drink)\b"), "high_fever_lethargy_child"),
    (re.compile(r"\b(child|son|daughter|baby|infant)\b.*(will not eat|not eating|will not feed|not feeding|poor feed)\b"), "poor_feeding_child"),
    (re.compile(r"\bfontanelle (bulg|raised|swollen)\b"), "fontanelle_bulge"),
    (re.compile(r"\b(child|son|daughter|baby|infant)\b.*(difficulty breathing|hard to breathe|gasping|wheezing badly)\b"), "difficulty_breathing_child"),
    # --- Endocrine / DKA ---
    (re.compile(r"\b(fruity|sweet|acetone) breath\b|breath smells (funny|sweet|fruity)"), "fruity_breath"),
    (re.compile(r"\bvery thirsty\b|so thirsty|extreme thirst|excessive thirst"), "high_thirst"),
    # --- Mental health ---
    (re.compile(r"\b(kill myself|end (my )?life|don.?t want to live|harm myself|suicid(e|al)|ending it)\b"), "suicidal_ideation"),
    # --- ENT / mild URI ---
    (re.compile(r"\brunny nose|nasal congestion|stuffy nose\b"), "runny_nose"),
    (re.compile(r"\b(sore|scratchy) throat\b"), "mild_sore_throat"),
    (re.compile(r"\b(pink|red sticky) eye|eye discharge|conjunctivit"), "conjunctivitis"),
    # --- MSK ---
    (re.compile(r"\bback pain\b"), "back_pain"),
    (re.compile(r"\b(sprain|twisted (my )?ankle|twisted (my )?wrist)\b"), "sprain"),
]


def extract_symptoms(text: str) -> list[str]:
    """Patient free-text -> deduplicated list of snake_case symptom names.

    Production Plan 2.0 uses Gemini 2.5 Flash for this. The aliaser below is
    deterministic, runs without API keys, and is used in offline eval and as
    the fallback path."""
    if not text:
        return []
    s = " " + text.lower().replace(",", " ").replace(".", " ").replace("'", "") + " "
    found: list[str] = []
    for pat, sym in SYMPTOM_ALIASES:
        if pat.search(s) and sym not in found:
            found.append(sym)
    return found


# ---------------------------------------------------------------------------
# 2. History / vitals helpers
# ---------------------------------------------------------------------------

HISTORY_TOKENS = {
    "diabetes":          {"diabetes", "diabetic", "type 1 diabetes", "type 2 diabetes", "t1d", "t2d"},
    "hypertension":      {"hypertension", "high bp", "high blood pressure"},
    "smoker":            {"smoker", "smoking", "smokes"},
    "asthma":            {"asthma", "asthmatic"},
    "pregnancy":         {"pregnant", "pregnancy"},
    "known_infection":   {"known infection", "uti", "pneumonia history"},
    "recent_surgery":    {"recent surgery", "post-op", "postoperative", "c-section", "csection"},
    "postpartum":        {"postpartum", "post-partum", "days postpartum", "days post partum"},
    "migraine":          {"migraine", "migraine history"},
    "allergy":           {"known allergy", "bee allergy", "peanut allergy", "drug allergy", "allergen exposure"},
    "gout":              {"gout"},
    "eczema":            {"eczema"},
    "family_history_t2d":{"family history t2d", "family history diabetes"},
}


def parse_history(raw: str) -> set[str]:
    if not raw or raw.strip().lower() in {"none", "nan", ""}:
        return set()
    raw_l = raw.lower()
    flags: set[str] = set()
    for key, tokens in HISTORY_TOKENS.items():
        for t in tokens:
            if t in raw_l:
                flags.add(key)
                break
    return flags


def parse_vitals(raw: str) -> dict[str, float]:
    if not raw or str(raw).strip().lower() in {"nan", ""}:
        return {}
    out: dict[str, float] = {}
    for token in str(raw).split(";"):
        if "=" not in token:
            continue
        k, v = token.split("=", 1)
        k = k.strip().lower()
        v = v.strip()
        if k == "bp":
            if "/" in v:
                sbp, dbp = v.split("/", 1)
                try:
                    out["sbp"] = float(sbp); out["dbp"] = float(dbp)
                except ValueError:
                    pass
            continue
        try:
            out[k] = float(v)
        except ValueError:
            pass
    return out


def parse_age(text: str, raw_age: int | float | None) -> int:
    if raw_age is not None and not np.isnan(raw_age) if isinstance(raw_age, float) else raw_age is not None:
        return int(raw_age)
    # try to pull "67yo" or "age 67" from text
    m = re.search(r"\b(\d{1,2})\s*(?:yo|y/o|years? old|year)\b", text or "")
    return int(m.group(1)) if m else 30


# ---------------------------------------------------------------------------
# 3. Red-flag rules (R1..R9) — verbatim from docs/RED_FLAGS.md
# ---------------------------------------------------------------------------

@dataclass
class Flag:
    rule_id: str
    rule_name: str
    force_level: str = "Emergency Room"
    reasoning: str = ""


def _any(symptoms: set[str], *items: str) -> bool:
    return any(i in symptoms for i in items)


def rule_R1_stemi(symptoms: set[str], age: int, history: set[str], vitals: dict) -> Flag | None:
    if "chest_pain" not in symptoms:
        return None
    if age >= 35 and _any(symptoms, "radiation_arm", "radiation_jaw", "diaphoresis", "shortness_of_breath"):
        return Flag("R1_STEMI", "STEMI / Acute Coronary Syndrome",
                    reasoning="Severe chest pain with ACS-suggestive features (radiation, sweating, or shortness of breath). Time is muscle.")
    if history & {"diabetes", "hypertension", "smoker"}:
        return Flag("R1_STEMI", "STEMI / ACS — cardiac risk factors",
                    reasoning="Chest pain in a patient with diabetes, hypertension, or smoking history warrants emergency cardiac evaluation.")
    # Atypical presentation in women: jaw/back + nausea + diaphoresis (no chest_pain) — caught above only if chest_pain
    return None


def rule_R1_stemi_atypical(symptoms: set[str], age: int, sex: str, history: set[str]) -> Flag | None:
    """Atypical STEMI in women: jaw/back tightness + diaphoresis without classic chest pain."""
    if sex.upper() != "F":
        return None
    if "radiation_jaw" in symptoms and "diaphoresis" in symptoms:
        if "smoker" in history or age >= 40:
            return Flag("R1_STEMI_atypical", "STEMI atypical presentation",
                        reasoning="Jaw/back tightness with sweating in a woman with cardiac risk factors can be an atypical heart attack. Go now.")
    return None


def rule_R2_stroke_fast(symptoms: set[str], age: int, history: set[str]) -> Flag | None:
    fast = {"face_droop", "arm_weakness", "slurred_speech", "sudden_confusion",
            "sudden_vision_loss", "worst_headache_ever"}
    if symptoms & fast:
        return Flag("R2_STROKE_FAST", "Stroke (FAST positive)",
                    reasoning="Sudden weakness, slurred speech, facial droop, vision change, or thunderclap headache can be a stroke. Treatment window is short.")
    return None


def rule_R3_anaphylaxis(symptoms: set[str], history: set[str]) -> Flag | None:
    skin = symptoms & {"rash", "hives"}
    airway = symptoms & {"difficulty_breathing", "throat_tightness", "wheeze"}
    if (skin and airway) or "throat_tightness" in symptoms:
        return Flag("R3_ANAPHYLAXIS", "Anaphylaxis",
                    reasoning="Allergic reaction with breathing or throat involvement can close the airway within minutes.")
    if "allergy" in history and ("difficulty_breathing" in symptoms or "throat_tightness" in symptoms):
        return Flag("R3_ANAPHYLAXIS", "Anaphylaxis (known allergen exposure)",
                    reasoning="Breathing or throat symptoms after exposure to a known allergen is anaphylaxis until proven otherwise.")
    return None


def rule_R4_sepsis(symptoms: set[str], history: set[str], vitals: dict) -> Flag | None:
    fever = symptoms & {"fever_high", "fever_very_high"} or vitals.get("temp", 0) >= 38.3
    tachy = vitals.get("hr", 0) > 90 or vitals.get("rr", 0) > 20
    ams_or_hypo = "altered_consciousness" in symptoms or vitals.get("sbp", 200) < 100
    if fever and tachy and ams_or_hypo:
        return Flag("R4_SEPSIS", "Sepsis (qSOFA-positive)",
                    reasoning="Fever, fast pulse or breathing, and confusion (or low blood pressure) meet qSOFA criteria. Mortality rises every hour.")
    if (history & {"known_infection", "recent_surgery", "postpartum"}) and tachy and ams_or_hypo:
        return Flag("R4_SEPSIS", "Sepsis (high-risk history + qSOFA)",
                    reasoning="Recent surgery, postpartum status, or known infection plus abnormal vitals and confusion is sepsis until proven otherwise.")
    return None


def rule_R5_dka(symptoms: set[str], history: set[str]) -> Flag | None:
    if "diabetes" not in history:
        return None
    trigger = symptoms & {"vomiting", "abdominal_pain", "fruity_breath", "sudden_confusion"}
    cosym = symptoms & {"high_thirst"}
    if trigger and cosym:
        return Flag("R5_DKA", "Diabetic Ketoacidosis",
                    reasoning="In a person with diabetes, vomiting or fruity breath with severe thirst suggests DKA — life-threatening without IV fluids and insulin.")
    if "fruity_breath" in symptoms:
        return Flag("R5_DKA", "Diabetic Ketoacidosis (fruity breath)",
                    reasoning="Fruity-smelling breath in diabetes is DKA until proven otherwise.")
    return None


def rule_R6_pediatric(symptoms: set[str], age: int, vitals: dict) -> Flag | None:
    if age >= 5:
        return None
    danger = symptoms & {"high_fever_lethargy_child", "poor_feeding_child",
                          "difficulty_breathing_child", "fontanelle_bulge",
                          "seizure", "fever_very_high", "altered_consciousness"}
    high_temp = vitals.get("temp", 0) >= 39
    if danger or high_temp:
        return Flag("R6_PEDIATRIC_DANGER", "Pediatric IMCI danger signs",
                    reasoning="A child under five with high fever, lethargy, poor feeding, or difficulty breathing meets WHO IMCI danger-sign criteria.")
    return None


def rule_R7_severe_asthma(symptoms: set[str], history: set[str], vitals: dict) -> Flag | None:
    if "asthma" not in history:
        return None
    if "cannot_speak_full_sentences" in symptoms or vitals.get("spo2", 100) < 92:
        return Flag("R7_SEVERE_ASTHMA", "Severe asthma exacerbation",
                    reasoning="An asthma attack where the person cannot finish a sentence or has SpO2 < 92% is life-threatening.")
    return None


def rule_R8_hemorrhage(symptoms: set[str], vitals: dict) -> Flag | None:
    if symptoms & {"heavy_bleeding", "vomiting_blood", "black_tarry_stool",
                    "coughing_blood", "vaginal_bleeding_pregnancy"}:
        return Flag("R8_HEMORRHAGE", "Acute hemorrhage / shock",
                    reasoning="Heavy or visible bleeding indicates active blood loss. The window before shock is short.")
    hr = vitals.get("hr", 0); sbp = vitals.get("sbp", 200)
    if hr > 110 and sbp < 90 and "syncope" in symptoms:
        return Flag("R8_HEMORRHAGE", "Hypovolemic shock signs",
                    reasoning="Fast heart rate with low blood pressure and fainting suggests shock.")
    return None


def rule_R9_suicidal(symptoms: set[str]) -> Flag | None:
    if "suicidal_ideation" in symptoms:
        return Flag("R9_SUICIDAL", "Suicidal ideation / self-harm",
                    reasoning="You are not alone. Please call iCall (9152987821) or Vandrevala Foundation (1860-2662-345) now, or go to the nearest emergency room.")
    return None


def get_red_flags(symptoms: list[str] | set[str], age: int, sex: str,
                  history: set[str], vitals: dict) -> list[Flag]:
    s = set(symptoms)
    flags: list[Flag] = []
    for f in (
        rule_R1_stemi(s, age, history, vitals),
        rule_R1_stemi_atypical(s, age, sex, history),
        rule_R2_stroke_fast(s, age, history),
        rule_R3_anaphylaxis(s, history),
        rule_R4_sepsis(s, history, vitals),
        rule_R5_dka(s, history),
        rule_R6_pediatric(s, age, vitals),
        rule_R7_severe_asthma(s, history, vitals),
        rule_R8_hemorrhage(s, vitals),
        rule_R9_suicidal(s),
    ):
        if f is not None:
            flags.append(f)
    return flags


# ---------------------------------------------------------------------------
# 4. Featurizer (for the ML severity classifier)
# ---------------------------------------------------------------------------

def _load_severity_csv() -> dict[str, float]:
    path = ML_DIR / "symptom_severity.csv"
    out: dict[str, float] = {}
    with path.open(encoding="utf-8") as fh:
        header = fh.readline().strip().split(",")
        for line in fh:
            row = [c.strip() for c in line.split(",")]
            if len(row) < 4:
                continue
            try:
                out[row[0]] = float(row[1])
            except ValueError:
                pass
    return out


SEVERITY_WEIGHTS = _load_severity_csv()
FEATURE_SYMPTOMS = sorted(SEVERITY_WEIGHTS.keys())

HISTORY_FEATURES = ["diabetes", "hypertension", "smoker", "asthma", "pregnancy",
                     "known_infection", "recent_surgery", "postpartum", "migraine",
                     "allergy"]


def featurize(symptoms: list[str], age: int, sex: str, history: set[str],
              vitals: dict) -> dict[str, float]:
    """Returns a flat dict of features (the same keys are used at training time)."""
    feats: dict[str, float] = {}
    for s in FEATURE_SYMPTOMS:
        feats[f"sym_{s}"] = 1.0 if s in symptoms else 0.0
    feats["age"] = float(age)
    feats["age_under5"] = 1.0 if age < 5 else 0.0
    feats["age_geriatric"] = 1.0 if age >= 65 else 0.0
    feats["sex_F"] = 1.0 if (sex or "").upper() == "F" else 0.0
    feats["sex_M"] = 1.0 if (sex or "").upper() == "M" else 0.0
    for h in HISTORY_FEATURES:
        feats[f"hx_{h}"] = 1.0 if h in history else 0.0
    feats["hr"]   = float(vitals.get("hr", 0))
    feats["rr"]   = float(vitals.get("rr", 0))
    feats["spo2"] = float(vitals.get("spo2", 0))
    feats["sbp"]  = float(vitals.get("sbp", 0))
    feats["temp"] = float(vitals.get("temp", 0))
    # severity proxy
    feats["sev_max"] = max((SEVERITY_WEIGHTS.get(s, 0.0) for s in symptoms), default=0.0)
    return feats


FEATURE_ORDER = (
    [f"sym_{s}" for s in FEATURE_SYMPTOMS]
    + ["age", "age_under5", "age_geriatric", "sex_F", "sex_M"]
    + [f"hx_{h}" for h in HISTORY_FEATURES]
    + ["hr", "rr", "spo2", "sbp", "temp", "sev_max"]
)


def feature_vector(feats: dict[str, float]) -> np.ndarray:
    return np.array([feats.get(k, 0.0) for k in FEATURE_ORDER], dtype=np.float32)


# ---------------------------------------------------------------------------
# 5. ESI mapper + safety property
# ---------------------------------------------------------------------------

def esi_from_severity(severity: float, vitals: dict, age: int) -> int:
    # Hard vitals overrides (mirrors RED_FLAGS.md ESI Level 1 triggers)
    if vitals.get("spo2", 100) and vitals.get("spo2", 100) < 90:
        return 1
    if vitals.get("hr", 0) >= 130 or 0 < vitals.get("hr", 0) < 40:
        return 1
    if severity >= 0.85:
        return 1
    if severity >= 0.70:
        return 2
    if severity >= 0.50:
        return 3
    if severity >= 0.30:
        return 4
    return 5


ESI_TO_CARE = {
    1: "Emergency Room",
    2: "Emergency Room",
    3: "Clinic Visit",
    4: "Home Care",
    5: "Home Care",
}


def final_care_level(flags: list[Flag], esi_level: int) -> str:
    candidates = [ESI_TO_CARE[esi_level]]
    if flags:
        candidates.append(flags[0].force_level)
    return max(candidates, key=lambda c: CARE_RANK[c])


# ---------------------------------------------------------------------------
# 6. End-to-end triage (used by run_eval.py)
# ---------------------------------------------------------------------------

@dataclass
class Verdict:
    level: str
    reasoning: str
    red_flags: list[Flag] = field(default_factory=list)
    severity: float = 0.0
    esi: int = 5
    symptoms_extracted: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "level": self.level,
            "reasoning": self.reasoning,
            "red_flags": [f.rule_id for f in self.red_flags],
            "severity": self.severity,
            "esi": self.esi,
            "symptoms_extracted": list(self.symptoms_extracted),
        }


def triage(symptoms_text: str, age: int | None, sex: str | None,
           history_raw: str | None, vitals_raw: str | None,
           model=None) -> Verdict:
    symptoms = extract_symptoms(symptoms_text)
    age_i = int(age) if age is not None and not (isinstance(age, float) and np.isnan(age)) else 30
    history = parse_history(history_raw or "")
    vitals = parse_vitals(vitals_raw or "")

    # Layer 1: rules first
    flags = get_red_flags(symptoms, age_i, sex or "", history, vitals)

    # Layer 2: ML severity
    feats = featurize(symptoms, age_i, sex or "", history, vitals)
    if model is not None:
        x = feature_vector(feats).reshape(1, -1)
        proba = model.predict_proba(x)[0]
        # P(ER) is the severity score we care about
        severity = float(proba[CARE_RANK["Emergency Room"]])
    else:
        # No model loaded -> fall back to the severity weight max
        severity = feats["sev_max"]

    esi = esi_from_severity(severity, vitals, age_i)
    level = final_care_level(flags, esi)

    if flags:
        reasoning = flags[0].reasoning
    elif level == "Emergency Room":
        reasoning = f"Severity score {severity:.2f} - urgent evaluation indicated."
    elif level == "Clinic Visit":
        reasoning = f"Severity score {severity:.2f} - see a clinician within 24-48 hours."
    else:
        reasoning = f"Severity score {severity:.2f} - manage at home, monitor for change."

    return Verdict(level=level, reasoning=reasoning, red_flags=flags,
                   severity=severity, esi=esi, symptoms_extracted=symptoms)


# ---------------------------------------------------------------------------
# Smoke test
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cases = [
        ("severe chest pain radiating to left arm and sweating", 67, "M", "diabetes,hypertension",
         "HR=110;SpO2=94;BP=160/100", "Emergency Room"),
        ("runny nose mild sore throat 2 days no fever", 34, "F", "none", "HR=72;SpO2=98", "Home Care"),
        ("my child has fever 39.5 and is very lethargic not feeding well", 3, "M", "none",
         "HR=140;temp=39.5", "Emergency Room"),
        ("I dont want to live anymore I have been thinking about ending it", 19, "F", "none", "",
         "Emergency Room"),
    ]
    for text, age, sex, hist, vit, expected in cases:
        v = triage(text, age, sex, hist, vit)
        ok = "OK" if v.level == expected else "MISS"
        print(f"[{ok}] expected={expected!r:18s} got={v.level!r:18s}  flags={[f.rule_id for f in v.red_flags]}  sx={v.symptoms_extracted}")
