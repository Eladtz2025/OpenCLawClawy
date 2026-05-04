# OpenClaw Control Dashboard -- Windows service control script.
# Manages a per-user Scheduled Task that launches the dashboard at logon
# via a hidden wscript.exe shim. No PowerShell window stays open.
#
# Usage:
#   .\dashboard-service.ps1 install        # register the scheduled task and start
#   .\dashboard-service.ps1 uninstall      # stop and unregister
#   .\dashboard-service.ps1 enable         # enable the scheduled task
#   .\dashboard-service.ps1 disable        # disable the scheduled task
#   .\dashboard-service.ps1 start          # start the dashboard now (no install)
#   .\dashboard-service.ps1 stop           # stop the running dashboard process
#   .\dashboard-service.ps1 restart        # stop + start
#   .\dashboard-service.ps1 status         # show running / task / health
#   .\dashboard-service.ps1 remote-on      # ensure token, restart, print remote URL
#   .\dashboard-service.ps1 remote-off     # delete token, restart (local 127.0.0.1 unaffected)
#   .\dashboard-service.ps1 remote-status  # show remote listener bind + token state

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true, Position=0)]
  [ValidateSet('install','uninstall','enable','disable','start','stop','restart','status','remote-on','remote-off','remote-status')]
  [string]$Command
)

$ErrorActionPreference = 'Stop'

# ---- paths ----------------------------------------------------------------
$TaskName = 'OpenClaw-ControlDashboard'
$ScriptDir = $PSScriptRoot
$DashDir   = Split-Path -Parent $ScriptDir
$Server    = Join-Path $DashDir 'server.js'
$Launcher  = Join-Path $ScriptDir 'launcher.vbs'
$TokenTool = Join-Path $ScriptDir 'remote-token-setup.ps1'
$LogDir    = Join-Path $DashDir 'logs'
$StateDir  = Join-Path $DashDir 'state'
$PidFile   = Join-Path $StateDir 'dashboard.pid'
$TaskFile  = Join-Path $StateDir 'dashboard-task.json'
$TokenPath = Join-Path $env:USERPROFILE '.openclaw\dashboard-remote.token'
$Url       = 'http://127.0.0.1:7777'

function Ensure-Dirs {
  if (-not (Test-Path $LogDir))   { New-Item -ItemType Directory -Path $LogDir   | Out-Null }
  if (-not (Test-Path $StateDir)) { New-Item -ItemType Directory -Path $StateDir | Out-Null }
}

function Read-PidFile {
  if (-not (Test-Path $PidFile)) { return $null }
  try { return Get-Content $PidFile -Raw | ConvertFrom-Json } catch { return $null }
}

function Get-RunningProc {
  $info = Read-PidFile
  if (-not $info -or -not $info.pid) { return $null }
  $p = Get-Process -Id $info.pid -ErrorAction SilentlyContinue
  if (-not $p) { return $null }
  if ($p.ProcessName -notmatch '^node') { return $null }
  return $p
}

