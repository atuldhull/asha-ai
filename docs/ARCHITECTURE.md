# ASHA-AI — System Architecture

> Companion to [PLAN.md](../PLAN.md). For the wearable integration layer in detail, see [WEARABLES.md](WEARABLES.md). For risk-scoring math and model cards, see [METHODOLOGY.md](METHODOLOGY.md).

## 0. Plan 1.0 architecture — what's actually shipping today

The full 3-layer architecture (LLM + Rule Engine + ML Classifier) lands in Plan 2.0. **Plan 1.0 is the safety-net floor** — a deterministic keyword-rule engine that hits every brief floor requirement and ships independently submittable. Diagram:

```
                      Patient (typed English symptoms)
                                   │
                                   ▼
                  ┌────────────────────────────────────┐
                  │   Next.js 14 PWA   ·   Vercel       │
                  │   ─────────────────────────────     │
                  │   /         landing + disclaimer    │
                  │   /triage   chat UI + verdict card  │
                  │             (3 color states using   │
                  │              EXACT strings)          │
                  └─────────────┬──────────────────────┘
                                │ POST /api/triage
                                │ (Edge runtime proxy)
                                ▼
                  ┌────────────────────────────────────┐
                  │   FastAPI Backend   ·   Render      │
                  │                                    │
                  │   ┌──────────────────────────────┐ │
                  │   │ Layer 2 (only) —             │ │
                  │   │ Keyword Rule Engine          │ │
                  │   │ ─────────────────────────    │ │
                  │   │ 30 rules in triage_rules.md  │ │
                  │   │ R1–R9   ESI Level 1/2        │ │
                  │   │         (red flags — ER)     │ │
                  │   │ R10–R24 Clinic Visit         │ │
                  │   │ R25–R30 Home Care            │ │
                  │   │ first-match-wins             │ │
                  │   └──────────────┬───────────────┘ │
                  │                  ▼                 │
                  │   ┌──────────────────────────────┐ │
                  │   │ Severity Fallback (no rule   │ │
                  │   │ fired): symptom_severity.csv │ │
                  │   │ < 0.30 → Home Care           │ │
                  │   │ 0.30–0.60 → Clinic Visit     │ │
                  │   │ ≥ 0.60 → Emergency Room       │ │
                  │   └──────────────┬───────────────┘ │
                  │                  ▼                 │
                  │   ┌──────────────────────────────┐ │
                  │   │ Safety refusal patterns      │ │
                  │   │ drug_dosing → reject + RMP   │ │
                  │   │ suicidal → ER + iCall +      │ │
                  │   │            Vandrevala         │ │
                  │   │ non_medical → 422            │ │
                  │   └──────────────┬───────────────┘ │
                  │                  ▼                 │
                  │   Response: {level, reasoning,     │
                  │              disclaimer, version}  │
                  └─────────────┬──────────────────────┘
                                │
                                ▼
                  ┌────────────────────────────────────┐
                  │   Supabase (Mumbai)                │
                  │   sessions · messages · verdicts   │
                  │   (anonymous auth — Plan 1.0)      │
                  └────────────────────────────────────┘
```

**Plan 1.0 deliberately omits** (turned on tier-by-tier):
- LLM symptom extraction (Plan 2.0 — Gemini 2.5 Flash)
- ML severity classifier (Plan 2.0 — XGBoost on Kaggle Disease-Symptom)
- Multi-turn conversational loop (Plan 2.0)
- Hindi / Kannada voice (Plan 3.0 — Bhashini)
- Offline edge mode (Plan 3.0 — Ollama + Gemma 4 E4B)
- Doctor cockpit + Realtime (Plan 3.0)
- Agentic 5-tool refactor (Plan 4.0)

**Plan 1.0 does ship** all 8 brief-required core features in basic form: triage chatbot (1), symptom + history collection (2 — single-shot), NLP query understanding (3 — keyword matching), risk scoring (4 — severity CSV), emergency alert (5 — 9 red-flag rules), care recommendation engine (6 — ESI mapper), multi-turn (7 — placeholder slot), health guidance dashboard (8 — verdict card with reasoning).

The Plan 2.0 → 4.0 architecture below describes the full target state.

---

## 0.5 Plan 2.0 architecture — what ships at end of Day 3

Plan 2.0 turns on Layer 1 (LLM) and Layer 3 (ML), wires Supabase phone-OTP auth + persistence + audit log, and adds the doctor cockpit + 50-case eval. The keyword rule engine from Plan 1.0 stays — promoted to "Layer 2 (deterministic)" — but its 30 rules are now back-stopped by the 9 canonical red-flag rules in [RED_FLAGS.md](RED_FLAGS.md) implemented as pure functions.

