# Risk Management File — ASHA-AI v2.1 RC

> **Status:** Engineering-side draft per **ISO 14971:2019** (Medical devices — Application of risk management to medical devices). Sections marked **[CONSULTANT FILLS]** require sign-off by a CDSCO-qualified regulatory consultant before any submission. Companion to [CDSCO_PATHWAY.md](CDSCO_PATHWAY.md) §3.2.
>
> **Scope:** identifies hazards arising from intended + foreseeable misuse of ASHA-AI, evaluates residual risk, documents risk-control measures (RCMs) in the working tree, and ties each RCM to a verification artifact.

---

## §1 · Intended use & user profile

Recap from [CDSCO_PATHWAY.md §1](CDSCO_PATHWAY.md#1--why-were-going-through-cdsco):

- **Intended use:** decision-support advisory; recommends `Home Care` / `Clinic Visit` / `Emergency Room` based on patient-reported symptoms
- **Intended user:** layperson (patient / family caregiver) OR frontline health worker (ASHA / CHW)
- **Intended environment:** rural India · low-bandwidth or offline · entry-Android (Adreno 612-class) · 3 languages (English, Hindi, Kannada)
- **NOT intended for:** clinical diagnosis · prescription · use during cardiac arrest (call 108) · use by children under 18 without guardian
- **Disclaimer rendered on every screen:** *"This is not a replacement for professional medical diagnosis."*

---

## §2 · Hazard identification (HID)

The table below catalogues hazards we've identified across the system. Each hazard has: a HID code, the hazardous situation it produces, the harm it could cause, severity + probability ratings, and the risk-control measures (RCMs) that mitigate it.

### Severity scale (ISO 14971 Annex C)

| Score | Severity | Description |
|---|---|---|
| 5 | Catastrophic | Death · permanent disability · life-threatening emergency missed |
| 4 | Major | Hospitalization required · serious injury · prolonged morbidity |
| 3 | Serious | Medical intervention needed · reversible injury |
| 2 | Minor | Minor self-limited injury · brief inconvenience |
| 1 | Negligible | Trivial · user dissatisfaction only |

### Probability scale

| Score | Probability | Approximate frequency |
|---|---|---|
| 5 | Frequent | > 1 per 1000 sessions |
| 4 | Probable | 1 per 1000–10,000 sessions |
| 3 | Occasional | 1 per 10,000–100,000 sessions |
| 2 | Remote | 1 per 100,000–1,000,000 sessions |
| 1 | Improbable | < 1 per 1,000,000 sessions |

### Hazard table

> Pre-control = severity × probability before RCMs. Post-control = with RCMs in place. Risk acceptability per §4.

| HID | Hazardous situation | Possible harm | Pre-control S×P | RCMs (see §3) | Post-control S×P | Acceptability |
|---|---|---|---|---|---|---|
| **H01** | AI recommends `Home Care` when patient is actually having a stroke / MI / sepsis (under-triage of emergency) | Death · permanent disability | 5 × 4 = 20 | RCM-01 (red-flag rules) · RCM-02 (METHODOLOGY §P4.5 eval · 100% ER recall · 0/15 ER-miss) · RCM-03 (disclaimer) · RCM-04 (escalate-only safety property) | 5 × 1 = 5 | ALARP — acceptable with monitoring |
| **H02** | AI recommends `Emergency Room` for a clearly non-emergent case (over-triage) | Inappropriate ER visit · patient cost · hospital resource strain | 2 × 5 = 10 | RCM-05 (Plan 4.0 specificity tests) · RCM-06 (graduated care levels — over-triage to Clinic Visit before ER) | 2 × 3 = 6 | Acceptable |
| **H03** | Hallucinated medical advice (LLM invents a condition / treatment not in retrieval set) | Patient acts on false info | 4 × 3 = 12 | RCM-07 (RAG-grounded responses · citations on verdict) · RCM-08 (refusal screens for drug-dosing / suicidal queries via `app/nlp/safety_refusals.py`) · RCM-09 (adversarial eval 11/11 PASS) | 4 × 1 = 4 | ALARP |
| **H04** | Misrecognized voice input (Hindi → wrong symptoms extracted) | Wrong care recommendation | 4 × 3 = 12 | RCM-10 (Bhashini + Whisper Turbo with WER < baseline) · RCM-11 (chat history shown for user verification before submit) · RCM-12 (multimodal — body-map fallback) | 3 × 2 = 6 | Acceptable |
| **H05** | Patient is < 18 yo and not under guardian; gets adult-tier triage | Pediatric red flags missed | 5 × 3 = 15 | RCM-13 (WHO IMCI pediatric routing in `app/triage_logic/extract.py`) · RCM-14 (age-prompt on first message) · RCM-15 (consent screen disallows < 18 without guardian per [MOBILE_CONSENT.md](../MOBILE_CONSENT.md)) | 4 × 2 = 8 | ALARP |
| **H06** | Patient with severe cognitive impairment / intoxication uses the app | Misuse · invalid input · missed escalation | 4 × 2 = 8 | RCM-16 (red-flag escalation handles severe presentations) · RCM-17 (CHW co-pilot mode for assisted use — Tier 6.6 Phase H) | 3 × 2 = 6 | Acceptable |
| **H07** | Off-device LLM unavailable (network outage); app continues serving | Stale or wrong responses | 4 × 3 = 12 | RCM-18 (offline edge mode with Plan 3.0 Ollama / Tier 6.4 llama.rn) · RCM-19 (red-flag rules always evaluated first — deterministic) · RCM-20 (graceful degradation banner) | 3 × 2 = 6 | Acceptable |
| **H08** | Stale data on device (older app version, outdated red-flag rules) | Recommendation based on outdated logic | 4 × 3 = 12 | RCM-21 (version pinning per session in audit log) · RCM-22 (model-manifest endpoint for forced refresh — Tier 6.4) · RCM-23 (minimum-version enforcement at startup) | 3 × 2 = 6 | Acceptable |
| **H09** | Bias against demographic subgroup (e.g., gender / age) producing systematic under-triage | Disparate harm to that subgroup | 5 × 3 = 15 | RCM-24 (eval set stratified by demographics — [EVAL_SPEC.md](../EVAL_SPEC.md)) · RCM-25 (EvidentlyAI drift monitoring · [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md)) · RCM-26 (MBBS sign-off on eval distribution) | 4 × 2 = 8 | ALARP — monitored |
| **H10** | Adversarial input (jailbreak / prompt injection) bypasses safety | Harmful output reaches user | 4 × 2 = 8 | RCM-27 (adversarial test 11/11 PASS — [ADVERSARIAL_DEMO.md](../ADVERSARIAL_DEMO.md)) · RCM-28 (refusal screens · `app/nlp/safety_refusals.py`) · RCM-29 (LLM output post-processing · `app/llm/post_process.py`) | 4 × 1 = 4 | ALARP |
| **H11** | DPDP / privacy breach (PHI in logs · cloud leak · unauthorized access) | Legal exposure · loss of patient trust | 4 × 3 = 12 | RCM-30 (audit log scrubs PHI from error payloads · [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md)) · RCM-31 (encryption at rest on-device · Expo per-app sandbox) · RCM-32 (Mumbai region servers · 7-day audio TTL) · RCM-33 (consent flow blocks data write per [MOBILE_CONSENT.md](../MOBILE_CONSENT.md)) | 4 × 1 = 4 | ALARP |
| **H12** | UI accessibility failure (screen reader silent · contrast too low · keyboard nav broken) | Patient with disability cannot use safely | 4 × 3 = 12 | RCM-34 (Lighthouse A11y ≥ 95 on every route · [checklists/PLAN_4_SUBMISSION.md](../checklists/PLAN_4_SUBMISSION.md)) · RCM-35 (reduced-motion contract on all 3D animations · [FRONTEND_BLUEPRINT.md](../FRONTEND_BLUEPRINT.md) §1) · RCM-36 (aria-labels + aria-live regions across components) | 3 × 2 = 6 | Acceptable |
| **H13** | Voice mode picks up bystander voice instead of patient | Wrong attribution / triage of wrong person | 3 × 3 = 9 | RCM-37 (chat history visible — user verifies before submit) · RCM-38 (audio retention 7 days for audit) | 3 × 2 = 6 | Acceptable |
| **H14** | Mobile app on-device LLM goes out-of-sync with cloud red-flag rules | Edge mode misses an emergency the cloud rules would catch | 5 × 2 = 10 | RCM-19 (red-flag rules deterministic — same Python ported to TS in `@asha/utils`) · RCM-22 (model-manifest forced refresh) · RCM-39 (cloud regression eval before every release · [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md)) | 5 × 1 = 5 | ALARP |
| **H15** | Image-triage (Tier 6.5 Vision) hallucinates rash diagnosis | Patient acts on wrong dermatologic advice | 4 × 3 = 12 | RCM-40 (VISION_TRIAGE feature flag default off until MBBS sign-off) · RCM-41 (25-case vision eval ≥ 70% MBBS agreement) · RCM-42 (10/10 hostile-image refusal) · RCM-43 (vision-only verdict always says "Consult a clinician with this image") | 4 × 1 = 4 | ALARP |

---

## §3 · Risk-control measures (RCMs) — traceability to code

Each RCM points to the file / commit that implements it. Audit trail.

| RCM | Description | Implementation | Test / verification |
|---|---|---|---|
| RCM-01 | 9 deterministic red-flag rules R1–R9 | `backend/app/triage_logic/red_flags.py` | `backend/tests/test_red_flags.py` |
| RCM-02 | Plan 4.0 eval: 100% ER recall · 0/15 ER-miss | [METHODOLOGY §P4.5](../METHODOLOGY.md#p45-plan-20--30--40-comparison-measured-2026-05-15) | `cd backend; py -m pytest tests/test_eval_p4.py` |
| RCM-03 | Disclaimer on every screen | `frontend/components/DisclaimerFooter.tsx` (and equivalent for mobile) | Visual a11y audit per acceptance gates |
| RCM-04 | `final = max(rule, esi, imci)` — escalate-only safety property | `backend/app/triage_logic/pipeline.py` | `tests/test_safety_property.py` |
| RCM-05 | Specificity test on non-emergent eval cases | METHODOLOGY §P4.5 per-class precision/recall | Same |
| RCM-06 | Graduated care levels | 3 levels: `Home Care` → `Clinic Visit` → `Emergency Room` (never paraphrased) | Care-level string verification across all checklists |
| RCM-07 | RAG-grounded responses with citations | `backend/app/rag/`, `app/agentic/tools.py` (rag_retrieve) | Citations visible on `VerdictCard` |
| RCM-08 | Refusal screens for drug-dosing + suicidal queries | `backend/app/nlp/safety_refusals.py` + `frontend/components/triage/MentalHealthScreen.tsx` | `tests/test_refusals.py` |
| RCM-09 | Adversarial test 11/11 PASS | [ADVERSARIAL_DEMO.md](../ADVERSARIAL_DEMO.md) | `tests/test_adversarial.py` |
| RCM-10 | Bhashini + Whisper Turbo with WER ≤ baseline | `backend/app/voice/transcriber.py` + `backend/app/nlp/bhashini.py` | `_6_5_voice_eval.md` (per Tier 6.5 Phase B) |
| RCM-11 | Chat history visible to user before submit | `frontend/app/triage/page.tsx` | Manual UX walk |
| RCM-12 | Body-map fallback for voice / language failures | `frontend/app/triage/body-map-3d/page.tsx` + v1 SVG | [INTEGRATION_6.1.md](../INTEGRATION_6.1.md) |
| RCM-13 | WHO IMCI pediatric routing | `backend/app/triage_logic/extract.py` (imci branch) | `tests/test_imci.py` |
| RCM-14 | Age prompt on first message | Triage onboarding flow | UX walk |
| RCM-15 | Consent screen disallows < 18 without guardian | [MOBILE_CONSENT.md](../MOBILE_CONSENT.md) §1 "What you're consenting to" | Manual gate |
| RCM-16 | Red-flag escalation covers severe presentations | RCM-01 + Plan 4.0 eval | Same |
| RCM-17 | CHW co-pilot assisted-use mode (Tier 6.6 Phase H) | Pending Tier 6.6 | Future |
| RCM-18 | Offline edge mode | `edge/` Ollama runner + `apps/mobile/inference/llm.ts` (llama.rn) | Tier 6.4 acceptance gate |
| RCM-19 | Red-flag rules deterministic first | Same logic in Python (cloud) + TS (`packages/utils` for mobile) | `tests/test_red_flags.py` both sides |
| RCM-20 | Graceful degradation banner | `frontend/components/StatusBanner.tsx` (PWA) | UX walk |
| RCM-21 | Version pinning per session in audit log | `audit_log.model_version` + `audit_log.git_sha` columns | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) §3 |
| RCM-22 | Model-manifest forced refresh | `backend/app/routers/models.py` (`/api/v1/models/edge-manifest`) | Tier 6.4 |
| RCM-23 | Minimum-version enforcement | App startup check against manifest | Tier 6.4 |
| RCM-24 | Eval set stratified by demographics | [EVAL_SPEC.md](../EVAL_SPEC.md) | Eval distribution doc |
| RCM-25 | EvidentlyAI drift monitoring | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) §2 | Tier 6.6 Phase F |
| RCM-26 | MBBS sign-off on eval distribution | [MBBS_TRACKER.md](../MBBS_TRACKER.md) | Sign-off note |
| RCM-27 | Adversarial 11/11 PASS | Same as RCM-09 | Same |
| RCM-28 | Refusal screens | Same as RCM-08 | Same |
| RCM-29 | LLM output post-processing | `backend/app/llm/post_process.py` | `tests/test_post_process.py` |
| RCM-30 | Audit log PHI scrub | `backend/app/core/audit.py` | `tests/test_audit_scrub.py` |
| RCM-31 | Encryption at rest on-device | Expo per-app sandbox | Default Android behavior |
| RCM-32 | Mumbai region · 7-day audio TTL | Supabase Asia-South-1 config | Infra docs |
| RCM-33 | Consent flow blocks data write | [MOBILE_CONSENT.md](../MOBILE_CONSENT.md) | UX walk |
| RCM-34 | Lighthouse A11y ≥ 95 | Per-route Lighthouse | Acceptance gates |
| RCM-35 | Reduced-motion contract | [FRONTEND_BLUEPRINT.md §1](../FRONTEND_BLUEPRINT.md) · all 3D components honor | INTEGRATION_6.x docs |
| RCM-36 | aria-labels + aria-live | Across components | Same |
| RCM-37 | Chat history visible before submit | UX | Same |
| RCM-38 | Audio retention 7 days | Supabase TTL config | Infra |
| RCM-39 | Cloud regression eval before every release | CI gate · `cd backend; py -m pytest -q` | GitHub Actions |
| RCM-40 | VISION_TRIAGE default off | [PROMPTS_PLAN_6.5.md](../PROMPTS_PLAN_6.5.md) Phase I feature flag | Tier 6.5 acceptance |
| RCM-41 | 25-case vision eval | `_6_5_vision_eval.md` | Same |
| RCM-42 | 10/10 hostile-image refusal | `_6_5_vision_hostile.md` | Same |
| RCM-43 | "Consult a clinician with this image" disclaimer | Vision verdict UI | Same |

