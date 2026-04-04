param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$lines = @(
  'Source vs output review checklist:',
  '- Is the face recognizable as the same person?',
  '- Are eyes, nose, mouth, and skin structure preserved?',
  '- Was the requested edit actually applied?',
  '- Are there visible artifacts or asymmetries?',
  '- Is another conservative pass recommended?'
)
$lines | Set-Content -Path (Join-Path $JobDir 'side_by_side_notes.txt') -Encoding UTF8
