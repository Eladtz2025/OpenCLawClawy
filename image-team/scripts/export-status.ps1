param(
  [Parameter(Mandatory=$true)][string]$JobDir,
  [string]$Status = 'FAILED',
  [string]$NextBestAction = ''
)

$job = Get-Content (Join-Path $JobDir 'job.json') -Raw | ConvertFrom-Json
$outputs = @()
if(Test-Path (Join-Path $JobDir 'outputs')){
  $outputs = Get-ChildItem (Join-Path $JobDir 'outputs') -File | Select-Object -ExpandProperty Name
}

$result = [ordered]@{
  STATUS = $Status
  TEAM_ROLE_FLOW = @(
    'Prompt & Workflow Planning Specialist',
    'Identity Preservation Specialist',
    'Image Generation / Editing Specialist',
    'QA & Export Specialist'
  )
  TOOLS_USED = @('local-files','powershell')
  INPUTS = @{
    jobName = $job.jobName
    type = $job.type
    createdAt = $job.createdAt
  }
  WORKING_FILES = @(
    (Join-Path $JobDir 'job.json'),
    (Join-Path $JobDir 'workflow_notes.txt'),
    (Join-Path $JobDir 'handoff.md'),
    (Join-Path $JobDir 'qa\qa_report.txt')
  )
  OUTPUT_FILES = $outputs
  ACTIONS_TAKEN = @('job scaffold created','status package generated')
  QUALITY_NOTES = @()
  PROBLEMS_FOUND = @()
  NEXT_BEST_ACTION = $NextBestAction
}

$result | ConvertTo-Json -Depth 6
