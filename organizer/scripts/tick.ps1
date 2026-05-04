# Organizer V2 — modular orchestrator tick (no Docker, no LLM, no infinite retries).
#
# Reads organizer/state/orchestrator.json. For each ENABLED module, performs a
# light "tick" action chosen per module's preferredTickVerb:
#   - computer: doctor (cheap; the heavy `scan` is run on demand)
#   - gmail:    auth   (cheap connectivity ping)
#   - photos:   auth   (cheap consent-URL refresh / token check)
#
# A LOOP-detection rule still applies: if a module returns a non-OK status
# `consecutiveBlockedTicks` increments. After `maxBlockedTicksBeforeQuiet`
# ticks the module enters `quieted` state and is skipped silently until
# manually re-armed.
#
# Outputs:
#   - organizer/state/orchestrator.json (updated)
#   - organizer/reports/orchestrator-tick.md (human summary)
#   - organizer/logs/tick.log (one line per tick)
#
# Exit codes:
#   0 = clean tick
#   2 = at least one enabled module errored
#   3 = every enabled module is in `quieted` state (manual action needed)

$ErrorActionPreference = 'Stop'

$workspace      = 'C:\Users\Itzhak\.openclaw\workspace'
$organizerRoot  = Join-Path $workspace 'organizer'
$stateDir       = Join-Path $organizerRoot 'state'
$reportsDir     = Join-Path $organizerRoot 'reports'
$logsDir        = Join-Path $organizerRoot 'logs'
$modulesDir     = Join-Path $organizerRoot 'modules'

if (-not (Test-Path $logsDir))    { New-Item -ItemType Directory -Force -Path $logsDir    | Out-Null }
if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Force -Path $reportsDir | Out-Null }

$orchestratorPath  = Join-Path $stateDir 'orchestrator.json'
$tickReportPath    = Join-Path $reportsDir 'orchestrator-tick.md'
$tickLogPath       = Join-Path $logsDir 'tick.log'

function Save-Json($path, $obj) {
    $obj | ConvertTo-Json -Depth 30 | Set-Content -Path $path -Encoding UTF8
}
function Read-Json($path) { return Get-Content $path -Raw | ConvertFrom-Json }
function Append-Log($line) { Add-Content -Path $tickLogPath -Value $line -Encoding UTF8 }

$nowUtc = (Get-Date).ToUniversalTime().ToString('o')
$startedAt = Get-Date

if (-not (Test-Path $orchestratorPath)) { throw "missing orchestrator config: $orchestratorPath" }
$orch = Read-Json $orchestratorPath

$results = @{}

# ---- helpers per runtime ----
function Tick-Computer($cfg) {
    $entry = Join-Path $modulesDir 'computer\computer.ps1'
    if (-not (Test-Path $entry)) { return @{ status = 'error'; error = 'entry missing' } }
    try {
        & powershell -ExecutionPolicy Bypass -File $entry -Verb doctor | Out-Null
        # Heuristic: derive scan freshness from module state.
        $st = Get-Content (Join-Path $modulesDir 'computer\state.json') -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json
        $stale = $false
        if ($st -and $st.lastScanAt) {
            $age = (New-TimeSpan -Start ([datetime]$st.lastScanAt) -End (Get-Date)).TotalHours
            $stale = $age -ge ($cfg.schedule.minScanIntervalHours -as [int])
        } else {
            $stale = $true
        }
        return @{ status = 'ok'; stale = $stale; note = if ($stale) { 'scan recommended (stale)' } else { 'scan fresh' } }
    } catch {
        return @{ status = 'error'; error = $_.Exception.Message }
    }
}

function Tick-Gmail($cfg) {
    $entry = Join-Path $modulesDir 'gmail\gmail.js'
    if (-not (Test-Path $entry)) { return @{ status = 'error'; error = 'entry missing' } }
    try {
        $r = & node $entry auth 2>&1
        $exit = $LASTEXITCODE
        if ($exit -ne 0) { return @{ status = 'error'; error = "node exit $exit" } }
        $obj = $r -join "`n" | ConvertFrom-Json
        if ($obj.decision -in @('authenticated','authenticated_via_marker_runner_blocked')) {
            return @{ status = 'ok'; decision = $obj.decision }
        } elseif ($obj.decision -eq 'runner_timeout_auth_unknown') {
            return @{ status = 'blocked_auth'; decision = $obj.decision }
        } else {
            return @{ status = 'blocked_auth'; decision = $obj.decision }
        }
    } catch {
        return @{ status = 'error'; error = $_.Exception.Message }
    }
}

