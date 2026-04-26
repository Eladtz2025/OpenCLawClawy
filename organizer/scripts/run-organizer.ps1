$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$organizerRoot = Join-Path $workspace 'organizer'
$statePath = Join-Path $organizerRoot 'state\organizer-state.json'
$reportsDir = Join-Path $organizerRoot 'reports'
$diskAuditRoot = Join-Path $workspace 'disk_audit'

function Load-State {
    return Get-Content $statePath -Raw | ConvertFrom-Json
}

function Save-State($state) {
    $state.updatedAt = (Get-Date).ToString('s')
    $state | ConvertTo-Json -Depth 10 | Set-Content -Path $statePath -Encoding UTF8
}

function Set-PipelineStatus($state, $name, $status, $note, $reportPath) {
    $pipeline = $state.pipelines.$name
    $pipeline.status = $status
    if ($note) { $pipeline.notes += $note }
    if ($reportPath) { $pipeline.lastReport = $reportPath }
}

function Run-ComputerPipeline($state) {
    $reportPath = Join-Path $reportsDir 'computer-latest.md'
    $approvalReportPath = Join-Path $reportsDir 'computer-approval-packages.md'
    $scriptPath = Join-Path $organizerRoot 'scripts\build-computer-report.ps1'
    $approvalScriptPath = Join-Path $organizerRoot 'scripts\build-computer-approval-packages.ps1'
    if (-not (Test-Path $diskAuditRoot)) {
        Set-PipelineStatus $state 'computer' 'blocked_missing_input' 'disk_audit folder is missing' $null
        return
    }
    & $scriptPath | Out-Null
    & $approvalScriptPath | Out-Null
    Set-PipelineStatus $state 'computer' 'ready_for_approval' 'computer report and approval packages rebuilt from disk_audit' $approvalReportPath
}

function Run-GmailPipeline($state) {
    $reportPath = Join-Path $reportsDir 'gmail-latest.md'
    $bootstrapReportPath = Join-Path $reportsDir 'gmail-auth-bootstrap.md'
    $bootstrapScriptPath = Join-Path $organizerRoot 'scripts\bootstrap-gmail-auth.ps1'
    & $bootstrapScriptPath | Out-Null
    $lines = @(
        '# Gmail Pipeline',
        '',
        "Generated: $(Get-Date -Format s)",
        '',
        'Status: blocked on OAuth/authenticated MCP session.',
        'Bootstrap: ready.',
        'Needed: real user-session auth flow for google-workspace MCP before audit can run.'
    )
    $lines -join "`r`n" | Set-Content -Path $reportPath -Encoding UTF8
    Set-PipelineStatus $state 'gmail' 'blocked_auth' 'gmail bootstrap rebuilt, waiting for real OAuth session' $bootstrapReportPath
}

function Run-PhotosPipeline($state) {
    $reportPath = Join-Path $reportsDir 'photos-latest.md'
    $bootstrapReportPath = Join-Path $reportsDir 'photos-auth-bootstrap.md'
    $bootstrapScriptPath = Join-Path $organizerRoot 'scripts\bootstrap-photos-auth.ps1'
    $credPath = 'C:\Users\Itzhak\.openclaw\workspace\credentials.json'
    $tokenPath = 'C:\Users\Itzhak\.openclaw\workspace\token_photos.pickle'
    & $bootstrapScriptPath | Out-Null
    $status = 'blocked_auth'
    $note = 'photos bootstrap rebuilt, waiting for valid credentials/token flow'
    if ((Test-Path $credPath) -and (Test-Path $tokenPath)) {
        $status = 'ready'
        $note = 'credentials and token file detected, audit runner can be implemented next'
    }
    $lines = @(
        '# Photos Pipeline',
        '',
        "Generated: $(Get-Date -Format s)",
        '',
        'Bootstrap: ready.',
        "Credentials file: $(Test-Path $credPath)",
        "Token file: $(Test-Path $tokenPath)",
        "Status: $status"
    )
    $lines -join "`r`n" | Set-Content -Path $reportPath -Encoding UTF8
    Set-PipelineStatus $state 'photos' $status $note $bootstrapReportPath
}

$state = Load-State
Run-ComputerPipeline $state
Run-GmailPipeline $state
Run-PhotosPipeline $state
Save-State $state

$summaryPath = Join-Path $reportsDir 'run-summary.md'
$summary = @(
    '# Organizer Run Summary',
    '',
    "Generated: $(Get-Date -Format s)",
    '',
    "- computer: $($state.pipelines.computer.status)",
    "- gmail: $($state.pipelines.gmail.status)",
    "- photos: $($state.pipelines.photos.status)"
)
$summary -join "`r`n" | Set-Content -Path $summaryPath -Encoding UTF8
Write-Output $summaryPath
