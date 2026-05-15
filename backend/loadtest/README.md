# Load testing — `loadtest/`

Targets the deployed Render backend with k6 to produce the Plan 4.0
"200 RPS, p95 < 2 s, error rate < 1 %" screenshot for the slide.

## Install k6

Windows (PowerShell, with `winget`):
```powershell
winget install k6 --source winget
```

macOS:
```bash
brew install k6
```

Or download from https://k6.io/docs/getting-started/installation/.

## Run the load test

```powershell
# Warm-up Render free-tier (it sleeps after 15 min idle).
1..10 | ForEach-Object {
  Invoke-RestMethod -Method POST `
    -Uri "https://asha-ai-backend-ib9p.onrender.com/api/v1/triage" `
    -ContentType "application/json" `
    -Body '{"symptoms":"chest pain"}'
}

# Then run the actual load test.
k6 run `
  --env API_URL=https://asha-ai-backend-ib9p.onrender.com `
  --env TARGET_RPS=200 `
  --env HOLD_MINUTES=2 `
  --summary-export=loadtest-summary.json `
  triage-load.js
```

## If thresholds fail on the free tier

Render's free tier shares CPU and is bandwidth-limited. The honest path
is to dial down the target RPS until p95 < 2 s + error rate < 1 % hold,
and report THAT number on the slide.

```powershell
k6 run --env API_URL=... --env TARGET_RPS=50 triage-load.js
```

> "Honest numbers > inflated numbers" — judges value the methodology.

## Output for the slide

After a successful run k6 writes:
- `loadtest-summary.json` — the raw metric dump
- terminal output — the human-readable summary

Screenshot the terminal summary (the boxed table + the
"ASHA-AI /triage load test" footer) and save as
`docs/assets/loadtest-plan4.png` for the slide deck (Role D's task).
