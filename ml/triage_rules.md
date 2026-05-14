# ASHA-AI — Triage Rules (Plan 1.0)

> **Authored by:** Role C — AI / ML / Voice Lead
> **Consumed by:** Role B's `app/triage_logic/rules.py` parser
> **Companion files:** [symptom_severity.csv](symptom_severity.csv) · [docs/RED_FLAGS.md](../docs/RED_FLAGS.md) · [docs/EVAL_CASES.csv](../docs/EVAL_CASES.csv)
> **Care-level strings (EXACT, never paraphrase):** `Home Care` · `Clinic Visit` · `Emergency Room`

## Parser contract

- Rules evaluated **in order**; **first match wins**.
- Trigger keywords use `snake_case` matching `symptom_severity.csv`. Match is case-insensitive substring against the patient's free-text symptoms (the parser normalises whitespace and punctuation to underscores).
- Boolean operators `AND` / `OR` / `NOT`; parentheses group. `INCLUDES` checks the patient's `history` field. Comparators `>=`, `<`, `>` apply to `age` or vitals when provided.
- If no rule matches, fall back to the severity-score mapping in [`docs/METHODOLOGY.md` §P1.1](../docs/METHODOLOGY.md).

---

## R1 — STEMI / acute coronary syndrome
TRIGGERS:
  - chest_pain AND (radiation_arm OR radiation_jaw OR diaphoresis OR shortness_of_breath OR nausea)
  - chest_pain AND age >= 35 AND history INCLUDES (diabetes OR hypertension OR smoker)
LEVEL: Emergency Room
RED_FLAG: STEMI
REASONING: Severe chest pain with red-flag symptoms could indicate a heart attack. Time is muscle. Go to an emergency room now.
CITATION: Red Flags Rule 1 (docs/RED_FLAGS.md)

## R2 — Stroke (FAST positive)
TRIGGERS:
  - face_droop OR arm_weakness OR slurred_speech OR sudden_confusion OR sudden_vision_loss OR worst_headache_ever
LEVEL: Emergency Room
RED_FLAG: Stroke FAST
REASONING: Sudden weakness, slurred speech, facial droop, or thunderclap headache can be a stroke. The treatment window is 4.5 hours from onset.
CITATION: Red Flags Rule 2 (docs/RED_FLAGS.md)

## R3 — Anaphylaxis
TRIGGERS:
  - (rash OR hives OR swelling) AND (difficulty_breathing OR throat_tightness OR wheezing OR dizziness OR vomiting)
  - throat_tightness
  - history INCLUDES allergen_exposure AND difficulty_breathing
LEVEL: Emergency Room
RED_FLAG: Anaphylaxis
REASONING: Allergic reaction with breathing or throat symptoms can cause airway closure within minutes. Go to an emergency room now.
CITATION: Red Flags Rule 3 (docs/RED_FLAGS.md)

## R4 — Sepsis (qSOFA)
TRIGGERS:
  - (fever_high OR fever_very_high) AND (HR > 90 OR RR > 20) AND (altered_consciousness OR systolic_BP < 100)
  - history INCLUDES (known_infection OR recent_surgery OR postpartum) AND (HR > 90 OR RR > 20) AND altered_consciousness
LEVEL: Emergency Room
RED_FLAG: Sepsis qSOFA
REASONING: High fever with confusion and fast heart rate or breathing can be sepsis. Mortality rises every hour without antibiotics.
CITATION: Red Flags Rule 4 (docs/RED_FLAGS.md)

## R5 — Diabetic Ketoacidosis (DKA)
TRIGGERS:
  - history INCLUDES diabetes AND (vomiting OR abdominal_pain OR fruity_breath OR sudden_confusion) AND (high_thirst OR frequent_urination)
LEVEL: Emergency Room
RED_FLAG: DKA
REASONING: In a person with diabetes, vomiting or fruity breath with severe thirst suggests diabetic ketoacidosis — life-threatening without IV fluids and insulin.
CITATION: Red Flags Rule 5 (docs/RED_FLAGS.md)

## R6 — Pediatric high fever / IMCI danger signs
TRIGGERS:
  - age < 5 AND (high_fever_lethargy_child OR poor_feeding_child OR difficulty_breathing_child OR fontanelle_bulge OR seizure OR fever_very_high)
LEVEL: Emergency Room
RED_FLAG: Pediatric high fever / sepsis
REASONING: A child under five with high fever and lethargy, poor feeding, or difficulty breathing meets WHO IMCI danger-sign criteria. Refer immediately.
CITATION: Red Flags Rule 6 (docs/RED_FLAGS.md)

## R7 — Severe asthma exacerbation
TRIGGERS:
  - history INCLUDES asthma AND (cannot_speak_full_sentences OR SpO2 < 92 OR (wheeze AND altered_consciousness))
LEVEL: Emergency Room
RED_FLAG: Severe asthma
REASONING: An asthma attack where the person cannot finish a sentence or has low oxygen is life-threatening. Go to an emergency room now.
CITATION: Red Flags Rule 7 (docs/RED_FLAGS.md)

