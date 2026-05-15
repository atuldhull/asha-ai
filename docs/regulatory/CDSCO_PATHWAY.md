# CDSCO Regulatory Pathway — ASHA-AI v2.1 RC

> **Status:** Engineering-side draft. **Not a regulatory submission.** Final positions require sign-off by a CDSCO-qualified regulatory consultant — that engagement is a [PENDING_USER_ACTIONS](../PENDING_USER_ACTIONS.md) item. Sections marked **[CONSULTANT FILLS]** require external expertise before any submission.
>
> **Scope:** Plan 6.6 Phase I deliverable per [PROMPTS_PLAN_6.6.md](../PROMPTS_PLAN_6.6.md#phase-i--cdsco-regulatory-pathway-docs). Authoring the framework + everything we know from the working tree + flagging what the consultant resolves.

---

## §1 · Why we're going through CDSCO

ASHA-AI is a **Software as a Medical Device (SaMD)** under India's [Medical Devices Rules 2017](https://cdsco.gov.in/opencms/opencms/en/Medical-Device-Diagnostics/Medical-Device-Diagnostics/) (G.S.R. 78(E), amended through 2022) and its CDSCO classification framework. The app:

- Recommends one of three care levels: `Home Care` / `Clinic Visit` / `Emergency Room`
- Operates as **decision support** per [India's Telemedicine Practice Guidelines 2020](https://www.mohfw.gov.in/pdf/Telemedicine.pdf) — it does NOT diagnose or prescribe
- Is intended for use by laypeople (patients) and by frontline health workers (ASHA / CHWs)
- Stores health data per [DPDP Act 2023](https://www.meity.gov.in/data-protection-framework) (see [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md))

The Indian SaMD pathway distinguishes 4 risk classes (A–D). ASHA-AI's intended use places it in **Class B** (low-moderate risk) by our reading — see §2.

---

## §2 · Risk classification

### §2.1 · Provisional classification

Per the **IMDRF SaMD Risk Categorization** framework (which CDSCO largely mirrors via the 2022 amendment):

| Axis | Value | Justification |
|---|---|---|
| Healthcare situation/condition | **Non-serious / serious** (mixed) | Bulk of usage is mild self-managed conditions (`Home Care`); a subset is `Emergency Room` escalation |
| State of healthcare information | **Inform** clinical management | The app informs the patient's care-seeking decision; it does NOT drive clinical management directly |
| IMDRF risk category | **II.i** (drive / inform clinical management of non-serious) intersecting **III.i** (inform on serious) | Net classification ≈ **CDSCO Class B** |

**[CONSULTANT FILLS]** — Provisional only. Consultant must validate against the latest CDSCO classification list and confirm Class B vs Class C. If any output is interpreted as "diagnostic" rather than "advisory", classification could escalate to Class C.

### §2.2 · What protects us in Class B (not Class C)

1. **No diagnosis** — the app never returns an ICD-10 code as the verdict. Care-level strings are the only output.
2. **No prescription** — the app refuses any drug-dosing query and routes to a doctor (`backend/app/nlp/safety_refusals.py`).
3. **Disclaimer on every screen** — *"This is not a replacement for professional medical diagnosis."*
4. **Telemedicine Practice Guidelines 2020 compliance** — AI assists, the licensed practitioner (or eventual practitioner) decides.
5. **Red-flag escalation** — high-acuity cases route to `Emergency Room` with `call 108` — the app explicitly hands off to in-person emergency care.

### §2.3 · Predicate / substantial-equivalence search

| Comparator | Indian regulatory status | Our position |
|---|---|---|
| Practo (Search/Search Bot) | Operating without explicit SaMD registration; consultative-only | Predicate for advisory pathway |
| Tata 1mg symptom checker | Same | Same |
| eSanjeevani | Government-operated telemedicine platform | Not a 1:1 predicate (we're SaMD, they're a service) |
| Ada Health (global; some Indian users) | CE Class IIa in EU; not registered in India | Useful design predicate, not regulatory |
| Infermedica (B2B) | Not registered in India | Same |

**[CONSULTANT FILLS]** — Confirm whether any substantially-equivalent device exists in CDSCO's Notified Bodies list to support a 510(k)-style equivalence claim.

---

## §3 · Submission strategy + timeline

### §3.1 · Pre-submission (Months 0–2)

| Month | Milestone | Owner |
|---|---|---|
| 0 | Engage CDSCO consultant; sign NDA + scope-of-work | User + consultant |
| 0 | Provisional classification confirmed (§2.1) | Consultant |
| 1 | This doc (`CDSCO_PATHWAY.md`) reviewed end-to-end + corrections applied | Consultant |
| 1 | [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) reviewed | Consultant |
| 2 | Pre-submission meeting with CDSCO (optional but recommended) | Consultant leads |

### §3.2 · Submission (Months 3–6)

| Month | Deliverable | Status as of Plan 6.6 |
|---|---|---|
| 3 | Form MD-3 (Application for Import + Manufacture License — Class B) | **[CONSULTANT FILLS]** |
| 3 | Device Master File (DMF) | Builds on [ARCHITECTURE.md](../ARCHITECTURE.md) + this directory |
| 3 | Risk Management File per ISO 14971 | [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) ← engineering draft |
| 3 | Clinical Evaluation Report | [CLINICAL_EVALUATION_PLAN.md](CLINICAL_EVALUATION_PLAN.md) ← evidence framework |
| 4 | Quality Management System certificate (ISO 13485) | [QUALITY_MANAGEMENT_SYSTEM.md](QUALITY_MANAGEMENT_SYSTEM.md) ← process docs · external certification is a separate ~6mo path |
| 4 | Post-Market Surveillance Plan | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) |
| 5 | CDSCO submission via SUGAM portal | **[CONSULTANT FILLS]** |
| 6 | Initial CDSCO review feedback | (gov't timeline) |

### §3.3 · Post-submission (Months 6–18)

- **[CONSULTANT FILLS]** — CDSCO review iteration timeline. Typical Class B SaMD review: 6–18 months end-to-end. We do NOT block product launch on this — Tier 6.6 ships v2.1 RC under the **soft-launch / pilot evidence** posture per Telemedicine 2020 advisory framing, with full marketing licence approval as a follow-up.

---

## §4 · The "pre-approval launch" posture

> **Critical legal position:** We are launching v2.1 RC as **decision-support advisory** under Telemedicine Practice Guidelines 2020 — NOT as a CDSCO-approved SaMD. The pilot evidence we collect (per [PROMPTS_PLAN_6.6.md Phase J](../PROMPTS_PLAN_6.6.md#phase-j--soft-launch-3-pilot-chws)) becomes part of the CDSCO submission.
>
> **[CONSULTANT FILLS]** — Validate that this advisory posture is legally defensible pre-CDSCO-approval. The framework rests on:
>
> 1. Disclaimer on every screen ("not a replacement for professional medical diagnosis")
> 2. No prescriptive output (no drug names, no dosing)
> 3. Always-on red-flag escalation to in-person care
> 4. Audit trail per [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md)
> 5. Voluntary, opt-in usage (consent flow per [MOBILE_CONSENT.md](../MOBILE_CONSENT.md))
> 6. DPDP compliance for personal data

If the consultant flags this posture as too aggressive, the fallback is to register as a "non-medical wellness app" until CDSCO approval lands — which is a strictly weaker positioning that some competitors use.

---

## §5 · Class B substantive requirements (engineering-side checklist)

Per CDSCO MDR 2017 Schedule II:

| Requirement | Engineering deliverable | Status |
|---|---|---|
| Device identification & specification | [ARCHITECTURE.md](../ARCHITECTURE.md) §1 + version history | ✅ done |
| Intended use statement | This doc §1 | ✅ draft |
| Risk analysis per ISO 14971 | [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) | ✅ draft |
| Verification & validation | [METHODOLOGY.md §P4.5](../METHODOLOGY.md#p45-plan-20--30--40-comparison-measured-2026-05-15) + §P6 (when Tier 6.5 ships) | ✅ partial (P4.5 done · P6 pending Tier 6.5) |
| Clinical evaluation | [CLINICAL_EVALUATION_PLAN.md](CLINICAL_EVALUATION_PLAN.md) + MBBS sign-offs | ✅ framework drafted |
| Labeling | Disclaimer + care-level strings + consent screen | ✅ done |
| QMS conformance (ISO 13485) | [QUALITY_MANAGEMENT_SYSTEM.md](QUALITY_MANAGEMENT_SYSTEM.md) — **process docs only** | ✅ draft (external cert is separate ~6mo path) |
| Cybersecurity | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) §3 | ✅ draft |
| Post-market surveillance | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) | ✅ draft |
| Adverse event reporting | Same doc §4 | ✅ draft |

---

## §6 · Open questions for consultant

The following are decisions we cannot make engineering-side:

1. **Class B vs Class C?** Provisional Class B per §2.1 — consultant to confirm or escalate.
2. **Predicate device strategy?** §2.3 — confirm whether any Indian SaMD predicate exists.
3. **Pre-submission meeting with CDSCO?** Optional; recommended for novel architectures (we're agentic LLM + on-device — somewhat novel).
4. **Form MD-3 vs Form MD-26?** MD-3 is Import + Manufacture; MD-26 is for indigenous manufacture only. We're indigenous — but consultant confirms.
5. **Notified Body involvement?** Class B may require a Notified Body for QMS audit; consultant scopes.
6. **State License vs Central License?** SaMD typically Central — but consultant confirms based on intended geographic distribution.
7. **Pre-approval marketing posture (§4)?** Defensibility of Telemedicine 2020 advisory framing.

---

## §7 · Plan D — if CDSCO pathway is unworkable

If the consultant concludes Class C is the actual classification (12–18+ months and notified-body required):

| Plan D measure | Effect |
|---|---|
| Register as "general health information / wellness app" (no SaMD claim) | Avoid CDSCO entirely; lose ability to claim clinical accuracy in marketing |
| Operate only via partnerships with already-registered telemedicine platforms (eSanjeevani / Tata 1mg / Practo) | Inherit their regulatory umbrella; lose direct B2C |
| Move to LMIC-only pilot under research-ethics committee review | Stay clinical but defer commercialization |

These are strictly weaker positions. They preserve the technology + the pilot but defer commercial scale. Plan A (Class B SaMD via CDSCO) is the primary; Plan D exists so we don't ship blocked.

---

## §8 · Cross-references

- [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) — ISO 14971 hazard analysis
- [CLINICAL_EVALUATION_PLAN.md](CLINICAL_EVALUATION_PLAN.md) — clinical evidence framework
- [QUALITY_MANAGEMENT_SYSTEM.md](QUALITY_MANAGEMENT_SYSTEM.md) — ISO 13485 process docs
- [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) — PMS + AE reporting + drift monitoring
- [METHODOLOGY.md](../METHODOLOGY.md) §P4.5 — Plan 4.0 measured numbers
- [MOBILE_CONSENT.md](../MOBILE_CONSENT.md) — DPDP consent copy
- [PROMPTS_PLAN_6.6.md](../PROMPTS_PLAN_6.6.md) Phase I — the Tier 6.6 work this doc operationalizes
- [PENDING_USER_ACTIONS.md](../PENDING_USER_ACTIONS.md) — CDSCO consultant engagement entry

---

## §9 · Version + sign-off

| Version | Date | Author | Reviewer | Change |
|---|---|---|---|---|
| **0.1 draft** | 2026-05-15 | Role D (engineering) | (pending consultant) | Initial framework + open-questions list + plan-D |

**Final approval before submission requires** consultant sign-off + at least one round of CDSCO pre-submission feedback (if meeting held).
