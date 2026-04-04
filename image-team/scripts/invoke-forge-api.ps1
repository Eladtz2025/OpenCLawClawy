param(
  [Parameter(Mandatory=$true)][string]$JobDir,
  [Parameter(Mandatory=$true)][string]$BaseUrl,
  [Parameter(Mandatory=$true)][string]$Prompt,
  [string]$NegativePrompt = 'deformed face, wrong identity, asymmetrical eyes, broken teeth, extra fingers, extra limbs, bad hands, warped background, oversmoothed skin, duplicate features, low detail',
  [int]$Width = 1024,
  [int]$Height = 1024,
  [int]$Steps = 28,
  [double]$CfgScale = 6.5,
  [int]$Seed = -1
)

$uri = "$BaseUrl/sdapi/v1/txt2img"
$body = @{
  prompt = $Prompt
  negative_prompt = $NegativePrompt
  width = $Width
  height = $Height
  steps = $Steps
  cfg_scale = $CfgScale
  seed = $Seed
} | ConvertTo-Json -Depth 6

$response = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 600
if(-not $response.images -or $response.images.Count -lt 1){
  throw 'No images returned from Forge API.'
}

$outputDir = Join-Path $JobDir 'outputs'
$previewPath = Join-Path $outputDir 'image_preview.png'
$v1Path = Join-Path $outputDir 'image_v1.png'
$finalPath = Join-Path $outputDir 'image_final.png'

[IO.File]::WriteAllBytes($previewPath, [Convert]::FromBase64String($response.images[0]))
[IO.File]::WriteAllBytes($v1Path, [Convert]::FromBase64String($response.images[0]))
[IO.File]::WriteAllBytes($finalPath, [Convert]::FromBase64String($response.images[0]))

$prompt | Set-Content -Path (Join-Path $JobDir 'used_prompt.txt') -Encoding UTF8
'identity preservation level: MEDIUM`nrealism quality: pending visual QA`nvisible artifacts: not yet reviewed`nrequest fulfillment quality: pending visual QA`nanother iteration recommended: YES`nnotes: Initial Forge API export created automatically.' | Set-Content -Path (Join-Path $JobDir 'qa\qa_report.txt') -Encoding UTF8

[ordered]@{
  status = 'success'
  files = @($previewPath,$v1Path,$finalPath)
} | ConvertTo-Json -Depth 5
