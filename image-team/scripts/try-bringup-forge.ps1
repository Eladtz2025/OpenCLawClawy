param(
  [Parameter(Mandatory=$true)][string]$EngineRoot
)

$prepJson = & (Join-Path $PSScriptRoot 'prepare-forge-bringup.ps1') -EngineRoot $EngineRoot
$prep = $prepJson | ConvertFrom-Json
if(-not $prep.canAttemptBringup){
  return ([ordered]@{ status='skipped'; notes=$prep.notes } | ConvertTo-Json -Depth 5)
}

return ([ordered]@{ status='pending-manual-or-background-start'; command=$prep.recommendedCommand; cwd=$prep.appDir; notes=@('Bring-up path verified but automatic startup not yet executed from the runner.') } | ConvertTo-Json -Depth 5)
