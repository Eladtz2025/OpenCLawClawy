# OpenClaw Telegram Bridge -- Windows service control script.
# Manages a per-user Scheduled Task that launches the bridge at logon
# via a hidden wscript.exe shim. No PowerShell window stays open.
#
# Usage:
#   .\bridge-service.ps1 install      # register the scheduled task and start
#   .\bridge-service.ps1 uninstall    # stop and unregister
#   .\bridge-service.ps1 enable       # enable the scheduled task
#   .\bridge-service.ps1 disable      # disable the scheduled task
#   .\bridge-service.ps1 start        # start the bridge now (no install)
#   .\bridge-service.ps1 stop         # stop the running bridge process
#   .\bridge-service.ps1 restart      # stop + start
#   .\bridge-service.ps1 status       # show running / task / health
#   .\bridge-service.ps1 self-check   # run bridge --self-check (no message sent)

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true, Position=0)]
  [ValidateSet('install','uninstall','enable','disable','start','stop','restart','status','self-check')]
  [string]$Command
)

$ErrorActionPreference = 'Stop'

# ---- paths ----------------------------------------------------------------
$TaskName  = 'OpenClaw-TelegramBridge'
$ScriptDir = $PSScriptRoot
$BridgeDir = Split-Path -Parent $ScriptDir
$Bridge    = Join-Path $BridgeDir 'bridge.js'
$Launcher  = Join-Path $ScriptDir 'launcher.vbs'
$LogDir    = Join-Path $BridgeDir 'logs'
$StateDir  = Join-Path $BridgeDir 'state'
$PidFile   = Join-Path $StateDir 'bridge.pid'
$TokenPathPrimary  = Join-Path $env:USERPROFILE '.openclaw\claude-bridge.token'
$TokenPathFallback = Join-Path $env:USERPROFILE '.openclaw\traffic-bridge.token'

function Ensure-Dirs {
  if (-not (Test-Path $LogDir))   { New-Item -ItemType Directory -Path $LogDir   | Out-Null }
  if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir | Out-Null }
}

# Find the running bridge node process by inspecting its command line.
# We don't write a pid file from the bridge itself (keeps the bridge tiny);
# instead we identify it by command-line argument matching bridge.js.
function Get-RunningProc {
  try {
    $p = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
         Where-Object { $_.CommandLine -and $_.CommandLine -like "*bridge.js*" -and $_.CommandLine -like "*telegram-bridge*" } |
         Select-Object -First 1
    return $p
  } catch { return $null }
}

