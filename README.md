# ASHA-AI

> **Voice-first, multilingual AI triage assistant for rural India.**
> Maps symptoms → `Home Care` · `Clinic Visit` · `Emergency Room` using the ESI v5 protocol, with a deterministic safety net of 9 red-flag rules. Works offline on edge hardware when the internet fails. **Decision support only — never diagnosis or prescription.**

[![Status](https://img.shields.io/badge/Plan%203.0-shipped-brightgreen)](PLAN.md) [![Eval](https://img.shields.io/badge/emergency--miss-0%25-success)](docs/METHODOLOGY.md#p37-plan-30-published-results) [![Voice](https://img.shields.io/badge/voice-Hindi%20%2B%20English-blue)](docs/METHODOLOGY.md#p31-the-voice-pipeline-bhashini) [![Edge](https://img.shields.io/badge/offline-Ollama%20%2B%20Gemma-purple)](docs/METHODOLOGY.md#p32-the-offline-edge-mode-ollama--gemma) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Hackathon](https://img.shields.io/badge/BMSIT-AI%20Fusion%20Challenge%20PS--2-orange)](PLAN.md)

**Live demo:** *(Vercel URL — Plan 3.0 deploys voice + edge fallback + Realtime cockpit + RAG citations)*
**Demo video (Plan 3.0, 2:30):** *(YouTube unlisted-public — Hindi voice + the unplug moment; uploaded once integration smoke test passes)*
**Demo video (Plan 2.0, 2:00):** *(kept as backup)*
**Demo video (Plan 1.0, 1:30):** *(kept as backup — never deleted)*
**Pitch deck:** [docs/PITCH_DECK_PLAN_3.0.md](docs/PITCH_DECK_PLAN_3.0.md) (v2 — supersedes [v1 / Plan 2.0](docs/PITCH_DECK_PLAN_2.0.md)) · **Strategy:** [PLAN.md](PLAN.md) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Methodology:** [docs/METHODOLOGY.md](docs/METHODOLOGY.md)

---

## Overview

India has **1 doctor per 11,082 rural patients** ([source](https://indiadatamap.com/2025/09/11/doctor-to-patient-ratio-in-india-a-state-wise-analysis/)). The WHO projects an **11 million** health-worker shortfall by 2030. Free national telemedicine (eSanjeevani) exists — but rural awareness sits at **2.2%** ([PMC 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10795884/)). **Distribution and trust — not technology — is what's broken.**

ASHA-AI is the triage layer that sits in front of that infrastructure. A patient describes symptoms in Hindi, Kannada, or English (voice or text). A foundation model extracts structured symptoms; a deterministic red-flag engine (ESI v5 + WHO IMCI) checks for emergencies that cannot be down-triaged; an ML severity classifier scores the rest; and a citation-grounded RAG layer explains the verdict. The result is one of three care levels — exact strings, never paraphrased:

- **`Home Care`** (green)
- **`Clinic Visit`** (amber)
- **`Emergency Room`** (red)

Positioned strictly as **decision support** per [India's Telemedicine Practice Guidelines 2020](https://www.mohfw.gov.in/pdf/Telemedicine.pdf). AI assists the registered medical practitioner; it does not prescribe or diagnose.

---

## 8 Core features (brief-mandated)

| # | Feature | Where it lives |
|---|---|---|
| 1 | **Triage chatbot** | `/triage` PWA — Next.js + Tailwind + shadcn |
| 2 | **Symptom + history collection** | Multi-turn chat with structured-JSON extraction (Gemini 2.5 Flash) |
| 3 | **NLP query understanding** | Layer 1 LLM — symptom canonicalization → UMLS CUIs |
| 4 | **Risk scoring** | Layer 3 XGBoost severity classifier (Symcat + Kaggle Disease-Symptom) |
| 5 | **Emergency alert** | 9 deterministic red-flag rules — ESI Level 1/2 escalation only |
| 6 | **Care recommendation engine** | ESI v5 mapper → `Home Care` / `Clinic Visit` / `Emergency Room` |
| 7 | **Multi-turn conversational interface** | Confidence-thresholded follow-up loop |
| 8 | **Health guidance dashboard** | Doctor cockpit + Glass-Health-style 3-tier differential |

**Plan 3.0 ships features 1–8 end-to-end and ticks 4 of the 10 advanced features** from the brief:

- ✅ **Voice-enabled assistant** — Bhashini ASR + TTS pipeline; speak symptoms, hear the verdict in Hindi
- ✅ **Multilingual** — Hindi + English UI (Kannada in Plan 4.0); 22 Indian languages addressable via Bhashini
- ✅ **Mental-health module** — explicit helpline takeover (iCall · Vandrevala) per India Mental Healthcare Act 2017
- ✅ **EHR-like persistent record** — Mumbai-region Supabase with audit log + RLS + DPDP compliance

Plus: **offline edge mode** via Ollama + Gemma 2 on Raspberry Pi 5 (the unplug moment in the demo), citation-grounded RAG over 30 hand-curated WHO IMCI + India MoHFW STG snippets, Supabase Realtime doctor cockpit (< 1 s case-arrival latency), and the Plan-1.0 keyword-rule safety floor still in place. **Emergency-miss rate = 0 in BOTH cloud and edge modes** (Layer 2 rule engine is provider-independent).

---

## 3 Care levels

| Level | Color | Strings (verbatim — never paraphrase) | Trigger |
|---|---|---|---|
| 🟢 | green | **`Home Care`** | severity < 0.30 · no red flag · monitor at home |
| 🟡 | amber | **`Clinic Visit`** | severity 0.30–0.60 · see a doctor within 24–48 h |
| 🔴 | red | **`Emergency Room`** | any of 9 red flags fired · call 108 / 112 immediately |

**Safety property:** `final_level = max(rule_level, ml_level)`. Rules can only **escalate**, never downgrade — even if the model thinks "home care," a fired red flag forces ER. See [docs/RED_FLAGS.md](docs/RED_FLAGS.md).

---

## Architecture

```
                    Patient (Hindi · Kannada · English · voice/text)
                              │
                     ┌────────┴────────┐
                     │  Next.js 14 PWA │ (Vercel)
                     └────────┬────────┘
                              │ POST /triage
                     ┌────────┴────────────────────────────┐
                     │     FastAPI Backend (Render)        │
                     │                                     │
                     │   Layer 1 — LLM Symptom Extraction  │
                     │     Gemini 2.5 Flash  /  Gemma 4    │
                     │                  ↓                  │
                     │   Layer 2 — Red-Flag Rule Engine    │
                     │     9 ESI v5 + IMCI rules           │
                     │     (can only ESCALATE)             │
                     │                  ↓                  │
                     │   Layer 3 — ML Severity Classifier  │
                     │     XGBoost (Symcat + Kaggle)       │
                     │                  ↓                  │
                     │   ESI v5 Mapper                     │
                     │     → Home Care / Clinic / ER       │
                     │   + Citation-grounded RAG           │
                     │     (WHO IMCI · NICE CKS · India)   │
                     └────────┬────────────────────────────┘
                              │
                     ┌────────┴─────────────┐
                     │  Supabase (Mumbai)   │  DPDP-compliant
                     │  Postgres+pgvector   │  audit logged
                     └──────────────────────┘
```

Full system diagram, file tree, DB schema, deployment topology: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Setup (3 commands)

```powershell
git clone https://github.com/<your-org>/asha-ai.git && cd asha-ai
docker compose up -d                          # backend + Supabase + Ollama edge
cd frontend && npm install && npm run dev     # http://localhost:3000
```

Env vars (copy `.env.example` → `.env`): `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BHASHINI_API_KEY`. Full prerequisites + per-service setup in [docs/ARCHITECTURE.md §8](docs/ARCHITECTURE.md).

**Eval suite:** `cd backend && uv run pytest tests/eval_scenarios.py -v` — runs the 50-case regression set per [docs/METHODOLOGY.md §5](docs/METHODOLOGY.md).

---

## Demo Video

**Plan 3.0 (2:30 · current):** *(YouTube unlisted-public — Hindi voice + the unplug moment + Realtime cockpit + RAG citations; uploaded after integration smoke test passes)*
**Plan 2.0 (2:00 · backup):** *(kept as fallback)*
**Plan 1.0 (1:30 · backup):** *(kept as fallback — never deleted)*
**Plan 4.0 (final, ≤ 2:55):** *(replaces the 3.0 video on submission day — Day 5)*

Shot lists + voiceover scripts for all four cuts: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).

---

## Team

| Role | Owns | Hackathon rubric |
|---|---|---|
| **A — Frontend Lead** | Next.js shell, chat UI, verdict cards, doctor cockpit, PWA | UI/UX 25% |
| **B — Backend / ML Lead** | FastAPI, rule engine, ESI mapper, classifier, Supabase, eval suite | Technical 25% · AI Accuracy 25% |
| **C — AI / Voice Lead** | LLM prompts, Bhashini Hindi/Kannada, Ollama edge mode, safety refusals | Conversation quality |
| **D — Storyteller / Demo / Ops** | README, methodology, architecture, demo video, pitch deck, MBBS outreach, submission ops | Submission package |

Per-tier task breakdown with Definition-of-Done: [docs/ROLES.md](docs/ROLES.md).

---

## License

[MIT](LICENSE) — free to use, fork, deploy. Built on the shoulders of [AI4Bharat](https://ai4bharat.iitm.ac.in/), [Bhashini](https://bhashini.gov.in/), [AHRQ ESI v5](https://www.ahrq.gov/), [WHO IMCI](https://www.who.int/teams/maternal-newborn-child-adolescent-health-and-ageing/child-health/integrated-management-of-childhood-illness), and the **1 million ASHA workers** for whom this is built.

---

## Disclaimer

> **ASHA-AI does not diagnose or prescribe.** It is **not a replacement for professional medical diagnosis**. It provides preliminary triage support to patients, ASHA workers, and registered medical practitioners deciding next steps. In a medical emergency call **108** (India ambulance) or **112** (universal). For mental-health crisis: **iCall 9152987821** · **Vandrevala 1860-2662-345**.
>
> Designed in accordance with: India Telemedicine Practice Guidelines 2020 · CDSCO Medical Device Software Draft Guidance (Oct 2025) · DPDP Act 2023 · WHO Ethics & Governance of AI for Health (2024 LMM guidance).
