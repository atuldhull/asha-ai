# verify_demo_ready.ps1
# ASHA-AI demo-day go/no-go aggregator.
# Run T-5 minutes before pitch. One GREEN/RED verdict in under 60 seconds.
# Companions: scripts/smoke_5_1_parity.ps1 (Plan 5.1 parity), edge/unplug_demo.ps1 (edge unplug rehearsal).
#
# Usage (from D:\hack with .venv activated):
#   .\scripts\verify_demo_ready.ps1
#
# Exit codes:
#   0 = GREEN, walk on stage
#   1 = RED, fix listed items first
#
# Last edited 2026-05-15.

$ErrorActionPreference = "Continue"
$script:failed = @()
$script:passed = @()
$repo = "D:\hack"

# Fast TCP-port test with hard timeout (default 2s).
# PS 5.1's Invoke-RestMethod -TimeoutSec does NOT reliably fire when the
# TCP handshake succeeds but the response never comes (the Ollama Desktop
# zombie-daemon failure mode). Use this guard before any HTTP call.
function Test-TcpPort([string]$hostname, [int]$port, [int]$timeoutMs = 2000) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $tcp.ConnectAsync($hostname, $port)
        if (-not $task.Wait($timeoutMs)) { return $false }
        return $tcp.Connected
    } catch {
        return $false
    } finally {
        $tcp.Close()
    }
}

function Check($name, $block) {
    Write-Host "[ ... ] $name" -NoNewline
    try {
        $result = & $block
        if ($result) {
            Write-Host "`r[PASS]" -ForegroundColor Green -NoNewline
            Write-Host " $name"
            $script:passed += $name
        } else {
            Write-Host "`r[FAIL]" -ForegroundColor Red -NoNewline
            Write-Host " $name"
            $script:failed += $name
        }
    } catch {
        Write-Host "`r[FAIL]" -ForegroundColor Red -NoNewline
        Write-Host " $name  ::  $($_.Exception.Message)"
        $script:failed += $name
    }
}

Write-Host "`n=== ASHA-AI Demo-Ready Verification ===" -ForegroundColor Cyan
Write-Host "Started: $(Get-Date -Format 'HH:mm:ss')`n"

# 1. Ollama daemon reachable + gemma2:2b present (edge mode demo prerequisite)
Check "Ollama daemon reachable + gemma2:2b pulled" {
    # Fast-fail if port not even listening -- avoids the PS 5.1 hang on zombie daemons.
    if (-not (Test-TcpPort "localhost" 11434 2000)) {
        Write-Host "         (port 11434 not listening -- daemon likely dead)" -ForegroundColor DarkGray
        return $false
    }
    $r = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 -ErrorAction Stop
    return ($r.models | Where-Object { $_.name -like "gemma2:2b*" }).Count -gt 0
}

# 2. Edge LLM warm-call latency
Check "Gemma 2 2B warm-call under 20s (target <10s)" {
    if (-not (Test-TcpPort "localhost" 11434 2000)) { return $false }
    $body = @{
        model = "gemma2:2b"
        prompt = "Reply with the single word: OK"
        stream = $false
    } | ConvertTo-Json
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r = Invoke-RestMethod -Uri "http://localhost:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30
    $sw.Stop()
    Write-Host "         (latency: $($sw.Elapsed.TotalSeconds.ToString('F2'))s)" -ForegroundColor DarkGray
    return $sw.Elapsed.TotalSeconds -lt 20 -and $r.response.Length -gt 0
}

# 3. Safety refusals self-test (18/18 PASS expected)
Check "Safety refusals self-test (18/18 PASS)" {
    Push-Location $repo
    $out = python -m backend.app.nlp.safety_refusals 2>&1 | Out-String
    Pop-Location
    return $out -match "18\s*/\s*18" -or $out -match "all\s*PASS"
}

# 4. Adversarial vague-stroke regex self-test (11/11 PASS expected)
Check "Adversarial stroke regex self-test (11/11 PASS)" {
    Push-Location "$repo\backend"
    $out = python -m app.llm.post_process 2>&1 | Out-String
    Pop-Location
    return $out -match "11\s*/\s*11" -or $out -match "all\s*PASS"
}