```
                  Patient (phone — typed English; voice in Plan 3.0)
                                  │
                                  │ Supabase phone-OTP auth
                                  ▼
                  ┌──────────────────────────────────────┐
                  │   Next.js 14 PWA  ·  Vercel           │
                  │   /sign-in  phone → OTP               │
                  │   /triage   chat + verdict + history  │
                  │   /history  past sessions             │
                  │   /doctor/  cockpit queue (polling)   │
                  │   dashboard                            │
                  │   PWA installable · Framer Motion     │
                  │   Lighthouse: Perf≥85 A11y≥95          │
                  └────────────────┬─────────────────────┘
                                   │ POST /triage  (JWT)
                                   ▼
                  ┌──────────────────────────────────────┐
                  │   FastAPI Backend  ·  Render          │
                  │   slowapi rate limit: 10/min/user     │
                  │                                       │
                  │   ┌─────────────────────────────────┐ │
                  │   │ LAYER 1 — LLM extraction        │ │
                  │   │ Gemini 2.5 Flash · JSON mode    │ │
                  │   │ structured-schema response      │ │
                  │   │ → {symptoms[], severity,        │ │
                  │   │    needs_followup,              │ │
                  │   │    followup_question}           │ │
                  │   └─────────────┬───────────────────┘ │
                  │                 │ (multi-turn loop if │
                  │                 │  needs_followup)    │
                  │                 ▼                     │
                  │   ┌─────────────────────────────────┐ │
                  │   │ LAYER 2 — Red-Flag Rule Engine  │ │
                  │   │ 9 canonical rules from          │ │
                  │   │ RED_FLAGS.md  (R1–R9)            │ │
                  │   │ + 30 legacy rules from 1.0      │ │
                  │   │ first-match-wins · pure fn      │ │
                  │   │ → flags[], force_level          │ │
                  │   └─────────────┬───────────────────┘ │
                  │                 ▼                     │
                  │   ┌─────────────────────────────────┐ │
                  │   │ LAYER 3 — ML Severity Classifier│ │
                  │   │ XGBoost v0.2.0                  │ │
                  │   │ trained on Kaggle               │ │
                  │   │ Disease-Symptom Prediction      │ │
                  │   │ → severity ∈ [0,1]              │ │
                  │   └─────────────┬───────────────────┘ │
                  │                 ▼                     │
                  │   ┌─────────────────────────────────┐ │
                  │   │ ESI v5 Mapper                   │ │
                  │   │ severity → ESI 1–5 → care_level │ │
                  │   │ ──────────────────────────────  │ │
                  │   │ SAFETY PROPERTY (unit-tested):  │ │
                  │   │   final = max(rule_level,       │ │
                  │   │               esi_level)        │ │
                  │   │ Rules ESCALATE only, never      │ │
                  │   │ downgrade.                      │ │
                  │   └─────────────┬───────────────────┘ │
                  │                 ▼                     │
                  │   ┌─────────────────────────────────┐ │
                  │   │ /explain/{verdict_id}           │ │
                  │   │ SHAP top-5 feature attribution  │ │
                  │   └─────────────┬───────────────────┘ │
                  │                 ▼                     │
                  │   audit_log row written BEFORE        │
                  │   response (atomic; fail-closed)      │
                  └────────────────┬─────────────────────┘
                                   │
                                   ▼
                  ┌──────────────────────────────────────┐
                  │  Supabase  ·  Mumbai region           │
                  │  ─────────────────────────────────    │
                  │  profiles   role={patient,asha,doctor}│
                  │  sessions   user_id, started_at       │
                  │  messages   role={user,assistant}     │
                  │  verdicts   level, esi, red_flags[],  │
                  │             confidence, model_version │
                  │  audit_log  event, inputs_hash,       │
                  │             output_summary            │
                  │  RLS: patients see own rows;          │
                  │  doctors see verdicts in last 24h     │
                  └──────────────────────────────────────┘
```

**Plan 2.0 ships:**
- Phone-OTP auth + session persistence + chat history
- 3-layer pipeline: Gemini extract → 9 deterministic rules → XGBoost severity → ESI mapper
- Safety property unit-tested: rules can only escalate
- Doctor cockpit `/doctor/dashboard` with queue + ESI badges (polling 30s; Realtime is Plan 3.0)
- `/explain/{verdict_id}` with SHAP attribution
- Audit log per verdict (CDSCO ACP precursor)
- Rate limiting 10/min/user
- 50-case eval published; **emergency-miss rate = 0**
- Lighthouse Mobile: Perf ≥ 85, A11y ≥ 95
- PWA installable on Android

**Plan 2.0 still omits** (deferred to 3.0+):
- Hindi / Kannada voice (Plan 3.0 — Bhashini ASR/TTS/NMT)
- Offline edge mode (Plan 3.0 — Ollama + Gemma 4 E4B on RPi5)
- Supabase Realtime in doctor cockpit (Plan 3.0)
- Mental-health helpline redirect endpoint (Plan 3.0)
- Citation-grounded RAG (Plan 3.0 — pgvector + BGE-M3)
- Agentic 5-tool refactor (Plan 4.0)
- MBBS validation slide line (Plan 4.0)

---

## 0.75 Plan 3.0 architecture — what ships at end of Day 4

