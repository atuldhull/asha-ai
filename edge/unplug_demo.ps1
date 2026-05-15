# ASHA-AI — Unplug-demo pre-flight (Plan 3.0, Windows / PowerShell)
# =================================================================
# Run from repo root *before every rehearsal* of the unplug demo.
#   .\edge\unplug_demo.ps1
#   .\edge\unplug_demo.ps1 -Model gemma2:2b -Strict
#
# What it checks:
#   1. Ollama daemon is alive on localhost:11434
#   2. The configured model is pulled
#   3. backend/app/llm provider abstraction returns the Ollama provider
#   4. Smoke extractions succeed within the latency budget (default 5s)
#
# Exits non-zero if any check fails with -Strict.

param(
    [string]$Model    = $env:OLLAMA_MODEL,
    [string]$Base     = $env:OLLAMA_BASE,
    [double]$Budget   = 20.0,
    [switch]$Strict
)

if (-not $Model) { $Model = "gemma2:9b" }
if (-not $Base)  { $Base  = "http://localhost:11434" }
$env:OLLAMA_MODEL = $Model
$env:OLLAMA_BASE  = $Base
$env:LLM_PROVIDER = "ollama"
$env:EDGE_LATENCY_BUDGET_S = "$Budget"

Write-Host ""
Write-Host "=== ASHA-AI unplug pre-flight ==="
Write-Host "  model:       $Model"
Write-Host "  ollama_base: $Base"
Write-Host "  budget:      ${Budget}s"
Write-Host ""

# 1. Daemon liveness
try {
    $tags = Invoke-RestMethod -Uri "$Base/api/tags" -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[ok]  Ollama daemon reachable at $Base"
} catch {
    Write-Host "[!! ] Ollama daemon NOT reachable at $Base"
    Write-Host "      Start it with: ollama serve   (or run the Ollama Desktop app)"
    if ($Strict) { exit 1 } else { exit 0 }
}

# 2. Model present
$models = $tags.models | ForEach-Object { $_.name }
$base   = $Model.Split(":")[0]
if ($models | Where-Object { $_ -like "$base*" }) {
    Write-Host "[ok]  Model $Model is installed locally"
} else {
    Write-Host "[!! ] Model $Model NOT installed locally"
    Write-Host "      Pull it with: ollama pull $Model"
    if ($Strict) { exit 1 } else { exit 0 }
}

# 3. Provider self-check + smoke extractions (delegated to Python).
#    Prefer the venv's `python` (already on PATH inside an active venv);
#    fall back to `py` with no version pin (works on 3.11 / 3.12 / 3.13 alike).
#    The old `py -3.12` pin failed on laptops that only had 3.13 + Astral 3.12.13.
$python = if (Get-Command python -ErrorAction SilentlyContinue) { 'python' }
          elseif (Get-Command py -ErrorAction SilentlyContinue) { 'py' }
          else { $null }
if (-not $python) {
    Write-Host "[!! ] No Python on PATH. Activate the venv first:"
    Write-Host "      .\.venv\Scripts\Activate.ps1"
    if ($Strict) { exit 1 } else { exit 0 }
}
$cmd = if ($Strict) { "$python edge\run_ollama.py --strict" } else { "$python edge\run_ollama.py" }
Write-Host ""
Write-Host "[..]  Running smoke test:  $cmd"
Invoke-Expression $cmd
$rc = $LASTEXITCODE
Write-Host ""
if ($rc -eq 0) {
    Write-Host "GREEN -- ready to record the unplug beat."
} else {
    Write-Host "RED -- fix the failures above before rehearsing on camera."
}
exit $rc
