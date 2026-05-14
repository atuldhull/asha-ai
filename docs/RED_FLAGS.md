# Red-Flag Rules — The Deterministic Safety Net

> **Companion to** [PLAN.md](../PLAN.md) §5 (Plan 2.0) and [AGENTIC_TOOLS.md](AGENTIC_TOOLS.md). Required reading for Member B and C.

## What this is

The **deterministic safety layer** that runs BEFORE the ML model and LLM decide anything. Its job: never miss an emergency. Implemented as a pure function — no model, no probability — just clinical rules.

## The Safety Property (unit-tested)

```python
# Every rule must satisfy:
assert rule.can_only_escalate == True
assert rule.never_downgrades == True

# At the system level:
final_level = max(red_flags.force_level, esi.care_level, imci.recommendation)
# where Emergency Room > Clinic Visit > Home Care
```

If any rule fires with `force_level="Emergency Room"`, the final verdict is **locked to Emergency Room** regardless of what the LLM, ML model, or ESI mapper says. This property is the line that wins Q&A.

## Implementation contract

```python
def get_red_flags(
    symptoms: list[Symptom],
    age: int,
    sex: Literal["M", "F", "other"],
    history: list[str],
    vitals: dict
) -> RedFlagResult:
    """
    Returns:
      RedFlagResult(
        flags: list[Flag],          # which rules fired
        force_escalation: bool,     # if any flag, True
        force_level: str | None     # "Emergency Room" or None
      )
    """
```

## The 9 Rules

### Rule 1 — STEMI / Acute Coronary Syndrome
**Trigger:** `chest_pain` AND any of (`radiation_arm`, `radiation_jaw`, `diaphoresis`, `shortness_of_breath`, `nausea`) AND `age >= 35`. **OR** `chest_pain` AND history includes `diabetes` OR `hypertension` OR `smoker`.
**Forces:** Emergency Room
**Why:** Heart attack signs. Time = muscle. Babylon Health missed this; we won't.

### Rule 2 — Stroke (FAST positive)
**Trigger:** any of (`face_droop`, `arm_weakness`, `slurred_speech`, `sudden_confusion`, `sudden_vision_loss`, `sudden_severe_headache`).
**Forces:** Emergency Room
**Why:** Window for tPA is 4.5 hours. Every minute = brain cells. The adversarial demo case (see [ADVERSARIAL_DEMO.md](ADVERSARIAL_DEMO.md)) tests this rule.

### Rule 3 — Anaphylaxis
**Trigger:** (`rash` OR `hives` OR `swelling`) AND (`difficulty_breathing` OR `throat_tightness` OR `wheezing` OR `dizziness` OR `vomiting`). **OR** known allergen exposure + any breathing symptom.
**Forces:** Emergency Room
**Why:** Airway compromise within minutes.

### Rule 4 — Sepsis triad (qSOFA)
**Trigger:** `fever >= 38.3°C` AND (`HR > 90` OR `RR > 20`) AND (`altered_mental_status` OR `systolic_BP < 100`). **OR** known infection + any 2 vitals abnormal.
**Forces:** Emergency Room
**Why:** Mortality climbs by the hour.

### Rule 5 — Diabetic Ketoacidosis (DKA)
**Trigger:** history `diabetes` AND (`vomiting` OR `abdominal_pain` OR `rapid_breathing` OR `fruity_breath` OR `confusion`) AND (`high_thirst` OR `frequent_urination`).
**Forces:** Emergency Room
**Why:** Life-threatening. Often missed in young T1D patients.

### Rule 6 — Pediatric high fever / sepsis (WHO IMCI danger signs)
**Trigger:** `age < 5` AND (`temp >= 39°C` OR `lethargy` OR `poor_feeding` OR `difficult_to_wake` OR `fontanelle_bulge` OR `seizure` OR `rash_non_blanching`).
**Forces:** Emergency Room
**Why:** WHO IMCI danger signs — non-negotiable.

### Rule 7 — Severe asthma exacerbation
**Trigger:** history `asthma` AND (`cannot_speak_full_sentences` OR `using_accessory_muscles` OR `SpO2 < 92` OR (`wheeze` AND `drowsy`)).
**Forces:** Emergency Room
**Why:** Silent chest = imminent respiratory failure.

### Rule 8 — Acute hemorrhage / shock
**Trigger:** any of (`heavy_bleeding`, `vomiting_blood`, `black_tarry_stool`, `coughing_blood`, `vaginal_bleeding_pregnancy`). **OR** `pale` AND `dizzy` AND `HR > 110` AND `systolic_BP < 90`.
**Forces:** Emergency Room
**Why:** Hypovolemic shock window is short.

### Rule 9 — Suicidal ideation / self-harm intent
**Trigger:** keywords (`kill myself`, `end my life`, `don't want to live`, `harm myself`, `suicide`). **OR** admission of plan / means / timing.
**Forces:** Emergency Room + show helplines:
- **iCall:** 9152987821
- **Vandrevala Foundation:** 1860-2662-345
**Why:** Mandatory escalation per WHO mental health protocol.

## Eval requirement

In `EVAL_CASES.csv` ([EVAL_SPEC.md](EVAL_SPEC.md)):
- ≥ 2 cases per rule that fire it (positive cases)
- ≥ 5 negative cases that should NOT fire any rule
- The published metric **"emergency-miss rate must be 0"** — that single number is what judges remember

## Q&A defense

> "What if the LLM hallucinates and says 'Home Care' for a heart attack?"
>
> "It can't reach the verdict. Our 9 rule-based red flags can only escalate, never downgrade. We have a unit test for that property. Try it — type 'severe chest pain radiating to left arm with sweating', and watch the rule layer override anything the LLM tried to say."
