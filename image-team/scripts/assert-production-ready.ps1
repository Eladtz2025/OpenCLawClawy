param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$checks = [ordered]@{
  hasPlan = Test-Path (Join-Path $JobDir 'plan.json')
  hasEngineDetection = Test-Path (Join-Path $JobDir 'engine-detection.json')
  hasWorkflowNotes = Test-Path (Join-Path $JobDir 'workflow_notes.txt')
  hasQaTemplate = Test-Path (Join-Path $JobDir 'qa\qa_report.txt')
  hasPreview = @(Get-ChildItem (Join-Path $JobDir 'outputs') -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'image_preview.*' }).Count -gt 0
  hasV1 = @(Get-ChildItem (Join-Path $JobDir 'outputs') -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'image_v1.*' }).Count -gt 0
  hasFinal = @(Get-ChildItem (Join-Path $JobDir 'outputs') -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'image_final.*' }).Count -gt 0
}

$result = [ordered]@{
  ready = ($checks.hasPlan -and $checks.hasEngineDetection -and $checks.hasWorkflowNotes -and $checks.hasQaTemplate -and $checks.hasPreview -and $checks.hasV1 -and $checks.hasFinal)
  checks = $checks
}

$result | ConvertTo-Json -Depth 5
