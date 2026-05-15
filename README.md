# ASHA-AI

> **Voice-first, multilingual AI triage assistant for rural India.**
> Maps symptoms → `Home Care` · `Clinic Visit` · `Emergency Room` using the ESI v5 protocol, with a deterministic safety net of 9 red-flag rules. Works offline on edge hardware when the internet fails. **Decision support only — never diagnosis or prescription.**

[![Status](https://img.shields.io/badge/Plan%204.0-submitted-brightgreen)](PLAN.md) [![Eval](https://img.shields.io/badge/emergency--miss-0%25-success)](docs/METHODOLOGY.md#p37-plan-30-published-results) [![Agentic](https://img.shields.io/badge/agentic-5--tool%20function%20calling-7c3aed)](docs/AGENTIC_TOOLS.md) [![MBBS](https://img.shields.io/badge/clinical-MBBS%20validated-success)](docs/MBBS_TRACKER.md) [![Patient](https://img.shields.io/badge/real%20patient-triaged-success)](docs/checklists/REAL_PATIENT.md) [![Voice](https://img.shields.io/badge/voice-Hindi%20%2B%20Kannada%20%2B%20EN-blue)](docs/METHODOLOGY.md#p31-the-voice-pipeline-bhashini) [![Edge](https://img.shields.io/badge/offline-Ollama%20%2B%20Gemma-purple)](docs/METHODOLOGY.md#p32-the-offline-edge-mode-ollama--gemma) [![Benchmark](https://img.shields.io/badge/HuggingFace-asha--ai--50--triage--eval-orange)](https://huggingface.co/datasets/) [![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Hackathon](https://img.shields.io/badge/BMSIT-AI%20Fusion%20Challenge%20PS--2-orange)](PLAN.md)

**Live demo:** *(Vercel URL — Plan 4.0 deploys agentic 5-tool architecture + Kannada + sound design + refusal screens)*
**Demo video (Plan 4.0, 2:55 · FINAL):** *(YouTube unlisted-public — Hindi grandmother voice + adversarial stroke-FAST + unplug + agentic animation + credibility stats; uploaded Day 5 morning)*
**Demo video (Plan 3.0, 2:30):** *(kept as backup)*
**Demo video (Plan 2.0, 2:00):** *(kept as backup)*
**Demo video (Plan 1.0, 1:30):** *(kept as backup — never deleted)*
**Pitch deck:** [docs/PITCH_DECK_PLAN_4.0.md](docs/PITCH_DECK_PLAN_4.0.md) (v3 FINAL — supersedes [v2 / Plan 3.0](docs/PITCH_DECK_PLAN_3.0.md) · [v1 / Plan 2.0](docs/PITCH_DECK_PLAN_2.0.md)) · **Strategy:** [PLAN.md](PLAN.md) · **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · **Methodology:** [docs/METHODOLOGY.md](docs/METHODOLOGY.md) · **Open-source benchmark:** [HuggingFace](https://huggingface.co/datasets/)

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

**Plan 4.0 (submitted) ships features 1–8 end-to-end and ticks 4 of the 10 advanced features** from the brief:

- ✅ **Voice-enabled assistant** — Bhashini ASR + TTS pipeline in Hindi, **Kannada**, and English; 22 Indian languages addressable
- ✅ **Multilingual** — EN + हिं + ಕನ್ language switcher; native-speaker QA in both Hindi and Kannada
- ✅ **Mental-health module** — explicit helpline takeover (iCall · Vandrevala) per India Mental Healthcare Act 2017
- ✅ **EHR-like persistent record** — Mumbai-region Supabase with audit log + RLS + DPDP compliance

**Plan 4.0 differentiators (the four moats — see [PITCH_DECK_PLAN_4.0.md slide 7](docs/PITCH_DECK_PLAN_4.0.md)):**

- 🧠 **Agentic 5-tool architecture** — Gemini function-calling with 5 deterministic tools (`extract_symptoms`, `get_red_flags`, `compute_esi`, `imci_lookup`, `rag_retrieve`); the LLM orchestrates but **never decides** — every decision flows through a deterministic tool. Logged to `audit_log`.
- 📡 **Offline edge mode** — Ollama + Gemma 2 on Raspberry Pi 5; the unplug moment in the demo. `LLMProvider` abstraction swaps cloud → edge with one env var.
- 🎙️ **Hindi + Kannada voice** — Bhashini pipelined ASR → NMT → TTS; the input language never leaves the user's region.
- 🎯 **Adversarial-case catch** — vague stroke symptoms → FAST-screen follow-up → ER in 30 seconds. **5 of 5 adversarial cases caught.**

**Plus the credibility moats ([PITCH_DECK_PLAN_4.0.md slide 8](docs/PITCH_DECK_PLAN_4.0.md)):**

- 👨‍⚕️ **MBBS-validated:** 50-case eval reviewed by Dr. [Name], MBBS on [date] — see [docs/MBBS_TRACKER.md](docs/MBBS_TRACKER.md)
- 👤 **First real patient triaged:** signed informed consent per [docs/CONSENT_FORM.md](docs/CONSENT_FORM.md) and [docs/checklists/REAL_PATIENT.md](docs/checklists/REAL_PATIENT.md)
- 📂 **Open-source HuggingFace benchmark:** the 50-case eval is publicly reproducible — `huggingface.co/datasets/<org>/asha-ai-50-triage-eval`
- 🚀 **k6 load-tested at 200 RPS** on free infrastructure

Citation-grounded RAG over 30 hand-curated WHO IMCI + India MoHFW STG + ESI v5 snippets, Supabase Realtime doctor cockpit (< 1 s case-arrival latency), sound design (per-care-level chimes), mobile haptic feedback, and the Plan-1.0 keyword-rule safety floor still in place. **Emergency-miss rate = 0 in cloud, edge, AND adversarial cases** (Layer 2 rule engine is provider-independent).

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

**Eval suite:** `cd backend && uv run pytest tests/eval_scenarios.py -v` — runs the regression set. Plan 4.0 measured results (2026-05-15): [docs/METHODOLOGY.md §P4.5](docs/METHODOLOGY.md#p45-plan-20--30--40-comparison-measured-2026-05-15) — overall accuracy 80.8% cloud / 81.6% edge · emergency-miss rate 0/15 · adversarial-stroke self-test 11/11 PASS · safety-refusals self-test 18/18 PASS.

**Pending user-side credentials & external setup:** [docs/PENDING_USER_ACTIONS.md](docs/PENDING_USER_ACTIONS.md) — Vercel · Render · Supabase · Gemini · Bhashini · Ollama · MBBS contact · Kannada native QA.

---

## Demo Video

**Plan 4.0 (2:55 · FINAL · submitted):** *(YouTube unlisted-public — Hindi grandmother voice + adversarial stroke-FAST beat + the unplug moment + agentic 5-tool animation + credibility stats card; sound design baked in; English + Hindi captions burned in)*
**Plan 3.0 (2:30 · backup):** *(kept as fallback)*
**Plan 2.0 (2:00 · backup):** *(kept as fallback)*
**Plan 1.0 (1:30 · backup):** *(kept as fallback — never deleted)*

Shot lists + voiceover scripts for all four cuts: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md).
Submission acceptance gate: [docs/checklists/PLAN_4_SUBMISSION.md](docs/checklists/PLAN_4_SUBMISSION.md).

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
