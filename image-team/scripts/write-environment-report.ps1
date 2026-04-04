param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$cap = Get-Content (Join-Path $JobDir 'engine-capabilities.json') -Raw | ConvertFrom-Json
$svc = Get-Content (Join-Path $JobDir 'local-services.json') -Raw | ConvertFrom-Json

$lines = @(
  "Engine: $($cap.engine)",
  "Path: $($cap.path)",
  "Runnable: $($cap.runnable)",
  "API: $($cap.api)",
  "txt2img: $($cap.txt2img)",
  "img2img: $($cap.img2img)",
  "inpainting: $($cap.inpainting)",
  "outpainting: $($cap.outpainting)",
  "InstantID: $($cap.instantid)",
  "PuLID: $($cap.pulid)",
  "PhotoMaker: $($cap.photomaker)",
  "",
  "Services:",
  ($svc | ForEach-Object { "- port=$($_.port) ok=$($_.ok) status=$($_.status) info=$($_.title)" })
)

$lines | Set-Content -Path (Join-Path $JobDir 'environment-report.txt') -Encoding UTF8
