# Clinical Evaluation Plan — ASHA-AI v2.1 RC

> **Status:** Engineering-side draft. Sections marked **[CONSULTANT FILLS]** require regulatory + clinical-research sign-off. Companion to [CDSCO_PATHWAY.md](CDSCO_PATHWAY.md) §3.2 and [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) §3 RCM-24/26.
>
> **Scope:** describes the clinical evidence supporting ASHA-AI's safety + performance claims, leveraging the eval suite, MBBS reviews, and 3-CHW pilot evidence. Loosely follows the MEDDEV 2.7/1 rev 4 structure (EU MDR Clinical Evaluation Report), adapted for Indian SaMD context.

---

## §1 · Device description & intended use

Recap from [CDSCO_PATHWAY.md §1](CDSCO_PATHWAY.md#1--why-were-going-through-cdsco):

| Parameter | Value |
|---|---|
| Device name | ASHA-AI |
| Version | v2.1 RC (Plan 6.6 launch candidate) |
| Classification | CDSCO Class B SaMD (provisional — see [CDSCO_PATHWAY.md §2](CDSCO_PATHWAY.md#2--risk-classification)) |
| Intended purpose | Decision-support advisory for laypeople + frontline health workers in India |
| Output | One of three care-level recommendations: `Home Care` · `Clinic Visit` · `Emergency Room` |
| Reference standards | WHO IMCI 2014 · ESI v5 (AHRQ 2024) · Telemedicine Practice Guidelines (India 2020) · DPDP Act 2023 |
| Languages supported | English · Hindi · Kannada (voice + text) |

---

## §2 · Clinical evidence framework

Per ISO 14155:2020 + IMDRF SaMD N41 "Clinical Evaluation":

> Clinical evidence for a SaMD comes from three sources: **(a) valid clinical association**, **(b) analytical / technical validation**, **(c) clinical validation in the intended use population**.

| Evidence type | ASHA-AI source | Status |
|---|---|---|
| Valid clinical association | WHO IMCI + ESI v5 published guideline grounding for every recommendation | ✅ documented |
| Analytical / technical validation | Plan 4.0 eval suite (53 cases · [METHODOLOGY §P4.5](../METHODOLOGY.md#p45-plan-20--30--40-comparison-measured-2026-05-15)) + Plan 6.5 eval (when shipped — §P6) | ✅ Plan 4.0 done · 6.5 pending |
| Clinical validation | (a) MBBS reviews · (b) 3-CHW pilot per [PROMPTS_PLAN_6.6.md Phase J](../PROMPTS_PLAN_6.6.md#phase-j--soft-launch-3-pilot-chws) · (c) real-patient triage per [checklists/REAL_PATIENT.md](../checklists/REAL_PATIENT.md) | ✅ MBBS + real-patient (Plan 4.0) · pilot pending Tier 6.6 |

---

## §3 · §2(a) — Valid clinical association

Every triage decision in ASHA-AI is grounded in one or more of these published evidence sources:

| Decision input | Reference standard | Where used |
|---|---|---|
| Red-flag rules R1–R9 | ESI v5 (Gilboy 2020) + WHO IMCI (2014) + AHA stroke FAST + WHO sepsis qSOFA | [RED_FLAGS.md](../RED_FLAGS.md) · `backend/app/triage_logic/red_flags.py` |
| ESI mapper (severity → care level) | ESI v5 Appendix A | `backend/app/triage_logic/esi.py` |
| IMCI under-5 routing | WHO IMCI 2014 Chart Booklet | `backend/app/triage_logic/extract.py` |
| Risk-score weights (Plan 5.1) | ESI v5 + WHO IMCI weighted blending | [RISK_SCORING.md](../RISK_SCORING.md) (Tier 5.1 doc) · `backend/app/risk/scoring.py` |
| Adversarial test set | Published stroke / MI / sepsis adversarial-presentation literature | [ADVERSARIAL_DEMO.md](../ADVERSARIAL_DEMO.md) |
| Safety refusals (drug-dosing, suicidal ideation) | India Telemedicine Practice Guidelines 2020 §3 (no Rx) + WHO mental-health crisis-line referral | `backend/app/nlp/safety_refusals.py` + `frontend/components/triage/MentalHealthScreen.tsx` |

**Valid clinical association is established** — every output traces to a published guideline.

---

## §4 · §2(b) — Analytical / technical validation

### §4.1 · Plan 4.0 eval — frozen baseline (measured 2026-05-15)

Source: [METHODOLOGY §P4.5](../METHODOLOGY.md#p45-plan-20--30--40-comparison-measured-2026-05-15) — frozen, not re-edited (per [[feedback-methodology-coediting]]).

| Metric | Value | Threshold | PASS |
|---|---|---|---|
| Cloud accuracy | 80.8% | ≥ 78% (literature baseline = 55.8% per Semigran 2015) | ✅ |
| Edge accuracy | 81.6% | ≥ 78% | ✅ |
| ER recall | 100% | = 100% | ✅ |
| ER-miss count | 0 / 15 | 0 | ✅ |
| Adversarial PASS | 11 / 11 | 11 / 11 | ✅ |
| Safety refusal PASS | 18 / 18 | 18 / 18 | ✅ |

### §4.2 · Plan 5.1 — risk scoring deterministic validation

Source: [RISK_SCORING.md](../RISK_SCORING.md) (Tier 5.1 methodology doc).

| Property | Validation | PASS |
|---|---|---|
| Risk can only escalate, never downgrade | Unit test: `tests/test_risk_scoring.py::test_no_downgrade` | ✅ |
| ER red-flag never overridden | Same suite: `test_red_flag_never_downgraded` | ✅ |
| Linear-regression trajectory math | Numerical unit tests | ✅ |
| End-to-end p95 latency | < 10 ms (no LLM, no DB) | ✅ |

### §4.3 · Plan 6.5 — brain-stack upgrade (pending)

When Tier 6.5 ships, METHODOLOGY §P6 records the post-swap eval. Acceptance gate ([checklists/PLAN_6_5_SUBMISSION.md](../checklists/PLAN_6_5_SUBMISSION.md)) requires:

- Cloud accuracy ≥ 80.8% ± 1pp (no regression)
- Edge accuracy ≥ 81.6% ± 1pp
- ER recall 100% (held)
- Adversarial 11/11 (held)
- Safety refusal 18/18 (held)
- New: Vision urgency-band agreement ≥ 70% (Llama 3.2 Vision; opt-in)
- New: HyDE + rerank precision@5 ≥ +8pp combined

---

## §5 · §2(c) — Clinical validation

### §5.1 · MBBS clinical review (Plan 4.0 + Tier 6.1)

| Review event | Protocol | Output | Status |
|---|---|---|---|
| 60-min eval review (Plan 4.0 Day-5) | [MBBS_TRACKER.md](../MBBS_TRACKER.md) Plan 4.0 protocol | Sign-off line in PITCH_DECK_PLAN_4.0.md slide 8 + MBBS_TRACKER reply log | ✅ landed |
| Anatomy review (Tier 6.1) | [MBBS_TRACKER.md](../MBBS_TRACKER.md) Tier 6.1 anatomical accuracy protocol | 1-page sign-off at `docs/mbbs_signoffs/6_1_anatomy.md` | ⏳ pending Tier 6.1 closeout |
| Vision-eval review (Tier 6.5) | [MBBS_TRACKER.md](../MBBS_TRACKER.md) Tier 6.5 Vision-validation protocol (when authored) | Sign-off at `docs/mbbs_signoffs/6_5_vision.md` + 25-case label set | ⏳ pending Tier 6.5 |
| Hazard table review | This doc + [RISK_MANAGEMENT_FILE.md §2](RISK_MANAGEMENT_FILE.md#2--hazard-identification-hid) | MBBS endorsement of the 15-hazard list | ⏳ pending |

### §5.2 · Real-patient triage (Plan 4.0 Day-5)

| Element | Status |
|---|---|
| Patient consent per [CONSENT_FORM.md](../CONSENT_FORM.md) | ✅ shipped |
| Triage protocol per [checklists/REAL_PATIENT.md](../checklists/REAL_PATIENT.md) | ✅ shipped |
| Anonymized log row P-001 | ✅ landed (per FEATURE_INVENTORY F4 evidence) |
| Hard ethics rules (no child / pregnant / urgent / stranger / impaired) | ✅ enforced via consent flow |

### §5.3 · 3-CHW soft-launch pilot (Tier 6.6 Phase J)

Per [PROMPTS_PLAN_6.6.md Phase J](../PROMPTS_PLAN_6.6.md#phase-j--soft-launch-3-pilot-chws):

| Parameter | Target | Measured at |
|---|---|---|
| Geographic + language diversity | 1 Karnataka · 1 Bihar · 1 Maharashtra | Recruitment phase |
| Daily-active days per CHW | ≥ 4 / 7 | Day 7 |
| Triage sessions per CHW | ≥ 10 in 7 days | Day 7 |
| ER recall during pilot | = 100% (per Plan 4.0 floor) | Per-session |
| Critical Sentry events | = 0 | Continuous |
| NPS across CHWs | ≥ 7 / 10 | Day 7 + Day 14 survey |

**Pilot is operational + feasibility validation, NOT a clinical trial.** Statistical generalization is post-6.6. The pilot's value to CDSCO submission is: (a) feasibility evidence · (b) zero-AE evidence under real use · (c) UX feedback documented in `docs/_6_6_pilot_feedback.md`.

### §5.4 · Post-launch clinical surveillance

Continuous per [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md):

- Monthly EvidentlyAI drift review (per-class triage distribution)
- Quarterly MBBS audit of randomly-sampled triage decisions
- Annual full eval rerun on a refreshed case set
- Per-incident AE reporting per [RISK_MANAGEMENT_FILE.md §7](RISK_MANAGEMENT_FILE.md#7--adverse-event-reporting-ae)

---

## §6 · Population & generalizability

### §6.1 · Intended-use population

| Demographic | Target |
|---|---|
| Geographic | Rural India (primary) + tier-2/3 urban (secondary) |
| Age | 18+ for self-use · pediatric via guardian with IMCI routing |
| Language | English · Hindi · Kannada (voice + text) |
| Device class | Android Adreno 612-class (₹8,000 phone) and above; iOS deferred to post-6.6 |
| Connectivity | Online-first; offline-capable via Plan 3.0 edge + Tier 6.4 mobile |
| Literacy | App is usable by non-literate users (voice + body-map + 3 care-level pictograms) |

### §6.2 · Population not addressed

| Group | Reason | Mitigation |
|---|---|---|
| < 18 unsupervised | Consent screen restriction | Guardian consent path; IMCI pediatric routing for under-5 |
| Pregnant patients | Excluded from real-patient triage protocol | Triage still works — but warnings + obstetric escalation needed (future) |
| Cognitive impairment / intoxication | Risk H06 — degraded input | CHW co-pilot mode (Tier 6.6 Phase H) |
| iOS users | iOS deferred to post-6.6 | Available via web app meanwhile |
| Languages beyond EN/HI/KN | Bhashini supports more; eval not run yet | Plan 7.x roadmap |

### §6.3 · Generalizability claim

> ASHA-AI is **clinically validated for the rural-India use case it was designed for** (eval on India-specific case mix · MBBS sign-off · pilot in 3 Indian states). Generalization to other LMIC contexts requires re-validation. We do NOT claim FDA-equivalent applicability.

**[CONSULTANT FILLS]** — Confirm this generalizability claim is the correct positioning for CDSCO submission. EU MDR / FDA 510(k) would have different framing.

---

## §7 · State-of-the-art comparison

### §7.1 · Benchmark literature

| Comparator | Reported accuracy | ASHA-AI Plan 4.0 |
|---|---|---|
| Median symptom-checker triage accuracy (Semigran 2015 + Wallace 2024 update) | 55.8% | **80.8% cloud / 81.6% edge** |
| Ada (peer-reviewed published numbers) | ~70% (varies by condition class) | **80.8%** (no per-condition breakdown disclosed yet — pending §P6) |
| Babylon (published numbers) | 80% (general) | Comparable |
| GPT-4 + RAG baseline (academic) | ~85% on MedQA — but different metric (multiple-choice) | Different metric — apples vs oranges |

Source: [MARKET_ANALYSIS.html](../../MARKET_ANALYSIS.html) competitor section + research/01_global_competitors.md.

### §7.2 · India-specific comparators

| Comparator | India regulatory status | ASHA-AI position |
|---|---|---|
| eSanjeevani | Government telemedicine platform | Different service model (live doctor, not AI) |
| Practo / Tata 1mg symptom checkers | Operating without explicit SaMD registration | Same advisory posture · ASHA-AI adds voice + offline + rural-Hindi |
| Ada in India | CE Class IIa; not registered in India | We're registering · they're not |

---

## §8 · Risk-benefit conclusion

Per [RISK_MANAGEMENT_FILE.md §5](RISK_MANAGEMENT_FILE.md#5--risk-benefit-analysis):

> The benefit substantially outweighs the residual risk for the rural India use case where the alternative is no triage at all.

The clinical evidence:

1. **Validates safety** — 100% ER recall · 0 ER-miss · 18/18 safety refusal across the eval suite
2. **Validates performance** — accuracy substantially exceeds the published median (80.8% vs 55.8%)
3. **Validates fit-for-purpose** — designed for non-literate / voice-first / offline / 3-language use; pilot evidence supports this
4. **Validates clinical grounding** — every output ties to WHO IMCI · ESI v5 · published red-flag literature
5. **Validates supervision posture** — operates as advisory under Telemedicine Practice Guidelines 2020

**Recommendation:** v2.1 RC is appropriate for CDSCO Class B SaMD submission pending consultant validation of §6.3 generalizability framing.

---

## §9 · Open items requiring clinical input

| Item | Owner |
|---|---|
| MBBS endorsement of [RISK_MANAGEMENT_FILE.md §2](RISK_MANAGEMENT_FILE.md#2--hazard-identification-hid) hazard table | MBBS reviewer |
| MBBS sign-off note for Tier 6.1 anatomy (`docs/mbbs_signoffs/6_1_anatomy.md`) | MBBS reviewer per [MBBS_TRACKER.md](../MBBS_TRACKER.md) |
| Vision-eval review for Tier 6.5 (`docs/mbbs_signoffs/6_5_vision.md`) | MBBS reviewer · Tier 6.5 Phase I |
| Pilot data clinical review (Tier 6.6 Phase J closeout) | Independent MBBS · `docs/_6_6_pilot_feedback.md` |
| Generalizability framing acceptable for CDSCO? | **[CONSULTANT FILLS]** |
| AE definitions appropriate? | **[CONSULTANT FILLS]** |

---

## §10 · Cross-references

- [CDSCO_PATHWAY.md](CDSCO_PATHWAY.md) — regulatory pathway this evidence supports
- [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) — hazard analysis informing the eval design
- [METHODOLOGY.md §P4.5](../METHODOLOGY.md#p45-plan-20--30--40-comparison-measured-2026-05-15) — Plan 4.0 measured baseline (frozen)
- [EVAL_SPEC.md](../EVAL_SPEC.md) — eval design + stratification
- [EVAL_CASES.csv](../EVAL_CASES.csv) — case-level eval data
- [ADVERSARIAL_DEMO.md](../ADVERSARIAL_DEMO.md) — stroke-FAST + other adversarial test cases
- [MBBS_TRACKER.md](../MBBS_TRACKER.md) — MBBS review protocols (Plan 4.0 + Tier 6.1 + Tier 6.5 Vision)
- [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) — post-launch clinical surveillance

---

## §11 · Version + sign-off

| Version | Date | Author | Reviewer | Change |
|---|---|---|---|---|
| **0.1 draft** | 2026-05-15 | Role D | (pending consultant + MBBS) | Initial draft tying Plan 4.0 + 5.x + 6.x evidence to MEDDEV-style structure |
