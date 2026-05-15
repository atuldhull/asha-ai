# Quality Management System — ASHA-AI v2.1 RC

> **Status:** Engineering-side **process docs only**. **NOT an ISO 13485 certification.** Full certification is a separate ~6-month path with a Notified Body audit — that's a [PENDING_USER_ACTIONS](../PENDING_USER_ACTIONS.md) item. This doc captures the QMS processes already running in the working tree so the consultant has a substantive baseline to start the formal certification from.
>
> **Scope:** ISO 13485:2016 process documentation for the CDSCO submission's QMS-conformance check (per [CDSCO_PATHWAY.md §5](CDSCO_PATHWAY.md#5--class-b-substantive-requirements-engineering-side-checklist)). Sections marked **[CONSULTANT FILLS]** require external audit + sign-off.

---

## §1 · Scope of the QMS

| Aspect | Scope |
|---|---|
| Products covered | ASHA-AI v2.1 RC (web app + Android mobile app + backend + ML pipeline) |
| Sites covered | Engineering operations: development repo at `d:\hack` · CI/CD via GitHub Actions · cloud infra on Vercel + Render + Supabase Mumbai · MinIO file store (post-6.6) |
| Excluded | Hardware manufacturing (n/a — software-only) · sterile-process controls (n/a) |
| Conformance target | ISO 13485:2016 (Indian SaMD context) |
| Applicable regulatory framework | India Medical Devices Rules 2017 · Telemedicine Practice Guidelines 2020 · DPDP Act 2023 |

---

## §2 · Process inventory

The QMS is built from processes already running. Each row maps an ISO 13485 clause to the existing artifact + the file/path that operationalizes it.