function Get-BridgeTask {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

# ---- commands -------------------------------------------------------------

function Cmd-Install {
  Ensure-Dirs

  if (-not (Test-Path $Launcher)) { throw "Launcher not found: $Launcher" }
  if (-not (Test-Path $Bridge))   { throw "Bridge not found: $Bridge" }

  if (-not (Test-Path $TokenPathPrimary) -and -not (Test-Path $TokenPathFallback)) {
    throw "No bot token at $TokenPathPrimary (or $TokenPathFallback). Place it before installing."
  }

  $action  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}"' -f $Launcher)
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings  = New-ScheduledTaskSettingsSet `
                  -AllowStartIfOnBatteries `
                  -DontStopIfGoingOnBatteries `
                  -StartWhenAvailable `
                  -MultipleInstances IgnoreNew `
                  -ExecutionTimeLimit ([TimeSpan]::Zero)

  if (Get-BridgeTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Register-ScheduledTask -TaskName $TaskName `
                         -Description 'OpenClaw Telegram Bridge (Claude Code remote-control bot).' `
                         -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
                         | Out-Null

  Write-Host "[install] Scheduled task '$TaskName' registered."
  Cmd-Start
}

function Cmd-Uninstall {
  Cmd-Stop -Quiet
  if (Get-BridgeTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[uninstall] Scheduled task '$TaskName' removed."
  } else {
    Write-Host "[uninstall] Scheduled task '$TaskName' was not installed."
  }
}

function Cmd-Enable {
  $t = Get-BridgeTask
  if (-not $t) { throw "Task '$TaskName' is not installed. Run: install" }
  Enable-ScheduledTask -TaskName $TaskName | Out-Null
  Write-Host "[enable] Task '$TaskName' enabled."
}

function Cmd-Disable {
  $t = Get-BridgeTask
  if (-not $t) { throw "Task '$TaskName' is not installed. Run: install" }
  Disable-ScheduledTask -TaskName $TaskName | Out-Null
  Write-Host "[disable] Task '$TaskName' disabled."
}

function Cmd-Start {
  $existing = Get-RunningProc
  if ($existing) {
    Write-Host "[start] Already running (pid $($existing.ProcessId))."
    return
  }
  Ensure-Dirs
  if (-not (Test-Path $Launcher)) { throw "Launcher missing: $Launcher" }
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"{0}"' -f $Launcher) -WindowStyle Hidden | Out-Null

  # Wait briefly for the process to come up.
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    if (Get-RunningProc) { break }
  }
  $p = Get-RunningProc
  if ($p) { Write-Host "[start] Started (pid $($p.ProcessId))." }
  else    { Write-Host "[start] Launched, but process not visible yet. Check logs at $LogDir." }
}

function Cmd-Stop {
  param([switch]$Quiet)
  $p = Get-RunningProc
  if (-not $p) {
    if (-not $Quiet) { Write-Host "[stop] Not running." }
    return
  }
  # Snapshot child tree before killing parent (long-running getUpdates http
  # connection has no children, but keep symmetry with dashboard-service.ps1).
  try {
    $kids = Get-CimInstance Win32_Process -Filter ("ParentProcessId = {0}" -f $p.ProcessId) -ErrorAction SilentlyContinue
    foreach ($k in $kids) {
      try { & taskkill.exe /T /F /PID $k.ProcessId 2>$null | Out-Null } catch {}
    }
  } catch {}
  Stop-Process -Id $p.ProcessId -Force
  Start-Sleep -Milliseconds 300
  if (-not $Quiet) { Write-Host "[stop] Stopped (was pid $($p.ProcessId))." }
}

function Cmd-Restart {
  Cmd-Stop -Quiet
  Cmd-Start
}

function Cmd-Status {
  $proc = Get-RunningProc
  $task = Get-BridgeTask

  $tokenLabel = if (Test-Path $TokenPathPrimary) { 'present (claude-bridge.token)' }
                elseif (Test-Path $TokenPathFallback) { 'present (legacy traffic-bridge.token)' }
                else { 'MISSING' }

  $state = if ($task) { [string]$task.State } else { 'NotInstalled' }

  Write-Host ''
  Write-Host '-- OpenClaw Telegram Bridge --------------------------'
  Write-Host ('  Task name    : {0}' -f $TaskName)
  Write-Host ('  Task state   : {0}' -f $state)
  if ($proc) {
    Write-Host ('  Process      : RUNNING (pid {0})' -f $proc.ProcessId)
  } else {
    Write-Host  '  Process      : NOT RUNNING'
  }
  Write-Host ('  Token file   : {0}' -f $tokenLabel)
  Write-Host ('  Logs         : {0}' -f $LogDir)
  Write-Host ''
}

function Cmd-SelfCheck {
  Write-Host "[self-check] running bridge.js --self-check ..."
  $node = (Get-Command node -ErrorAction SilentlyContinue)
  if (-not $node) { throw "node not found in PATH" }
  & node $Bridge --self-check
  Write-Host "[self-check] exit code $LASTEXITCODE"
}

switch ($Command) {
  'install'    { Cmd-Install }
  'uninstall'  { Cmd-Uninstall }
  'enable'     { Cmd-Enable }
  'disable'    { Cmd-Disable }
  'start'      { Cmd-Start }
  'stop'       { Cmd-Stop }
  'restart'    { Cmd-Restart }
  'status'     { Cmd-Status }
  'self-check' { Cmd-SelfCheck }
}
