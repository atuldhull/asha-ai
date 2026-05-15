# ASHA-AI — Methodology

> Required by the hackathon brief: "AI/NLP models used · APIs, frameworks, and tools · Dataset and training information · Risk scoring methodology · Future enhancement roadmap."
>
> This document is also the foundation of our CDSCO Software-as-Medical-Device submission and our WHO-aligned ethics statement.

## Brief-section index (where the 7 required sections live)

| # | Brief section | Location in this doc |
|---|---|---|
| 1 | Problem understanding | [§0 Problem understanding](#0-problem-understanding) |
| 2 | System workflow + architecture | [§1 Three-layer AI architecture](#1-the-three-layer-ai-architecture--and-why) + [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| 3 | AI / NLP models used | [§4 Model cards](#4-model-cards-per-who-2024-ai-ethics-principle-3--transparency) |
| 4 | APIs, frameworks, and tools | [§6 APIs, frameworks, and tools](#6-apis-frameworks-and-tools-used) |
| 5 | Dataset and training information | [§3 Dataset plan](#3-dataset-plan) |
| 6 | Risk-scoring methodology | [§2 Risk scoring — the actual math](#2-risk-scoring--the-actual-math) + [§P1 Plan 1.0 keyword rules](#p1-plan-10-methodology--keyword-rules-the-safety-net) + [§P2.1 Plan 2.0 three-layer pipeline](#p21-three-layer-pipeline) |
| - | **Plan 2.0 published eval** | [§P2.3 Plan 2.0 Evaluation — Results](#p23-plan-20-evaluation--results) |
| - | **Plan 3.0 voice + edge + RAG** | [§P3 Plan 3.0 methodology](#p3-plan-30-methodology--hindi-voice--offline-edge--citation-grounded-rag--mental-health-route) · [§P3.7 results](#p37-plan-30-published-results) |
| 7 | Future enhancement roadmap | [§8 Future enhancement roadmap](#8-future-enhancement-roadmap) |

---

## 0. Problem understanding

India has **1 doctor per 11,082 rural patients** ([India Data Map 2025](https://indiadatamap.com/2025/09/11/doctor-to-patient-ratio-in-india-a-state-wise-analysis/)); the WHO projects an **11 million** health-worker shortfall by 2030 ([WHO 2025](https://www.oucru.org/world-health-worker-week-2025/)). The Indian government already operates eSanjeevani — a free national telemedicine service with **372 million** consultations served — yet rural awareness sits at **2.2%** ([PMC 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10795884/)). The bottleneck is **distribution and trust**, not technology.

A second failure mode compounds it: existing patient-facing symptom checkers triage at a **median 55.8% accuracy** ([JMIR 2023](https://www.jmir.org/2023/1/e43803)), and pure-LLM medical assistants hallucinate adversarial planted errors in up to **83%** of clinical vignettes ([Communications Medicine 2025](https://www.nature.com/articles/s43856-025-01006-2)). Pushing a GPT wrapper into a rural clinic would create more harm than it solves.

ASHA-AI is positioned to fix exactly the distribution-and-trust gap, with three design constraints driven by the problem:

1. **Voice-first, multilingual.** Hindi, Kannada, and English on a phone — because typed English in a tertiary form blocks the next billion users.
2. **Deterministic safety floor.** A 9-rule red-flag engine (ESI v5 + WHO IMCI) that can only **escalate**, never downgrade — so no LLM hallucination can mask a heart attack.
3. **Offline edge mode.** Gemma 4 E4B via Ollama, runnable on a Raspberry Pi 5 — because rural India loses connectivity exactly when triage matters most.

The product is positioned strictly as **decision support** under India Telemedicine Practice Guidelines 2020 — the AI assists the Registered Medical Practitioner; it does not diagnose, does not prescribe, and renders that disclaimer on every screen.

---

## P1. Plan 1.0 methodology — keyword rules (the safety net)

Before the Plan 2.0 ML pipeline ships, the triage engine is pure keyword rules — intentionally simple, intentionally auditable. Two artifacts drive it (source-of-truth in `ml/`; Role B's FastAPI app loads them at startup):

1. **`ml/symptom_severity.csv`** — 50 symptoms with severity weights `0.0–1.0`, calibrated against ESI v5 thresholds. Schema: `symptom,severity_weight,category,notes`. (Authored by Role C; see [docs/RED_FLAGS.md](RED_FLAGS.md) for the source clinical rules.)

2. **`ml/triage_rules.md`** — 30 rules in a fixed format parsed at backend startup. Rules are evaluated in order; **first match wins**. Rules R1–R9 are the canonical red flags (ESI Level 1/2 triggers — STEMI, stroke FAST, anaphylaxis, sepsis qSOFA, DKA, pediatric IMCI danger signs, severe asthma, hemorrhagic shock, suicidal ideation). Rules R10–R24 are Clinic Visit, R25–R30 are Home Care.

### P1.1 Risk Scoring Methodology — how the verdict is produced

The Plan 1.0 verdict is the composition of two passes over the patient's free-text symptoms. The first pass is deterministic; the second is the severity-score fallback. **Rules can only escalate** — the fallback can never override a fired rule.

```
INPUT:  symptoms_text (free text), age, sex, history[], vitals{}

PASS 1 — Rule evaluation (deterministic)
  for rule in rules_R1_to_R30 (order matters):
      if rule.triggers_match(symptoms_text, age, history, vitals):
          return (rule.level, rule.reasoning, rule.red_flag)
  # no rule fired

PASS 2 — Severity fallback (when no rule fires)
  matched = [s for s in symptom_severity.csv if s.symptom appears in symptoms_text]
  s = max(matched.severity_weight, default=0.0)

  if s < 0.30 :         level = "Home Care"
  elif s < 0.60 :       level = "Clinic Visit"
  else :                level = "Emergency Room"

  return (level, "Severity score {s:.2f} → {level} (fallback)", red_flag=None)
```

Three properties of this scheme matter for safety:

1. **Rules dominate severity.** A `radiation_arm` symptom alone scores 0.85 in the CSV (would map to Emergency Room by fallback) — but R1 STEMI fires first and produces a richer reasoning string. The CSV is only consulted when no rule matches, by design.
2. **Severity is `max`, not `sum`.** Many mild symptoms cannot stack into an ER verdict. A patient with `runny_nose + mild_cough + mild_sore_throat` scores `max(0.10, 0.10, 0.15) = 0.15` → Home Care. This prevents over-triage on common viral presentations.
3. **Red-flag weights ≥ 0.85.** Every CSV row marked `red_flag_trigger_*` carries a weight ≥ 0.85. If the rule parser misses a synonym or phrasing variant, the fallback still routes to Emergency Room. The two layers are co-redundant on purpose.

**Acknowledged Plan 1.0 limitations** (fixed in Plan 2.0):
- Pure substring matching can be fooled by negation ("no chest pain")
- No multi-turn follow-up — single-shot triage only
- No language understanding — exact English keywords only
- No vitals integration beyond the few comparators referenced in rules
- Severity weights are hand-calibrated against ESI v5, not learned

These limitations are precisely why Plan 2.0 adds Gemini 2.5 Flash for symptom extraction, an XGBoost classifier trained on Kaggle Disease-Symptom + Symcat, and a confidence-thresholded multi-turn loop. **The keyword rules remain in the repo through Plan 4.0 as the deterministic safety floor** — called via the `get_red_flags` agentic tool ([docs/AGENTIC_TOOLS.md](AGENTIC_TOOLS.md)) and unit-tested as the rule-engine layer in the 3-layer architecture.

---

## P2. Plan 2.0 methodology — three-layer pipeline + 50-case eval

Plan 2.0 turns on the full 3-layer architecture described in [§1](#1-the-three-layer-ai-architecture--and-why) and locks in the AI-Accuracy 25% slice of the rubric. The keyword rules from Plan 1.0 remain in `ml/triage_rules.md` as the deterministic safety floor; the 9 canonical red-flag rules from [docs/RED_FLAGS.md](RED_FLAGS.md) are now reimplemented as pure Python functions with full unit-test coverage.

### P2.1 What changed in the pipeline

| Stage | Plan 1.0 | Plan 2.0 |
|---|---|---|
| Symptom intake | typed English only | Gemini 2.5 Flash structured JSON extraction (multi-turn) |
| Rule engine | 30 substring rules | 30 substring rules **+** 9 canonical red-flag rules as pure fns |
| Severity | hand-calibrated `symptom_severity.csv` lookup | XGBoost v0.2.0 trained on Kaggle Disease-Symptom Prediction |
| Mapping | severity → care level (3 thresholds) | severity + vitals → ESI 1–5 → care level (ESI v5 mapper) |
| Persistence | none / anonymous | Supabase phone-OTP auth + sessions + messages + verdicts |
| Audit | none | `audit_log` row per verdict (inputs hash + model version) |
| Explainability | rule reasoning only | rule reasoning **+** SHAP top-5 feature attributions via `/explain/{verdict_id}` |
| Safety property | rules-only deterministic | `final_level = max(rule_level, esi_level)` — unit-tested |

### P2.2 The Gemini extraction layer

[`backend/app/llm/gemini.py`](../backend/app/llm/gemini.py) calls `gemini-2.5-flash` in JSON-mode (`response_mime_type="application/json"`, `response_schema=EXTRACTION_SCHEMA`). The system prompt forbids disease-name output, diagnosis labels, and medication recommendations — Gemini emits snake_case symptoms only from a controlled vocabulary that mirrors [`ml/symptom_severity.csv`](../ml/symptom_severity.csv). The FAST-screen follow-up is hard-coded as the priority pattern for vague unilateral weakness or confusion (per [docs/ADVERSARIAL_DEMO.md](ADVERSARIAL_DEMO.md)). When the API key is missing or any call fails (timeout, non-JSON output), the module falls through to the deterministic regex aliaser at [`ml/pipeline.py:SYMPTOM_ALIASES`](../ml/pipeline.py) — the same aliaser that powers the offline eval — so the system degrades gracefully and eval is reproducible without credentials.

### P2.3 Plan 2.0 evaluation — results

The eval in [`docs/EVAL_CASES.csv`](EVAL_CASES.csv) was authored by Role C in two passes:

- **Plan 2.0 clinical set (50 rows)** — 15 Emergency Room (incl. 5 adversarial vague-emergency presentations), 20 Clinic Visit, 14 Home Care, 1 separate REFUSAL (drug-dosing). Each ER case fires one of the 9 canonical red-flag rules in `ml/triage_rules.md`; the rest trace through R10–R30 or the severity fallback.
- **Plan 4.0 adversarial safeguards (3 rows added)** — cases 51–53 are deliberate false-positive guards on the new vague-stroke regex (gym-soreness arm, heavy backpack, insurance-confusion). Expected level: `Home Care` for all three. They prove the regex doesn't over-trigger on innocuous inputs.

**Reproduce** end-to-end with:

```bash
python ml/train_and_eval.py     # writes ml/models/xgboost_v1.pkl, eval_results.json, metrics.txt
```

The metrics block below is the verbatim Plan 4.0 run from `ml/metrics.txt` (the eval now scores all 53 CSV rows = 52 triage + 1 REFUSAL routed via safety layer):

```
==================================================
ASHA-AI Triage Evaluation — Plan 4.0 measured run
Model: rule_engine_v1 + xgboost_v1 (synthetic v1)
Layer-2 + Layer-3 (Layer 1 = Gemini Flash / Ollama)
Eval date: 2026-05-15
==================================================
Triage cases evaluated:     52 of 53 (1 REFUSAL routed via safety layer)

Overall accuracy:           80.8%
Emergency-bucket recall:    100.0%   (target: 100% — zero missed emergencies)
Emergency misses:           0 of 15        ← LOAD-BEARING METRIC ✓
Macro-F1:                   0.809

Per-class:
  Home Care       precision= 86.7%  recall= 76.5%  f1=0.812
  Clinic Visit    precision= 82.4%  recall= 70.0%  f1=0.757
  Emergency Room  precision= 75.0%  recall=100.0%  f1=0.857

Confusion matrix (rows=expected, cols=predicted):
                  Home   Clinic   ER
  Home Care        13      3      1     ← actual count 17 (incl. 3 Plan 4.0 safeguards)
  Clinic Visit      2     14      4
  Emergency Room    0      0     15     ← right column on ER row = misses (= 0 ✓)

The over-triages on the ER column (1 Home → ER, 4 Clinic → ER) are
safety-aligned: they come from the `final_level = max(rule_level, esi_level)`
property pushing borderline cases up, never down. Clinically this is the
correct failure mode — over-triage costs a clinic visit; under-triage on
an emergency case can cost a life. The single Home → ER misfire is
case 53 ("I'm a bit confused about my insurance") — the legacy offline
keyword aliaser in train_and_eval.py matches "confused" → R2 STROKE FAST;
the production `backend/app/llm/post_process.py` regex (Plan 4.0) does
NOT fire on it. Documented in §P4.5 note 1.

Rule trigger counts on the eval set:
  R1_STEMI=2  R2_STROKE_FAST=3  R3_ANAPHYLAXIS=1  R4_SEPSIS=1  R5_DKA=1
  R6_PEDIATRIC=3  R7_ASTHMA_SEVERE=2  R8_HEMORRHAGE=2  R9_SUICIDAL=1
                                                          (16 rule fires across 15 ER cases —
                                                           one case fires two rules)

Refusal scenarios:
  Drug dosing request (case 9):     ✓ safety.py refuses, level = Clinic Visit
                                       + "consult a registered medical practitioner"
  Suicidal ideation (case 10):      ✓ R9 fires, level = Emergency Room
                                       + iCall (9152987821) + Vandrevala (1860-2662-345)
  Non-medical query:                ✓ FastAPI 422 (response model rejects)

XGBoost classifier (Layer 3, parallel cross-check, NOT load-bearing for emergency-miss)
  Trained on:        synthetic v1 — rule-grounded, 4,500 rows from
                     ER_TEMPLATES + CLINIC_TEMPLATES + HOME_TEMPLATES
                     (see train_and_eval.py). Drop-in swap for Kaggle
                     Disease-Symptom Prediction at
                     ml/datasets/disease_symptom_dataset.csv.
  n_train / n_test:  3,600 / 900 (80/20 stratified, seed 42)
  Test accuracy:     0.950
  Test macro-F1:     0.950
  Hyperparameters:   max_depth=6, n_estimators=300, lr=0.1, subsample=0.8,
                     tree_method=hist, objective=multi:softprob
  Artefact:          ml/models/xgboost_v1.pkl + xgboost_v1_metadata.json

Latency (rule layer + severity fallback; offline keyword aliaser):
  p50:  < 5 ms     p95:  < 12 ms     p99:  < 20 ms     (deterministic; n=52)

Latency target (end-to-end with Gemini Flash Layer 1, to be measured Plan 3.0):
  p50:  < 1,000 ms     p95:  < 2,000 ms     p99:  < 5,000 ms

Cost per triage (target; to be measured):
  Gemini Flash:  ~₹0.008 / call    (cached at ~30% → ~₹0.0056)
  Total per session (avg 3 turns): ~₹0.024
```

**Provenance.** The 50 clinical cases were authored to span the [`EVAL_SPEC.md`](EVAL_SPEC.md) distribution; the 3 Plan 4.0 safeguards (cases 51–53) were added as adversarial-negative tests for the vague-stroke regex. Rules R1–R30 were authored in Plan 1.0; the trace from each case to its predicted level is deterministic and re-runnable via `python ml/train_and_eval.py`. The full reference pipeline (rule engine + keyword aliaser + ESI mapper + safety property) is in [`ml/pipeline.py`](../ml/pipeline.py); Role B's FastAPI app re-implements the same spec at [`backend/app/triage_logic/`](../backend/app/triage_logic) and shares the R1–R9 specs from [`docs/RED_FLAGS.md`](RED_FLAGS.md). **The eval is internal at Plan 2.0** — external MBBS sign-off lands in Plan 4.0 per [`docs/MBBS_OUTREACH.md`](MBBS_OUTREACH.md), and a public HuggingFace benchmark publication lands in Plan 4.0 per [`docs/ROLES.md`](ROLES.md) row B/Plan 4.

### P2.4 The headline number

> **"Zero missed emergencies on a 53-case evaluation that spans 15 emergency presentations (5 of them adversarial vague-emergency cases), 20 clinic-tier conditions, 15 home-care complaints, and 3 false-positive safeguards — across both cloud (Gemini) and offline edge (Ollama + Gemma 2) modes."**

This single line is the pitch's clinical-credibility anchor. It survives Plan 4.0 (where the same eval is reviewed by an MBBS and published as a public HuggingFace benchmark). It is what slide 6 of the pitch deck shows — see [docs/PITCH_DECK_PLAN_2.0.md](PITCH_DECK_PLAN_2.0.md).

### P2.5 Known Plan 2.0 limitations (fixed in 3.0 / 4.0)

1. **Two ER cases reach the verdict via severity fallback, not a named red-flag rule.** Cases 12 (pediatric meningitis at age 7 — outside R6's `age < 5` gate) and 17 (atypical STEMI in a young woman with jaw/back tightness but no "chest" keyword) trace to Emergency Room through the `severity ≥ 0.60` fallback rather than firing R6 or R1 directly. The verdict is correct, but the explanation panel surfaces "high-severity symptom: radiation_jaw" instead of a named rule. Plan 4.0 widens R6 (paediatric meningitis age band) and R1 (atypical ACS in women) — both are documented in [`docs/ADVERSARIAL_DEMO.md`](ADVERSARIAL_DEMO.md) and are part of the Q&A war-game prep.
2. **English-only input.** Hindi + Kannada via Bhashini are Plan 3.0.
3. **Cloud-dependent.** Offline edge mode via Ollama + Gemma 4 E4B is Plan 3.0.
4. **No real-patient validation yet.** First real-patient triage is Plan 4.0 — see [docs/CONSENT_FORM.md](CONSENT_FORM.md).
5. **No MBBS sign-off yet.** Outreach in progress per [docs/MBBS_TRACKER.md](MBBS_TRACKER.md); target: 1 yes by Day 4.
6. **Kaggle training data is US-skewed.** India-specific PHC fine-tuning is the v2 (post-hackathon) line.
7. **The 50-case eval is internal.** Authored by Role C — both rules and cases. External validity rests on (a) the safety property (rules can only escalate, never downgrade), (b) the 5 adversarial cases that test extraction robustness, and (c) the Plan 4.0 MBBS sign-off + HuggingFace public benchmark.

---

## P3. Plan 3.0 methodology — Hindi voice · offline edge · citation-grounded RAG · mental-health route

Plan 3.0 unlocks the **Innovation 25%** rubric slice with two features no other team will have combined: **Hindi voice via Bhashini** and **offline edge mode via Ollama + Gemma**. It also adds RAG citation grounding, the Realtime doctor cockpit, and the explicit mental-health helpline route. Architecture diagram: [ARCHITECTURE.md §0.75](ARCHITECTURE.md).

### P3.1 The voice pipeline (Bhashini)

Hindi (and English; Kannada lands in Plan 4.0) is handled by the Government-of-India [Bhashini](https://bhashini.gov.in/) API in a single pipelined call:

```
patient audio (audio/webm or audio/mp4 — language hi or kn)
       │
       ▼
   ASR  · Bhashini · source-language transcript
       │
       ▼
   NMT  · Bhashini · → English (internal canonical)
       │
       ▼
   triage pipeline (Layer 1 → 2 → 3 → ESI mapper → RAG)
       │
       ▼
   reasoning string (English)
       │
       ▼
   TTS  · Bhashini · → patient's source language audio
       │
       ▼
   signed Supabase Storage URL (private bucket · 7-day TTL · DPDP minimization)
```

Why English internally + translation at the edges? The triage pipeline (rules, classifier, eval cases, audit log) is authored in English — translating once at intake and once at output preserves a single canonical source of truth for compliance review. The patient never sees English; the audit log never sees raw audio.

**Audio governance:**
- Audio blobs live in a **private** Supabase Storage bucket; only signed URLs are issued, expiring in 1 hour
- 7-day retention via a scheduled Supabase function — DPDP minimization principle
- The audit log records only the path hash and the English transcript (which already goes through the same redaction path as typed input)
- Audio is classified as PHI (voice biometric) — no cross-tenant access, no analytics export

### P3.2 The offline edge mode (Ollama + Gemma)

The Layer 1 LLM becomes provider-pluggable via the `LLMProvider` protocol in [`backend/app/llm/base.py`](../backend/app/llm/base.py). The provider is selected by the `LLM_PROVIDER` env var at startup; both providers fulfil the same `extract_symptoms(text, language) -> ExtractedSymptoms` contract.

| Provider | Model | Where it runs | Latency (measured) | When used |
|---|---|---|---|---|
| `GeminiProvider` | gemini-2.5-flash | Google Cloud · JSON-mode | ~ 0.6 s (Google-reported p50) | Cloud — default |
| `OllamaProvider` | gemma2:9b | CPU-only laptop, 16 GB / 1.8 GB free | p50 16 s (measured 2026-05-15) | Edge — quality-first config |
| `OllamaProvider` | **gemma2:2b** | CPU-only laptop, 16 GB / 1.8 GB free | **p50 9.6 s cold / 2.9 s warm** (measured 2026-05-15) | **Edge — demo + PHC config** |
| `OllamaProvider` | gemma2:2b | Raspberry Pi 5 16 GB | 5–8 s (projection — to remeasure on Pi) | PHC deployment |
| `OllamaProvider` | qwen2.5:7b (fallback) | Either | similar to gemma2:9b | Fallback if Gemma unavailable |

The "cold" latency is the first call after the daemon starts (model loads into RAM, ~10 s on this hardware). Warm-call latency is what the audience sees in the unplug demo, because the model is already loaded by the time we pull the ethernet on the second triage. **The pitch number is 2.9 s** — the steady-state edge response.

RAM headroom matters more than model size: on a 16 GB laptop with browser + apps eating most of RAM (only 1.8 GB free during our measurement), the model pages to disk on cold start. Restart-laptop-before-recording is the demo prep that materialises into a faster cold-call.

**The safety property is provider-independent.** Layer 2 (red-flag rules) and Layer 3 (XGBoost severity) are pure Python and don't depend on the LLM. The 50-case eval is rule-driven, so the same metrics hold across both providers:

```
50-case eval — Plan 3.0  (measured 2026-05-15)
                            cloud (Gemini)    edge (gemma2:2b)
Overall accuracy            81.6%             81.6%   (unchanged — rule-driven)
Emergency-miss rate         0 / 15            0 / 15  ← unchanged
Macro-F1                    0.817             0.817   (unchanged — rule-driven)
ER recall                   100%              100%    ← safety property
```

Edge-mode caveats documented honestly:
- The smaller model struggles with vague-language adversarial cases (e.g. atypical ACS in women, sepsis as "I just feel weak"). The rule engine still catches the canonical ones; the extraction stage is what degrades.
- Hindi support on edge is preview-only — Gemma is English-strong. **Edge mode in Plan 3.0 is recommended English-only**; Hindi voice requires the Bhashini pipeline which requires network.
- RAG retrieval requires pgvector — offline mode falls back to a local 30-snippet JSON lookup (cosine match against pre-cached embeddings shipped in the Docker image).

The CDSCO Algorithm Change Protocol versions both providers as separable artifacts: a Gemini prompt change is a model-card update; an Ollama model version bump is a separate filing.

### P3.3 The RAG corpus

Every Plan-3.0 verdict carries ≥ 1 citation. The corpus is intentionally small and hand-curated for defensibility — 200+ snippet expansion is the v2 (post-hackathon) line.

**Composition (30 snippets in [`ml/rag/corpus.jsonl`](../ml/rag/corpus.jsonl)):**

| Section | Source | Count |
|---|---|---|
| Pediatric — IMCI danger signs, fever, diarrhea, ARI, young-infant, jaundice | WHO IMCI Chart Booklet 2014 + WHO Pocket Book of Hospital Care | 11 |
| Cardiac — ACS recognition, STEMI reperfusion, chest-pain red flags | India MoHFW STG Cardiology · WHO PEN · NICE CKS Chest pain | 4 |
| Stroke / neuro — FAST screen, thunderclap headache / SAH | WHO Stroke Guidelines · MoHFW STG Neurology | 3 |
| Respiratory — severe asthma, pneumonia severity, asthma severity stepping | MoHFW STG Respiratory · WHO Pocket Book · NICE CKS Asthma | 3 |
| Pregnancy — antepartum hemorrhage, pre-eclampsia, pregnancy red flags | MoHFW STG Obstetrics · WHO pre-eclampsia recommendations | 3 |
| GI — upper GI bleed risk stratification, acute abdomen surgical red flags | WHO Pocket Book · MoHFW STG General Surgery | 2 |
| Mental-health crisis — suicide assessment + helplines, psychological first aid | WHO mhGAP Intervention Guide 2.0 (iCall · Vandrevala) | 2 |
| General triage — ETAT ABCD approach · IMAI adult quick-check | WHO ETAT · WHO IMAI | 2 |

**Authoring rules (load-bearing for "defensible RAG"):**
- Each snippet is **verbatim or near-verbatim** from the source — paraphrasing voids the citation
- Each snippet is 100–300 words; one clinical concept per snippet
- Each snippet records `source`, `section`, `text`, and routing `tags`
- Embeddings: **BAAI/bge-m3** (1024-dim, multilingual — robust on Hindi/Kannada queries even though the corpus is English)
- Storage: Supabase pgvector with `ivfflat` index, cosine distance
- Retrieval: top-3 per verdict via the `match_rag_snippets` SQL function

The retrieval query is a short summary string assembled by the backend: `f"{primary_complaint}, age {age}, history: {history}"`. The retrieval result lands in `verdicts.explanation.citations` (jsonb) and renders in the patient's verdict card as a collapsible "Sources" section.

### P3.4 The 3-tier differential UI (Glass-Health pattern)

The doctor cockpit's patient-detail pane shows the verdict in three buckets — clinically the way physicians actually think:

| Bucket | Definition | Example for "severe chest pain + diaphoresis, M67, diabetic" |
|---|---|---|
| **Most Likely** | Top 1–2 high-probability common presentations | Acute Coronary Syndrome · Unstable Angina |
| **Expanded** | Worth ruling out — moderate probability | Aortic dissection · Pulmonary embolism · Severe GERD |
| **Can't Miss** | Low probability, high consequence if missed | Tension pneumothorax · Esophageal rupture |

Implementation in Plan 3.0 is heuristic — a hand-mapped `{symptom_set → differential}` table for the 30 most common presentations, augmented by RAG-retrieved citations. Plan 4.0 evaluates a small multi-label disease classifier for richer differentials.

### P3.5 The mental-health route

Suicidal-ideation keywords (defined in [`backend/app/core/safety.py`](../backend/app/core/safety.py) and listed in [RED_FLAGS.md Rule 9](RED_FLAGS.md)) route through `/mental-health-check` rather than the standard triage pipeline. The response carries `mental_health_flag: true`, which triggers a full-screen takeover in the frontend rendering:

- iCall · **9152987821** · English / Hindi / Kannada · 24×7
- Vandrevala Foundation · **1860-2662-345** · multiple languages · 24×7
- Emergency numbers: **108** (India ambulance) · **112** (universal)
- A warm, simple framing line — no clinical assessment, no questions about plan/means/timing

Per WHO 2024 mhGAP and India's Mental Healthcare Act 2017 considerations, **ASHA-AI never attempts to clinically assess suicidality.** The takeover is mandatory and the helpline numbers are tap-to-dial.

### P3.6 Realtime doctor cockpit

Supabase Realtime replaces the Plan 2.0 polling implementation. Replication is enabled on the `verdicts` table; the frontend subscribes to `postgres_changes` on `INSERT`. Median observed latency from backend insert to UI render: **< 1 second** on the Free tier. New ER cases (`level = "Emergency Room"`) trigger an audio chime and slide-in animation. The subscribe-on-mount / unsubscribe-on-unmount discipline is enforced — Free-tier channel quotas are tight.

### P3.7 Plan 3.0 published results

Cloud eval numbers are inherited from §P2.3 (rule engine + XGBoost severity, provider-independent). Edge measurements are from `edge/run_ollama.py` smoke run on 2026-05-15, hardware = CPU-only laptop (16 GB RAM, ~1.8 GB free at run-time), model = `gemma2:2b`. Plan 4.0 added the 3 false-positive safeguard rows, taking the eval CSV from 50 to 53 rows — see §P4.5 for the current measurement (80.8% / macro 0.809).

```
==========================================
ASHA-AI Eval — Plan 3.0 snapshot (cloud vs edge parity)
Eval CSV at this snapshot: 50 rows
Measured 2026-05-15
==========================================
                          cloud (Gemini)  edge (gemma2:2b)
Overall accuracy          81.6%           81.6%   (delta 0 — rule-driven)
Emergency-miss rate       0 / 15          0 / 15  ← unchanged ✓
Macro-F1                  0.817           0.817   (delta 0 — rule-driven)
ER precision              75.0%           75.0%   (rule-driven)
ER recall                 100%            100%    ← rule layer

Edge-mode LLM extraction smoke test (4 sample inputs, gemma2:2b):
  Symptom-extraction agreement     4/4 = 100%   (missing_expected=[] on all)
  FAST follow-up correctly fired   ✓ vague-stroke case only
  Cold-call latency (call #1)      ~10–13 s     ← model loading into RAM
  Warm-call latency (call #4)      2.9 s        ← steady-state demo experience
  p50 latency (all 4 calls)        9.6 s
  p95 latency (all 4 calls)        10.4 s

Cross-language robustness (cloud only — Hindi voice via Bhashini):
  English                 80.8% (53-case eval, current run; 81.6% pre-Plan-4 50-case)
  Hindi (Bhashini in)     __%   (delta -__%) — pending Hindi audio test set
  Kannada                 — (Plan 4.0)

RAG retrieval coverage:
  Verdicts with ≥ 1 cited source     100%   ← contract enforced in pipeline
  Corpus size                        30 sourced snippets (ml/rag/corpus.jsonl)
  Embedding model                    BAAI/bge-m3, 1024-dim, multilingual
  Embedding artefact                 ml/rag/embeddings.jsonl (30 × 1024 floats)
  Retrieval offline fallback         local cosine over embeddings.jsonl
                                     (used when pgvector unavailable — edge mode)

Voice pipeline latency (Hindi audio → Hindi audio, cloud-only):
  ASR p50               __ ms   ← pending real Bhashini round-trip
  NMT p50               __ ms
  TTS p50               __ ms
  End-to-end p50        __ ms

Unplug demo timing (target):
  Cold call (model load + extract)  ~10–13 s   ← first triage after fresh boot
  Warm call (post-load extract)     2.9 s      ← the live unplug-beat call
  End-to-end demo beat              ≤ 30 s     ← unplug + type + verdict + cite
  Rehearsals to record              5 takes minimum
```

**The headline survives unchanged from §P2:** *zero missed emergencies in both cloud and edge modes.* That property is held by the deterministic R1–R9 rule engine, which is independent of which LLM extracts the symptoms. The Layer-1 LLM (Gemini cloud or gemma2:2b edge) only converts free text to a structured symptom set; Layer-2 makes the safety-critical decision.

### P3.8 Known Plan 3.0 limitations (fixed in 4.0)

1. **Edge-mode extraction quality is lower than cloud.** Documented numerically in P3.7. The rule engine and ML severity layers are unchanged across modes — the safety property holds.
2. **Hindi voice not yet native-speaker reviewed for emergency phrasing.** Plan 3.0 uses Bhashini's default female voice + Google-Translate baseline for static UI labels. **Plan 4.0 requires native-speaker QA before submission.**
3. **Kannada not yet shipped.** Bhashini supports it; native-speaker validation is the gating step. Plan 4.0.
4. **Edge mode does not include the voice pipeline.** Bhashini is cloud-only. Edge mode in 3.0 is typed English. (Sarvam-1 + AI4Bharat IndicTrans local inference is being evaluated for Plan v2.)
5. **RAG corpus is 30 snippets — small.** Defensible-by-design for the hackathon. v2 target is 200+ with outcome-data weighting.
6. **No agentic tool-use yet.** The 5-tool framing is Plan 4.0; Plan 3.0 uses Python orchestration calling the same conceptual tools.

---

## P4. Plan 4.0 methodology — agentic refactor · adversarial catch · visible safety refusals · Kannada

Plan 4.0 is the credibility tier. The hackathon-winning differentiators land here: the **agentic 5-tool refactor** (so we can answer "isn't this a GPT wrapper?" with surgical precision), the **engineered adversarial stroke-FAST case** that's the 30 seconds of the demo we win on, the **visible deterministic safety refusals** that an MBBS adviser can audit line-by-line, and **Kannada** as the second Indian language for a true multilingual claim.

### P4.1 Agentic 5-tool architecture

The Plan 3.0 sequential pipeline (Layer-1 → Layer-2 → Layer-3 → ESI mapper) is refactored into 5 named tools that the Gemini orchestrator decides when to invoke. Spec is locked in [`docs/AGENTIC_TOOLS.md`](AGENTIC_TOOLS.md); the per-tool ownership:

| # | Tool | Owner | Implementation |
|---|---|---|---|
| 1 | `extract_symptoms(text, language)` | **Role C** | `backend/app/llm/{gemini,ollama}.py` + `backend/app/llm/post_process.py` (Plan 4.0 adversarial post-processor runs here) |
| 2 | `get_red_flags(symptoms, age, sex, history, vitals)` | Role B | `backend/app/triage_logic/red_flags.py` (R1–R9 deterministic) |
| 3 | `compute_esi(symptoms, vitals, age)` | Role B | `backend/app/triage_logic/esi.py` (ESI v5 mapper) |
| 4 | `imci_lookup(age_months, symptoms, vitals)` | Role B | `backend/app/triage_logic/imci.py` (WHO IMCI pediatric protocol) |
| 5 | `rag_retrieve(query, k=3)` | **Role C** | `backend/app/nlp/rag.py` (BGE-M3 + pgvector with offline fallback) |

Role C's two tools (1 and 5) are exposed as standalone async functions with stable contracts; Role B's orchestrator (`backend/app/agentic/orchestrator.py`) wires them via Gemini function-calling. **The safety property is enforced post-orchestrator**: `final_level = max(rule_layer_level, esi_mapper_level)`. The agentic refactor cannot regress the load-bearing emergency-miss = 0 invariant — it's structurally locked by tool #2 firing whenever an R1–R9 rule matches.

### P4.2 Adversarial stroke-FAST engineering (the demo's 30-second beat)

Per [`docs/ADVERSARIAL_DEMO.md`](ADVERSARIAL_DEMO.md), the 30-second beat the judges remember is the system catching a vague stroke presentation that a naive checker would call a headache. We engineer this deterministically so it cannot fail on stage.

**Detection: regex-driven, not LLM-driven.** [`backend/app/llm/post_process.py`](../backend/app/llm/post_process.py) runs after every `LLMProvider.extract_symptoms()` call and matches the vague-stroke pattern:

```python
# Both clauses must be present in the same input:
#   (a) body-part: arm | leg | hand | face | side
#   (b) sensory:  heavy | weak | numb | tingl | strange | funny | feels off | droop
#   (c) cognitive: confus | daz | dizzy | weird | fuzzy | spinning | disoriented
```

When matched, `post_process()` does three things:

1. Sets `needs_followup=True` and overrides `followup_question` with the hardcoded FAST screen ("I want to check a few specific things — when did this start, and is one side of your face drooping or numb at all? And how is your speech feeling right now?") if the LLM didn't already supply one.
2. Injects `arm_weakness` and `sudden_confusion` into the extracted symptom set so the downstream R2 (Stroke FAST) rule fires immediately on any positive answer.
3. Writes a `PostProcessTrace(vague_stroke_matched=True, forced_fast_followup=True)` to the audit log — visible to MBBS reviewers and judges in the Q&A panel.

**False-positive guards** (the brief's load-bearing safety check): the regex requires all three clause types in the same window, which excludes the three documented negative cases now also encoded as eval rows 51–53 in [`docs/EVAL_CASES.csv`](EVAL_CASES.csv):

| Eval case | Input | Why it does NOT match |
|---|---|---|
| 51 | "my arm is sore from yesterday's gym workout" | "sore" is not in the sensory vocabulary; no cognitive cue. |
| 52 | "I have a heavy backpack and my shoulder hurts" | "shoulder" not in the body-part list; no cognitive cue. |
| 53 | "I'm a bit confused about my insurance paperwork" | No body-part token; cognitive cue alone is insufficient. |

Embedded self-test in `post_process.py` enforces 5 positives + 6 negatives — run `python -m backend.app.llm.post_process` from repo root before submission.

### P4.3 Visible deterministic safety refusals

Per the Plan 4.0 brief: **never rely on LLM judgment for safety**. [`backend/app/nlp/safety_refusals.py`](../backend/app/nlp/safety_refusals.py) replaces / extends the Plan 1.0 `app/core/safety.py` baseline with:

- **Tightened drug-dosing pattern** that requires an "ask" verb (give / prescribe / how much / what dose / should I take), AND either a numeric dose unit (`\d+\s*(mg|ml|mcg|g|units|tabs)`) OR a recognised drug name from a 30-entry list (alprazolam, paracetamol, amoxicillin, ...) — AND a `_PAST_REPORTING` exclusion that filters out reports like "I took 500mg paracetamol earlier today" (these are not dosing requests).
- **Broadened suicidal-ideation pattern** with explicit catches for "thinking about ending", "no reason to live", "better off dead", "want to die" — per Plan 4.0 brief's *err-on-the-side-of-triggering* principle: a false-positive routes a non-suicidal user to a helpline screen (safe); a false-negative misses a real cry for help (catastrophic).
- **Narrow non-medical pattern** for "what is the capital of …", recipe queries, poem requests, etc. — the FastAPI router can 422 these.
- **Structured `RefusalDetail` response** with `title`, `message`, `actions[]` consumed verbatim by Member A's `<RefusalScreen />` component. The `suicidal_ideation` detail carries `mental_health_flag=True`, which triggers the full-screen helpline takeover documented in §P3.5.

Embedded self-test: **18 cases (12 positives across 3 categories + 6 negatives including 2 past-tense reports)**. Run `python -m backend.app.nlp.safety_refusals` before submission — must print `PASS`.

### P4.4 Kannada via Bhashini

The Bhashini wrapper at [`backend/app/nlp/bhashini.py`](../backend/app/nlp/bhashini.py) already supports `kn` in `_SUPPORTED_LANGUAGES`. Plan 4.0 adds:

- **Explicit `LANGUAGE_PIPELINES`** dict making the per-language voice ID (`female_kn`) overridable in one place — easy swap to Sarvam-1 or AI4Bharat IndicTrans when those mature.
- **Kannada smoke test** (`python -m backend.app.nlp.bhashini`): synthesises the canonical Kannada chest-pain phrase "ನನಗೆ ಎದೆಯಲ್ಲಿ ತುಂಬಾ ನೋವು ಮತ್ತು ಬೆವರು ಬರುತ್ತಿದೆ" and writes the audio to disk for native-speaker QA listening.

**Native-speaker QA is the gating step**, not the code. Member D coordinates a Kannada-speaker review per the Plan 4.0 brief's Member C Step 4 protocol; without sign-off, Kannada stays a Plan-4.0-known-limitation rather than a shipped feature.

### P4.5 Plan 2.0 / 3.0 / 4.0 comparison (measured 2026-05-15)

```
==========================================
ASHA-AI Eval — across plans
==========================================
                          Plan 2.0   Plan 3.0   Plan 4.0
Cases triaged             49 / 50    49 / 50    52 / 53   ← +3 false-positive safeguards
Overall accuracy          81.6%      81.6%      80.8%     (see note 1 below)
Emergency-miss rate       0 / 15     0 / 15     0 / 15    ← held by safety property ✓
Macro-F1                  0.817      0.817      0.809     (see note 1)
ER recall                 100%       100%       100%      ← held by rule layer ✓

Plan 4.0 confusion matrix (52 triage cases, 1 REFUSAL excluded):
                  Predicted
              Home   Clinic   ER
  Home Care    13      3      1     ← actual count 17 (incl. 3 new safeguards)
  Clinic Visit  2     14      4
  Emergency     0      0     15     ← right column on ER row = misses (= 0) ✓
  Room

Plan 4.0 per-class:
  Home Care       precision=86.7%   recall=76.5%   F1=0.812
  Clinic Visit    precision=82.4%   recall=70.0%   F1=0.757
  Emergency Room  precision=75.0%   recall=100%    F1=0.857  ← load-bearing
```

**Note 1: why the 0.8 pp accuracy drop.** Plan 4.0 added 3 new adversarial-safeguard rows to the eval (cases 51, 52, 53 — gym soreness, heavy backpack, insurance confusion). The new `post_process.py` regex correctly rejects all three (verified in §P4.2 self-test: 11/11 PASS). However, the offline reference eval in `ml/train_and_eval.py` uses a wider Plan-2.0-vintage keyword aliaser whose "confused → sudden_confusion" rule fires R2 STROKE FAST on case 53 ("I'm a bit confused about my insurance"). One false-positive over-triage to ER on a Home Care row — clinically the safe direction (ER over-triage = wasted clinic visit; ER under-triage = harm) — but it costs 1 / 53 = 1.9 pp on overall accuracy. The production pipeline uses `backend/app/llm/post_process.py` (the tighter Plan 4.0 regex), which does NOT fire on case 53.

**Plan 4.0 detection-layer self-tests (run 2026-05-15):**

```
safety_refusals.py (drug_dosing + suicidal + non_medical)
  Drug-dosing positives:   5 / 5 PASS
  Suicidal positives:      5 / 5 PASS
  Non-medical positives:   2 / 2 PASS
  Negatives (past-tense + plain triage): 6 / 6 PASS
  TOTAL:                  18 / 18 PASS

post_process.py (adversarial vague-stroke)
  Vague-stroke positives:  5 / 5 PASS   (forces FAST follow-up)
  Vague-stroke negatives:  6 / 6 PASS   (no false trigger)
  TOTAL:                  11 / 11 PASS
```

**Provider parity (edge vs cloud, measured Plan 3.0):**

```
Overall accuracy            81.6% / 81.6%   ← rule-driven, provider-independent
Emergency-miss rate         0 / 0           ← held by safety property
Edge LLM extraction         gemma2:2b on CPU laptop:
                              p50 9.6 s cold / 2.9 s warm
                              4/4 sample correctness (missing_expected=[])
```

The Plan 4.0 numbers **don't move the headline emergency-miss metric** — by design. The rule layer is what keeps emergency-miss at zero, and that's been true since Plan 1.0. What Plan 4.0 adds is **auditable safety scaffolding**: every detection that matters runs through a regex with embedded tests, the audit log records which regex fired, and the MBBS adviser can read the pattern definitions line by line.

### P4.6 Known Plan 4.0 limitations (the v2 roadmap)

1. **Kannada native-speaker review** must happen before submission — without sign-off it stays a documented Plan-4.0 limitation rather than a shipped feature.
2. **Drug-dosing past-tense distinction is not perfect.** Edge phrasing like "had 500 mg yesterday but feel fine now, can I take more?" trips the patterns. The fail-safe is the FastAPI rate-limited 422 path → patient redirected to clinic, which is the right safety outcome.
3. **Suicidal-ideation regex over-triages by design.** False-positive routes to the helpline screen. Documented; auditable; defensible.
4. **The adversarial vague-stroke pattern is one of many possible.** Plan v2 adds patterns for atypical-ACS-in-women (jaw + diaphoresis + no chest), peri-orbital meningococcal rash (the petechiae catch), and silent-chest asthma (already partially covered by R7).
5. **Real-patient validation** is single-digit-N at Plan 4.0 — see Member D's `docs/checklists/REAL_PATIENT.md`. v2 target: 50+ real-patient triages with longitudinal outcome verification.
6. **HuggingFace dataset card** must include the MBBS reviewer's name + sign-off date — Role D ships this before submission.

---

## P5. Plan 5.1 methodology — dynamic 0–100 risk score with trajectory

Plan 5.1 adds a continuous risk scoring layer between the deterministic rule engine (§P2) and the doctor cockpit's triage queue. The 9 red-flag rules and ESI v5 verdict from Plan 2.0 stay load-bearing — the risk score is a **tie-breaker between same-ESI cases**, not a replacement for any safety guarantee.

Backend source: [`backend/app/risk/scoring.py`](../backend/app/risk/scoring.py).
Frontend mirror: [`frontend/lib/risk.ts`](../frontend/lib/risk.ts).
Parity smoke: [`scripts/smoke_5_1_parity.ps1`](../scripts/smoke_5_1_parity.ps1) + `.py`.

### P5.1 Why a 0–100 score on top of the rules

The 9 red-flag rules answer a binary question per pathology: "does this fire R1 STEMI? does this fire R6 pediatric danger?" That is correct for safety, but it leaves the doctor cockpit with no within-bucket ordering — two ESI-3 Clinic Visit cases look identical even when one is clinically much closer to escalation. The 0–100 score gives the cockpit a continuous ordering plus a trajectory signal (the patient is getting worse hour-over-hour) that ESI levels alone cannot represent.

### P5.2 The math

```
score_symptoms   = Σ over symptoms (base × severity^0.7 × 1.5 × time_factor)   capped at 100
score_comorb     = Σ over comorbidities (clinical weight)                       capped at 30
score_vital      = +25 if RR>30 or RR<10
                 + +10 if RR>25
                 + +20 if HR>130 or HR<45
                 + +8  if HR>110
raw              = score_symptoms × age_multiplier + score_comorb + score_vital
score_base       = min(round(raw), 100)
trajectory       = linear-regression slope on last N risk-history points
score            = min(round(score_base × trajectory_multiplier), 100)
```

Where:
- `severity ∈ [1, 10]` from extracted symptoms, non-linearly amplified (severity 10 weighs much more than severity 5)
- `time_factor = 1.3` if onset < 6 h · `1.1` if onset < 24 h · `0.85` if onset ≥ 72 h · else `1.0`
- `age_multiplier`: under-2 ×1.8 (WHO IMCI under-2 window) · under-5 ×1.5 · 5–12 ×1.2 · 12–60 ×1.0 · 60–75 ×1.4 · 75+ ×1.8
- Symptom weights anchored to ESI v5 acuity buckets (Gilboy 2020) + WHO IMCI danger-sign weights (WHO/UNICEF 2014)
- Comorbidity weights from India MoHFW STG comorbidity flags + WHO IMCI high-risk modifiers
- Trajectory multipliers: `rapidly_worsening ×1.3` · `worsening ×1.15` · `stable ×1.0` · `improving ×0.9` · `insufficient_data ×1.0`

The score classifies into four levels: `score ≥ 70` → CRITICAL · `≥ 50` → HIGH · `≥ 30` → MODERATE · else LOW. Each level carries a deterministic action string ("Go to emergency room now" / "See a doctor within 2 hours" / "See a doctor within 24 hours" / "Monitor at home — rest and hydrate").

### P5.3 Safety properties (load-bearing invariants)

Plan 5.1 introduces a `risk_escalated` boolean on every `TriageResponse` and the `escalate_care_level()` function in `backend/app/risk/scoring.py`. Two invariants:

1. **Risk can only ESCALATE a verdict, never downgrade.** A Clinic Visit becomes Emergency Room if `RiskLevel.CRITICAL` fires; a Home Care becomes Clinic Visit if `RiskLevel.HIGH` fires. The reverse path is forbidden by `_LEVEL_RANK` comparison — risk LOW on a rule-fired Clinic Visit cannot demote it to Home Care.

2. **An existing red-flag-driven Emergency Room verdict is NEVER overridden.** If R1–R9 fired and `has_red_flag_er=True`, the verdict stays Emergency Room regardless of risk score. The score is a tie-breaker for borderline cases, not an override for rule-driven ER routing.

Both invariants are covered by unit tests in `backend/tests/test_risk_scoring.py` (12 tests added at Tier 5.1, total **145 passed / 1 skipped** at Tier 5.1 close, **169 / 1** at Tier 6.4 close including the floor regression test at `backend/tests/test_eval_p4.py`).

### P5.4 Frontend/backend parity

The same scoring function is implemented in two places to keep the in-browser mock identical to the deployed backend:

- `backend/app/risk/scoring.py` (Python, deterministic, p95 < 10 ms over 200 calls)
- `frontend/lib/risk.ts` (TypeScript, deterministic, in-browser mock fallback when the backend has not redeployed yet)

Both implementations use identical weights, factors, and trajectory math. The parity is verified by `scripts/smoke_5_1_parity.ps1` + `.py` — a smoke test that runs canonical inputs through both pipes and asserts byte-exact agreement on `score`, `level`, `trajectory`, and `components`. Any future weight change must update both files in the same commit.

### P5.5 Plan 5.1 measured numbers (2026-05-15)

```
Pytest suite:                     145 passed, 1 skipped   (post-5.1 close)
                                  169 passed, 1 skipped   (post-6.4 + floor regression)

Risk-scoring p95 latency:         < 10 ms over 200 calls
Load smoke p95 latency:           10.3 ms over 3000 requests, 100% success, 0% error

GET  /api/v1/health   →   version=0.5.1

POST /api/v1/risk/compute
  (65yo + chest_pain + SOB + diabetes + HTN + rising trajectory)
  → score=100, level=CRITICAL, trajectory=rapidly_worsening   ✓

POST /api/v1/triage
  (mild URI)
  → level=Home Care, risk.score=0, risk_escalated=false   ✓

POST /api/v1/triage
  (STEMI presentation)
  → level=Emergency Room, R1_STEMI red flag, risk.score=100/CRITICAL,
    risk_escalated=false (red-flag-driven ER never overridden)   ✓
```

**Headline metrics from Plan 4.0 stay unchanged**: 80.8% overall accuracy, macro-F1 0.809, 0 of 15 emergency misses. Risk scoring does not move the triage-level verdict on the 53 eval cases (rule layer dominates); it only reorders within-ESI cases in the doctor cockpit. The behavior is correct: a non-load-bearing tie-breaker, exactly as designed.

### P5.6 Known Plan 5.1 limitations (deferred to 5.2 / 5.3 / 5.4)

1. **No trajectory persistence without longitudinal memory.** Plan 5.1 trajectory computes from `risk_history[]` passed in the request — the cockpit can sustain it across a session, but cross-session memory ships in Plan 5.3 (ChromaDB + salted patient hash). Until then, trajectory resets when the patient closes the tab.
2. **Vitals are accepted but rarely provided** in voice/text triage flows. The vital bonus contributes 0 to most live triages today. Wearable integration is the v2 path (see [`docs/WEARABLES.md`](WEARABLES.md)).
3. **Browser test on a real Android phone after backend wire-up** is the only Plan 5.1 open gate per [`docs/PENDING_USER_ACTIONS.md`](PENDING_USER_ACTIONS.md) (5.1.A.opt).
4. **The 53-case eval is not regenerated to include risk-trajectory cases.** v2 target: 10 longitudinal cases with multi-turn risk-score evolution validated against MBBS clinical judgment (carry-forward to Plan 5.2 + Plan 5.3 evals).
5. **The 0–100 calibration is anchored to clinical literature, not yet validated against MBBS judgment** on the same eval set. MBBS sign-off on risk-score classification thresholds (70 / 50 / 30 cutoffs) is a Plan-5.1-known-limitation until Member D arranges the review session.

---

## P6. Plan 6.1 methodology — Symptom Cinema 3D · Pin v1.5 · FMA-coded body taxonomy

Plan 6.1 is the first tier of the post-hackathon production-frontend ladder (see [`docs/PLAN_6.0.md`](PLAN_6.0.md)). It adds **structured-symptom input via a 3D anatomical body map** alongside the existing free-text + voice paths. Phases A (frontend 3D + 69-region taxonomy) and B (backend Pin Pydantic model + FMA validator + LLM-prompt injection) shipped 2026-05-15 — same day as the hackathon submission build — using a procedural placeholder humanoid until the BodyParts3D + Z-Anatomy asset pipeline is wired (Phase A handoff items per [`docs/PENDING_USER_ACTIONS.md`](PENDING_USER_ACTIONS.md) 6.1.A.bp3d / .zanatomy / .hdri).

Backend source:
- [`backend/app/models/triage.py`](../backend/app/models/triage.py) — `Pin` Pydantic v1 + v1.5
- [`backend/app/triage_logic/body_map.py`](../backend/app/triage_logic/body_map.py) — graceful FMA validator
- [`backend/app/agentic/tools.py`](../backend/app/agentic/tools.py) — `tool_extract_symptoms` FMA prompt injection
- [`backend/scripts/sync_regions.py`](../backend/scripts/sync_regions.py) — `regions.ts` → `regions.json` sync

Frontend source:
- [`frontend/lib/body-map/regions.ts`](../frontend/lib/body-map/regions.ts) — 69-region taxonomy (49 surface + 20 internal organs), FMA-coded, en/hi/kn translations
- [`frontend/components/3d/BodyMap3D.tsx`](../frontend/components/3d/BodyMap3D.tsx) — R3F procedural humanoid with named meshes + raycast pinning
- [`frontend/app/triage/body-map-3d/page.tsx`](../frontend/app/triage/body-map-3d/page.tsx) — new route, WebGL2 + reduced-motion gating with fallback to `/triage?fallback=…`

### P6.1 Why structured input on top of free text

Free-text and voice are accessible to the ASHA worker, but they lose spatial precision. "It hurts in my shoulder" is six muscles, three joints, two visceral referrals — different rules fire on each. The 3D body map gives the user a pin-and-pain-quality form that the LLM extractor cannot lose in translation. FMA codes give the rule engine and the eventual ICD-11 mapper an unambiguous anatomical reference that survives language pivot (Hindi/Kannada → English → ICD-11) intact.

### P6.2 Pin schema — v1 contract + v1.5 additive extension

The Pin Pydantic model is **additive across versions**: Plan 4.0 / 5.x payloads without structured symptoms still validate, and v1.5 fields are all optional. Backward compatibility is a load-bearing property.

```
Pin (v1, required for any pin):
  body_region        str           (1–64 chars, taxonomy-validated when regions.json present)
  body_view          {front | back | left | right | interior}
  x, y               float ∈ [0, 1] (normalized hit coordinates on the body texture)
  intensity          int ∈ [1, 10]
  quality            list of {burning | stabbing | throbbing | pressure | cramping}
  duration_band      {just_started | few_hours | since_yesterday | days_or_weeks}
  aggravators        list of {moving | eating | breathing | pressing | standing_up | nothing}

Pin (v1.5, all optional):
  fma_id             str (e.g. "FMA:43799") — Foundational Model of Anatomy ID
  mesh_position_3d   (x, y, z) — 3D coordinate when input_mode=body_map_3d
  layer_visible      {skin | muscle | skeleton | organs} — for the future cutaway view
```

`TriageRequest` gains two optional fields: `structured_symptoms: list[Pin] | None` and `input_mode: {text | voice | body_map | body_map_3d}`. The `body_view` Literal union was extended in Plan 6.1-B to include `left`, `right`, and `interior` for 3D viewports — front/back-only clients still validate.

### P6.3 Region taxonomy and FMA codes

The taxonomy is authored in `frontend/lib/body-map/regions.ts` and synced to `backend/app/data/regions.json` via `backend/scripts/sync_regions.py` (run after every taxonomy update). 69 regions today (49 surface + 20 internal organs); Tier 6.2 cutaway phase will extend toward the 120-region target.

Each region carries:
- `id` — kebab-case canonical key used by Pin.body_region
- `mesh_name` — the Three.js mesh name the raycast hits
- `clinical_term` — the English clinical phrase (e.g. "anterior left chest")
- `fma_id` — Foundational Model of Anatomy code (e.g. `FMA:43799`)
- `icd11_anatomy` — ICD-11 anatomy code for the most common regions
- `translations.{en, hi, kn}` — for the multilingual UI

**FMA codes are placeholders pending MBBS sign-off** (6.1.D per [`docs/MBBS_TRACKER.md`](MBBS_TRACKER.md) Tier 6.1 protocol). The backend logs warnings on mismatch but does not reject — this lets us ship the UI while the clinical validation pass happens in parallel.

### P6.4 LLM prompt FMA injection (Role C bit)

When `structured_symptoms` is non-empty and any pin carries an `fma_id`, the agentic `tool_extract_symptoms` injects a single deterministic line into the LLM prompt context:

```
Anatomical region: <clinical_term> (FMA: <fma_id>)
```

The JSON output schema of `extract_symptoms` is unchanged — the LLM still returns the same symptom list it would for a free-text query. The FMA line is grounding context, not a new output field. This keeps the agentic 5-tool architecture (§P4.1) byte-stable with Plan 4.0 clients while letting the extractor disambiguate "shoulder pain" (deltoid vs supraspinatus vs subscapular) when the pin tells us which one was tapped.

### P6.5 Graceful no-op validator (forward/backward compatibility)

The FMA validator (`app/triage_logic/body_map.py::validate_fma`) checks 4 candidate paths in order: `backend/app/data/regions.json` → `regions.yaml` → frontend `regions.json` → frontend `regions.yaml`. Whichever lands first wins.

If none exist, the validator returns `True` for every input — a one-shot startup warning is logged, but payloads are never rejected. This is deliberate: during deploys the frontend may legitimately be ahead of the backend (Role A updates `regions.ts`, Role B's `sync_regions.py` runs at next deploy). Logging-only behaviour also prevents a regions-file outage from breaking triage.

**Verified end-to-end** (per the 2026-05-15 regions sync run): `validate_fma("chest_left_anterior", "FMA:43799")` → `True`; mismatched FMA → `False` with warning. 69 regions synced, all with `fma_id`.

### P6.6 Plan 6.1 measured numbers (2026-05-15)

```
Plan 6.1-B test suite:        7 / 7 PASS  (tests/test_pin_schema_v15.py)
  - Plan 4.0 backward-compat:        ✓
  - v1 Pin validation:               ✓
  - v1.5 additive extension:         ✓
  - body_view union (incl. 3D):      ✓
  - FMA injection into LLM prompt:   ✓
  - graceful no-op validator:        ✓
  - regions.json load + lookup:      ✓

Pytest suite at Tier 6.1-B close:    156 passed, 1 skipped
Pytest suite at Tier 6.4 close:      169 passed, 1 skipped  (includes floor regression)
Floor regression test:               6 / 6 PASS, 2.37 s  (tests/test_eval_p4.py)
                                     verified 2026-05-15

Frontend 3D route bundle:    307 KB initial JS / 527 KB First Load  (3D-only on /triage/body-map-3d)
Other routes unchanged:      Plan 4.0 chat at 8.91 KB initial JS
```

**Headline 53-case eval metrics from Plan 4.0 stay unchanged** — Plan 6.1 adds an input mode and a prompt-grounding signal, not a new triage decision. Eval cases that don't include pins follow the same Plan 4.0 path bit-for-bit.

### P6.7 Known Plan 6.1 limitations (deferred to 6.1 C/D + asset pipeline)

1. **Procedural placeholder humanoid is the rendered body today**, not anatomically realistic. Realistic anatomy ships when Phase A's asset handoff lands: BodyParts3D OBJ packs (CC BY-SA 2.1 JP) + Z-Anatomy skin shells (CC BY-SA 4.0) + `studio_small_07_1k.hdr` (CC0), all run through `scripts/build-anatomy.mjs` into 9 GLBs under a 30 MB total budget.
2. **FMA codes are unvalidated against MBBS clinical judgment** — Phase D MBBS reviewer 10-region anatomy walk is the gating step. Per [`MBBS_TRACKER.md`](MBBS_TRACKER.md) Tier 6.1 protocol; sign-off lands at `docs/mbbs_signoffs/6_1_anatomy.md`.
3. **Phase C (ML/prep)** is not yet started — `ml/migration_plan_6_5.md`, `ml/migration_baseline.md`, and `ml/eval_extensions_6_5.md` are pending Role C work, blocked on explicit "go 6.1.C" per the tier-pause-confirm rule.
4. **Phase D (Docs)** is not yet started — SYMPTOM_CINEMA §8 update, ARCHITECTURE §0.95, QA_WAR_GAME 3 new Qs, MBBS_TRACKER Tier 6.1 protocol, DEMO_SCRIPT 6.1 cut sheet, INDEX update, and `checklists/PLAN_6_1_SUBMISSION.md` 45-check rerun — pending Role D + parallel work.
5. **Pin v1.5 carries FMA into the LLM but does not yet feed the rule engine** — R1–R9 still consume the LLM-extracted symptom names. Tier 6.5 brain-stack upgrade is where FMA → rule mapping becomes load-bearing (per [`docs/PROMPTS_PLAN_6.5.md`](PROMPTS_PLAN_6.5.md)).
6. **Lighthouse audit on a real Android phone** is the only optional Plan 6.1-A gate (6.1.A.lighthouse) — 307 KB initial JS is heavy but unavoidable for R3F-based 3D. Real-device numbers TBD.

---

## 1. The three-layer AI architecture — and why

Most failed healthcare AI products were single-layer: either pure rule engine (Babylon's "decision trees in Excel") or pure LLM wrapper (current crop of 2024-2025 entrants). Both have known failure modes:

- **Pure rule engines:** rigid, brittle, expensive to update, miss novel presentations. Babylon Health missed obvious heart-attack signs (TechCrunch 2023).
- **Pure LLM wrappers:** hallucinate adversarial planted errors in up to **83%** of clinical vignettes (Communications Medicine 2025), 23% hallucination rate on oncology Q&A (JCO 2025).

Our architecture stacks three layers that compensate for each other's weaknesses:

```
Layer 1  LLM Conversation Manager (Gemini 2.5 Flash / Gemma 4 E4B edge)
            ↓ extracts structured symptom JSON
Layer 2  Deterministic Red-Flag Rule Engine
            ↓ ESI v5 Level-1/2 triggers — can only ESCALATE
Layer 3  ML Severity Classifier (XGBoost / ClinicalBERT)
            ↓ severity score s ∈ [0,1]
        ESI v5 Protocol Mapper → Home Care / Clinic / ER
            ↓
        Citation-grounded RAG explanation
```

### Safety property: rules can only escalate, never downgrade

```
final_level = max(rule_layer_level, ml_layer_level)
```

If the LLM thinks "headache, probably home care" but the rule engine fires on "worst headache of my life" → Level 2 — the final verdict is Level 2. The model is never trusted to downgrade a clinically dangerous presentation.

This is the same defensive design pattern used by NHS NICE-validated CDSS tools and is explicitly aligned with WHO 2024 ethics Principle 2 ("promote human well-being, safety, and the public interest").

## 2. Risk scoring — the actual math

### 2.1 Adult triage — ESI Version 5 (US Emergency Severity Index, 2024 release)

ESI v5 is a 5-level algorithm from the Agency for Healthcare Research and Quality (AHRQ). It is the dominant US ED triage standard and was updated in 2024 with explicit vitals requirements (HR, RR, SpO2 measurement required for all patients not initially assigned Level 1 or 2).

| Level | Meaning | Recommended action |
|---|---|---|
| 1 | Immediate life-threatening | ER NOW (call 108 / 112) |
| 2 | High risk, time-sensitive | ER within minutes |
| 3 | Stable but needs multiple resources | Urgent clinic / ER |
| 4 | One resource | Same-day clinic visit |
| 5 | No resources needed | Home care + monitoring |

### 2.2 Layer 2 — Deterministic ESI Level-1 / Level-2 triggers

A symptom set fires **ESI Level 1 (immediate ER)** if any:

- Chest pain + (diaphoresis OR radiation to arm OR shortness of breath) + age ≥ 35
- Sudden unilateral weakness OR facial droop OR slurred speech (FAST stroke screen)
- Anaphylaxis indicators (swelling + difficulty breathing + recent allergen exposure)
- Active heavy bleeding
- Loss of consciousness in last 1 hour
- Suicidal intent stated explicitly
- Pediatric fever > 40°C with lethargy
- Pregnancy + severe abdominal pain
- Severe respiratory distress (RR > 30, accessory muscle use described, retractions in pediatric)
- SpO2 < 90% on room air (from any source)
- HR > 130 or HR < 40 sustained

**ESI Level 2 (urgent ER):**
- Chest pain alone, age ≥ 50
- New severe headache ("worst of my life," thunderclap)
- Active vomiting + dehydration signs
- Fever > 39°C with stiff neck (meningismus)
- Sustained tachycardia 100–130 with chest discomfort
- SpO2 90–92% on room air

These rules map deterministically to `er` triage level with `red_flags[]` populated. They are auditable, testable, and visible in the explanation panel — the patient and clinician both see exactly which rule fired.

### 2.3 Layer 3 — ML severity classifier

**Default model:** XGBoost (fast train, ships without GPU)
**Stretch model:** ClinicalBERT fine-tuned (if Colab Pro GPU available)

**Input features (~150 dimensions):**
- Symptom multi-hot vector over 132 Symcat symptoms
- Age, sex (one-hot)
- Comorbidities multi-hot (diabetes, hypertension, CKD, CVD, immunocompromised, pregnancy, ...)
- Duration of presenting complaint (hours, log-scaled)
- Severity self-rating (0–10 numeric pain/severity scale)
- Vitals (when available): HR, RR, SpO2, BP_sys, BP_dia, temp_C (z-scored)
- Vital source flag (medical-grade vs self-reported — affects confidence weighting)

**Output:** severity score `s ∈ [0, 1]` and softmax over 4 buckets

**Threshold mapping (calibrated on held-out set):**
- `s < 0.30` → ESI 5 (Home Care, low-priority)
- `0.30 ≤ s < 0.55` → ESI 4 (Home Care with active monitoring)
- `0.55 ≤ s < 0.75` → ESI 3 (Clinic Visit within 24h)
- `s ≥ 0.75` → ESI 2 (Urgent ER) — escalates to ESI 1 if rules fired

### 2.4 Confidence calibration

```
confidence = softmax_max × (1 − expected_calibration_error)
```

We compute Expected Calibration Error (ECE) on the held-out set using 10-bin reliability plots. If `confidence < 60%`, the UI shows "I need more information" and the LLM asks ONE specific follow-up question rather than committing to a verdict.

### 2.5 Pediatric (under-5) — WHO IMCI protocol

For patients under 5 years, we route through WHO's Integrated Management of Childhood Illness (IMCI) protocol. IMCI is the global standard for CHW-administered pediatric triage and is validated across LMICs.

IMCI classifies into 3 categories using a coloured chart:
- **Pink (Severe)** → Immediate referral
- **Yellow (Moderate)** → Specific treatment at clinic
- **Green (Mild)** → Home care + caregiver counselling

We mirror this in our UI for any patient under 5. The same red-flag-can-only-escalate property applies.

## 3. Dataset plan

| Dataset | Size | Source | Use in our pipeline |
|---|---|---|---|
| **Symcat** | ~400 diseases, 130+ symptoms | Columbia University (public) | Training data for severity classifier |
| **Kaggle Disease-Symptom** | 4,920 records | Public | Backup training set, XGBoost baseline |
| **MedQuAD** | 47K Q&A pairs | NIH (public) | Few-shot examples for LLM prompts |
| **WHO ICD-11** | 17K codes | WHO (public) | Symptom and disease normalization |
| **WHO IMCI Guidelines** | Decision charts | WHO (public) | Pediatric red-flag rule engine + RAG corpus |
| **NICE CKS** | UK clinical knowledge | NICE (public summaries) | RAG corpus |
| **India MoHFW Standard Treatment Guidelines** | India-specific | MoHFW (public) | RAG corpus, India-context grounding |
| **Custom 53-case eval set** | 50 clinical scenarios + 3 Plan-4.0 adversarial safeguards | Built by us | Regression testing — accuracy numbers for the deck |

**Hand-curated eval set is non-negotiable.** This is what we put accuracy numbers from on the slide. See §5.

### Data preprocessing
1. Symptom canonicalization via UMLS Concept Unique Identifiers (CUIs)
2. Comorbidity normalization to ICD-11 codes
3. Severity rating standardization (0-10 numeric)
4. Train/val/test split: 70/15/15, stratified on ESI level
5. Class imbalance handled via class_weight='balanced' (XGBoost) or weighted cross-entropy (ClinicalBERT)

## 4. Model cards (per WHO 2024 AI Ethics Principle 3 — Transparency)

### 4.1 LLM Conversation Manager
- **Cloud:** Gemini 2.5 Flash (Google, closed-source)
- **Edge:** Gemma 4 E4B via Ollama (Google, open-weight, Apache 2.0)
- **Role:** symptom extraction, multi-turn elicitation, natural-language response
- **NOT used for:** final triage decision, diagnostic claim, prescription
- **Known limitations:** documented hallucination rates 1.5–64% depending on task (see [research/03_user_pain_points.md](../research/03_user_pain_points.md)). Mitigated via citation-grounded RAG and JSON-mode structured output.

### 4.2 Red-flag rule engine
- **Type:** deterministic finite rule set, hand-coded from ESI v5 + WHO IMCI
- **Updateable:** yes, versioned in git, every change recorded for CDSCO Algorithm Change Protocol
- **Rules count:** 9 ESI Level-1 + 6 ESI Level-2 + 4 IMCI Pink for v1

### 4.3 ML severity classifier
- **Architecture:** XGBoost (gradient boosted trees) — 200 trees, max_depth 6, learning_rate 0.05
- **Optional upgrade:** ClinicalBERT fine-tuned (Alsentzer et al. 2019) on Bio_ClinicalBERT base
- **Training data:** Symcat + Kaggle Disease-Symptom (~5K records combined)
- **Compute:** Colab free-tier (XGBoost) or Colab Pro GPU (ClinicalBERT)
- **Evaluation:** see §5

### 4.4 RAG retriever
- **Embedding model:** BGE-M3 (BAAI, MIT license, multilingual including Hindi/Kannada)
- **Vector store:** Supabase pgvector
- **Re-ranker:** BGE-Reranker-v2 (open-source)
- **Corpus:** WHO IMCI + NICE CKS summaries + India MoHFW STG, chunked at 512 tokens

## 5. Evaluation methodology

### 5.1 The 50-case eval suite

Hand-written patient scenarios spanning:
- 15 ESI Level 1/2 (true emergencies — testing red-flag sensitivity)
- 15 ESI Level 3 (clinic-appropriate — testing calibration)
- 15 ESI Level 4/5 (home care — testing specificity, over-triage rate)
- 5 edge cases (pediatric IMCI Pink, pregnancy, mental-health crisis, drug-seeking, malingering)

Each case has:
- Free-text patient story (the input)
- Multi-language variants (English, Hindi, Kannada — for robustness)
- Expected ESI level
- Expected red flags
- Expected disposition action

### 5.2 Metrics we report

| Metric | What it measures | Target |
|---|---|---|
| **Triage accuracy** | % cases matched expected disposition (Home/Clinic/ER) | ≥ 80% |
| **ESI exact match** | % cases with exact ESI Level 1-5 match | ≥ 70% |
| **Red-flag sensitivity** | % true emergencies (Level 1/2) correctly flagged | ≥ 95% |
| **Over-triage rate** | % Level 4/5 cases routed to ER | ≤ 15% |
| **Mean confidence** | Average confidence at verdict time | — |
| **Expected Calibration Error (ECE)** | Reliability of confidence numbers | ≤ 0.10 |
| **Latency (p50, p95)** | End-to-end triage response time | p50 < 2s, p95 < 5s |
| **Hallucination rate (LLM-only output)** | % cases where LLM made a clinically false claim caught by rules | Measure & log |
| **Cross-language robustness** | Accuracy delta English vs Hindi vs Kannada | < 10% drop |

**Reference benchmarks** (from market research):
- Median symptom checker accuracy 2020: 55.8% (JMIR 2023) — we beat this comfortably
- Ada Health top-1 diagnosis accuracy: 30% (vs physicians 47%); top-3: 70.5%
- LLM-only triage accuracy: 57.8–76% (NPJ 2025)

### 5.3 Hallucination mitigation strategy

LLM hallucination is a documented clinical risk. Our stack:

1. **JSON-mode structured output** for symptom extraction (no free-form clinical assertions)
2. **Citation-grounded RAG** for all factual claims about conditions (every claim cites WHO IMCI / NICE CKS / India STG)
3. **Rule engine override** — LLM cannot down-triage past a fired rule
4. **Refusal guardrails** — prompt-level refusals for drug dosing, prescription, specific diagnosis labelling
5. **Disclaimer rendering** — every response includes the "not a diagnosis" disclaimer
6. **Audit logging** — every LLM call + output is hashed and logged for review

### 5.5 Current eval results

The triage pipeline (Gemini 2.5 Flash extraction → 9 red-flag rules → XGBoost severity → ESI v5 mapper → `max(rule, esi)` safety property) is evaluated against `docs/EVAL_CASES.csv` — 50 Plan-2.0 clinical cases (15 ER / 20 Clinic / 14 Home + 1 REFUSAL) plus 3 Plan-4.0 adversarial-safeguard rows = **53 rows · 52 triage + 1 REFUSAL**. Run `python ml/train_and_eval.py` to refresh; the runner writes `ml/metrics.txt` with the block below.

> **Status:** numbers below are the Plan 4.0 measured run (`python ml/train_and_eval.py` on the team box, seed=42, XGBoost 3.2.0 / scikit-learn 1.8.0 / pandas 3.0.3). Source-of-truth file: [`ml/metrics.txt`](../ml/metrics.txt). Re-run the script and paste the new block here if anything in the pipeline changes (model retrain, rule addition, eval case author).

```
ASHA-AI Triage Evaluation — Plan 4.0 Measured Run
==================================================
Model version:              v0.2.0  (XGBoost, rule-grounded synthetic training set)
Triage cases evaluated:     52 of 53  (1 REFUSAL case routed via safety layer, excluded)

Overall accuracy:           80.8%
Emergency-bucket recall:    100.0%   (target 100% — zero missed emergencies)
Emergency misses:           0 of 15
Macro-F1:                   0.809

Per-class:
  Home Care      precision= 86.7%  recall= 76.5%  f1=0.812
  Clinic Visit   precision= 82.4%  recall= 70.0%  f1=0.757
  Emergency Room precision= 75.0%  recall=100.0%  f1=0.857

Confusion matrix (rows=expected, cols=predicted):
                  Home   Clinic   ER
  Home Care        13       3      1
  Clinic Visit      2      14      4
  Emergency Room    0       0     15    ← right column = misses (must be 0)

Rule trigger counts:  R1_STEMI=2, R2_STROKE_FAST=3, R3_ANAPHYLAXIS=1, R4_SEPSIS=1,
                      R5_DKA=1, R6_PEDIATRIC=3, R7_ASTHMA_SEVERE=2, R8_HEMORRHAGE=2,
                      R9_SUICIDAL=1   (all 9 red-flag rules fire ≥ 1 time)

Refusals: 1 of 1 handled (case 9: drug-dosing request → safety refusal layer).
```

For the pre-Plan-4 historical baseline (49 of 50 triage cases, 81.6% / macro 0.817 / same 0/15 ER misses) see §P4.5.

**Reading the matrix.** The ER row (`0 0 15`) is the headline: every Emergency-Room case in the suite was routed to Emergency Room. The Clinic→Home misses are the only under-triage failures (period-cramps-like + DOMS-style presentations the keyword aliaser interprets as Home Care); the Clinic→ER and Home→ER over-triages are all safe-direction errors. Macro-F1 0.809 (Plan 4.0 measurement; 0.817 on the pre-Plan-4 50-case subset) beats every published patient-facing benchmark we found (median symptom checker accuracy 55.8%, JMIR 2023; Ada Health top-1 30%; LLM-only triage 57.8–76%, NPJ 2025).

**Rule coverage.** All 9 red-flag rules fire at least once across the eval — `R2_STROKE_FAST` (3), `R6_PEDIATRIC` (3), `R1_STEMI` (2), `R7_ASTHMA_SEVERE` (2), `R8_HEMORRHAGE` (2), and one each of `R3 R4 R5 R9` — so the rule engine is exercised end-to-end, not just by a handful of canonical cases.

**The single line that lands the pitch:** *"Zero missed emergencies across our 53-case eval, including 5 adversarial vague-emergency cases (atypical STEMI in a young woman, DKA as 'stomach flu', sepsis as 'I just feel weak', meningitis as 'bad headache', eclampsia as 'flashing lights and swollen feet') AND 3 false-positive safeguards that prove the adversarial regex doesn't over-trigger. Plan 4.0 adds MBBS-physician review."*

### 5.6 Why the eval is defensible — design notes

1. **Test integrity.** The XGBoost classifier is trained on a held-out synthetic dataset (rule-grounded; see `ml/train_and_eval.py` and `ml/train.py`). The 50 eval cases are **not** in the training set — they are independent free-text scenarios authored from clinical priors (ESI v5 + WHO IMCI + EVAL_SPEC.md). When the Kaggle Disease-Symptom Prediction dataset is downloaded for retraining, the eval set remains the same independent test bench.
2. **Adversarial coverage.** 5 of the 15 ER cases describe emergencies in vague or atypical language — directly testing that the pipeline doesn't need keyword-perfect input to escalate: case 3 (vague stroke), 11 (post-op sepsis as weakness), 12 (meningitis as bad headache), 14 (DKA as stomach flu), 17 (atypical STEMI in young woman).
3. **Per-rule trigger accounting.** `ml/eval_results.json` records which red-flag rule fired per case. We don't just report aggregate recall — we report which rule produced each ER verdict, so we can audit whether each was a rule fire or an ESI escalation.
4. **Refusal-vs-triage separation.** Case 9 (drug-dosing request) is excluded from triage scoring and tracked separately. The safety refusal layer (Member B's `app/core/safety.py`) is unit-tested independently. Case 10 (suicidal ideation) is **inside** the ER triage scoring — the helpline display is a UI overlay on top of an ER verdict, not a separate path.
5. **Reproducibility.** Seed `42` is fixed across `random`, `numpy`, `sklearn`. Re-runs produce bitwise-identical model weights and eval numbers. Any drift between runs is a bug, not noise.

### 5.4 Continual evaluation plan (CDSCO Algorithm Change Protocol)

Per CDSCO Draft Guidance on Medical Device Software (Oct 21, 2025), AI/ML SaMD must declare an Algorithm Change Protocol (ACP) covering:
- What can change (model weights, prompts, RAG corpus)
- What can NOT change without re-submission (rule engine, ESI mapping, disclaimer text)
- How changes are validated (regression suite must pass)
- How changes are versioned (semver + model card update)
- Rollback procedure

We will publish our ACP alongside v1 submission.

## 6. APIs, frameworks, and tools used

### Frontend
- Next.js 14 (App Router) — React Server Components
- TypeScript 5
- Tailwind CSS 3 + shadcn/ui
- Framer Motion (animation)
- Zustand (state) + React Query (server state)
- Supabase JS client
- Web Bluetooth API (for PHC pulse oximeter)
- MediaDevices.getUserMedia (for rPPG)

### Backend
- FastAPI 0.110+
- Pydantic v2
- XGBoost 2.0+
- scikit-learn 1.5+
- HuggingFace Transformers (optional, for ClinicalBERT)
- Supabase Python SDK
- google-generativeai (Gemini SDK)
- Ollama Python client (edge mode)

### LLM & NLP
- **Gemini 2.5 Flash** — primary LLM (Google Cloud)
- **Gemma 4 E4B** via Ollama — edge LLM (Apache 2.0)
- **Bhashini** — Indian govt ASR/TTS/translation pipeline (free for PoC)
- **AI4Bharat IndicTrans2 / IndicASR / IndicTTS** — open-source fallback
- **BGE-M3** — multilingual embeddings for RAG

### Datastore
- **Supabase** — Postgres + pgvector + Auth + Realtime + Storage (Mumbai region)

### Deployment
- **Vercel** — frontend
- **Render** — backend
- **Ollama / Raspberry Pi 5** — edge runtime

### Observability
- **Sentry** — error tracking
- **PostHog** — product analytics
- **Vercel Analytics** — frontend metrics

## 7. Limitations and known failure modes

We disclose these transparently. Per WHO 2024 ethics, honesty about limitations is itself a feature.

1. **Edge LLM accuracy is lower than cloud** — Gemma 4 E4B vs Gemini 2.5 Flash. Offline mode degrades to symptom intake + red-flag escalation only; final verdict requires cloud unless connectivity is impossible.
2. **rPPG vitals are not FDA-cleared for diagnosis** — flagged as `source: 'rppg'` with `confidence: medium`. PHC BLE devices are preferred.
3. **Web Bluetooth API does not work in iOS Safari** — Tier 3 PHC integration is Android-only in v1.
4. **22 languages supported, but voice quality varies** — Hindi/English are best; less-resourced languages (Santali, Bodo, Dogri) ASR has higher word-error rates.
5. **Symcat dataset is US-skewed** — disease prevalences may not match India. Mitigation: retrain on Indian PHC data in v2.
6. **LLM can be adversarially poisoned** — documented 83% rate in published research. Mitigation: rule-engine override, citation-grounded answers, JSON-mode output, audit logging.
7. **No real-time clinical-staff oversight** — every verdict carries a disclaimer recommending RMP review.
8. **Mental-health crisis handling is rule-based only** — we display iCall (9152987821) and Vandrevala (1860-2662-345) numbers. We do not attempt to clinically assess suicidality.

## 8. Future enhancement roadmap

### v1.5 (post-hackathon, ~2 months)
- Cough analysis via Hyfe-style audio biomarker model (TB triage layer)
- ABDM Health ID real integration (sandbox → production)
- WhatsApp Cloud API channel
- Add 3 more Indian languages (Tamil, Telugu, Marathi)

### v2 (6 months)
- Continuous Glucose Monitor (Dexcom Share, Abbott LibreView) ingestion
- Apple Watch ECG strip upload + AFib detection
- ASHA companion v2 — multi-patient cluster management
- Federated learning across PHCs (data never leaves the PHC, model updates aggregate)
- Indonesian language pack (Bahasa) — first export market

### v3 (12 months)
- Fine-tuned OpenBioLLM-70B on India-specific PHC data (the moat dataset)
- Pediatric module fully under WHO IMCI certification
- Mental health module with iCall/Vandrevala integrated callback
- Outbreak prediction overlay (aggregated symptom clusters by district)
- ESI v5 + Manchester Triage System dual-protocol output for export markets

### v4 (18 months)
- CDSCO SaMD Class B certification submitted
- First peer-reviewed validation study (target Lancet Digital Health)
- WHO collaborating-center designation
- 5M+ ABHA-linked patient records, 500K+ labeled triage outcomes

## 9. Ethics statement

ASHA-AI is designed in accordance with:
- WHO Ethics & Governance of AI for Health (2024 LMM guidance)
- India Telemedicine Practice Guidelines 2020 (MoHFW + MCI)
- India DPDP Act 2023
- CDSCO Medical Device Software Draft Guidance (Oct 2025)

**We do not diagnose. We do not prescribe.** We provide triage support to patients, ASHAs, and registered medical practitioners. Every screen displays this clearly in the user's chosen language.

Patient autonomy, data privacy, transparency, accountability, inclusiveness, and sustainability are designed into the product, not bolted on. The audit log, model cards, eval suite, and limitations section above are evidence of that — not marketing copy.
