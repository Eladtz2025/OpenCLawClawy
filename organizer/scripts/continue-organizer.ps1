$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$organizerRoot = Join-Path $workspace 'organizer'
$queuePath = Join-Path $organizerRoot 'state\run-queue.json'
$continuationPath = Join-Path $organizerRoot 'state\continuation-state.json'
$statePath = Join-Path $organizerRoot 'state\organizer-state.json'
$reportsDir = Join-Path $organizerRoot 'reports'
$authStatusScript = Join-Path $organizerRoot 'scripts\get-organizer-auth-status.ps1'
$authStatusReportPath = Join-Path $reportsDir 'auth-status-latest.json'
$summaryPath = Join-Path $reportsDir 'continuation-summary.md'

function Save-Json($path, $obj) {
    $obj | ConvertTo-Json -Depth 20 | Set-Content -Path $path -Encoding UTF8
}

function Write-ContinuationSummary($path, $continuation, $state, $authStatus) {
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

    if ($authStatus) {
        $summary += ''
        $summary += 'Auth snapshot:'
        $summary += "- Gmail appDataExists: $($authStatus.gmail.appDataExists)"
        $summary += "- Gmail logsDirExists: $($authStatus.gmail.logsDirExists)"
        $summary += "- Gmail logsLastWriteUtc: $($authStatus.gmail.logsLastWriteUtc)"
        $summary += "- Photos tokenExists: $($authStatus.photos.tokenExists)"
    }

    $summary -join "`r`n" | Set-Content -Path $path -Encoding UTF8
}

function Test-GmailAuthFresh($authStatus, [int]$maxAgeMinutes = 30) {
    if (-not $authStatus) { return $false }
    if (-not $authStatus.gmail.appDataExists) { return $false }
    if (-not $authStatus.gmail.logsDirExists) { return $false }
    if (-not $authStatus.gmail.logsLastWriteUtc) { return $false }

    try {
        $lastWriteUtc = [datetime]::Parse($authStatus.gmail.logsLastWriteUtc)
        return $lastWriteUtc -ge (Get-Date).ToUniversalTime().AddMinutes(-1 * $maxAgeMinutes)
    }
    catch {
        return $false
    }
}

function Invoke-GmailProbeWithTimeout($workspace, $timeoutSeconds = 25) {
    $probeScript = Join-Path $workspace 'organizer\scripts\probe-gmail-capabilities.ps1'
    if (-not (Test-Path $probeScript)) {
        return [pscustomobject]@{ completed = $false; timedOut = $false; outputPath = $null; reason = 'missing_probe_script' }
    }

    $job = Start-Job -ScriptBlock {
        param($scriptPath)
        powershell -ExecutionPolicy Bypass -File $scriptPath
    } -ArgumentList $probeScript

    $completed = Wait-Job -Job $job -Timeout $timeoutSeconds
    if (-not $completed) {
        Stop-Job -Job $job | Out-Null
        Remove-Job -Job $job | Out-Null
        return [pscustomobject]@{ completed = $false; timedOut = $true; outputPath = $null; reason = 'timeout' }
    }

    $output = Receive-Job -Job $job
    Remove-Job -Job $job | Out-Null
    return [pscustomobject]@{ completed = $true; timedOut = $false; outputPath = ($output | Select-Object -Last 1); reason = $null }
}

$queue = Get-Content $queuePath -Raw | ConvertFrom-Json
$continuation = Get-Content $continuationPath -Raw | ConvertFrom-Json
$state = Get-Content $statePath -Raw | ConvertFrom-Json

$authStatus = $null
if (Test-Path $authStatusScript) {
    $authStatus = powershell -ExecutionPolicy Bypass -File $authStatusScript | ConvertFrom-Json
    Save-Json $authStatusReportPath $authStatus
    if ($authStatus.gmail.logsDirExists -and $authStatus.gmail.logsLastWriteUtc) {
        $gmailNotes = @()
        if ($state.pipelines.gmail.notes) { $gmailNotes += $state.pipelines.gmail.notes }
        $logNote = "latest observed gmail log write utc: $($authStatus.gmail.logsLastWriteUtc)"
        if ($gmailNotes -notcontains $logNote) {
            $gmailNotes += $logNote
            $state.pipelines.gmail.notes = $gmailNotes
        }
    }
    if ($authStatus.photos.tokenExists) {
        $state.pipelines.photos.status = 'ready'
    }
}

$gmailAuthFresh = Test-GmailAuthFresh -authStatus $authStatus
$gmailBlocked = ($state.pipelines.gmail.status -in @('blocked_session_scope','user_scope_config_repaired_pending_auth','waiting_live_auth_flow')) -and (-not $gmailAuthFresh)
$photosBlocked = $state.pipelines.photos.status -eq 'blocked_interactive_auth'
$authWaiting = $gmailBlocked -or $photosBlocked

