# Edge Workspace — Role C (Plan 3.0)

> **Owner:** Role C (AI / ML / Voice Lead)
> **Stack:** Ollama · Gemma 4 (E4B preferred, fallback Llama 3.1 8B) · Python
> **Target hardware:** any laptop with 8+ GB RAM (demo); future: Raspberry Pi 5 (PHC deployment)

## What lives here

Everything needed to run ASHA-AI **without internet**:
- Ollama config + model files
- Python runner script that exposes the same `/api/v1/triage` endpoint Role B's cloud backend exposes
- Provider abstraction wiring (so the frontend can swap cloud ↔ edge with one env var)

## Why this matters (the demo beat)

In the demo video, we **pull the ethernet cable** mid-demo. The app keeps working. This folder is what makes that possible.

> *"When the internet fails — the village still gets triage."*

## How to start (Plan 3.0)

1. Read your role prompt: `D:\hack\docs\PROMPTS_PLAN_3.0.md` § Role C
2. Install Ollama from https://ollama.com (free)
3. Pull a model:
   ```bash
   ollama pull gemma2:2b           # fastest, fits 4GB RAM
   # or
   ollama pull llama3.1:8b         # better quality, needs 8GB+
   ```
4. Test it runs:
   ```bash
   ollama run gemma2:2b "Hello"
   ```
5. Scaffold `runner.py` — a FastAPI app that mirrors Role B's endpoints but calls Ollama instead of Gemini

## The provider abstraction (the trick that makes the unplug work)

In `D:\hack\backend\app\llm\base.py` you author the `LLMProvider` protocol. Both:
- `GeminiProvider` (cloud — uses your Gemini API key)
- `OllamaProvider` (local — uses this edge runner)

implement the same interface. Frontend doesn't know or care which is running. Switch by env var:
```
LLM_PROVIDER=gemini    # default (cloud)
LLM_PROVIDER=ollama    # demo "unplug" mode
```

## Rehearsal protocol

Practice the unplug **at least 5 times** before demo day. Targets:
- Cable pulled → app responds via Ollama in **< 5 seconds**
- Same triage verdict for the same input on both providers (within reason)
- No error toast appears during the switch

See [ADVERSARIAL_DEMO.md](../docs/ADVERSARIAL_DEMO.md) for the demo case to use during this rehearsal.

## End-of-tier checklist

Plan 3.0 DoD per [docs/ROLES.md](../docs/ROLES.md):
- [ ] Ollama installed and a model pulled
- [ ] `edge/runner.py` exposes `/api/v1/triage` matching Role B's contract
- [ ] Provider abstraction works — `LLM_PROVIDER=ollama` swaps cleanly
- [ ] Unplug rehearsal passes 5× in a row
- [ ] Pushed to local git branch `feat/C-plan3`

## Companion files in this folder

| Path | Purpose |
|---|---|
| [`Modelfile.asha-clinical`](Modelfile.asha-clinical) | Ollama Modelfile — base model + ASHA-AI extraction system prompt + JSON-mode params. Build with `ollama create asha-clinical -f Modelfile.asha-clinical`. |
| [`run_ollama.py`](run_ollama.py) | Smoke-test: pulls the model, checks daemon, runs 4 sample triage extractions, prints latencies. **Run before every rehearsal.** |
| [`unplug_demo.ps1`](unplug_demo.ps1) | Pre-flight (Windows / PowerShell): daemon liveness + model presence + provider self-check + p95 latency budget. |
| [`docker-compose.yml`](docker-compose.yml) | Local edge stack (Ollama daemon + ASHA-AI backend with `LLM_PROVIDER=ollama`) for one-command rehearsal. |

The provider implementation lives in [`backend/app/llm/ollama.py`](../backend/app/llm/ollama.py); the env-var swap factory is in [`backend/app/llm/base.py`](../backend/app/llm/base.py). Edge mode and cloud mode use the same `LLMProvider` Protocol — Role A's frontend doesn't know or care which is running.