| ISO 13485 clause | Process | Artifact in repo | Status |
|---|---|---|---|
| 4.1 General requirements | QMS scope (this doc) | `docs/regulatory/QUALITY_MANAGEMENT_SYSTEM.md` | ✅ this draft |
| 4.2 Documentation requirements | Doc-versioning · git history · `INDEX.md` as living catalog | `git log` + [INDEX.md](../INDEX.md) | ✅ |
| 5.1 Management commitment | Tech-lead sign-off on each tier release; pilot management = Role A (eng lead) | [ROLES.md](../ROLES.md) | ✅ |
| 5.2 Customer focus | Pilot evidence collection · NPS survey | [PROMPTS_PLAN_6.6.md Phase J](../PROMPTS_PLAN_6.6.md#phase-j--soft-launch-3-pilot-chws) | ⏳ pending Tier 6.6 |
| 5.4 Quality policy | "We never regress the 100% ER-recall floor · we never paraphrase care-level strings · we always render the disclaimer" | All checklists encode this | ✅ |
| 6.1 Resources | Compute: Render + Vercel + Supabase · Human: 4-role engineering split (A/B/C/D — Plan 1–5.x) collapsing to single-window for Plan 6.x | [ROLES.md](../ROLES.md) + [PLAN_6.0.md](../PLAN_6.0.md) §3 | ✅ |
| 6.3 Infrastructure | `infra/docker-compose.prod.yml` (Tier 6.6 Phase D) · Traefik + SSL · Alembic migrations | [PROMPTS_PLAN_6.6.md Phase D](../PROMPTS_PLAN_6.6.md#phase-d--infra-docker-compose--alembic--minio--traefik) | ⏳ Tier 6.6 |
| 6.4 Work environment | Engineering-only — software | n/a | ✅ |
| 7.1 Planning of product realization | The Plan 1.0 → 6.6 ladder · per-tier prompts + checklists | [PLAN.md](../../PLAN.md) + per-tier docs | ✅ |
| 7.2 Customer-related processes | Patient consent flow ([MOBILE_CONSENT.md](../MOBILE_CONSENT.md)) + disclaimer on every screen | ✅ Plan 4.0 + 6.4 | ✅ |
| 7.3 Design + development | Each tier has: spec doc · prompt doc · acceptance gate · integration verifier · pitch deck slide | All `PROMPTS_PLAN_*.md` + `checklists/PLAN_*_SUBMISSION.md` + `INTEGRATION_*.md` | ✅ |
| 7.3.2 Design + development inputs | [PLAN.md](../../PLAN.md) + [FRONTEND_BLUEPRINT.md](../FRONTEND_BLUEPRINT.md) + [ARCHITECTURE.md](../ARCHITECTURE.md) | ✅ |
| 7.3.3 Design + development outputs | Per-tier acceptance gate + integration verifier docs | ✅ |
| 7.3.4 Design + development review | Per-tier acceptance gate runs · MBBS reviews | ✅ ongoing |
| 7.3.5 Design + development verification | Test suites: backend pytest · frontend jest · ML run_eval.py | `cd backend && py -m pytest` + `cd ml && py run_eval.py` | ✅ |
| 7.3.6 Design + development validation | [CLINICAL_EVALUATION_PLAN.md](CLINICAL_EVALUATION_PLAN.md) · pilot evidence | ✅ framework · pilot pending |
| 7.3.7 Design + development changes | Per-tier `PROMPTS_PLAN_*.md` + Phase-D doc updates · METHODOLOGY co-edit discipline | ✅ |
| 7.4 Purchasing | LLM provider (Together AI · Gemini) · Bhashini · Mapbox · Ably · MSG91 · Razorpay · ABDM | [PENDING_USER_ACTIONS.md](../PENDING_USER_ACTIONS.md) tracks credentials | ✅ |
| 7.5 Production + service provision | CI/CD via GitHub Actions (Tier 6.6 Phase G) · release tags · soft-launch posture | ⏳ Tier 6.6 |
| 7.5.6 Validation of processes | Test gates run on every release | ✅ |
| 7.5.8 Identification | Audit log per session: `model_version` + `git_sha` + `consent_version` | [POST_MARKET_SURVEILLANCE_PLAN.md §3](POST_MARKET_SURVEILLANCE_PLAN.md) | ✅ |
| 7.5.9 Traceability | Same audit log + this QMS doc's RCM traceability ([RISK_MANAGEMENT_FILE.md §3](RISK_MANAGEMENT_FILE.md#3--risk-control-measures-rcms--traceability-to-code)) | ✅ |
| 7.6 Control of monitoring + measuring equipment | n/a (software-only) | ✅ |
| 8.1 General (measurement) | Per-release eval suite · Prometheus + Grafana | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) | ✅ pre-6.6 partial · 6.6 full |
| 8.2.1 Feedback (customer) | NPS · pilot surveys · in-app feedback (post-6.6 add) | ⏳ Tier 6.6+ |
| 8.2.2 Complaint handling | DPDP grievance email + AE reporting per [RISK_MANAGEMENT_FILE.md §7](RISK_MANAGEMENT_FILE.md#7--adverse-event-reporting-ae) | ✅ |
| 8.2.3 Reporting to regulatory authorities | CDSCO MDR 2017 Rule 65 AE timeline | **[CONSULTANT FILLS]** |
| 8.2.4 Internal audit | Quarterly: re-run all acceptance gates · doc-drift review · `INDEX.md` reconciliation | ⏳ post-launch |
| 8.2.5 Monitoring + measurement of processes | EvidentlyAI drift monitor · Sentry · Prometheus | [POST_MARKET_SURVEILLANCE_PLAN.md §2](POST_MARKET_SURVEILLANCE_PLAN.md) | ⏳ Tier 6.6 |
| 8.2.6 Monitoring + measurement of product | Per-release eval rerun · 100% ER recall floor enforced | ✅ |
| 8.3 Control of nonconforming product | Feature flags · component rollback procedures per each tier's INTEGRATION doc | All `INTEGRATION_*.md` Rollback sections | ✅ |
| 8.4 Analysis of data | Monthly drift review · quarterly MBBS audit | ⏳ post-launch |
| 8.5 Improvement | Per-tier carry-forward · POST_MARKET_SURVEILLANCE_PLAN feedback loop | ✅ ongoing |
| 8.5.2 Corrective action | Per-incident: root-cause → fix → eval rerun → re-deploy | ✅ |
| 8.5.3 Preventive action | Pre-release eval + adversarial + safety suites · regression test gating | ✅ |

---

## §3 · Document control

### §3.1 · Versioning convention

| Artifact type | Versioning | Where |
|---|---|---|
| Engineering docs (this `docs/` tree) | Per-doc front-matter version + changelog | `## §X · Version + sign-off` in each doc |
| Code | Semantic versioning + git tag (per release) | `package.json` + git tags |
| Models | Hugging Face repo with explicit version-pinned URLs | `backend/app/llm/*.py` + `apps/mobile/inference/llm.ts` |
| Eval cases | `EVAL_CASES.csv` versioned in git; freezes documented in METHODOLOGY § anchors | [METHODOLOGY.md](../METHODOLOGY.md) |
| Consent copy | Versioned per `consent_log.consent_version` column ([MOBILE_CONSENT.md §4](../MOBILE_CONSENT.md)) | DB schema |

### §3.2 · Master doc list (controlled documents)

| Document | Path | Current version |
|---|---|---|
| Plan / Strategy | [PLAN.md](../../PLAN.md) | git HEAD |
| Plan 6.0 ladder | [PLAN_6.0.md](../PLAN_6.0.md) | revised 2026-05-15 |
| Frontend engineering spec | [FRONTEND_BLUEPRINT.md](../FRONTEND_BLUEPRINT.md) | git HEAD |
| System architecture | [ARCHITECTURE.md](../ARCHITECTURE.md) | §0.95–§0.98 added 2026-05-15 |
| Methodology + eval results | [METHODOLOGY.md](../METHODOLOGY.md) | §P4.5 frozen (co-edited) |
| Risk management | [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) | v0.1 draft |
| Clinical evaluation | [CLINICAL_EVALUATION_PLAN.md](CLINICAL_EVALUATION_PLAN.md) | v0.1 draft |
| CDSCO pathway | [CDSCO_PATHWAY.md](CDSCO_PATHWAY.md) | v0.1 draft |
| Post-market surveillance | [POST_MARKET_SURVEILLANCE_PLAN.md](POST_MARKET_SURVEILLANCE_PLAN.md) | v0.1 draft |
| Mobile consent | [MOBILE_CONSENT.md](../MOBILE_CONSENT.md) | v1.0 draft (HI/KN pending) |
| 9 red-flag rules | [RED_FLAGS.md](../RED_FLAGS.md) | locked Plan 2.0 |
| Eval spec | [EVAL_SPEC.md](../EVAL_SPEC.md) | locked Plan 2.0 |
| Adversarial demo | [ADVERSARIAL_DEMO.md](../ADVERSARIAL_DEMO.md) | locked Plan 4.0 |
| MBBS review protocols | [MBBS_TRACKER.md](../MBBS_TRACKER.md) | Plan 4.0 + Tier 6.1 sections |
| QA war-game | [QA_WAR_GAME.md](../QA_WAR_GAME.md) | Q1–Q43 (Plan 1–6.6) |

---

## §4 · Change control

For any change to a controlled doc:

1. **Pull request** with the proposed change.
2. **Reviewer**: at minimum the Role-D agent (engineering-side); for clinical content, an MBBS reviewer.
3. **Acceptance gate**: relevant per-tier checklist re-run for any code-affecting change.
4. **Eval regression**: full backend + ml suite re-run for any ML / pipeline change.
5. **Audit log**: `audit_log.model_version` + `git_sha` columns capture per-session what version produced the verdict.
6. **Communication**: changelog entry in the affected doc; `INDEX.md` Status section updated.

**[CONSULTANT FILLS]** — Confirm whether ISO 13485:2016 requires a separate Change Control Board (CCB) or whether this PR-based process is acceptable for a Class B SaMD scope.

---

## §5 · Training + competency

| Role | Training requirements | Documentation |
|---|---|---|
| Engineering team (Role A/B/C/D) | India Telemedicine 2020 + DPDP basics + this QMS overview | Onboarding doc (PENDING_USER_ACTIONS) |
| MBBS reviewer | Familiarity with WHO IMCI · ESI v5 · the eval review protocol in MBBS_TRACKER | Per-engagement briefing |
| Pilot CHWs | 30-min screen-share onboarding per [PROMPTS_PLAN_6.6.md Phase J](../PROMPTS_PLAN_6.6.md#phase-j--soft-launch-3-pilot-chws) | Onboarding session recording |
| Regulatory consultant | (external) | NDA + scope-of-work |
| Legal counsel | (external) — DPDP-qualified Indian practice | NDA + scope-of-work |

**[CONSULTANT FILLS]** — Confirm training-record format expected by Notified Body.

---

## §6 · Internal audit schedule

Once v2.1 RC launches, the QMS runs the following internal audits:

| Audit | Frequency | Owner |
|---|---|---|
| Doc-drift review (controlled docs vs working tree) | Monthly | Role D |
| Acceptance-gate rerun (all 6 Plan 6.x gates) | Per-release | Engineering |
| Eval suite rerun (Plan 4.0 + 5.x + 6.5 §P6) | Per-release | Role C / ML |
| AE backlog review | Monthly | (eventual) regulatory affairs lead |
| DPDP grievance + access-request log | Monthly | Same |
| Pilot data review (until pilot ends) | Weekly | Role D + MBBS |

---

## §7 · Gap analysis vs full ISO 13485 certification

Items still pending for full certification (NOT blocking soft launch under Telemedicine 2020 advisory framing):

| Gap | Effort | Owner |
|---|---|---|
| Notified Body engagement | 2–3 months | PENDING_USER_ACTIONS |
| Formal QMS audit | 1 month | Notified Body |
| Management Review records (formal sign-off cadence) | Ongoing | Tech lead |
| CAPA (Corrective and Preventive Action) system formalization | 1 month | **[CONSULTANT FILLS]** |
| Supplier-qualification records for Together AI / Mapbox / etc. | 2 weeks | Role A (procurement) |
| Software-of-Unknown-Provenance (SOUP) inventory per IEC 62304 | 2 weeks | Role A |
| Software safety classification per IEC 62304 (Class A/B/C — different from CDSCO class) | 1 week | **[CONSULTANT FILLS]** + Role A |
| Formal training records | 2 weeks | Engineering lead |

---

## §8 · Version + sign-off

| Version | Date | Author | Reviewer | Change |
|---|---|---|---|---|
| **0.1 draft** | 2026-05-15 | Role D | (pending consultant) | Initial process docs mapping existing artifacts to ISO 13485 clauses |
