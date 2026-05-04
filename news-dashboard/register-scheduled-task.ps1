# register-scheduled-task.ps1
# ----------------------------------------------------------------------------
# Manage the Windows Task Scheduler entry that replaces the Docker-based
# OpenClaw cron job for the News Dashboard morning run.
#
# Task name : OpenClaw-NewsDashboard-Morning
# Trigger   : Daily at 07:30 (machine local time; user TZ = Asia/Jerusalem)
# Action    : node.exe <workspace>\news-dashboard\scheduled-run.js
# Runs as   : current user (interactive logon = needed for ws / network use)
#
# Modes:
#   -Mode Install     create or replace the task (uses Register-ScheduledTask)
#   -Mode Uninstall   remove the task (reversible - re-run Install to restore)
#   -Mode Status      show the current task definition + last result
#   -Mode Run         start the task right now (does NOT change schedule)
#   -Mode Disable     stop the task from firing without removing it
#   -Mode Enable      re-enable a disabled task
#
# Examples:
#   powershell -File register-scheduled-task.ps1 -Mode Install
#   powershell -File register-scheduled-task.ps1 -Mode Status
#   powershell -File register-scheduled-task.ps1 -Mode Run
#   powershell -File register-scheduled-task.ps1 -Mode Uninstall
# ----------------------------------------------------------------------------

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Install', 'Uninstall', 'Status', 'Run', 'Disable', 'Enable')]
    [string]$Mode,

    [string]$TaskName = 'OpenClaw-NewsDashboard-Morning',
    [string]$TimeOfDay = '07:30'
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner    = Join-Path $scriptDir 'scheduled-run.js'

function Resolve-NodeExe {
    $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $candidates = @(
        "${env:ProgramFiles}\nodejs\node.exe",
        "${env:ProgramFiles(x86)}\nodejs\node.exe",
        "${env:LOCALAPPDATA}\Programs\nodejs\node.exe",
        "${env:APPDATA}\nvm\current\node.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    throw "node.exe not found on PATH or in common install locations. Install Node.js or pass it explicitly."
}

function Install-Task {
    if (-not (Test-Path $runner)) {
        throw "runner script not found: $runner"
    }
    $node = Resolve-NodeExe
    Write-Host "Installing task '$TaskName'"
    Write-Host "  node       : $node"
    Write-Host "  runner     : $runner"
    Write-Host "  daily at   : $TimeOfDay (machine local time)"

    $action  = New-ScheduledTaskAction -Execute $node -Argument "`"$runner`"" -WorkingDirectory $scriptDir
    $trigger = New-ScheduledTaskTrigger -Daily -At $TimeOfDay
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
        -MultipleInstances IgnoreNew `
        -RestartCount 2 `
        -RestartInterval (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Write-Host "Existing task found - replacing." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }

    Register-ScheduledTask `
        -TaskName    $TaskName `
        -Description 'Daily News Dashboard morning run (Node-native, replaces Docker cron). Runs morning-run.js, verifies publish, sends Telegram summary with buildId idempotency.' `
        -Action      $action `
        -Trigger     $trigger `
        -Settings    $settings `
        -Principal   $principal | Out-Null

    Write-Host "Installed. Showing status..." -ForegroundColor Green
    Show-Status
}

function Uninstall-Task {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
        Write-Host "Uninstalled task '$TaskName'." -ForegroundColor Green
    } else {
        Write-Host "No task named '$TaskName' is registered." -ForegroundColor Yellow
    }
}

function Show-Status {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Host "No task '$TaskName' is registered." -ForegroundColor Yellow
        return
    }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    [PSCustomObject]@{
        Name            = $task.TaskName
        State           = $task.State
        Author          = $task.Author
        LastRunTime     = $info.LastRunTime
        LastTaskResult  = $info.LastTaskResult
        NextRunTime     = $info.NextRunTime
        NumberOfMissedRuns = $info.NumberOfMissedRuns
        Trigger         = ($task.Triggers | ForEach-Object { "$($_.CimClass.CimClassName)@$($_.StartBoundary)" }) -join '; '
        Action          = ($task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join '; '
    } | Format-List
}

function Run-Task {
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
        throw "task '$TaskName' is not registered. Run -Mode Install first."
    }
    Write-Host "Triggering '$TaskName' now..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    Show-Status
}

function Disable-Task {
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
        throw "task '$TaskName' is not registered."
    }
    Disable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "Disabled '$TaskName' (will not fire until re-enabled)." -ForegroundColor Yellow
}

function Enable-Task {
    if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
        throw "task '$TaskName' is not registered."
    }
    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    Write-Host "Enabled '$TaskName'." -ForegroundColor Green
}

switch ($Mode) {
    'Install'   { Install-Task }
    'Uninstall' { Uninstall-Task }
    'Status'    { Show-Status }
    'Run'       { Run-Task }
    'Disable'   { Disable-Task }
    'Enable'    { Enable-Task }
}
