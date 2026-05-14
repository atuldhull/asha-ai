# ML Workspace — Role C

> **Owner:** Role C (AI / ML / Voice Lead)
> **Stack:** XGBoost · scikit-learn · pandas · Google Generative AI SDK (Gemini 2.5 Flash) · Ollama · Bhashini APIs · BGE-M3 embeddings · Colab free tier (T4 GPU) for training

## Workspace rules

- ✅ **Write inside** `D:\hack\ml\` (datasets, notebooks, trained model files)
- ✅ Also write inside `D:\hack\edge\` (Ollama runner for Plan 3.0)
- ✅ Also write inside `D:\hack\backend\app\llm\` and `D:\hack\backend\app\nlp\` (LLM prompts, Bhashini wrappers — these run inside Role B's FastAPI app)
- ✅ Author and update `D:\hack\docs\EVAL_CASES.csv` (you own the eval suite)
- ✅ Update `D:\hack\docs\METHODOLOGY.md` with eval numbers when Plan 2.0 eval is done
- ❌ Do **NOT** touch `D:\hack\frontend\` or other `backend/` subdirs

## How to start (Plan 2.0 — your big tier)

1. Read your full role prompt: `D:\hack\docs\PROMPTS_PLAN_2.0.md` § Role C
2. Read the eval spec: `D:\hack\docs\EVAL_SPEC.md`
3. Read existing eval cases: `D:\hack\docs\EVAL_CASES.csv` (has 10; you author 40 more)
4. Read the 9 red-flag rules: `D:\hack\docs\RED_FLAGS.md` (Role B implements; you author the test set that proves they work)
5. Scaffold structure:
   ```
   d:/hack/ml/
   ├── notebooks/
   │   ├── 01_dataset_prep.ipynb
   │   ├── 02_train_xgboost.ipynb
   │   └── 03_eval_metrics.ipynb
   ├── datasets/             (downloaded Kaggle Disease-Symptom)
   └── models/               (exported trained model goes here for Role B to import)
   ```

## Plan-by-plan summary

| Tier | What you ship |
|---|---|
| **1.0** | `symptom_severity.csv` + keyword rules in `docs/METHODOLOGY.md` |
| **2.0** | XGBoost trained → `ml/models/xgboost_v1.pkl` · 50-case eval CSV · published numbers · 0 missed emergencies |
| **3.0** | Ollama + Gemma 4 in `edge/` · provider abstraction in `backend/app/llm/` · RAG corpus + retrieval in `backend/app/nlp/` |
| **4.0** | Kannada Bhashini support · adversarial case logic · safety refusals · agentic tool refactor |

## End-of-tier checklist

Per ROLES.md row C across all 4 tiers.

**Plan 2.0 critical metric:** **emergency-bucket recall = 100%** in the published eval. Zero missed emergencies. This is the single number that decides AI Accuracy 25%.

Push to local git branch `feat/C-plan<N>` after each tier.
