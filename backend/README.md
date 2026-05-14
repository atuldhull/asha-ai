# Backend Workspace — Role B

> **Owner:** Role B (Backend & API Lead)
> **Stack:** FastAPI · Pydantic v2 · Python 3.11 · scikit-learn / XGBoost · Supabase Python SDK · Docker · Render
> **Deploy target:** Render (free tier)

## Workspace rules

- ✅ **Only write inside** `D:\hack\backend\`
- ❌ Do **NOT** write to `D:\hack\frontend\`, `D:\hack\ml\` (Role C trains models there), or `D:\hack\docs\`
- ❌ Do **NOT** modify root docs (PLAN.md etc.) — Role D owns those
- ✅ You may import the trained model produced by Role C from `D:\hack\ml\models\` — Role C will leave it there for you

## How to start (Plan 1.0)

1. Read your full role prompt: `D:\hack\docs\PROMPTS_PLAN_1.0.md` § Role B
2. Read the API contract: `D:\hack\docs\API_CONTRACT.md`
3. Read the 9 red-flag rules: `D:\hack\docs\RED_FLAGS.md` — you implement these in `backend/app/ml/red_flags.py` for Plan 2.0
4. Read DoD: `D:\hack\docs\ROLES.md` § Plan 1.0 row B
5. Scaffold FastAPI:
   ```bash
   cd d:/hack/backend
   python -m venv venv
   source venv/Scripts/activate     # Windows Git Bash
   pip install fastapi uvicorn pydantic supabase python-dotenv
   ```

## API contract (your only touchpoint with frontend)

The exact shape Role A expects is in `D:\hack\docs\API_CONTRACT.md`. **Do not deviate from it without telling the integrator.**

Minimum Plan 1.0 endpoints:
- `POST /api/v1/triage` → `{ "level": "Home Care|Clinic Visit|Emergency Room", "reasoning": "string" }`
- `GET /api/v1/health` → `{ "status": "ok" }`

Use the **exact verdict labels** — `Home Care`, `Clinic Visit`, `Emergency Room`. Do not abbreviate.

## End-of-tier checklist

Per Plan 1.0 DoD in [docs/ROLES.md](../docs/ROLES.md):
- [ ] `curl <render-url>/api/v1/triage -d '{"symptoms":"chest pain"}'` returns Emergency Room
- [ ] `GET /api/v1/health` returns 200
- [ ] Deployed publicly on Render
- [ ] Disclaimer string included in response
- [ ] Pushed to local git branch `feat/B-plan1`