Plan 3.0 unlocks **Innovation 25%** with two features no other team will have: **Hindi voice via Bhashini** and **offline edge mode via Ollama + Gemma**. It also wires the RAG citation layer (pgvector + BGE-M3), the Realtime doctor cockpit, and the mental-health helpline route. The LLM stage becomes provider-pluggable behind an `LLMProvider` interface — Gemini in the cloud, Ollama on edge, same JSON-mode contract.

```
                  Patient — Hindi / English (Kannada in Plan 4.0)
                  voice OR text · phone OR PHC laptop
                                  │
                                  ▼
            ┌──────────────────────────────────────────────────┐
            │  Next.js 14 PWA  ·  Vercel (cloud) OR localhost   │
            │  ──────────────────────────────────────────────  │
            │  Voice button (MediaRecorder · webm/mp4)         │
            │  Language switcher  EN · HI                       │
            │  Verdict card · Sources collapsible (RAG)         │
            │  Mental-health takeover screen (helplines)        │
            │  Doctor cockpit · Realtime subscription           │
            │  3-tier differential UI (Most likely · Expanded · │
            │                          Can't Miss)              │
            └────────────────┬─────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │ /voice/transcribe  (audio)   │  /triage  (text)
              ▼                              ▼
            ┌──────────────────────────────────────────────────┐
            │   FastAPI Backend                                 │
            │                                                   │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ Bhashini pipeline (cloud-only)              │ │
            │   │ ASR (hi/kn → text) → NMT (→ en) → TTS (→ hi) │ │
            │   │ Audio: Supabase Storage (private, 7-day TTL)│ │
            │   └────────────────┬────────────────────────────┘ │
            │                    ▼                               │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ LAYER 1 — LLMProvider (env-var swap)        │ │
            │   │ ┌─────────────┐  ┌──────────────────────┐   │ │
            │   │ │ GeminiProv  │  │ OllamaProvider       │   │ │
            │   │ │ 2.5 Flash   │  │ gemma2:9b (laptop)   │   │ │
            │   │ │ (cloud)     │  │ gemma2:2b (RPi 5)    │   │ │
            │   │ └──────┬──────┘  └────────┬─────────────┘   │ │
            │   │        └──────same schema──┘                 │ │
            │   │   → ExtractedSymptoms JSON                    │ │
            │   └────────────────┬────────────────────────────┘ │
            │                    ▼                               │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ LAYER 2 — 9 red-flag rules (pure fns)        │ │
            │   │ + mental-health keyword router               │ │
            │   │   → /mental-health-check + helplines screen  │ │
            │   └────────────────┬────────────────────────────┘ │
            │                    ▼                               │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ LAYER 3 — XGBoost severity classifier        │ │
            │   └────────────────┬────────────────────────────┘ │
            │                    ▼                               │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ ESI v5 mapper                                │ │
            │   │ SAFETY PROPERTY: final = max(rule, esi)      │ │
            │   └────────────────┬────────────────────────────┘ │
            │                    ▼                               │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ RAG retrieve · pgvector + BGE-M3 (1024 dim)  │ │
            │   │ Top-3 snippets from 30-source corpus:        │ │
            │   │  WHO IMCI · India MoHFW STG · NICE CKS       │ │
            │   │  Plus differential heuristic                  │ │
            │   │  (Most likely / Expanded / Can't Miss)        │ │
            │   └────────────────┬────────────────────────────┘ │
            │                    ▼                               │
            │   ┌─────────────────────────────────────────────┐ │
            │   │ verdicts INSERT  →  Supabase                 │ │
            │   │ Replication: postgres_changes  →  Realtime   │ │
            │   │ audit_log row (atomic)                       │ │
            │   └────────────────┬────────────────────────────┘ │
            └────────────────────┼──────────────────────────────┘
                                 │
                                 ▼
            ┌──────────────────────────────────────────────────┐
            │  Doctor cockpit subscribes to verdicts channel    │
            │  Animated insertion · ER audio ping               │
            │  (/sounds/er-alert.mp3 · respects autoplay)       │
            │  sorted by ESI · click → 3-tier differential view │
            │  (driven by docs/differentials.json — one row     │
            │  per red-flag rule R1–R9)                          │
            │                                                   │
            │  (No more polling — < 1s latency end-to-end)      │
            └──────────────────────────────────────────────────┘

            ┌──────────────────────────────────────────────────┐
            │  Connection-status indicator — the unplug signal  │
            │                                                   │
            │  Nav badge polls GET /api/v1/edge-status every 5s │
            │   provider="cloud"  → 🌐 Cloud   (Gemini 2.5 Flash)│
            │   provider="edge"   → 📡 Edge    (Ollama + Gemma)  │
            │   unreachable       → ⚠  Offline                  │
            │                                                   │
            │  When the demo pulls the ethernet cable, the      │
            │  badge flips cloud → edge within 5 s. That is the │
            │  camera-captured visual of the unplug moment.     │
            └──────────────────────────────────────────────────┘

                   ╔═══════════════════════════════════════════╗
                   ║  EDGE MODE — the unplug moment             ║
                   ║                                            ║
                   ║  When network drops, the same backend       ║
                   ║  process serves with LLM_PROVIDER=ollama.   ║
                   ║                                            ║
                   ║  Cloud-only stages SKIPPED on edge:        ║
                   ║    • Bhashini voice (replaced: typed EN)   ║
                   ║    • RAG retrieval (cached local corpus    ║
                   ║      lookup if pgvector unreachable)       ║
                   ║                                            ║
                   ║  Cloud + edge BOTH preserve:               ║
                   ║    • Layer 2 red-flag rules                ║
                   ║    • Layer 3 XGBoost severity              ║
                   ║    • ESI v5 mapper + safety property       ║
                   ║    • emergency-miss rate = 0 (unchanged)   ║
                   ║                                            ║
                   ║  Tested on:                                ║
                   ║    Laptop M1 16GB  · 3–5s · gemma2:9b      ║
                   ║    RPi 5 16GB      · 8–12s · gemma2:2b     ║
                   ╚═══════════════════════════════════════════╝
```

