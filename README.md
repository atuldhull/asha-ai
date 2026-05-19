# ASHA-AI

> **Voice-first, multilingual clinical triage decision-support for rural India.**
> Maps a patient's symptoms to one of three care levels — `Home Care` · `Clinic Visit` · `Emergency Room` — using the Emergency Severity Index (ESI v5) protocol with a deterministic safety net of nine red-flag rules. Runs offline on edge hardware when connectivity fails.
>
> **Decision support only — not a replacement for professional medical diagnosis.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Emergency-miss rate](https://img.shields.io/badge/emergency--miss-0%25-success)](docs/METHODOLOGY.md)
[![Care engine](https://img.shields.io/badge/engine-ESI%20v5%20%2B%209%20red--flag%20rules-7c3aed)](docs/RED_FLAGS.md)
[![Languages](https://img.shields.io/badge/languages-English%20%C2%B7%20Hindi%20%C2%B7%20Kannada-blue)](docs/METHODOLOGY.md)

---

## Why this exists

India has roughly **one doctor per 11,000 rural patients**, and the WHO projects an
**11 million** health-worker shortfall by 2030. Free national telemedicine exists, but
rural awareness of it is in the low single digits. The bottleneck is not technology —
it is the **first triage decision**: should this person stay home, see a clinician soon,
or go to an emergency room now? Getting that decision wrong in time-critical conditions
(myocardial infarction, stroke, paediatric sepsis) costs lives.

ASHA-AI is the triage layer that sits in front of existing health infrastructure. A
patient describes symptoms in **English, Hindi, or Kannada** (voice or text). A language
model extracts structured symptoms; a **deterministic red-flag engine** (ESI v5 + WHO
IMCI) catches emergencies that may never be down-triaged; an ML severity model scores the
remainder; and a citation-grounded retrieval layer explains the verdict. The output is
exactly one care level — the strings are fixed and never paraphrased:

| Level | Meaning |
|---|---|
| 🟢 **`Home Care`** | Low severity, no red flag — monitor at home |
| 🟡 **`Clinic Visit`** | Moderate severity — see a clinician within 24–48 h |
| 🔴 **`Emergency Room`** | Any red flag fired — seek emergency care immediately |

Positioned strictly as **decision support** under India's Telemedicine Practice
Guidelines 2020. The system assists a registered medical practitioner; it does not
diagnose or prescribe.

---

## Core capabilities

| # | Capability | Implementation |
|---|---|---|
| 1 | Conversational triage | Next.js PWA, multi-turn chat with structured-JSON symptom extraction |
| 2 | Symptom & history capture | Free text, voice, or interactive body map |
| 3 | NLP understanding | LLM symptom canonicalisation to clinical concepts |
| 4 | Severity scoring | Gradient-boosted classifier over symptom + demographic + vitals features |
| 5 | Emergency detection | 9 deterministic red-flag rules — escalation only, never down-triage |
| 6 | Care recommendation | ESI v5 mapper → `Home Care` / `Clinic Visit` / `Emergency Room` |
| 7 | Multilingual voice | ASR → translation → TTS pipeline (English, Hindi, Kannada) |
| 8 | Offline edge mode | Local LLM (Ollama + Gemma) — one environment variable swaps cloud ↔ edge |
| 9 | Clinician dashboard | Real-time verdict queue ordered by clinical urgency |
| 10 | Auditable record | Postgres with audit log and row-level security |

**Safety property:** `final_level = max(rule_level, ml_level)`. Rules can only
**escalate** — even if the model predicts "home care", a fired red flag forces an
emergency verdict. See [docs/RED_FLAGS.md](docs/RED_FLAGS.md).

---

## Architecture

```
              Patient (English · Hindi · Kannada — voice / text)
                                  │
                         ┌────────┴────────┐
                         │  Next.js PWA    │
                         └────────┬────────┘
                                  │ POST /triage
                  ┌───────────────┴────────────────────┐
                  │            FastAPI backend          │
                  │                                     │
                  │  Layer 1 — LLM symptom extraction   │
                  │  Layer 2 — Red-flag rule engine     │
                  │            (ESI v5 + IMCI; escalate)│
                  │  Layer 3 — ML severity classifier   │
                  │  ESI v5 mapper → care level         │
                  │  Citation-grounded retrieval        │
                  └───────────────┬────────────────────┘
                                  │
                       ┌──────────┴──────────┐
                       │  PostgreSQL          │  audit-logged
                       │  (+ pgvector)        │  RLS-protected
                       └──────────────────────┘
```

Full system diagram, data model, and deployment topology:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Database design (ER model, relational
schema, normalization to BCNF): [docs/DBMS_REPORT.md](docs/DBMS_REPORT.md).

---

## Getting started

```bash
git clone https://github.com/atuldhull/Heath.git
cd Heath
docker compose up -d                          # backend + database + edge LLM
cd frontend && npm install && npm run dev     # http://localhost:3000
```

Copy `.env.example` → `.env` and set the required keys
(`GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BHASHINI_API_KEY`).
Per-service setup is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Run the evaluation suite:**

```bash
cd backend && pytest tests/eval_scenarios.py -v
```

Measured results, methodology, and metric definitions:
[docs/METHODOLOGY.md](docs/METHODOLOGY.md). Evaluation-set specification:
[docs/EVAL_SPEC.md](docs/EVAL_SPEC.md). Agentic tool architecture:
[docs/AGENTIC_TOOLS.md](docs/AGENTIC_TOOLS.md).

---

## Repository layout

```
backend/      FastAPI service — triage engine, rule base, ESI mapper, API
frontend/     Next.js PWA — chat UI, body map, clinician dashboard
ml/           Severity model, red-flag classifier, evaluation harness
edge/          Offline edge-mode runtime
infra/        Container and deployment configuration
docs/          Architecture, methodology, evaluation, and regulatory documentation
```

---

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data model, deployment |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | Models, metrics, measured results |
| [docs/RED_FLAGS.md](docs/RED_FLAGS.md) | The nine red-flag rules and their clinical citations |
| [docs/EVAL_SPEC.md](docs/EVAL_SPEC.md) | Evaluation-set specification |
| [docs/AGENTIC_TOOLS.md](docs/AGENTIC_TOOLS.md) | Tool-calling architecture |
| [docs/DBMS_REPORT.md](docs/DBMS_REPORT.md) | Database design and normalization |
| [docs/regulatory/](docs/regulatory/) | CDSCO pathway, clinical evaluation, QMS, risk management |

---

## Contributing

Contributions that **preserve the safety guarantees** are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and the invariants that
must not be broken.

---

## License

[MIT](LICENSE). Built on the work of [AI4Bharat](https://ai4bharat.iitm.ac.in/),
[Bhashini](https://bhashini.gov.in/), [AHRQ ESI v5](https://www.ahrq.gov/), and
[WHO IMCI](https://www.who.int/teams/maternal-newborn-child-adolescent-health-and-ageing/child-health/integrated-management-of-childhood-illness).

---

## Disclaimer

> **ASHA-AI does not diagnose or prescribe.** It is **not a replacement for professional
> medical diagnosis**. It provides preliminary triage decision-support for patients,
> community health workers, and registered medical practitioners deciding next steps.
> In a medical emergency call **108** (India ambulance) or **112** (universal emergency).
> Mental-health crisis: **iCall 9152987821** · **Vandrevala 1860-2662-345**.
>
> Designed in accordance with India's Telemedicine Practice Guidelines 2020, the CDSCO
> medical-device software guidance, the DPDP Act 2023, and the WHO guidance on the ethics
> and governance of AI for health.
