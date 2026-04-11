param(
  [int]$IntervalMinutes = 15,
  [string]$TaskName = 'PC Guardian Monitor'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot 'run-pc-guardian.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
$trigger.Repetition = [pscustomobject]@{
  Interval = "PT$IntervalMinutes`M"
  Duration = 'P1D'
  StopAtDurationEnd = $false
}
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'PC Guardian lightweight monitor' -User $currentUser -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output "Installed and started: $TaskName for $currentUser every $IntervalMinutes minutes"