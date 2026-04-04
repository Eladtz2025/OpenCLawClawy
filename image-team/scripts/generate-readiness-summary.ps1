param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$ready = Get-Content (Join-Path $JobDir 'production-ready.json') -Raw | ConvertFrom-Json
$bringup = Get-Content (Join-Path $JobDir 'bringup.json') -Raw | ConvertFrom-Json
$cap = Get-Content (Join-Path $JobDir 'engine-capabilities.json') -Raw | ConvertFrom-Json
$svc = Get-Content (Join-Path $JobDir 'local-services.json') -Raw | ConvertFrom-Json
$pathRisk = & (Join-Path $PSScriptRoot 'detect-windows-path-risk.ps1')
$pathRisk | Set-Content -Path (Join-Path $JobDir 'windows-path-risk.json') -Encoding UTF8
$risk = $pathRisk | ConvertFrom-Json

$lines = @(
  "ready=$($ready.ready)",
  "engine=$($cap.engine)",
  "enginePath=$($cap.path)",
  "engineRunnable=$($cap.runnable)",
  "engineApi=$($cap.api)",
  "bringupPossible=$($bringup.canAttemptBringup)",
  "longPathsEnabled=$($risk.longPathsEnabled)",
  "longPathRisk=$($risk.risk)",
  "services="
)
$lines += ($svc | ForEach-Object { "- port=$($_.port) ok=$($_.ok)" })
$lines | Set-Content -Path (Join-Path $JobDir 'readiness-summary.txt') -Encoding UTF8
