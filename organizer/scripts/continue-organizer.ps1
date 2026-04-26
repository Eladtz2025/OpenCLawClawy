$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$organizerRoot = Join-Path $workspace 'organizer'
$queuePath = Join-Path $organizerRoot 'state\run-queue.json'
$continuationPath = Join-Path $organizerRoot 'state\continuation-state.json'
$statePath = Join-Path $organizerRoot 'state\organizer-state.json'
$reportsDir = Join-Path $organizerRoot 'reports'

function Save-Json($path, $obj) {
    $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $path -Encoding UTF8
}

$queue = Get-Content $queuePath -Raw | ConvertFrom-Json
$continuation = Get-Content $continuationPath -Raw | ConvertFrom-Json
$state = Get-Content $statePath -Raw | ConvertFrom-Json

if (-not $queue.activeRun -and $queue.pendingRuns.Count -gt 0) {
    $queue.activeRun = $queue.pendingRuns[0]
    if ($queue.pendingRuns.Count -gt 1) {
        $queue.pendingRuns = @($queue.pendingRuns | Select-Object -Skip 1)
    } else {
        $queue.pendingRuns = @()
    }
    $continuation.currentRunId = $queue.activeRun.id
    $continuation.currentPhase = 'computer'
}

if (-not $queue.activeRun) {
    $continuation.currentPhase = 'idle'
    $continuation.lastTickAt = (Get-Date).ToString('s')
    Save-Json $queuePath $queue
    Save-Json $continuationPath $continuation
    Write-Output 'IDLE'
    exit 0
}

switch ($continuation.currentPhase) {
    'computer' {
        powershell -ExecutionPolicy Bypass -File (Join-Path $organizerRoot 'scripts\build-computer-report.ps1') | Out-Null
        powershell -ExecutionPolicy Bypass -File (Join-Path $organizerRoot 'scripts\build-computer-approval-packages.ps1') | Out-Null
        $state.pipelines.computer.status = 'ready_for_approval'
        $state.pipelines.computer.lastReport = Join-Path $reportsDir 'computer-approval-packages.md'
        $continuation.currentPhase = 'gmail'
    }
    'gmail' {
        powershell -ExecutionPolicy Bypass -File (Join-Path $organizerRoot 'scripts\probe-gmail-capabilities.ps1') | Out-Null
        $state.pipelines.gmail.status = 'blocked_session_scope'
        $state.pipelines.gmail.lastReport = Join-Path $reportsDir 'gmail-capability-probe.md'
        $continuation.currentPhase = 'photos'
    }
    'photos' {
        $state.pipelines.photos.status = 'blocked_interactive_auth'
        $state.pipelines.photos.lastReport = Join-Path $reportsDir 'photos-auth-status.md'
        $continuation.currentPhase = 'finalize'
    }
    'finalize' {
        $run = $queue.activeRun
        $run.status = 'partial'
        $run.completedAt = (Get-Date).ToString('s')
        $history = @()
        if ($queue.history) { $history += $queue.history }
        $history += $run
        $queue.history = $history
        $queue.activeRun = $null
        $continuation.currentRunId = $null
        if ($queue.pendingRuns.Count -gt 0) {
            $continuation.currentPhase = 'computer'
        } else {
            $continuation.currentPhase = 'idle'
        }
    }
    default {
        $continuation.currentPhase = 'computer'
    }
}

$state.updatedAt = (Get-Date).ToString('s')
$continuation.lastTickAt = (Get-Date).ToString('s')

Save-Json $statePath $state
Save-Json $queuePath $queue
Save-Json $continuationPath $continuation

$summaryPath = Join-Path $reportsDir 'continuation-summary.md'
$summary = @(
    '# Organizer Continuation Summary',
    '',
    "Generated: $(Get-Date -Format s)",
    "Current phase: $($continuation.currentPhase)",
    "Current run: $($continuation.currentRunId)",
    "Computer: $($state.pipelines.computer.status)",
    "Gmail: $($state.pipelines.gmail.status)",
    "Photos: $($state.pipelines.photos.status)"
)
$summary -join "`r`n" | Set-Content -Path $summaryPath -Encoding UTF8
Write-Output $summaryPath