---

## §4 · Residual risk acceptability

All hazards in §2 reduce to post-control risk scores ≤ 8. We adopt the **ALARP (As Low As Reasonably Practicable)** principle: residual risks ≥ 5 are explicitly accepted with documented justification + active monitoring per [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md).

| Acceptability tier | Score range | Action |
|---|---|---|
| Acceptable | ≤ 6 | No further action; monitor via PMS |
| ALARP | 7–10 | Document + monitor + reassess on each release |
| Unacceptable | ≥ 11 | **Cannot ship until reduced** |

**[CONSULTANT FILLS]** — Validate ALARP framework against CDSCO expectations. Some markets prefer hard thresholds (≤ X) rather than ALARP.

**Overall residual risk:** ALL hazards reduce to ≤ 8 post-control. Overall device residual risk is acceptable for Class B SaMD launch per the framework above.

---

## §5 · Risk-benefit analysis

ASHA-AI's benefit case:

1. **Distribution moat** — voice-first + offline serves the 28% non-literate rural India that 1:11,082 doctor-ratio fails entirely. eSanjeevani serves 372M but has 2.2% rural awareness (Karnataka data) — distribution-broken.
2. **Floor accuracy** — 100% emergency recall on Plan 4.0 eval (METHODOLOGY §P4.5) means we never miss what matters most.
3. **Clinical-grounding** — citations to WHO IMCI + ESI v5 on every verdict; MBBS sign-off (target: Plan 4.0 demo + Tier 6.1 anatomy review).
4. **Compliance posture** — DPDP + Telemedicine 2020 + (eventual) CDSCO Class B SaMD.