**Plan 3.0 ships:**
- Hindi voice (and English) — Bhashini ASR → NMT → TTS pipeline, audio in private Supabase Storage with 7-day TTL
- Language switcher EN ↔ HI; verdict card title stays English, Hindi subtitle appears
- Offline edge mode — `LLMProvider` abstraction; `LLM_PROVIDER=ollama` env-var swap; Gemma 2 or Llama 3.1 8B on laptop / Gemma 2:2b on RPi 5
- Citation-grounded RAG — 30-snippet hand-curated corpus from WHO IMCI + India MoHFW STG + NICE CKS, BGE-M3 embeddings in pgvector; every verdict carries ≥ 1 source
- Realtime doctor cockpit — Supabase Realtime replaces polling; new ER cases slide in with framer-motion + audio chime
- 3-tier differential UI on patient detail (Most likely / Expanded / Can't Miss)
- Mental-health helpline route — explicit takeover screen with iCall (9152987821) + Vandrevala (1860-2662-345)
- Tested unplug demo at ≤ 30 s

**Plan 3.0 still omits** (deferred to 4.0):
- Kannada (Plan 4.0)
- Agentic refactor — Gemini function-calling with 5 formal tools (Plan 4.0)
- Adversarial demo case engineering — vague stroke → FAST screen as a polished 30 s beat (Plan 4.0)
- Sound design — Home Care chime, Emergency Room two-tone (Plan 4.0)
- MBBS sign-off line (Plan 4.0)
- First real-patient triage (Plan 4.0)
- Open-source HuggingFace benchmark publish (Plan 4.0)
- k6 load test screenshot (Plan 4.0)

---

## 0.9 Plan 4.0 architecture — agentic 5-tool refactor (submission state)

Plan 4.0 finalizes the architecture for submission with three structural changes vs Plan 3.0:

1. **Layer 1 becomes agentic.** Gemini is refactored from a JSON-extraction call to **Gemini function-calling with 5 tools** ([AGENTIC_TOOLS.md](AGENTIC_TOOLS.md)). The LLM orchestrates; every clinical decision flows through a deterministic tool.
2. **Kannada activates.** The Bhashini pipeline now handles `kn` source/target alongside `hi`. Native-speaker QA documented in `docs/kn_qa_notes.md`.
3. **Refusal screens become first-class.** Drug-dosing requests and suicidal ideation route through `app/core/safety.py` to dedicated `RefusalScreen.tsx` views, distinct from the verdict card.

```
                  Patient — voice or text · EN · HI · KN
                                  │
                                  ▼  (Bhashini ASR + NMT for voice; direct for text)
            ┌──────────────────────────────────────────────────┐
            │   Gemini 2.5 Flash · function-calling orchestrator │
            │                                                   │
            │   tools = [extract_symptoms, get_red_flags,        │
            │            compute_esi, imci_lookup, rag_retrieve] │
            │                                                   │
            │   while gemini_wants_to_call_tool:                 │
            │     1. parse function_call from Gemini             │
            │     2. execute tool locally (Python)               │
            │     3. log invocation to audit_log                 │
            │     4. send function_response back to Gemini        │
            │     5. max-iterations cap = 8 (safety)             │
            │                                                   │
            │   ┌──────────────┐   ┌────────────────┐           │
            │   │ extract_     │ ─►│ get_red_flags  │           │
            │   │ symptoms     │   │ R1–R9 pure fns │           │
            │   │ (LLMProvider)│   └────────┬───────┘           │
            │   └──────────────┘            │                   │
            │           │                   ▼                   │
            │           │           ┌────────────────┐           │
            │           │           │ compute_esi    │           │
            │           │           │ severity → ESI │           │
            │           │           │ 1–5 → care lvl │           │
            │           │           └────────┬───────┘           │
            │           ▼                    ▼                   │
            │   ┌──────────────┐   ┌────────────────┐           │
            │   │ imci_lookup  │   │ rag_retrieve   │           │
            │   │ (under-5     │   │ top-3 snippets │           │
            │   │  routing)    │   │ from pgvector  │           │
            │   └──────┬───────┘   └────────┬───────┘           │
            │          │                    │                   │
            │          └────────┬───────────┘                   │
            │                   ▼                               │
            │   final = max(rule_layer.force_level,             │
            │               esi_layer.care_level,                │
            │               imci_layer.recommendation)           │
            │   ── SAFETY PROPERTY · UNIT-TESTED ──              │
            └────────────────┬─────────────────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────┐
              │   /api/v1/triage response             │
              │   { verdict_id, level, esi, …,        │
              │     tool_invocations: [...]  ← logged │
              │     citations: [...],                 │
              │     refusal: bool, refusal_type: ... }│
              └──────────────────────────────────────┘
                             │
              ┌──────────────┼────────────────────────────┐
              ▼              ▼                            ▼
      VerdictCard       RefusalScreen                  Doctor cockpit
      (sound +          ┌─────────────┐                Realtime · 3-tier
       haptic +         │ drug-dosing │                differential
       Sources)         │ → consult   │
                        │   RMP        │
                        └─────────────┘
                        ┌─────────────┐
                        │ suicidal    │
                        │ → iCall +   │
                        │  Vandrevala │
                        └─────────────┘
```

**What Plan 4.0 adds beyond Plan 3.0 (operational, not just architectural):**

- **k6 load test**: 200 RPS sustained, p95 latency screenshot in [PITCH_DECK_PLAN_4.0.md slide 6](PITCH_DECK_PLAN_4.0.md)
- **HuggingFace public benchmark**: `huggingface.co/datasets/<org>/asha-ai-50-triage-eval` (CC-BY-4.0)
- **MBBS clinical validation**: 50-case eval reviewed by Dr. [Name], MBBS (see [MBBS_TRACKER.md Plan 4.0 review session protocol](MBBS_TRACKER.md))
- **First real-patient triage**: signed consent per [CONSENT_FORM.md](CONSENT_FORM.md); log row in [checklists/REAL_PATIENT.md](checklists/REAL_PATIENT.md)
- **Sound design**: per-care-level chimes (`/audio/chime-home.mp3`, `chime-clinic.mp3`, `urgent-er.mp3`) + ER cockpit ping
- **Mobile haptic feedback** via Vibration API (Android)
- **OG image · favicon · maskable PWA icons**
- **Final Lighthouse Mobile: Perf ≥ 85 · A11y ≥ 95 · Best Practices ≥ 90 · SEO ≥ 90** on every route

**What does NOT change vs Plan 3.0:**

- Care-level strings are exact (`Home Care` / `Clinic Visit` / `Emergency Room`)
- Safety property still `final = max(rule, esi, imci)` — rules can only escalate
- Disclaimer on every screen and in every video frame
- DPDP / Mumbai region / 7-day audio TTL / audit log
- Edge-mode `LLMProvider` toggle still works (the agentic refactor preserves the protocol; on edge, Ollama replaces Gemini and the tool-call loop happens via Python orchestration over Ollama's JSON-mode output)

The submitted system is this diagram. The Plan 1.0 keyword-rule engine, the Plan 2.0 XGBoost classifier, and the Plan 3.0 RAG + Realtime layers are all still present — Plan 4.0 only wraps an agentic orchestrator around them and ships the four credibility moats above.

---

## 1. High-level architecture (Plan 4.0+ target state)

```
                           ┌────────────────────────────────────────┐
                           │           USER (Patient / ASHA)         │
                           │  Browser PWA · Voice · Hindi/Kannada/EN │
                           └──────────────┬─────────────────────────┘
                                          │ HTTPS
                                          ▼
                  ┌──────────────────────────────────────────────────┐
                  │              FRONTEND  (Next.js 14)               │
                  │  Vercel · App Router · Tailwind · shadcn/ui      │
                  │                                                   │
                  │   ┌────────┐  ┌─────────┐  ┌──────────────────┐ │
                  │   │ Chat   │  │ Triage  │  │ Doctor Cockpit   │ │
                  │   │  UI    │  │ Verdict │  │ (Glass-style     │ │
                  │   │        │  │ + Vitals│  │  3-tier diff)    │ │
                  │   └───┬────┘  └────┬────┘  └────────┬─────────┘ │
                  │       │ Web Bluetooth (Tier 3)      │            │
                  │       │ rPPG / camera (Tier 1)      │            │
                  └───────┼────────────┼────────────────┼────────────┘
                          │            │                │
                          ▼            ▼                ▼
                  ┌──────────────────────────────────────────────┐
                  │           BACKEND  (FastAPI · Render)         │
                  │                                                │
                  │  /chat    /triage    /vitals    /explain      │
                  │  /history /edge-status    /emergency-check    │
                  │     │           │           │         │        │
                  │     ▼           ▼           ▼         ▼        │
                  │  ┌─────────────────────────────────────────┐  │
                  │  │  Layer 1: LLM Conversation Manager      │  │
                  │  │  ┌────────────────┐ ┌────────────────┐  │  │
                  │  │  │ Gemini 2.5     │ │ Ollama         │  │  │
                  │  │  │ Flash (cloud)  │ │ Gemma 4 E4B    │  │  │
                  │  │  │                │ │ (edge/offline) │  │  │
                  │  │  └────────────────┘ └────────────────┘  │  │
                  │  │  → structured JSON {symptoms[], hx, age}│  │
                  │  └─────────────┬───────────────────────────┘  │
                  │                ▼                                │
                  │  ┌─────────────────────────────────────────┐  │
                  │  │  Layer 2: Red-Flag Rule Engine          │  │
                  │  │  Deterministic ESI v5 Level-1/2 trigers │  │
                  │  │  (STEMI signs, stroke FAST,             │  │
                  │  │   anaphylaxis, pediatric high fever ...) │  │
                  │  └─────────────┬───────────────────────────┘  │
                  │                ▼                                │
                  │  ┌─────────────────────────────────────────┐  │
                  │  │  Layer 3: ML Severity Classifier        │  │
                  │  │  XGBoost (default) / ClinicalBERT (GPU) │  │
                  │  │  Trained on Symcat + Kaggle disease     │  │
                  │  │  → severity score s ∈ [0..1]            │  │
                  │  └─────────────┬───────────────────────────┘  │
                  │                ▼                                │
                  │  ┌─────────────────────────────────────────┐  │
                  │  │  ESI v5 Mapper  →  Level 1–5            │  │
                  │  │  → Home Care / Clinic / ER              │  │
                  │  │  (rules can only escalate, not          │  │
                  │  │   downgrade — safety property)          │  │
                  │  └─────────────┬───────────────────────────┘  │
                  │                ▼                                │
                  │  ┌─────────────────────────────────────────┐  │
                  │  │  Explainability (SHAP-style attribution)│  │
                  │  │  + Citation-grounded RAG over           │  │
                  │  │  WHO IMCI / NICE CKS / India STG        │  │
                  │  └─────────────────────────────────────────┘  │
                  └──────────────────┬───────────────────────────┘
                                     │
                                     ▼
                  ┌──────────────────────────────────────────────┐
                  │     SUPABASE  (Mumbai region · DPDP-compliant)│
                  │     Postgres + pgvector · Auth · Realtime    │
                  │     Tables: profiles, sessions, messages,    │
                  │     verdicts, vitals, explanations           │
                  └──────────────────────────────────────────────┘

                  ┌──────────────────────────────────────────────┐
                  │       VITALS / WEARABLE INGRESS (4 tiers)     │
                  │   1. rPPG (phone camera HR) + voice          │
                  │   2. Google Health Connect (Android)         │
                  │   3. Web Bluetooth GATT (PHC pulse ox/BP)    │
                  │   4. Apple HealthKit (iOS — v2)              │
                  │   → normalized vitals payload                 │
                  └──────────────────────────────────────────────┘

                  ┌──────────────────────────────────────────────┐
                  │       EXTERNAL SERVICES  (free / govt)        │
                  │   Bhashini ASR/TTS/NMT (22 Indian languages)  │
                  │   AI4Bharat IndicTrans2 / IndicASR / IndicTTS │
                  │   ABDM/ABHA Open APIs (Health ID linkage)     │
                  │   WhatsApp Cloud API (Sprint 5)               │
                  └──────────────────────────────────────────────┘
```

## 2. Repository layout

```
d:\hack\
├── README.md                       (public entry point)
├── PLAN.md                         (master strategy)
├── LICENSE                         (MIT)
├── .gitignore
├── MARKET_ANALYSIS.html            (sourced market intelligence)
│
├── docs/
│   ├── INDEX.md                    (navigation aid)
│   ├── ARCHITECTURE.md            (this file)
│   ├── METHODOLOGY.md             (datasets, model card, eval, risk-scoring math)
│   ├── WEARABLES.md               (4-tier vitals integration)
│   ├── DEMO_SCRIPT.md             (3-min video cut sheet)
│   ├── ROLES.md                   (per-person task breakdown)
│   └── assets/
│       ├── architecture.excalidraw
│       └── architecture.png
│
├── research/                       (sourced raw findings — Role D should read)
│   ├── 01_global_competitors.md
│   ├── 02_india_competitors.md
│   ├── 03_user_pain_points.md
│   ├── 04_emerging_tech.md
│   ├── 05_regulatory_market.md
│   └── 06_features_and_constraints.md
│
├── frontend/                       (Next.js 14 · TypeScript · Role A)
│   ├── package.json
│   ├── next.config.mjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── public/
│   │   ├── manifest.json          (PWA)
│   │   ├── icons/
│   │   └── service-worker.js
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               (landing)
│   │   ├── triage/
│   │   │   └── page.tsx           (chat interface + vitals capture)
│   │   ├── result/[sessionId]/
│   │   │   └── page.tsx           (verdict card + explanation)
│   │   ├── history/
│   │   │   └── page.tsx
│   │   ├── doctor/
│   │   │   └── dashboard/
│   │   │       └── page.tsx       (queue + Glass-style 3-tier diff)
│   │   ├── asha/
│   │   │   └── companion/
│   │   │       └── page.tsx       (ASHA companion view)
│   │   ├── (auth)/
│   │   │   ├── sign-in/
│   │   │   └── sign-up/
│   │   └── api/
│   │       ├── chat/route.ts
│   │       └── triage/route.ts
│   ├── components/
│   │   ├── chat/
│   │   ├── triage/
│   │   ├── vitals/                (rPPG capture, BLE pulse-ox, manual entry)
│   │   ├── doctor/                (queue list, patient detail, differential UI)
│   │   ├── asha/
│   │   └── ui/                    (shadcn primitives)
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── api-client.ts
│   │   ├── stores/                (zustand)
│   │   ├── ble/                   (Web Bluetooth helpers)
│   │   ├── rppg/                  (Binah SDK wrapper)
│   │   └── i18n/
│   │       ├── en.json
│   │       ├── hi.json
│   │       └── kn.json
│   └── styles/
│
├── backend/                        (FastAPI · Python 3.11 · Role B)
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── render.yaml
│   ├── .env.example
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── routers/
│   │   │   ├── chat.py
│   │   │   ├── triage.py
│   │   │   ├── vitals.py
│   │   │   ├── explain.py
│   │   │   ├── history.py
│   │   │   ├── emergency.py
│   │   │   └── edge_status.py
│   │   ├── models/                (Pydantic)
│   │   ├── ml/
│   │   │   ├── classifier.py      (XGBoost / ClinicalBERT)
│   │   │   ├── red_flags.py       (rule engine)
│   │   │   ├── esi_mapper.py      (ESI v5 protocol)
│   │   │   ├── imci_mapper.py     (WHO IMCI for under-5s)
│   │   │   └── explainer.py       (SHAP attributions)
│   │   ├── llm/
│   │   │   ├── base.py            (LLMProvider protocol)
│   │   │   ├── gemini.py
│   │   │   ├── ollama.py
│   │   │   └── prompts/
│   │   ├── nlp/
│   │   │   ├── bhashini.py
│   │   │   ├── ai4bharat.py
│   │   │   └── tokenizer.py
│   │   ├── rag/
│   │   │   ├── retriever.py       (pgvector + BGE-M3)
│   │   │   ├── reranker.py
│   │   │   └── corpus/            (WHO IMCI, NICE CKS, India STG)
│   │   ├── db/
│   │   │   └── supabase.py
│   │   └── core/
│   │       ├── safety.py          (refusal rules)
│   │       └── disclaimers.py
│   └── tests/
│       ├── test_red_flags.py
│       ├── test_esi_mapper.py
│       ├── test_imci_mapper.py
│       └── eval_scenarios.py      (50-case regression suite)
│
├── ml/                             (training notebooks · Role B)
│   ├── notebooks/
│   │   ├── 01_dataset_prep.ipynb
│   │   ├── 02_train_xgboost.ipynb
│   │   ├── 03_train_clinicalbert.ipynb (optional, GPU)
│   │   └── 04_eval_metrics.ipynb
│   ├── datasets/
│   └── models/
│       └── README.md              (model card)
│
├── edge/                           (offline Ollama runner · Role C)
│   ├── runner.py
│   ├── Dockerfile
│   └── README.md                  (Raspberry Pi 5 setup)
│
└── .github/
    └── workflows/
        ├── frontend-ci.yml
        └── backend-ci.yml
```

## 3. API surface

All endpoints under `/api/v1`. JWT auth via Supabase except `/health` and `/edge-status`.

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/chat` | `{session_id, message, lang}` | `{reply, needs_more_info, extracted_symptoms[]}` |
| `POST` | `/triage` | `{session_id, symptoms[], age, sex, history[], vitals[]}` | `{level, esi, confidence, red_flags[], reasoning, citations[]}` |
| `POST` | `/vitals` | `{session_id, kind, value, source, recorded_at}` | `{ok, vital_id}` |
| `GET` | `/explain/{verdict_id}` | — | `{factors: [{name, weight}], summary, citations[]}` |
| `GET` | `/history` | — | `{sessions: [{id, started_at, verdict}]}` |
| `POST` | `/emergency-check` | `{symptoms[], vitals[]}` | `{is_emergency, reasons[]}` |
| `GET` | `/edge-status` | — | `{provider, model, loaded, latency_ms}` |
| `GET` | `/health` | — | `{status, model_loaded, llm_provider, version}` |

Response wrapper for all:
```json
{
  "ok": true,
  "data": {...},
  "disclaimer": "ASHA-AI provides triage support only. Not a substitute for professional medical advice. Per India Telemedicine Practice Guidelines 2020, AI does not prescribe or diagnose."
}
```

## 4. Supabase schema

```sql
-- profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users(id),
  role text check (role in ('patient','asha','doctor')) default 'patient',
  language text default 'en',
  age int, sex text,
  abha_id text unique,            -- nullable, ABDM Health ID (mock in v1)
  phc_code text,                  -- which PHC this user belongs to
  created_at timestamptz default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  initiated_by uuid references profiles(id),  -- ASHA if assisted
  started_at timestamptz default now(),
  ended_at timestamptz,
  language text,
  llm_provider text                -- 'gemini' or 'ollama'
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text check (role in ('user','assistant')),
  content text,
  audio_url text,                  -- nullable, for voice inputs
  created_at timestamptz default now()
);

create table verdicts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  level text check (level in ('home','clinic','er')),
  esi int check (esi between 1 and 5),
  confidence numeric(4,3),
  red_flags jsonb,
  symptoms jsonb,
  explanation jsonb,               -- {factors: [...], citations: [...]}
  model_version text,              -- for CDSCO ACP audit
  created_at timestamptz default now()
);

