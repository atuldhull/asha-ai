# Post-Market Surveillance Plan — ASHA-AI v2.1 RC

> **Status:** Engineering-side draft per CDSCO MDR 2017 + ISO 14971 + IMDRF SaMD N32 guidance. Sections marked **[CONSULTANT FILLS]** require regulatory sign-off before any submission.
>
> **Scope:** PMS — proactive + reactive monitoring after v2.1 RC ships. Operationalizes [RISK_MANAGEMENT_FILE.md §6](RISK_MANAGEMENT_FILE.md#6--risk-management-plan--lifecycle) + §7 (AE reporting). Wires the monitoring stack landed in [PROMPTS_PLAN_6.6.md Phase F](../PROMPTS_PLAN_6.6.md#phase-f--monitoring--observability-prometheus--grafana--evidentlyai--sentry) to the regulatory framework.

---

## §1 · Surveillance objectives

| Objective | What we measure | Threshold |
|---|---|---|
| Maintain 100% ER recall floor | Per-session: was an Emergency Room verdict assigned when red-flag rules said it should be? | 100% (any miss = release-blocking AE) |
| Detect model drift | EvidentlyAI on triage-distribution + risk-score distribution per district | Alert on > 10% shift in any per-class share |
| Detect adversarial-attack patterns | Sentry tags on safety_refusals firings | Alert on > 100 refusals/day (jailbreak attempt cluster) |
| Catch UI/UX regressions | Lighthouse CI on every release | A11y ≥ 95 · LCP ≤ 2.5s on emulated entry Android |
| Detect cost / latency anomalies | Prometheus on LLM provider latency + cost | Alert on p95 > 4.5s OR daily spend > 2× rolling 7d average |
| Catch DPDP violations | grep-audit on logs + PII-detection on Sentry payloads | Alert on any PHI pattern in log output |
| User-reported harm | Sentry user-feedback + DPDP grievance email | Acknowledged within 24h; investigated within 72h |

---

## §2 · Monitoring stack (post-Tier-6.6)

```
                  RUNTIME EVENTS
                       │
   ┌───────────────────┼───────────────────┐
   ▼                   ▼                   ▼
┌────────┐       ┌──────────┐       ┌──────────┐
│ Sentry │       │Prometheus│       │EvidentlyAI│
│ (errors│       │ + Grafana│       │ (drift   │
│  + PHI │       │ (metrics │       │ detect)  │
│  scrub)│       │  +dashes)│       │           │
└────┬───┘       └─────┬────┘       └─────┬────┘
     │                 │                  │
     │                 │                  │
     └────────┬────────┴─────────┬────────┘
              │                  │
              ▼                  ▼
     ┌──────────────┐   ┌──────────────────┐
     │ PagerDuty    │   │ Monthly PMS       │
     │  (P0/P1      │   │  review meeting   │
     │  incidents)  │   │  (Role D + MBBS   │
     │              │   │   + tech lead)    │
     └──────────────┘   └──────────────────┘
```

### §2.1 · Sentry configuration (Tier 6.6 Phase F)

- **PHI scrub** at SDK level — `before_send` hook removes patterns matching:
  - Phone numbers (`\d{10}` Indian format + `+91` prefix)
  - Email addresses
  - ABHA Health IDs (14-digit format)
  - Aadhaar numbers (12-digit format)
  - Patient-supplied free-text symptoms (replaced with `[SYMPTOM_TEXT_SCRUBBED]` token; the audit log retains the original on-server)
- **Tags**: `tier` (4.0 / 5.1 / 6.x) · `model_version` · `git_sha` · `language` · `device_class` · `consent_version`
- **Alerting**: P0 alerts (any 5xx > 1% of requests for 5min · ER-recall regression detected) page on-call via PagerDuty

### §2.2 · Prometheus + Grafana dashboards

| Dashboard | Metrics tracked | Refresh |
|---|---|---|
| Triage-pipeline latency | p50 · p95 · p99 of `/api/triage` end-to-end | 30s |
| LLM provider health | Per-provider error rate + token cost + per-1k-query spend | 30s |
| Voice STT WER (sampled) | Daily aggregate of confidence-low transcriptions | 1h |
| Care-level distribution | % Home Care / Clinic Visit / Emergency Room per day | 1h |
| Risk-score distribution | Histogram of Plan 5.1 risk scores | 1h |
| Outbreak cluster count | HDBSCAN cluster output cardinality | 1h |
| DPDP audit log | Consent acceptances · deletion requests · access requests per day | 1h |
| Mobile sync queue | Backlog depth + sync success rate | 5min |

### §2.3 · EvidentlyAI drift detection (Celery-scheduled task)

Runs daily at 03:00 IST. Compares the previous 24h triage distribution against the rolling-30d baseline:

| Metric | Drift threshold | Action on exceed |
|---|---|---|
| Per-class share (Home Care / Clinic / ER) | ±10pp | P1 alert · MBBS review |
| Average risk score | ±5 points | P2 alert · investigate |
| Adversarial-flag firing rate | +50% | P1 alert · jailbreak investigation |
| Refusal rate | +30% | P2 alert · check for adversarial cluster |
| Language distribution | ±15pp | P3 alert · check for systematic NLP regression |

---

## §3 · Audit trail (per-session evidence record)

Every triage session writes a non-deletable row to `audit_log`:

```
audit_log:
  id              uuid PRIMARY KEY
  session_id      uuid NOT NULL
  user_id         uuid NULL    -- nullable for anonymous /triage
  action          text NOT NULL -- "triage" | "consent" | "deletion_request" | "vision_triage" | "admin_query"
  timestamp       timestamptz NOT NULL DEFAULT now()
  language        text NOT NULL
  device_class    text NULL
  model_version   text NOT NULL -- model identifier (e.g. "llama3.3-70b-q4-together-2026-06")
  git_sha         text NOT NULL -- backend git SHA at deploy time
  pipeline        text NOT NULL -- "langgraph" | "legacy"
  rag_flags       jsonb NOT NULL -- {"hyde": true, "rerank": true, "vision": false}
  red_flag_fired  text NULL    -- R-code (R1..R9) if any
  esi_level       int NULL     -- 1..5
  imci_route      text NULL    -- "under_5" | "adult" | null
  care_level      text NOT NULL -- exact: "Home Care" | "Clinic Visit" | "Emergency Room"
  risk_score      int NULL     -- 0..100 (Plan 5.1)
  risk_level      text NULL    -- "LOW" | "MODERATE" | "HIGH" | "CRITICAL"
  trajectory      text NULL    -- "improving" | "stable" | "worsening" | "rapidly_worsening" | "insufficient_data"
  payload_hash    text NOT NULL -- SHA-256 of the input payload (no raw PHI in this table)
  consent_version text NOT NULL -- references consent_log
  retention_class text NOT NULL -- "transient" | "12_month" | "permanent"
```

**Properties:**

- Non-deletable — no DELETE permission; only INSERT and SELECT for the application user.
- Tamper-evident — daily integrity check via a CI job that hashes the prior day's rows and stores the hash externally.
- Queryable for AE investigation — `select * from audit_log where session_id = ?` returns the complete reconstruction.
- DPDP-compliant — the `payload_hash` lets us prove what was triaged without storing PHI in this table; raw payload lives in the encrypted session store with retention TTL.

---

## §4 · Adverse-event reporting (AE)

Recap from [RISK_MANAGEMENT_FILE.md §7](RISK_MANAGEMENT_FILE.md#7--adverse-event-reporting-ae):

### §4.1 · AE categories + reporting timeline

| Category | Examples | Severity threshold | Reporting timeline (CDSCO MDR 2017 Rule 65) |
|---|---|---|---|
| Death / serious injury | Patient triaged `Home Care` had cardiac event within 24h | Single event | **24 hours** to CDSCO |
| Serious public health risk | Cluster of missed emergencies (same condition class) | ≥ 3 events in 7 days | **24 hours** |
| Anticipated AE | Bias-related under-triage of a subgroup | Statistical | **15 days** trend report |
| Field Safety Corrective Action (FSCA) | Critical bug → forced app update | Per incident | **24 hours** notification to all affected users + CDSCO |
| Other reportable | UX-related harm without clinical consequence | Per investigation | **30 days** |

**[CONSULTANT FILLS]** — Validate exact timelines against the latest CDSCO MDR amendment.

### §4.2 · AE intake channels

1. **DPDP grievance email** — `privacy@asha-ai.in` (or production replacement)
2. **In-app feedback** (post-6.6.x add)
3. **Sentry user-reported errors** with severity tags
4. **CHW pilot daily-standup feedback** (during Tier 6.6 Phase J pilot)
5. **MBBS reviewer audit findings** (quarterly random-sample audits)
6. **Internal incident** — engineer files AE via internal form

### §4.3 · AE investigation workflow

1. Intake → AE ticket created in tracking system (PENDING_USER_ACTIONS: confirm Linear / Jira / GitHub Issues use)
2. **Acknowledge within 24h** to reporter
3. Reproduce on staging where possible — pull `audit_log` row for the session
4. **Root cause** + classify severity per §4.1
5. **Corrective action** — code fix · eval regression rerun · rollback if needed
6. **Preventive action** — new eval case added · new RCM added to [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md)
7. **Report** — CDSCO per §4.1 timeline
8. **Close** — AE ticket with full disposition + lessons-learned doc

### §4.4 · Field Safety Corrective Action (FSCA) — emergency procedure

If a P0 incident is identified (e.g., a deployed model is missing emergencies):

1. **Halt deployments** — block GitHub Actions auto-deploy
2. **Feature-flag rollback** — flip the affected component's flag to its prior state (per each tier's INTEGRATION doc Rollback section)
3. **Cloud-cache invalidation** — force-refresh model manifests to push updated edge models
4. **Push notification** — via FCM to all installed mobile users with "Update available — required for safety" framing
5. **Internal incident commander** — Role A or tech lead
6. **CDSCO notification** within 24h
7. **Public disclosure** if patient-facing impact — within timeline per consultant guidance

---

## §5 · Periodic safety update report (PSUR)

CDSCO MDR 2017 requires periodic safety reports. Cadence varies by class; provisional plan:

| Report | Cadence | Contents |
|---|---|---|
| Monthly drift + ops review | Internal — monthly | Drift alerts · Sentry top-10 · pilot extension data · acceptance-gate reruns |
| Quarterly clinical audit | Internal + MBBS — quarterly | Random-sample MBBS audit of 50 triage decisions across 3 languages; deviations flagged |
| Annual PSUR (full) | External — yearly to CDSCO | Aggregated AE counts · drift summary · clinical-evidence updates · post-launch claims · risk-file revision |

**[CONSULTANT FILLS]** — Confirm PSUR cadence + format per current CDSCO requirements (Class B SaMD).

---

## §6 · Cybersecurity surveillance

| Concern | Monitoring | Response |
|---|---|---|
| Prompt-injection / jailbreak attempts | Sentry tag on `safety_refusals` firings · daily aggregate | P1 alert on > 100/day; investigate IP pattern |
| Credential abuse | Backend rate-limit logs · admin login anomalies | P2 alert; rotate keys if breach suspected |
| DDoS / load spike | Prometheus latency p95 + Cloudflare/Traefik metrics | Auto-scaling (Tier 6.6) + manual escalation |
| Supply-chain compromise | Dependabot + npm audit + pip-audit on CI | Block merge on critical CVE in production dep |
| LLM provider compromise | Same `safety_refusals` rate spike pattern | Switch `LLM_PROVIDER` env var (Tier 6.5 rollback) |
| Model artifact integrity | Hugging Face GGUF sha256 verified at install | Reject install on mismatch; force re-download from manifest |
| On-device data exfiltration | Expo per-app sandbox + app-store review process | Standard Android security |

---

## §7 · Post-launch enhancements + lifecycle planning

Per ISO 14971 §10:

1. **Continuous learning loop** — every AE that produces a CAPA gets a new eval case added to `EVAL_CASES.csv` (and the per-tier eval extensions). Enforces no-regression by construction.
2. **Periodic model refresh** — Llama 3.3 / Gemini / Bhashini provider updates require eval rerun + drift comparison before deployment.
3. **End-of-life planning** — when a major model is deprecated (e.g., Llama 3.3 → 4.0): give patients a 60-day notice, migrate to the new model with overlap period, document the transition in METHODOLOGY (new § entry, NOT overwriting old).
4. **Pilot expansion** — 3-CHW pilot → 30-CHW Phase 2 → state-level rollout. Each expansion is gated on the prior phase clearing its acceptance + zero P0/P1 AE.

---

## §8 · Roles + responsibilities

| Role | PMS responsibility |
|---|---|
| Engineering lead (Role A) | FSCA execution · CI/CD enforcement · feature-flag rollback |
| Backend lead (Role B) | Audit-log integrity · API latency monitoring · cost dashboards |
| ML lead (Role C) | Eval rerun · drift investigation · model refresh planning |
| Docs / regulatory (Role D) | AE intake routing · CDSCO reports · PSUR authorship · MBBS audit coordination |
| MBBS reviewer (external) | Quarterly clinical audits · AE clinical-severity classification |
| Regulatory consultant (external) | CDSCO interaction · PSUR review · classification updates |
| Legal counsel (external) | DPDP grievance escalations · FSCA public disclosure language |

---

## §9 · Cross-references

- [CDSCO_PATHWAY.md](CDSCO_PATHWAY.md) — regulatory context this PMS supports
- [RISK_MANAGEMENT_FILE.md](RISK_MANAGEMENT_FILE.md) — hazard list informing PMS thresholds
- [CLINICAL_EVALUATION_PLAN.md](CLINICAL_EVALUATION_PLAN.md) §5.4 — post-launch clinical surveillance ties here
- [QUALITY_MANAGEMENT_SYSTEM.md §2](QUALITY_MANAGEMENT_SYSTEM.md#2--process-inventory) — ISO 13485 clauses 8.x mapped to this doc
- [PROMPTS_PLAN_6.6.md Phase F](../PROMPTS_PLAN_6.6.md#phase-f--monitoring--observability-prometheus--grafana--evidentlyai--sentry) — Tier 6.6 monitoring deployment
- [MOBILE_CONSENT.md §4](../MOBILE_CONSENT.md) — `consent_log` schema cross-referenced in §3

---

## §10 · Version + sign-off

| Version | Date | Author | Reviewer | Change |
|---|---|---|---|---|
| **0.1 draft** | 2026-05-15 | Role D | (pending consultant + legal counsel) | Initial draft wiring Tier 6.6 Phase F monitoring stack to CDSCO PMS requirements |
