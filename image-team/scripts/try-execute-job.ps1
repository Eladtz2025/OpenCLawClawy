param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$services = Get-Content (Join-Path $JobDir 'local-services.json') -Raw | ConvertFrom-Json
$plan = Get-Content (Join-Path $JobDir 'plan.json') -Raw | ConvertFrom-Json

$forgePort = $services | Where-Object { $_.port -eq 7860 -and $_.ok } | Select-Object -First 1
if($forgePort){
  try {
    return & (Join-Path $PSScriptRoot 'invoke-forge-api.ps1') -JobDir $JobDir -BaseUrl 'http://127.0.0.1:7860' -Prompt $plan.PROMPT -NegativePrompt $plan.NEGATIVE_PROMPT
  } catch {
    return ([ordered]@{ status='failed'; notes=@($_.Exception.Message) } | ConvertTo-Json -Depth 5)
  }
}

return ([ordered]@{ status='skipped'; notes=@('No compatible local service detected for execution.') } | ConvertTo-Json -Depth 5)
