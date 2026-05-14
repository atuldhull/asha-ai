"""Built-in RAG fallback corpus.

Used until Role C ships `ml/rag/corpus.jsonl` + BGE-M3 embeddings in
pgvector. Plan 3.0 anti-pattern: "every verdict must have ≥ 1 citation".
This module guarantees that floor — keyword retrieval against ~30
canonical clinical snippets from WHO IMCI + India MoHFW STG.

Each snippet is a dict with: id, source, section, text, tags.
"""
from __future__ import annotations

FALLBACK_SNIPPETS: list[dict] = [
    {
        "id": "imci_3_1",
        "source": "WHO IMCI Chart Booklet",
        "section": "§3.1 Danger Signs",
        "text": (
            "A child with any of these signs is in danger: not able to drink "
            "or breastfeed, vomits everything, has convulsions, is lethargic "
            "or unconscious. Refer urgently."
        ),
        "tags": [
            "child", "infant", "lethargy", "poor_feeding",
            "fontanelle_bulge", "seizure", "high_fever",
            "pediatric", "rash_non_blanching",
        ],
    },
    {
        "id": "imci_3_2",
        "source": "WHO IMCI Chart Booklet",
        "section": "§3.2 Fever in children",
        "text": (
            "Refer URGENTLY any child under 5 with fever ≥ 38.5 °C and any "
            "general danger sign, stiff neck, or non-blanching rash."
        ),
        "tags": ["high_fever", "child", "rash_non_blanching", "pediatric"],
    },
    {
        "id": "who_acs_1",
        "source": "WHO PEN Protocol 2 (Cardiovascular)",
        "section": "§ACS triage",
        "text": (
            "Suspect acute coronary syndrome with central chest pain plus any of: "
            "radiation to arm/jaw, sweating, shortness of breath, or nausea. "
            "Aspirin 300 mg chewable and immediate referral."
        ),
        "tags": [
            "chest_pain", "radiation_arm", "radiation_jaw",
            "diaphoresis", "shortness_of_breath", "nausea", "stemi",
        ],
    },
    {
        "id": "mohfw_stg_stroke",
        "source": "India MoHFW STG — Acute Stroke",
        "section": "§FAST screen",
        "text": (
            "FAST screen: Face droop, Arm weakness, Speech slurring, Time to call. "
            "Treatment window for thrombolysis is 4.5 hours from symptom onset."
        ),
        "tags": [
            "face_droop", "arm_weakness", "slurred_speech",
            "sudden_confusion", "sudden_vision_loss",
            "worst_headache_ever", "stroke",
        ],
    },
    {
        "id": "who_anaphylaxis",
        "source": "WHO Allergic Reactions Guideline 2019",
        "section": "§Anaphylaxis recognition",
        "text": (
            "Anaphylaxis: skin/mucosal involvement (rash/hives/swelling) PLUS "
            "respiratory compromise (wheezing/stridor/dyspnea) or hypotension. "
            "Adrenaline 0.5 mg IM is first line."
        ),
        "tags": [
            "rash", "hives", "swelling", "wheezing",
            "throat_tightness", "difficulty_breathing", "anaphylaxis",
        ],
    },
    {
        "id": "qsofa_sepsis",
        "source": "Sepsis Surviving Campaign — qSOFA",
        "section": "§Bedside qSOFA",
        "text": (
            "qSOFA positive: ≥ 2 of altered mental status (GCS < 15), "
            "respiratory rate ≥ 22/min, systolic BP ≤ 100 mmHg. Treat as "
            "sepsis until proven otherwise."
        ),
        "tags": [
            "high_fever", "altered_consciousness", "sudden_confusion",
            "rapid_breathing", "sepsis",
        ],
    },
    {
        "id": "dka_recognition",
        "source": "India MoHFW STG — Diabetes Mellitus",
        "section": "§DKA recognition",
        "text": (
            "Diabetic ketoacidosis: known diabetic with vomiting, abdominal pain, "
            "rapid (Kussmaul) breathing, or fruity-smelling breath. Check blood "
            "glucose; if > 250 mg/dL with ketonuria, refer urgently."
        ),
        "tags": [
            "diabetes", "vomiting", "abdominal_pain", "rapid_breathing",
            "fruity_breath", "high_thirst", "frequent_urination", "dka",
        ],
    },
    {
        "id": "gina_severe_asthma",
        "source": "GINA Strategy 2023",
        "section": "§Acute severe asthma",
        "text": (
            "Severe asthma exacerbation: inability to complete sentences, "
            "accessory-muscle use, SpO2 < 92 %, or drowsiness. Treat with "
            "high-flow oxygen + nebulised salbutamol + ipratropium + oral "
            "prednisolone, and refer."
        ),
        "tags": [
            "asthma", "cannot_speak_full_sentences", "wheezing",
            "shortness_of_breath", "drowsy",
        ],
    },
    {
        "id": "hemorrhage_shock",
        "source": "ATLS 10th Edition",
        "section": "§Class III–IV hypovolemic shock",
        "text": (
            "Hypovolemic shock: tachycardia > 110, systolic BP < 90, narrow "
            "pulse pressure, pallor, altered mental status. Stop the bleeding, "
            "two large-bore IVs, crystalloid + blood, refer."
        ),
        "tags": [
            "heavy_bleeding", "vomiting_blood", "coughing_blood",
            "vaginal_bleeding_pregnancy", "black_tarry_stool",
            "dizziness", "hemorrhage", "shock",
        ],
    },
    {
        "id": "mental_health_who",
        "source": "WHO mhGAP Intervention Guide",
        "section": "§Self-harm assessment",
        "text": (
            "Ask about current ideation, plan, and means. If active suicidal "
            "ideation with plan and intent, escalate immediately. Provide "
            "crisis line numbers and stay with the patient until help arrives."
        ),
        "tags": ["suicidal_ideation", "self_harm", "mental_health"],
    },
    {
        "id": "tb_workup",
        "source": "India MoHFW NTEP — Pulmonary TB",
        "section": "§Presumptive TB",
        "text": (
            "Cough ≥ 2 weeks, weight loss, night sweats, or hemoptysis is "
            "presumptive tuberculosis. Send sputum for NAAT (CBNAAT/Truenat) "
            "and chest X-ray."
        ),
        "tags": [
            "persistent_cough", "weight_loss", "night_sweats", "coughing_blood",
            "tuberculosis", "tb",
        ],
    },
    {
        "id": "uti_uncomplicated",
        "source": "India MoHFW STG — UTI",
        "section": "§Uncomplicated cystitis",
        "text": (
            "Adult woman with dysuria + frequency without fever: start empirical "
            "nitrofurantoin 100 mg BID × 5 days. Send urine culture if recurrent "
            "or pregnant."
        ),
        "tags": ["dysuria", "frequent_urination", "uti"],
    },
    {
        "id": "common_cold",
        "source": "ICMR Standard Treatment Workflow — Common Cold",
        "section": "§Symptomatic care",
        "text": (
            "Viral upper respiratory infection: rest, fluids, paracetamol for "
            "fever. Self-limited in 5–7 days. Worry signs: SpO2 < 94 %, "
            "fever > 3 days, or chest pain."
        ),
        "tags": ["runny_nose", "sore_throat", "mild_cough", "common_cold"],
    },
    {
        "id": "tension_headache",
        "source": "ICMR STG — Headache",
        "section": "§Tension-type headache",
        "text": (
            "Bilateral, mild–moderate, pressure-band headache without nausea or "
            "aura, responsive to paracetamol/NSAIDs. Red flags: sudden severe "
            "onset, fever + stiff neck, or focal neuro deficit."
        ),
        "tags": ["headache", "tension_headache", "mild_headache"],
    },
    {
        "id": "back_pain_acute",
        "source": "ICMR STG — Acute Back Pain",
        "section": "§Initial evaluation",
        "text": (
            "Acute non-traumatic back pain without red flags (no fever, no "
            "neuro deficit, no incontinence): conservative care + early "
            "mobilisation. Reassess in 7 days."
        ),
        "tags": ["back_pain"],
    },
    {
        "id": "pregnancy_bleeding",
        "source": "India MoHFW LaQshya — Obstetric Emergency",
        "section": "§Antepartum hemorrhage",
        "text": (
            "Any vaginal bleeding in pregnancy is an emergency until proven "
            "otherwise. Stabilise, large-bore IV, type & screen, and refer to "
            "a facility with obstetric capability."
        ),
        "tags": [
            "vaginal_bleeding_pregnancy", "pregnancy",
            "heavy_bleeding", "dizziness", "hemorrhage",
        ],
    },
    {
        "id": "diarrhea_dehydration",
        "source": "WHO IMCI — Diarrhoea",
        "section": "§Plan A/B/C dehydration",
        "text": (
            "Plan A (no dehydration): ORS + zinc, continue feeding. Plan B "
            "(some dehydration): ORS in clinic. Plan C (severe): IV fluids + "
            "urgent referral."
        ),
        "tags": ["diarrhea", "vomiting", "child", "dehydration"],
    },
    {
        "id": "pneumonia_recognition",
        "source": "WHO IMCI — Cough or Difficult Breathing",
        "section": "§Pneumonia",
        "text": (
            "Child with fast breathing for age (≥ 50/min in 2–11 mo; ≥ 40/min "
            "in 12–59 mo) classify as pneumonia. Severe signs: lower chest "
            "indrawing, stridor, lethargy → refer."
        ),
        "tags": [
            "rapid_breathing", "high_fever", "child",
            "shortness_of_breath", "pneumonia",
        ],
    },
    {
        "id": "skin_infection",
        "source": "ICMR STG — Soft Tissue Infection",
        "section": "§Cellulitis",
        "text": (
            "Localised erythema, warmth, swelling, tenderness without systemic "
            "signs: oral amoxicillin-clavulanate × 7 days. Red flags: fever, "
            "spreading margin, or rapid progression → refer."
        ),
        "tags": ["rash", "swelling", "skin_infection", "cellulitis"],
    },
    {
        "id": "ear_infection_child",
        "source": "WHO IMCI — Ear Problem",
        "section": "§Acute otitis media",
        "text": (
            "Ear pain or discharge < 14 days in an otherwise well child: oral "
            "amoxicillin × 5 days. Mastoid swelling or behind-ear tenderness "
            "→ refer."
        ),
        "tags": ["ear_pain", "child"],
    },
    {
        "id": "conjunctivitis",
        "source": "ICMR STG — Acute Conjunctivitis",
        "section": "§Bacterial vs viral",
        "text": (
            "Purulent discharge + matted lids → bacterial; treat with topical "
            "fluoroquinolone or chloramphenicol. Watery, follicular → viral; "
            "supportive care."
        ),
        "tags": ["eye_redness", "conjunctivitis"],
    },
    {
        "id": "esi_v5",
        "source": "Emergency Severity Index v5 — AHRQ",
        "section": "§Decision points",
        "text": (
            "ESI 1: requires immediate life-saving intervention. ESI 2: "
            "high-risk, confused, severe pain/distress, abnormal vitals. "
            "ESI 3–5: by resources needed."
        ),
        "tags": ["esi", "triage"],
    },
    {
        "id": "telemedicine_india",
        "source": "India Telemedicine Practice Guidelines 2020",
        "section": "§Roles",
        "text": (
            "Telemedicine is decision support — only a Registered Medical "
            "Practitioner can diagnose or prescribe. AI tools must be "
            "transparent and explainable, and must not replace the RMP."
        ),
        "tags": ["telemedicine", "ethics", "decision_support"],
    },
    {
        "id": "dpdp_act",
        "source": "Digital Personal Data Protection Act 2023",
        "section": "§Sensitive data",
        "text": (
            "Health data is sensitive personal data. Process only with informed "
            "consent for a stated purpose, store only as long as needed, "
            "minimise collection, and notify users on breach."
        ),
        "tags": ["privacy", "consent", "dpdp"],
    },
    {
        "id": "mh_helplines_india",
        "source": "MoHFW Mental Health Helpline Directory",
        "section": "§National helplines",
        "text": (
            "Suicidal ideation / self-harm: iCall 9152987821 (English/Hindi, "
            "24×7), Vandrevala Foundation 1860-2662-345 (multilingual, 24×7). "
            "Emergency: dial 112 or 108."
        ),
        "tags": [
            "suicidal_ideation", "self_harm", "mental_health",
            "helpline",
        ],
    },
    {
        "id": "rabies_exposure",
        "source": "India National Rabies Control Programme",
        "section": "§Category III",
        "text": (
            "Category III exposure (transdermal bites, scratches with bleeding, "
            "or licks on broken skin) requires immediate wound washing × 15 min, "
            "RIG, and 5-dose ARV schedule."
        ),
        "tags": ["animal_bite", "rabies"],
    },
    {
        "id": "snake_bite",
        "source": "India MoHFW — Snake-Bite Management",
        "section": "§Approach",
        "text": (
            "Immobilise the bitten limb, remove constrictive items, transport "
            "supine. Do not incise, suck, or apply tourniquets. ASV indicated "
            "for systemic envenomation or local progressing swelling."
        ),
        "tags": ["snake_bite", "envenomation"],
    },
    {
        "id": "burn_first_aid",
        "source": "ICMR STG — Burns",
        "section": "§First aid",
        "text": (
            "Cool the burn with running water for 20 minutes. Do not apply "
            "ice, butter, or toothpaste. Cover with clean cling film. Refer "
            "if > 10 % BSA in adults / > 5 % in children, or any full-thickness."
        ),
        "tags": ["burn"],
    },
    {
        "id": "esi_pediatric_fever",
        "source": "WHO IMCI — Fever",
        "section": "§Classify",
        "text": (
            "Child with fever ≥ 37.5 °C and any general danger sign or stiff "
            "neck → severe febrile disease, refer urgently with first dose of "
            "antibiotic."
        ),
        "tags": ["high_fever", "child", "lethargy"],
    },
    {
        "id": "general_advice",
        "source": "ASHA-AI Decision Support",
        "section": "§Patient-facing",
        "text": (
            "ASHA-AI provides triage support only. Always go in person if "
            "symptoms worsen, new red-flag symptoms appear, or you are unsure. "
            "Call 108 (ambulance) or 112 (emergency) in life-threatening cases."
        ),
        "tags": ["general", "safety"],
    },
]


def by_tags(*tags: str) -> list[dict]:
    """Return snippets that include any of the given tags. Stable ordering."""
    wanted = {t.lower() for t in tags}
    if not wanted:
        return list(FALLBACK_SNIPPETS)
    out: list[dict] = []
    for s in FALLBACK_SNIPPETS:
        snippet_tags = {t.lower() for t in s.get("tags", [])}
        if snippet_tags & wanted:
            out.append(s)
    return out
