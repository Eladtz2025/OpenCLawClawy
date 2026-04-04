param(
  [Parameter(Mandatory=$true)][string]$EngineDetectionPath
)

$det = Get-Content $EngineDetectionPath -Raw | ConvertFrom-Json
$selected = $det.selectedEngine

$result = [ordered]@{
  engine = $null
  path = $null
  runnable = $false
  api = $false
  txt2img = $false
  img2img = $false
  inpainting = $false
  outpainting = $false
  instantid = $false
  pulid = $false
  photomaker = $false
  notes = @()
}

if($selected){
  $result.engine = $selected.name
  $result.path = $selected.path

  if($selected.name -eq 'stable-diffusion-webui-forge'){
    $appDir = Join-Path $selected.path 'app'
    $webuiBat = Join-Path $appDir 'webui-user.bat'
    $apiPy = Join-Path $appDir 'modules\api\api.py'
    $result.txt2img = $true
    $result.img2img = $true
    $result.inpainting = $true
    $result.outpainting = $true
    if(Test-Path $appDir){
      $result.notes += 'Forge app directory exists.'
    } else {
      $result.notes += 'Forge app directory missing.'
    }
    if(Test-Path $webuiBat){
      $result.runnable = $true
      $result.notes += 'webui-user.bat exists.'
    }
    if(Test-Path $apiPy){
      $result.api = $true
      $result.notes += 'API module present.'
    }
    $instant = Get-ChildItem $appDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'instantid' } | Select-Object -First 1
    $pulid = Get-ChildItem $appDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'pulid' } | Select-Object -First 1
    $photo = Get-ChildItem $appDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'photomaker' } | Select-Object -First 1
    if($instant){ $result.instantid = $true }
    if($pulid){ $result.pulid = $true }
    if($photo){ $result.photomaker = $true }
  } elseif($selected.name -eq 'comfy') {
    $appDir = Join-Path $selected.path 'app'
    $mainPy = Join-Path $appDir 'main.py'
    $apiRoutes = Join-Path $appDir 'server.py'
    $result.txt2img = $true
    $result.img2img = $true
    $result.inpainting = $true
    $result.outpainting = $true
    if(Test-Path $appDir){
      $result.notes += 'Comfy app directory exists.'
    } else {
      $result.notes += 'Comfy app directory missing.'
    }
    if(Test-Path $mainPy){
      $result.runnable = $true
      $result.notes += 'main.py exists.'
    }
    if(Test-Path $apiRoutes){
      $result.api = $true
      $result.notes += 'server.py exists.'
    }
    $instant = Get-ChildItem $appDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'instantid' } | Select-Object -First 1
    $pulid = Get-ChildItem $appDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'pulid' } | Select-Object -First 1
    $photo = Get-ChildItem $appDir -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'photomaker' } | Select-Object -First 1
    if($instant){ $result.instantid = $true }
    if($pulid){ $result.pulid = $true }
    if($photo){ $result.photomaker = $true }
  } else {
    $result.notes += 'Capabilities not implemented for selected engine.'
  }
} else {
  $result.notes += 'No selected engine.'
}

$result | ConvertTo-Json -Depth 6
