param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$plan = Get-Content (Join-Path $JobDir 'plan.json') -Raw | ConvertFrom-Json
$workflowFile = if($plan.ID_METHOD_SELECTED){ 'comfy-portrait-preserve-workflow.json' } else { 'comfy-txt2img-workflow.json' }
$templatePath = Join-Path $PSScriptRoot ("..\\templates\\{0}" -f $workflowFile)
Copy-Item $templatePath (Join-Path $JobDir 'workflow-template.json') -Force

$payload = [ordered]@{
  prompt = $plan.PROMPT
  negative_prompt = $plan.NEGATIVE_PROMPT
  width = 1024
  height = 1024
  steps = 28
  cfg = 6.5
  seed = -1
  identity_method = $plan.ID_METHOD_SELECTED
  recommended_settings = $plan.RECOMMENDED_SETTINGS
}
$payload | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $JobDir 'workflow-inputs.json') -Encoding UTF8
