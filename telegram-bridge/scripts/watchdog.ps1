# OpenClaw Telegram Bridge -- watchdog.
# Designed to run every ~5 minutes via Scheduled Task. If bridge.log has not
# been written to in $StaleMinutes (default 10), assume the bridge is hung
# (the symptom we hit on 2026-05-05 after a Telegram 502 storm) and restart
# it via bridge-service.ps1.
#
# Logs to logs/watchdog.log so we can reconstruct restart history.

[CmdletBinding()]
param(
  [int]$StaleMinutes = 10
)

$ErrorActionPreference = 'Stop'

$ScriptDir   = $PSScriptRoot
$BridgeDir   = Split-Path -Parent $ScriptDir
$LogFile     = Join-Path $BridgeDir 'logs\bridge.log'
$WatchdogLog = Join-Path $BridgeDir 'logs\watchdog.log'
$Service     = Join-Path $ScriptDir 'bridge-service.ps1'

function Write-Wlog([string]$msg) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssZ'), $msg
  $line | Out-File -FilePath $WatchdogLog -Append -Encoding utf8
}

if (-not (Test-Path $LogFile)) {
  Write-Wlog "bridge.log missing -- attempting start"
  & $Service start | Out-Null
  exit 0
}

$lastWrite = (Get-Item $LogFile).LastWriteTime
$ageMin    = ((Get-Date) - $lastWrite).TotalMinutes

if ($ageMin -lt $StaleMinutes) {
  # Healthy. No action; only log every 6th call (~30 min) to keep log small.
  $minute = (Get-Date).Minute
  if ($minute % 30 -lt 5) {
    Write-Wlog ('OK -- log age {0:N1} min' -f $ageMin)
  }
  exit 0
}

Write-Wlog ('STALE -- log age {0:N1} min >= {1}; restarting bridge' -f $ageMin, $StaleMinutes)
try {
  & $Service restart | Out-Null
  Write-Wlog 'restart issued'
} catch {
  Write-Wlog ('restart FAILED: {0}' -f $_.Exception.Message)
  exit 1
}