if ($continuation.loopEnabled -and -not $queue.activeRun -and (($null -eq $queue.pendingRuns) -or $queue.pendingRuns.Count -eq 0) -and -not $authWaiting) {
    $autoRunId = [guid]::NewGuid().ToString()
    $queue.activeRun = [pscustomobject]@{
        id = $autoRunId
        createdAt = (Get-Date).ToString('s')
        status = 'queued'
        goal = 'Organizer V2 auto-continuation cycle'
        phases = @('computer','gmail','photos','finalize')
    }
    $continuation.currentRunId = $autoRunId
    $continuation.currentPhase = 'computer'
}

if ($authWaiting -and -not $queue.activeRun) {
    $continuation.currentPhase = 'waiting_for_auth'
}

if (-not $authWaiting -and -not $queue.activeRun -and $continuation.currentPhase -eq 'waiting_for_auth') {
    $continuation.currentPhase = 'computer'
}

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
    if ($authWaiting) {
        $continuation.currentPhase = 'waiting_for_auth'
    } else {
        $continuation.currentPhase = 'idle'
    }
    $continuation.lastTickAt = (Get-Date).ToString('s')
    $state.updatedAt = (Get-Date).ToString('s')
    Save-Json $statePath $state
    Save-Json $queuePath $queue
    Save-Json $continuationPath $continuation
    Write-ContinuationSummary -path $summaryPath -continuation $continuation -state $state -authStatus $authStatus
    Write-Output $continuation.currentPhase.ToUpperInvariant()
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
        $probePath = Join-Path $reportsDir 'gmail-capability-probe.md'
        if ($gmailAuthFresh) {
            $probeResult = Invoke-GmailProbeWithTimeout -workspace $workspace -timeoutSeconds 25
            if ($probeResult.outputPath) {
                $probePath = $probeResult.outputPath
            }
            if ($probeResult.completed -and (Test-Path $probePath)) {
                $probeText = Get-Content $probePath -Raw
                if ($probeText -match 'mcporter people\.getMe exit:\s*0' -and $probeText -match 'mcporter gmail\.search exit:\s*0') {
                    $state.pipelines.gmail.status = 'ready'
                } else {
                    $state.pipelines.gmail.status = 'waiting_live_auth_flow'
                }
            } elseif ($probeResult.timedOut) {
                $state.pipelines.gmail.status = 'waiting_live_auth_flow'
                $gmailNotes = @()
                if ($state.pipelines.gmail.notes) { $gmailNotes += $state.pipelines.gmail.notes }
                $timeoutNote = "gmail probe timed out at $(Get-Date -Format s)"
                $gmailNotes += $timeoutNote
                $state.pipelines.gmail.notes = $gmailNotes
            }
        } else {
            if (-not (Test-Path $probePath)) {
                $lines = @(
                    '# Gmail Capability Probe',
                    '',
                    "Generated: $(Get-Date -Format s)",
                    '',
                    'Status: blocked_session_scope',
                    'Reason: runtime HOME/AppData resolves to systemprofile, so google-workspace auth lands in the wrong profile.',
                    'Continuation loop is waiting for fresh user-session auth activity before running a live probe.'
                )
                $lines -join "`r`n" | Set-Content -Path $probePath -Encoding UTF8
            }
            if ($authStatus -and $authStatus.gmail.appDataExists -and $authStatus.gmail.logsDirExists) {
                $state.pipelines.gmail.status = 'waiting_live_auth_flow'
            } elseif (-not $state.pipelines.gmail.status) {
                $state.pipelines.gmail.status = 'blocked_session_scope'
            }
        }
        $state.pipelines.gmail.lastReport = $probePath
        $continuation.currentPhase = 'photos'
    }
    'photos' {
        if ($authStatus -and $authStatus.photos.tokenExists) {
            $state.pipelines.photos.status = 'ready'
        } else {
            $state.pipelines.photos.status = 'blocked_interactive_auth'
        }
        $state.pipelines.photos.lastReport = Join-Path $reportsDir 'photos-auth-status.md'
        $continuation.currentPhase = 'finalize'
    }
    'finalize' {
        $run = $queue.activeRun
        $completedRun = [pscustomobject]@{
            id = $run.id
            createdAt = $run.createdAt
            status = 'partial'
            goal = $run.goal
            phases = $run.phases
            completedAt = (Get-Date).ToString('s')
        }
        $history = @()
        if ($queue.history) { $history += $queue.history }
        $history += $completedRun
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

Write-ContinuationSummary -path $summaryPath -continuation $continuation -state $state -authStatus $authStatus
Write-Output $summaryPath
