param(
  [string]$JobName = 'job',
  [string]$Type = 'generate'
)

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$root = Join-Path $PSScriptRoot '..\runs'
$jobDir = Join-Path $root ("{0}-{1}" -f $timestamp, $JobName)
New-Item -ItemType Directory -Force -Path $jobDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $jobDir 'inputs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $jobDir 'intermediate') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $jobDir 'outputs') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $jobDir 'qa') | Out-Null

@"
{
  "jobName": "$JobName",
  "type": "$Type",
  "createdAt": "$(Get-Date -Format s)",
  "status": "initialized"
}
"@ | Set-Content -Path (Join-Path $jobDir 'job.json') -Encoding UTF8

Copy-Item (Join-Path $PSScriptRoot '..\templates\workflow-notes-template.txt') (Join-Path $jobDir 'workflow_notes.txt') -Force
Copy-Item (Join-Path $PSScriptRoot '..\templates\qa-report-template.txt') (Join-Path $jobDir 'qa\qa_report.txt') -Force
Copy-Item (Join-Path $PSScriptRoot '..\templates\handoff-template.md') (Join-Path $jobDir 'handoff.md') -Force

Write-Output $jobDir