function Tick-Photos($cfg) {
    $entry = Join-Path $modulesDir 'photos\photos.py'
    if (-not (Test-Path $entry)) { return @{ status = 'error'; error = 'entry missing' } }
    try {
        $r = & python $entry auth 2>&1
        $exit = $LASTEXITCODE
        if ($exit -ne 0) { return @{ status = 'error'; error = "python exit $exit" } }
        $obj = $r -join "`n" | ConvertFrom-Json
        if ($obj.decision -in @('authenticated','refreshed','authenticated_via_code')) {
            return @{ status = 'ok'; decision = $obj.decision }
        } elseif ($obj.decision -in @('awaiting_user_consent','no_credentials_json','token_invalid','deps_missing')) {
            return @{ status = 'blocked_auth'; decision = $obj.decision }
        } else {
            return @{ status = 'error'; decision = $obj.decision }
        }
    } catch {
        return @{ status = 'error'; error = $_.Exception.Message }
    }
}

# ---- iterate modules ----
foreach ($name in @('computer','gmail','photos')) {
    $cfg = $orch.modules.$name
    if (-not $cfg.enabled) {
        $results[$name] = @{ status = 'disabled' }
        continue
    }
    # Already-quieted: skip silently
    if ([int]$cfg.consecutiveBlockedTicks -ge [int]$cfg.maxBlockedTicksBeforeQuiet) {
        $results[$name] = @{ status = 'quieted' }
        continue
    }
    $r = switch ($name) {
        'computer' { Tick-Computer $cfg }
        'gmail'    { Tick-Gmail $cfg }
        'photos'   { Tick-Photos $cfg }
    }
    $results[$name] = $r
    # Update tick counters
    if ($r.status -in @('blocked_auth')) {
        $cfg.consecutiveBlockedTicks = [int]$cfg.consecutiveBlockedTicks + 1
        if (-not $cfg.blockedSinceUtc) { $cfg.blockedSinceUtc = $nowUtc }
    } elseif ($r.status -eq 'ok') {
        $cfg.consecutiveBlockedTicks = 0
        $cfg.blockedSinceUtc = $null
    }
}

# Set updatedAt safely whether the property already exists on the deserialized PSObject or not.
if ($orch.PSObject.Properties['updatedAt']) {
    $orch.updatedAt = $nowUtc
} else {
    $orch | Add-Member -NotePropertyName 'updatedAt' -NotePropertyValue $nowUtc -Force
}
Save-Json $orchestratorPath $orch

# ---- summary ----
$lines = @(
    '# Organizer V2 Orchestrator Tick',
    '',
    "Generated UTC: $nowUtc",
    '',
    '| Module   | Enabled | Status         | Detail |',
    '|----------|---------|----------------|--------|'
)
foreach ($name in @('computer','gmail','photos')) {
    $cfg = $orch.modules.$name
    $r = $results[$name]
    $detail = ''
    if ($r.error)    { $detail = $r.error }
    elseif ($r.note) { $detail = $r.note }
    elseif ($r.decision) { $detail = $r.decision }
    elseif ($r.stale -ne $null) { $detail = ("stale=$($r.stale)") }
    $lines += "| $name | $($cfg.enabled) | $($r.status) | $detail |"
}
$lines += '', '## Notes', '',
    '- Computer is the always-on module. Gmail and Photos are opt-in.',
    '- A blocked module increments `consecutiveBlockedTicks` until `maxBlockedTicksBeforeQuiet`, then enters `quieted`.',
    '- This tick uses no Docker and no LLM calls.'
($lines -join "`r`n") | Set-Content -Path $tickReportPath -Encoding UTF8

# ---- log + exit ----
$enabled = @('computer','gmail','photos') | Where-Object { $orch.modules.$_.enabled }
$enabledQuiet = $enabled | Where-Object { $results[$_].status -eq 'quieted' }
$errors = @('computer','gmail','photos') | Where-Object { $results[$_].status -eq 'error' }

$durationMs = [int]((Get-Date) - $startedAt).TotalMilliseconds
$logLine = "$nowUtc tick durMs=$durationMs computer=$($results['computer'].status) gmail=$($results['gmail'].status) photos=$($results['photos'].status)"
Append-Log $logLine
Write-Output $logLine

if ($errors.Count -gt 0) { exit 2 }
if ($enabled.Count -gt 0 -and $enabled.Count -eq $enabledQuiet.Count) { exit 3 }
exit 0
