param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$bringup = Get-Content (Join-Path $JobDir 'bringup.json') -Raw | ConvertFrom-Json
$health = Get-Content (Join-Path $JobDir 'healthcheck.json') -Raw | ConvertFrom-Json
$ready = Get-Content (Join-Path $JobDir 'production-ready.json') -Raw | ConvertFrom-Json

$state = 'recipe-only'
if($bringup.appDirExists){ $state = 'app-present' }
if($bringup.canAttemptBringup){ $state = 'launcher-ready' }
if($health.anyServiceUp){ $state = 'service-live' }
if($ready.ready){ $state = 'production-ready' }

[ordered]@{ state=$state } | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $JobDir 'system-state.json') -Encoding UTF8
Get-Content (Join-Path $JobDir 'system-state.json') -Raw