create table vitals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  kind text check (kind in ('hr','rr','spo2','bp_sys','bp_dia','temp_c','ecg','glucose','hrv')),
  value numeric,
  unit text,
  source text check (source in ('rppg','self_reported','health_connect','phc_ble','healthkit','cgm','manual_phc')),
  confidence text check (confidence in ('low','medium','high')),
  device_label text,
  recorded_at timestamptz not null,
  ingested_at timestamptz default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  event text,                      -- 'triage', 'vital_read', 'llm_call', etc.
  session_id uuid,
  user_id uuid,
  model_version text,
  inputs_hash text,                -- never log raw PHI
  output_summary jsonb,
  created_at timestamptz default now()
);

-- RLS policies:
-- patients see only their own rows
-- ASHAs see rows for their assigned cluster
-- doctors see verdicts in last 24h for their PHC
```

Full RLS policies are written into `db/migrations/`.

## 5. Risk-scoring methodology — see [METHODOLOGY.md](METHODOLOGY.md)

Summary: final triage level = `max(rule_layer_level, ml_layer_level)`. Rules can only escalate, never downgrade. ESI v5 protocol applied. WHO IMCI for under-5s.

## 6. Dataset plan — see [METHODOLOGY.md](METHODOLOGY.md)

Summary: Symcat (Columbia), Kaggle Disease-Symptom, WHO ICD-10 for normalization, custom 50-case eval set.

## 7. Wearable / vitals layer — see [WEARABLES.md](WEARABLES.md)

Summary: 4 tiers — rPPG, Google Health Connect, Web Bluetooth at PHC, Apple HealthKit. All normalize to the same vitals payload schema.

## 8. Deployment

### Frontend — Vercel
- Connect GitHub repo, automatic preview deploys per PR
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_BASE`
- Custom domain: `asha-ai.vercel.app`

