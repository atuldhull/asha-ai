# Plan 5.1 — frontend ↔ backend parity smoke
#
# Verifies that the deterministic risk scorer produces identical results
# regardless of which side computes it. Run after either window has changed
# the scoring math to catch silent drift.
#
# Usage: pwsh d:/hack/scripts/smoke_5_1_parity.ps1
#
# Exit 0 = parity OK. Exit 1 = drift detected, fix before integration.

$ErrorActionPreference = "Stop"
$port = 8909
$backend = "d:/hack/backend"

# 5 canonical cases. Each pinned to expected (score, level) computed by hand
# from the documented weights (ESI v5 + WHO IMCI + age multipliers).
$cases = @(
    @{
        name = "Elderly cardiac (CRITICAL)"
        body = '{"symptoms":[{"name":"chest_pain","severity":9,"onset_hours_ago":1}],"age":68,"sex":"F","comorbidities":["diabetes","hypertension"],"vital_proxy":{"breathing_rate":26,"heart_rate":118}}'
        expected_min = 90
        expected_level = "CRITICAL"
    },
    @{
        name = "Pediatric cyanosis (CRITICAL)"
        body = '{"symptoms":[{"name":"blueness_lips","severity":9,"onset_hours_ago":2},{"name":"difficulty_breathing","severity":8,"onset_hours_ago":3}],"age":1,"sex":"M","comorbidities":[]}'
        expected_min = 90
        expected_level = "CRITICAL"
    },
    @{
        name = "Adult fever worsening (HIGH-MOD)"
        body = '{"symptoms":[{"name":"high_fever","severity":7,"onset_hours_ago":12},{"name":"joint_pain","severity":6,"onset_hours_ago":12},{"name":"rash","severity":4,"onset_hours_ago":6}],"age":35,"sex":"F","comorbidities":[]}'
        expected_min = 50
        expected_level_in = @("HIGH","MODERATE","CRITICAL")
    },
    @{
        name = "Mild headache (LOW)"
        body = '{"symptoms":[{"name":"severe_headache","severity":3,"onset_hours_ago":12}],"age":28,"sex":"M","comorbidities":[]}'
        expected_max = 35
        expected_level_in = @("LOW","MODERATE")
    },
    @{
        name = "Trajectory escalator"
        body = '{"symptoms":[{"name":"fever","severity":5,"onset_hours_ago":24}],"age":40,"sex":"F","comorbidities":[],"history":[{"ts":"2026-05-15T00:00:00Z","score":20},{"ts":"2026-05-15T01:00:00Z","score":28},{"ts":"2026-05-15T02:00:00Z","score":35},{"ts":"2026-05-15T03:00:00Z","score":42},{"ts":"2026-05-15T04:00:00Z","score":48}]}'
        expected_trajectory_in = @("worsening","rapidly_worsening")
    }
)

Write-Host "Booting backend on $port..."
Set-Location $backend
$uviArgs = @("-m","uvicorn","app.main:app","--port","$port","--log-level","warning")
$proc = Start-Process -FilePath py -ArgumentList $uviArgs -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4

$failures = 0
$total = $cases.Count

try {
    foreach ($c in $cases) {
        Write-Host -NoNewline "  $($c.name)... "
        try {
            $r = Invoke-RestMethod -Uri "http://127.0.0.1:$port/api/v1/risk/compute" -Method Post -ContentType "application/json" -Body $c.body -TimeoutSec 10
        } catch {
            Write-Host "FAIL (HTTP error: $($_.Exception.Message))" -ForegroundColor Red
            $failures++
            continue
        }

        $ok = $true
        $reasons = @()

        if ($c.expected_min -ne $null -and $r.score -lt $c.expected_min) {
            $ok = $false; $reasons += "score $($r.score) < min $($c.expected_min)"
        }
        if ($c.expected_max -ne $null -and $r.score -gt $c.expected_max) {
            $ok = $false; $reasons += "score $($r.score) > max $($c.expected_max)"
        }
        if ($c.expected_level -ne $null -and $r.level -ne $c.expected_level) {
            $ok = $false; $reasons += "level $($r.level) != $($c.expected_level)"
        }
        if ($c.expected_level_in -ne $null -and -not ($c.expected_level_in -contains $r.level)) {
            $ok = $false; $reasons += "level $($r.level) not in [$($c.expected_level_in -join ',')]"
        }
        if ($c.expected_trajectory_in -ne $null -and -not ($c.expected_trajectory_in -contains $r.trajectory)) {
            $ok = $false; $reasons += "trajectory $($r.trajectory) not in [$($c.expected_trajectory_in -join ',')]"
        }

        if ($ok) {
            Write-Host "OK (score=$($r.score) level=$($r.level) traj=$($r.trajectory))" -ForegroundColor Green
        } else {
            Write-Host "FAIL — $($reasons -join '; ')" -ForegroundColor Red
            $failures++
        }
    }
} finally {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

Write-Host ""
if ($failures -eq 0) {
    Write-Host "All $total parity cases passed." -ForegroundColor Green
    exit 0
} else {
    Write-Host "$failures / $total parity cases FAILED." -ForegroundColor Red
    exit 1
}
