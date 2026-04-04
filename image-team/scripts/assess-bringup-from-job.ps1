param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$det = Get-Content (Join-Path $JobDir 'engine-detection.json') -Raw | ConvertFrom-Json
if(-not $det.selectedEngine){
  return ([ordered]@{ status='no-engine'; notes=@('No engine selected.') } | ConvertTo-Json -Depth 5)
}

if($det.selectedEngine.name -eq 'stable-diffusion-webui-forge'){
  return & (Join-Path $PSScriptRoot 'prepare-forge-bringup.ps1') -EngineRoot $det.selectedEngine.path
}

if($det.selectedEngine.name -eq 'comfy'){
  return & (Join-Path $PSScriptRoot 'prepare-comfy-bringup.ps1') -EngineRoot $det.selectedEngine.path
}

return ([ordered]@{ status='unsupported'; notes=@('Bring-up assessment not implemented for selected engine.') } | ConvertTo-Json -Depth 5)