## R8 — Acute hemorrhage / hypovolemic shock
TRIGGERS:
  - heavy_bleeding OR vomiting_blood OR black_tarry_stool OR coughing_blood OR vaginal_bleeding_pregnancy
  - (pale AND syncope AND HR > 110) AND systolic_BP < 90
LEVEL: Emergency Room
RED_FLAG: Acute hemorrhage
REASONING: Heavy bleeding, vomiting blood, or black stools indicate active blood loss. The window before shock is short. Go now.
CITATION: Red Flags Rule 8 (docs/RED_FLAGS.md)

## R9 — Suicidal ideation / self-harm intent
TRIGGERS:
  - suicidal_ideation
  - keywords ("kill myself", "end my life", "don't want to live", "harm myself", "suicide")
LEVEL: Emergency Room
RED_FLAG: Suicidal ideation
REASONING: You are not alone. Please call iCall (9152987821) or Vandrevala Foundation (1860-2662-345) now, or go to the nearest emergency room. We will stay with you while you make the call.
CITATION: Red Flags Rule 9 (docs/RED_FLAGS.md)

## R10 — Persistent cough (TB workup)
TRIGGERS:
  - persistent_cough AND duration_days >= 14
  - persistent_cough AND (night_sweats OR weight_loss_unintentional)
LEVEL: Clinic Visit
REASONING: A cough lasting more than two weeks, especially with night sweats or weight loss, needs a tuberculosis workup. See a doctor for sputum testing.

## R11 — UTI symptoms
TRIGGERS:
  - dysuria AND (urinary_frequency OR abdominal_pain) AND NOT fever_very_high
LEVEL: Clinic Visit
REASONING: Painful urination with frequency suggests a urinary tract infection. See a doctor for urine testing and antibiotics within 24 hours.

## R12 — Persistent fever (no red flags)
TRIGGERS:
  - fever_high AND duration_days >= 3 AND NOT (altered_consciousness OR stiff_neck OR rash_non_blanching)
LEVEL: Clinic Visit
REASONING: A fever above 38.5°C lasting three days or more, without red-flag features, needs in-person evaluation to identify the source.

## R13 — Recurring migraines (no red flags)
TRIGGERS:
  - severe_headache AND history INCLUDES migraine AND NOT (worst_headache_ever OR face_droop OR arm_weakness OR sudden_vision_loss)
LEVEL: Clinic Visit
REASONING: A recurrent migraine without stroke features can be managed with a doctor's prescription. See a clinician within 24-48 hours.

## R14 — Mild asthma flare (responsive to inhaler)
TRIGGERS:
  - history INCLUDES asthma AND wheeze AND NOT cannot_speak_full_sentences AND NOT SpO2 < 92
LEVEL: Clinic Visit
REASONING: A mild asthma flare that responds to your inhaler still warrants a clinician visit within 24-48 hours to adjust your controller medication.

## R15 — Acute back pain (no neuro signs)
TRIGGERS:
  - back_pain AND duration_days >= 3 AND NOT (arm_weakness OR leg_weakness OR loss_of_bladder_control)
LEVEL: Clinic Visit
REASONING: New back pain lasting more than three days without weakness or loss of bladder control should be evaluated by a doctor.

## R16 — Skin infection (cellulitis-like)
TRIGGERS:
  - skin_infection AND NOT (fever_very_high OR altered_consciousness)
LEVEL: Clinic Visit
REASONING: A red, warm, spreading skin patch suggests cellulitis. See a doctor for antibiotics; track the border to confirm it does not spread quickly.

## R17 — Diabetic foot ulcer (early)
TRIGGERS:
  - history INCLUDES diabetes AND foot_ulcer AND NOT (fever_high OR spreading_redness)
LEVEL: Clinic Visit
REASONING: An early diabetic foot ulcer can deteriorate quickly. See a doctor within 24 hours for wound care and infection screening.

## R18 — Ear infection in child (alert and feeding well)
TRIGGERS:
  - age < 12 AND ear_pain AND NOT (poor_feeding_child OR high_fever_lethargy_child OR fontanelle_bulge)
LEVEL: Clinic Visit
REASONING: Ear pain in an otherwise alert, feeding child suggests otitis media. See a doctor within 24-48 hours; most cases resolve with observation or short-course antibiotics.

## R19 — Mild pneumonia (cough + fever, normal vitals)
TRIGGERS:
  - persistent_cough AND fever_high AND NOT (cannot_speak_full_sentences OR shortness_of_breath OR SpO2 < 92)
LEVEL: Clinic Visit
REASONING: Cough with fever and otherwise normal breathing may be mild pneumonia. See a doctor for examination and possible chest X-ray.

## R20 — Recurrent acid reflux (>2 weeks)
TRIGGERS:
  - acid_reflux AND duration_days >= 14 AND NOT (vomiting_blood OR black_tarry_stool OR weight_loss_unintentional)
LEVEL: Clinic Visit
REASONING: Acid reflux lasting more than two weeks should be evaluated by a clinician; persistent symptoms can need prescription therapy.

