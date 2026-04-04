param(
  [Parameter(Mandatory=$true)][string]$JobDir,
  [Parameter(Mandatory=$true)][string]$Role,
  [Parameter(Mandatory=$true)][string]$TaskSummary,
  [string[]]$InputFiles = @(),
  [string[]]$ExpectedOutputs = @(),
  [string[]]$Risks = @(),
  [string[]]$Notes = @()
)

$content = @(
  "HANDOFF_TO:",
  $Role,
  "TASK_SUMMARY:",
  $TaskSummary,
  "INPUT_FILES:",
  ($InputFiles -join "`n"),
  "EXPECTED_OUTPUTS:",
  ($ExpectedOutputs -join "`n"),
  "RISKS:",
  ($Risks -join "`n"),
  "NOTES:",
  ($Notes -join "`n")
)
$content | Set-Content -Path (Join-Path $JobDir 'handoff.md') -Encoding UTF8
