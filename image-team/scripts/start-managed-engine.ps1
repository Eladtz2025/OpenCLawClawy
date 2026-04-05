param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$bringup = Get-Content (Join-Path $JobDir 'bringup.json') -Raw | ConvertFrom-Json
$result = [ordered]@{
  status = 'not-started'
  engineRoot = $bringup.engineRoot
  canAttemptBringup = $bringup.canAttemptBringup
  command = $bringup.recommendedCommand
  cwd = $bringup.appDir
  notes = @()
}

if(-not $bringup.canAttemptBringup){
  $result.status = 'blocked'
  $result.notes += 'Managed start blocked because runnable app files are missing.'
} else {
  $result.status = 'ready-for-launcher'
  $result.notes += 'Bring-up contract is sufficient for a managed background launcher, but launcher execution is not wired in PowerShell script mode yet.'
}

$result | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $JobDir 'managed-start.json') -Encoding UTF8
Get-Content (Join-Path $JobDir 'managed-start.json') -Raw
