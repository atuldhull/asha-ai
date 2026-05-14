# Frontend Workspace — Role A

> **Owner:** Role A (Frontend / UX Lead)
> **Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · shadcn/ui · Framer Motion · Zustand · React Query · Supabase JS client
> **Deploy target:** Vercel (free tier)

## Workspace rules

- ✅ **Only write inside** `D:\hack\frontend\`
- ❌ Do **NOT** write to `D:\hack\backend\`, `D:\hack\ml\`, `D:\hack\edge\`, or `D:\hack\docs\`
- ❌ Do **NOT** modify root files like `PLAN.md`, `README.md`, or `MARKET_ANALYSIS.html` — Role D owns those
- ✅ You may **read** any file outside this folder for reference, but never write to them

## How to start (Plan 1.0)

1. Read your full role prompt: `D:\hack\docs\PROMPTS_PLAN_1.0.md` § Role A
2. Read the API contract: `D:\hack\docs\API_CONTRACT.md` (if it exists — talk to integrator if not)
3. Read your Definition of Done in `D:\hack\docs\ROLES.md` § Plan 1.0 row A
4. Scaffold Next.js inside this folder:
   ```bash
   cd d:/hack/frontend
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*"
   ```
5. Install shadcn/ui + Framer Motion + the rest of your stack per the prompt

## API contract (your only touchpoint with backend)

You consume Role B's API at the URL specified in `.env.local`:
```
NEXT_PUBLIC_API_BASE=https://[render-app].onrender.com
```

You must use the **exact verdict labels**:
- `Home Care` (green)
- `Clinic Visit` (amber)
- `Emergency Room` (red)

## End-of-tier checklist

Per Plan 1.0 DoD in [docs/ROLES.md](../docs/ROLES.md):
- [ ] URL on phone shows chat, accepts input, shows verdict card
- [ ] Disclaimer footer on every screen
- [ ] Lighthouse Perf ≥ 70 (Plan 1.0) / ≥ 85 (Plan 2.0+)
- [ ] Mobile responsive (tested at 360px / 768px / 1440px)
- [ ] Pushed to local git branch `feat/A-plan1`