### Backend — Render or Railway
- Docker-based deploy
- Env vars: `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BHASHINI_API_KEY`, `MODEL_PATH`
- Health check: `/api/v1/health`
- Region: Singapore (closest stable free region to India)

### Edge — demo machine + future PHC
- Local Ollama on `localhost:11434` running Gemma 4 E4B (or Llama 3.1 8B fallback)
- `edge/runner.py` exposes the same API subset, swapped LLM provider
- For demo: switch frontend `NEXT_PUBLIC_API_BASE` to `localhost:8000` to show offline mode
- Future: Raspberry Pi 5 + 16GB at PHC level

## 9. Observability

- **Sentry** (free tier) — frontend + backend error tracking
- **PostHog** (free tier) — funnel: landing → chat-start → verdict → action
- **Vercel Analytics** — built-in
- **Custom event:** `triage_completed` with anonymized `{level, esi, lang, latency_ms, llm_provider}` — gives us a "we have data" slide

## 10. Security & privacy (DPDP Act + CDSCO + WHO 2024)

- All PHI stored in Supabase **Mumbai region** with RLS — users only read their own rows
- Edge mode: zero outbound network calls from edge device after startup
- No raw symptom text in logs — hashed session IDs only
- Audit log per `verdicts` insert: model version, inputs hash, output summary (for CDSCO Algorithm Change Protocol)
- Disclaimer banner on every screen — rendered before model output
- Refusal guardrails in system prompt: drug dosing, prescription requests, mental-health crisis (escalate to iCall + Vandrevala helplines)
- HTTPS-only, HSTS header set
- Tokens encrypted at rest
- DPO (Data Protection Officer) designated for production
- Consent screen at first launch — multilingual, withdrawable, granular per data type
- Zero PHI in error logs (Sentry scrubbing rules enforced)

## 11. Build sequence (mapped to sprints)

| Sprint | Architectural milestone |
|---|---|
| 1 | Frontend shell + backend stub + Render deploy. Hardcoded triage. |
| 2 | LLM-driven extraction + red-flag rules + Supabase. Real verdict end-to-end on simple cases. |
| 3 | ML classifier trained + ESI mapper + auth + 50-case eval. Numbers on the slide. |
| 4 | Voice (Bhashini), doctor cockpit (Realtime), edge mode (Ollama), rPPG vitals. |
| 5 | Polish + accessibility + load test + final eval lock. Demo video + submission. |