function Get-DashboardTask {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Write-TaskMeta {
  param([bool]$Installed, [string]$State)
  Ensure-Dirs
  $meta = @{
    taskName    = $TaskName
    installed   = $Installed
    state       = $State                        # 'Ready' | 'Disabled' | 'Running' | 'Unknown'
    enabled     = ($State -ne 'Disabled')
    updatedAt   = (Get-Date).ToString('o')
    launcher    = $Launcher
    serverPath  = $Server
    url         = $Url
  } | ConvertTo-Json -Depth 4
  Set-Content -Path $TaskFile -Value $meta -Encoding UTF8
}

function Refresh-TaskMeta {
  $t = Get-DashboardTask
  if (-not $t) { Write-TaskMeta -Installed $false -State 'NotInstalled'; return }
  Write-TaskMeta -Installed $true -State ([string]$t.State)
}

# ---- commands -------------------------------------------------------------

function Cmd-Install {
  Ensure-Dirs

  if (-not (Test-Path $Launcher)) { throw "Launcher not found: $Launcher" }
  if (-not (Test-Path $Server))   { throw "Server not found: $Server" }

  # Use wscript.exe so node runs with no visible window.
  $action  = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}"' -f $Launcher)
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
  $settings  = New-ScheduledTaskSettingsSet `
                  -AllowStartIfOnBatteries `
                  -DontStopIfGoingOnBatteries `
                  -StartWhenAvailable `
                  -MultipleInstances IgnoreNew `
                  -ExecutionTimeLimit ([TimeSpan]::Zero)

  if (Get-DashboardTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Register-ScheduledTask -TaskName $TaskName `
                         -Description 'OpenClaw Control Dashboard (loopback only).' `
                         -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
                         | Out-Null

  Refresh-TaskMeta
  Write-Host "[install] Scheduled task '$TaskName' registered."
  Cmd-Start
}

function Cmd-Uninstall {
  Cmd-Stop -Quiet
  if (Get-DashboardTask) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "[uninstall] Scheduled task '$TaskName' removed."
  } else {
    Write-Host "[uninstall] Scheduled task '$TaskName' was not installed."
  }
  if (Test-Path $TaskFile) { Remove-Item $TaskFile -Force }
}

function Cmd-Enable {
  $t = Get-DashboardTask
  if (-not $t) { throw "Task '$TaskName' is not installed. Run: install" }
  Enable-ScheduledTask -TaskName $TaskName | Out-Null
  Refresh-TaskMeta
  Write-Host "[enable] Task '$TaskName' enabled."
}

function Cmd-Disable {
  $t = Get-DashboardTask
  if (-not $t) { throw "Task '$TaskName' is not installed. Run: install" }
  Disable-ScheduledTask -TaskName $TaskName | Out-Null
  Refresh-TaskMeta
  Write-Host "[disable] Task '$TaskName' disabled."
}

function Cmd-Start {
  $existing = Get-RunningProc
  if ($existing) {
    Write-Host "[start] Already running (pid $($existing.Id))."
    return
  }
  Ensure-Dirs
  if (-not (Test-Path $Launcher)) { throw "Launcher missing: $Launcher" }
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"{0}"' -f $Launcher) -WindowStyle Hidden | Out-Null

  # Wait briefly for the server to write its pid file.
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 250
    if (Get-RunningProc) { break }
  }
  $p = Get-RunningProc
  if ($p) { Write-Host "[start] Started (pid $($p.Id)) - $Url" }
  else    { Write-Host "[start] Launched, but pid file not yet visible. Check logs at $LogDir." }
}

function Get-ProcessTreePids {
  # Recursively walk Win32_Process by ParentProcessId and return all
  # descendant PIDs. Used to sweep claude.exe (and grandchildren — node, bash,
  # curl, etc.) the dashboard spawned, so a stop/restart never leaves orphans.
  param([int]$ParentPid)
  $out = @()
  try {
    $kids = Get-CimInstance Win32_Process -Filter ("ParentProcessId = {0}" -f $ParentPid) -ErrorAction SilentlyContinue
  } catch { $kids = $null }
  if (-not $kids) { return $out }
  foreach ($k in $kids) {
    if ($null -eq $k.ProcessId) { continue }
    $out += [int]$k.ProcessId
    $out += Get-ProcessTreePids -ParentPid ([int]$k.ProcessId)
  }
  return ,$out
}

function Cmd-Stop {
  param([switch]$Quiet)
  $p = Get-RunningProc
  if (-not $p) {
    if (-not $Quiet) { Write-Host "[stop] Not running." }
    if (Test-Path $PidFile) { Remove-Item $PidFile -Force }
    return
  }
  # Snapshot the descendant tree BEFORE killing the parent, otherwise the
  # WMI walk loses the ParentProcessId link and we leak claude.exe.
  $descendants = Get-ProcessTreePids -ParentPid $p.Id
  if ($descendants -and $descendants.Count -gt 0) {
    foreach ($cp in $descendants) {
      try { & taskkill.exe /T /F /PID $cp 2>$null | Out-Null } catch {}
    }
    if (-not $Quiet) { Write-Host ("[stop] Swept {0} child process(es)." -f $descendants.Count) }
  }
  Stop-Process -Id $p.Id -Force
  Start-Sleep -Milliseconds 300
  if (Test-Path $PidFile) { Remove-Item $PidFile -Force -ErrorAction SilentlyContinue }
  if (-not $Quiet) { Write-Host "[stop] Stopped (was pid $($p.Id))." }
}

function Cmd-Restart {
  Cmd-Stop -Quiet
  Cmd-Start
}

function Cmd-Status {
  $proc = Get-RunningProc
  $task = Get-DashboardTask
  $info = Read-PidFile

  $health = $null
  try {
    $r = Invoke-WebRequest -Uri "$Url/api/health" -TimeoutSec 2 -UseBasicParsing
    $health = ($r.Content | ConvertFrom-Json)
  } catch { $health = $null }

  $state = if ($task) { [string]$task.State } else { 'NotInstalled' }
  Refresh-TaskMeta

  Write-Host ''
  Write-Host '-- OpenClaw Control Dashboard ------------------------'
  Write-Host ('  URL          : {0}' -f $Url)
  Write-Host ('  Task name    : {0}' -f $TaskName)
  Write-Host ('  Task state   : {0}' -f $state)
  if ($proc) {
    Write-Host ('  Process      : RUNNING (pid {0})' -f $proc.Id)
    if ($info -and $info.startedAt) { Write-Host ('  Started at   : {0}' -f $info.startedAt) }
  } else {
    Write-Host  '  Process      : NOT RUNNING'
  }
  if ($health -and $health.ok) {
    Write-Host ('  Health       : OK (server pid {0})' -f $health.pid)
  } else {
    Write-Host  '  Health       : unreachable'
  }
  # Surface leftover claude.exe processes so the user can spot leaks.
  $claudeProcs = Get-Process -Name 'claude' -ErrorAction SilentlyContinue
  $count = if ($claudeProcs) { @($claudeProcs).Count } else { 0 }
  if ($count -gt 0) {
    $pids = ($claudeProcs | ForEach-Object { $_.Id }) -join ', '
    Write-Host ('  claude.exe   : {0} live ({1})' -f $count, $pids)
  } else {
    Write-Host  '  claude.exe   : none'
  }
  Write-Host ('  Logs         : {0}' -f $LogDir)
  Write-Host ''
}

function Get-RemoteStatus {
  # Ask the running dashboard. /api/remote/status is reachable on the loopback
  # listener and returns tailscaleIp, port, listening, tokenConfigured, etc.
  try {
    $r = Invoke-WebRequest -Uri "$Url/api/remote/status" -TimeoutSec 2 -UseBasicParsing
    return ($r.Content | ConvertFrom-Json)
  } catch { return $null }
}

function Cmd-RemoteOn {
  if (-not (Test-Path $TokenTool)) { throw "Token tool missing: $TokenTool" }

  # 1. Ensure a token exists. The setup script is a no-op if one is already there.
  $tokenExisted = Test-Path -LiteralPath $TokenPath
  & $TokenTool | Out-Host
  if (-not (Test-Path -LiteralPath $TokenPath)) {
    throw "Token file was not created at $TokenPath"
  }

  # 2. Restart the dashboard so the remote listener picks up the token.
  Cmd-Restart

  # 3. Wait briefly for the remote listener to bind and report status.
  $status = $null
  $deadline = (Get-Date).AddSeconds(8)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 400
    $status = Get-RemoteStatus
    if ($status -and $status.listening) { break }
  }

  Write-Host ''
  Write-Host '-- OpenClaw Remote Access ----------------------------'
  if ($status) {
    if ($status.listening) {
      Write-Host ('  Remote URL   : {0}' -f $status.url)
      Write-Host ('  Bind         : {0}:{1}' -f $status.listeningOn.ip, $status.listeningOn.port)
      Write-Host  '  State        : LISTENING (Tailscale-only)'
    } else {
      Write-Host  '  State        : NOT LISTENING'
      Write-Host ('  Reason       : {0}' -f $status.reason)
      if ($status.tailscaleIp) {
        Write-Host ('  Tailscale IP : {0}' -f $status.tailscaleIp)
      } else {
        Write-Host  '  Tailscale IP : not detected -- is Tailscale up? (tailscale ip -4)'
      }
    }
    Write-Host ('  Token file   : {0}' -f $status.tokenPath)
  } else {
    Write-Host  '  Could not query /api/remote/status (dashboard not responding yet).'
    Write-Host  '  Re-run: .\dashboard-service.ps1 remote-status'
  }
  if (-not $tokenExisted) {
    Write-Host ''
    Write-Host  '  A new token was generated above. Copy it into your phone bookmark:'
    Write-Host  '    http://<tailscale-ip>:7787/?token=<token>'
  }
  Write-Host ''
}

function Cmd-RemoteOff {
  if (-not (Test-Path $TokenTool)) { throw "Token tool missing: $TokenTool" }

  # 1. Delete the token file. The remote listener stops accepting requests
  #    immediately (token re-read on every request).
  & $TokenTool -Disable | Out-Host

  # 2. Restart so the listener also stops binding the Tailscale interface.
  Cmd-Restart

  $status = Get-RemoteStatus
  Write-Host ''
  Write-Host '-- OpenClaw Remote Access ----------------------------'
  if ($status -and -not $status.listening) {
    Write-Host  '  State        : DISABLED'
    Write-Host ('  Reason       : {0}' -f $status.reason)
  } elseif ($status -and $status.listening) {
    Write-Host  '  State        : still listening (unexpected) -- check token file'
  } else {
    Write-Host  '  State        : dashboard not responding; remote token has been removed.'
  }
  Write-Host  '  Local        : http://127.0.0.1:7777 (unaffected)'
  Write-Host ''
}

function Cmd-RemoteStatus {
  $status = Get-RemoteStatus
  $tokenExists = Test-Path -LiteralPath $TokenPath

  Write-Host ''
  Write-Host '-- OpenClaw Remote Access ----------------------------'
  if (-not $status) {
    $tokenLabel = if ($tokenExists) { 'present' } else { 'MISSING' }
    Write-Host  '  Dashboard    : NOT RESPONDING on 127.0.0.1:7777'
    Write-Host  '  (start the service: .\dashboard-service.ps1 start)'
    Write-Host ('  Token file   : {0}' -f $tokenLabel)
    Write-Host ('  Token path   : {0}' -f $TokenPath)
    Write-Host ''
    return
  }
  if ($status.listening) {
    Write-Host ('  Remote URL   : {0}' -f $status.url)
    Write-Host ('  Bind         : {0}:{1}' -f $status.listeningOn.ip, $status.listeningOn.port)
    Write-Host  '  State        : LISTENING (Tailscale-only, 100.64.0.0/10)'
  } else {
    Write-Host  '  State        : NOT LISTENING'
    Write-Host ('  Reason       : {0}' -f $status.reason)
    if ($status.tailscaleIp) {
      Write-Host ('  Tailscale IP : {0}' -f $status.tailscaleIp)
    } else {
      Write-Host  '  Tailscale IP : not detected'
    }
  }
  $tokLabel = if ($status.tokenConfigured) { 'configured' } else { 'NOT configured' }
  Write-Host ('  Token        : {0}' -f $tokLabel)
  if ($status.tokenRotatedAt) { Write-Host ('  Rotated at   : {0}' -f $status.tokenRotatedAt) }
  Write-Host ('  Token path   : {0}' -f $status.tokenPath)
  Write-Host  '  Local        : http://127.0.0.1:7777 (always on, loopback only)'
  Write-Host ''
}

switch ($Command) {
  'install'       { Cmd-Install }
  'uninstall'     { Cmd-Uninstall }
  'enable'        { Cmd-Enable }
  'disable'       { Cmd-Disable }
  'start'         { Cmd-Start }
  'stop'          { Cmd-Stop }
  'restart'       { Cmd-Restart }
  'status'        { Cmd-Status }
  'remote-on'     { Cmd-RemoteOn }
  'remote-off'    { Cmd-RemoteOff }
  'remote-status' { Cmd-RemoteStatus }
}