# 5. 53-case clinical eval: 0 of 15 emergency misses
Check "53-case eval: emergency misses = 0 of 15" {
    Push-Location $repo
    $out = python ml/train_and_eval.py 2>&1 | Out-String
    Pop-Location
    return $out -match "Emergency misses:\s*0\s*of\s*15"
}

# 6. Plan 5.1 risk-scoring parity smoke (frontend mock <-> backend deterministic match)
Check "Plan 5.1 frontend/backend parity smoke" {
    if (-not (Test-Path "$repo\scripts\smoke_5_1_parity.ps1")) { return $true }   # not blocking if absent
    Push-Location $repo
    $out = & "$repo\scripts\smoke_5_1_parity.ps1" 2>&1 | Out-String
    Pop-Location
    return $out -notmatch "FAIL" -and $out -notmatch "MISMATCH"
}

# 7. Pytest suite (169 passed, 1 skipped expected post-5.1/6.1/6.4)
Check "Pytest backend suite green (>=169 passing)" {
    Push-Location "$repo\backend"
    $out = pytest -q --no-header 2>&1 | Out-String
    Pop-Location
    if ($out -match "(\d+)\s+passed") {
        $passing = [int]$matches[1]
        Write-Host "         ($passing passing)" -ForegroundColor DarkGray
        return $passing -ge 169
    }
    return $false
}

# 8. Bhashini gateway reachable (informational only -- Web Speech fallback exists)
Check "Bhashini gateway reachable (informational)" {
    if (-not (Test-TcpPort "meity-auth.ulcacontrib.org" 443 3000)) { return $false }
    try {
        $r = Invoke-WebRequest -Uri "https://meity-auth.ulcacontrib.org" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        return $r.StatusCode -lt 500
    } catch { return $false }
}

# 9. Git working tree clean (so demo doesn't show stale uncommitted code)
Check "Git working tree clean" {
    Push-Location $repo
    $status = git status --porcelain 2>&1
    Pop-Location
    return [string]::IsNullOrWhiteSpace($status)
}

# 10. Disk headroom (Ollama swaps to disk under memory pressure)
Check "Free disk space > 5 GB on D:" {
    $drive = Get-PSDrive D -ErrorAction SilentlyContinue
    if (-not $drive) { return $true }
    return ($drive.Free / 1GB) -gt 5
}

# 11. RAM headroom (memory: only ~1.8 GB free during ML runs is the floor)
Check "Free RAM > 1.5 GB" {
    $os = Get-CimInstance Win32_OperatingSystem
    $freeMB = $os.FreePhysicalMemory / 1024
    Write-Host "         (free: $([int]$freeMB) MB)" -ForegroundColor DarkGray
    return $freeMB -gt 1500
}

# 12. Eval artefacts exist (judges may ask to see them)
Check "ml/metrics.txt + ml/eval_results.json present" {
    return (Test-Path "$repo\ml\metrics.txt") -and (Test-Path "$repo\ml\eval_results.json")
}

# === Summary ===
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "Passed: $($script:passed.Count)" -ForegroundColor Green
$failColor = if ($script:failed.Count -gt 0) { 'Red' } else { 'Green' }
Write-Host "Failed: $($script:failed.Count)" -ForegroundColor $failColor

if ($script:failed.Count -eq 0) {
    Write-Host "`n[GREEN] DEMO READY. Step on stage.`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n[RED] FIX BEFORE DEMO:" -ForegroundColor Red
    $script:failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "`nRecovery commands:" -ForegroundColor Yellow
    Write-Host "  Ollama dead?  -> Get-Process *ollama* | Stop-Process -Force; Start-Sleep 3; Start-Process ollama -ArgumentList serve -WindowStyle Hidden"
    Write-Host "  Daemon slow?  -> ollama run gemma2:2b 'hi'   (warm the model)"
    Write-Host "  Self-test?    -> activate .venv first: .\.venv\Scripts\Activate.ps1"
    Write-Host "  Git dirty?    -> git stash   (don't commit during demo)"
    Write-Host "  Tests fail?   -> cd backend && pytest -x   (find first failure)"
    Write-Host ""
    exit 1
}
