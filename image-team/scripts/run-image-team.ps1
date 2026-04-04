param(
  [Parameter(Mandatory=$true)][string]$Request,
  [string]$JobName = 'job',
  [string]$Type = 'generate',
  [string]$SourceImage = '',
  [string]$ReferenceImage = '',
  [string]$MaskImage = ''
)

$root = Split-Path $PSScriptRoot -Parent
$jobDir = & (Join-Path $PSScriptRoot 'new-image-job.ps1') -JobName $JobName -Type $Type
$engineJson = & (Join-Path $PSScriptRoot 'detect-engines.ps1')
$planJson = & (Join-Path $PSScriptRoot 'plan-workflow.ps1') -Request $Request -SourceImage $SourceImage -ReferenceImage $ReferenceImage -MaskImage $MaskImage

$engineJson | Set-Content -Path (Join-Path $jobDir 'engine-detection.json') -Encoding UTF8
$planJson | Set-Content -Path (Join-Path $jobDir 'plan.json') -Encoding UTF8

$plan = $planJson | ConvertFrom-Json
$workflowNotes = @(
  "WORKFLOW_TYPE=$($plan.WORKFLOW_TYPE)",
  "PRIMARY_TOOL=$($plan.PRIMARY_TOOL)",
  "SECONDARY_TOOL=$($plan.SECONDARY_TOOL)",
  "REQUIRED_INPUTS=$(($plan.REQUIRED_INPUTS | ConvertTo-Json -Compress))",
  "PROMPT=$($plan.PROMPT)",
  "NEGATIVE_PROMPT=$($plan.NEGATIVE_PROMPT)",
  "RISK_NOTES=$($plan.RISK_NOTES)",
  "",
  "ID_METHOD_SELECTED=$($plan.ID_METHOD_SELECTED)",
  "IDENTITY_RISK_LEVEL=$($plan.IDENTITY_RISK_LEVEL)",
  "RECOMMENDED_SETTINGS=$($plan.RECOMMENDED_SETTINGS)",
  "PASS_OR_RETRY=$($plan.PASS_OR_RETRY)",
  "NOTES=$($plan.NOTES)"
)
$workflowNotes | Set-Content -Path (Join-Path $jobDir 'workflow_notes.txt') -Encoding UTF8

& (Join-Path $PSScriptRoot 'build-handoff.ps1') `
  -JobDir $jobDir `
  -Role 'Image Generation / Editing Specialist' `
  -TaskSummary 'Execute the planned workflow with the selected local engine once runnable engine wiring exists.' `
  -InputFiles @(
    (Join-Path $jobDir 'job.json'),
    (Join-Path $jobDir 'plan.json'),
    (Join-Path $jobDir 'engine-detection.json'),
    (Join-Path $jobDir 'workflow_notes.txt')
  ) `
  -ExpectedOutputs @('image_preview.*','image_v1.*','image_final.*','workflow_notes.txt','qa\\qa_report.txt') `
  -Risks @('Identity drift on real faces','No runnable engine path verified yet') `
  -Notes @('Do not overwrite originals','Prefer conservative reruns')

$adapterJson = & (Join-Path $PSScriptRoot 'engine-adapter.ps1') -JobDir $jobDir
$adapterJson | Set-Content -Path (Join-Path $jobDir 'engine-adapter.json') -Encoding UTF8

$readyJson = & (Join-Path $PSScriptRoot 'assert-production-ready.ps1') -JobDir $jobDir
$readyJson | Set-Content -Path (Join-Path $jobDir 'production-ready.json') -Encoding UTF8

$status = 'PARTIAL'
$next = 'Verify a runnable local engine on this machine, then wire execution to produce preview/v1/final image files.'
& (Join-Path $PSScriptRoot 'export-status.ps1') -JobDir $jobDir -Status $status -NextBestAction $next