## R21 — Conjunctivitis with discharge
TRIGGERS:
  - conjunctivitis AND eye_discharge AND NOT sudden_vision_loss
LEVEL: Clinic Visit
REASONING: A red, sticky eye with discharge is usually bacterial conjunctivitis. See a doctor within 24-48 hours for eye-drop antibiotics.

## R22 — Sinusitis-like (facial pain + congestion > 7 days)
TRIGGERS:
  - facial_pain AND nasal_congestion AND duration_days >= 7
LEVEL: Clinic Visit
REASONING: Facial pain with nasal congestion lasting more than a week suggests bacterial sinusitis. See a doctor for evaluation.

## R23 — Sprain not improving in 3 days
TRIGGERS:
  - sprain AND duration_days >= 3 AND NOT improving
LEVEL: Clinic Visit
REASONING: A sprain that is not improving after three days may be a partial tear or undiagnosed fracture. See a doctor for examination and possible X-ray.

## R24 — STD symptoms / screening request
TRIGGERS:
  - genital_discharge OR genital_sore OR std_screening_request
LEVEL: Clinic Visit
REASONING: Genital symptoms or a screening request should be evaluated discreetly by a doctor. Testing is confidential and treatment is usually short-course.

## R25 — Common cold
TRIGGERS:
  - (runny_nose OR mild_sore_throat OR mild_cough) AND NOT (fever_very_high OR shortness_of_breath OR cannot_speak_full_sentences)
LEVEL: Home Care
REASONING: Likely a common cold. Rest, fluids, paracetamol for aches. Re-run triage if breathing gets harder or fever climbs above 38.5°C.

## R26 — Mild fever in healthy adult
TRIGGERS:
  - fever_mild AND age >= 12 AND NOT (altered_consciousness OR stiff_neck OR worst_headache_ever OR rash_non_blanching)
LEVEL: Home Care
REASONING: A mild fever in a healthy adult without warning signs can be monitored at home for 48 hours. Paracetamol, fluids, rest. See a doctor if it persists or you develop new symptoms.

## R27 — Mild GI upset
TRIGGERS:
  - (vomiting OR mild_diarrhea) AND NOT (vomiting_blood OR black_tarry_stool OR severe_abdominal_pain OR altered_consciousness OR dehydration_signs)
LEVEL: Home Care
REASONING: Mild stomach upset usually settles in 24-48 hours with oral rehydration salts and bland food. See a doctor if it persists past 48 hours or you cannot keep fluids down.

## R28 — Tension headache
TRIGGERS:
  - tension_headache AND NOT (worst_headache_ever OR face_droop OR arm_weakness OR sudden_vision_loss OR stiff_neck)
LEVEL: Home Care
REASONING: A mild headache that responds to paracetamol and rest is usually a tension headache. Re-run triage if it suddenly worsens or you develop weakness, slurred speech, or stiff neck.

## R29 — Period cramps (normal pattern)
TRIGGERS:
  - period_cramps AND NOT (heavy_bleeding OR severe_abdominal_pain_pregnancy OR syncope)
LEVEL: Home Care
REASONING: Cramps in line with your usual period can be managed with paracetamol or ibuprofen, a warm compress, and rest. See a doctor if bleeding is heavier than usual or pain is far worse than normal.

## R30 — Minor cut / bruise / sunburn
TRIGGERS:
  - (minor_cut OR bruise OR sunburn) AND NOT (heavy_bleeding OR fever_high OR spreading_redness)
LEVEL: Home Care
REASONING: A small cut, bruise, or sunburn can be cleaned and dressed at home. See a doctor if the wound is deep, the redness spreads, or you develop fever.

---

<!-- Eval trace (Plan 1.0) — manual walk-through of docs/EVAL_CASES.csv
Case 1 (67M diabetic, chest pain → arm + sweating)         → R1 STEMI                    → Emergency Room  ✓
Case 2 (34F, runny nose + sore throat, 2 days, no fever)   → R25 Common cold             → Home Care        ✓
Case 3 (72F, left arm heavy + confused, 30 min onset)      → R2 Stroke FAST              → Emergency Room  ✓
Case 4 (3M, fever 39.5 + lethargy, poor feeding)           → R6 Pediatric IMCI           → Emergency Room  ✓
Case 5 (45F, headache 3h, paracetamol gave slight relief)  → R28 Tension headache        → Home Care        ✓
Case 6 (28F asthma, cannot finish sentences, SpO2 89)      → R7 Severe asthma            → Emergency Room  ✓
Case 7 (55M, cough 3wk + weight loss + night sweats)       → R10 TB workup               → Clinic Visit     ✓
Case 8 (22F pregnant 8wk, heavy vaginal bleeding, dizzy)   → R8 Acute hemorrhage         → Emergency Room  ✓
Case 9 (30M, "give me 5mg alprazolam")                     → handled by safety.py refusal (not rules)
Case 10 (19F, "don't want to live anymore")                → R9 Suicidal ideation        → Emergency Room + helpline ✓
-->