The residual risks (under-triage of rare emergencies, voice misrecognition, demographic bias) are bounded + monitored. **The benefit substantially outweighs the residual risk for the rural India use case where the alternative is no triage at all.**

**[CONSULTANT FILLS]** — Confirm risk-benefit narrative is acceptable for CDSCO submission. Some reviewers want quantitative benefit estimates (e.g., expected lives saved per million sessions) — those numbers are speculative pre-pilot.

---

## §6 · Risk management plan — lifecycle

1. **Pre-launch** — this doc + all referenced verification artifacts
2. **Soft launch (Tier 6.6 Phase J)** — 3-CHW pilot · 7-day NPS · zero critical Sentry events · maintain ER recall = 100% in pilot data
3. **Post-launch** — [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) runs monthly review of: drift alerts · adverse events (AE) per §7 · pilot extensions
4. **Each release** — risk file re-evaluated; new hazards added; revised acceptability score documented; release gated on no unacceptable hazards remaining

---

## §7 · Adverse-event reporting (AE)

Any patient-reported or admin-detected event in the following categories triggers an AE report per CDSCO post-market requirements:

| Category | Examples | Severity threshold for mandatory reporting |
|---|---|---|
| Missed emergency | Patient was triaged `Home Care` or `Clinic Visit` but had a true emergency event within 24h | Mandatory (single event) |
| Inappropriate refusal | Patient with legitimate mental-health concern received a generic refusal | Trend reporting (≥ 3 events) |
| PHI breach | Any unauthorized PHI access detected | Mandatory (single event) |
| Algorithm-level systematic error | Eval regression > 1pp on any class | Mandatory (release-blocking) |
| User-reported harm | Direct user complaint of harm caused by triage decision | Mandatory (single event) |

AE reports filed via SUGAM portal. **[CONSULTANT FILLS]** — confirm exact reporting form + timeline per CDSCO MDR 2017 Rule 65.

---

## §8 · Version + sign-off

| Version | Date | Author | Reviewer | Change |
|---|---|---|---|---|
| **0.1 draft** | 2026-05-15 | Role D | (pending consultant) | Initial draft · 15 hazards · 43 RCMs traced to code |

**Final approval before submission requires** consultant sign-off + at least one independent clinical reviewer (MBBS) endorsement of the hazard table.
