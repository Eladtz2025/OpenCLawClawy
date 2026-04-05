param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$preflight = Get-Content (Join-Path $JobDir 'preflight.json') -Raw | ConvertFrom-Json
$installPlanExists = Test-Path (Join-Path $JobDir 'install-plan.json')

$state = 'install-blocked'
if($preflight.installPossible -and $installPlanExists){
  $state = 'install-planned'
}

[ordered]@{ installState=$state } | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $JobDir 'install-state.json') -Encoding UTF8
Get-Content (Join-Path $JobDir 'install-state.json') -Raw
