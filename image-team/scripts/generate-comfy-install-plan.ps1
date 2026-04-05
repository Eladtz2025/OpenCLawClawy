param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$det = Get-Content (Join-Path $JobDir 'engine-detection.json') -Raw | ConvertFrom-Json
if(-not $det.selectedEngine -or $det.selectedEngine.name -ne 'comfy'){
  return ([ordered]@{ status='skipped'; notes=@('Selected engine is not Comfy.') } | ConvertTo-Json -Depth 5)
}

$engineRoot = $det.selectedEngine.path
$appDir = Join-Path $engineRoot 'app'
$envDir = Join-Path $appDir 'env'
$modelPath = Join-Path $appDir 'models\checkpoints'

$steps = @(
  "git clone https://github.com/comfyanonymous/ComfyUI app",
  "git clone https://github.com/comfyanonymous/ComfyUI_examples workflows\\ComfyUI_examples",
  "git clone https://github.com/ltdrdata/ComfyUI-Manager app\\custom_nodes\\ComfyUI-Manager",
  "uv pip install -r requirements.txt",
  "uv pip install -U bitsandbytes",
  "uv pip install torch==2.7.0 torchvision==0.22.0 torchaudio==2.7.0 --index-url https://download.pytorch.org/whl/cpu --force-reinstall --no-deps",
  "download runwayml/stable-diffusion-v1-5 -> v1-5-pruned.safetensors"
)

$result = [ordered]@{
  status = 'planned'
  engine = 'comfy'
  engineRoot = $engineRoot
  appDir = $appDir
  envDir = $envDir
  modelPath = $modelPath
  mode = 'cpu-safe-plan'
  steps = $steps
  notes = @(
    'Plan derived from local Pinokio Comfy recipe files.',
    'This is an install plan only; not executed automatically yet.',
    'CPU torch path selected because no NVIDIA runtime was verified.'
  )
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $JobDir 'install-plan.json') -Encoding UTF8
Get-Content (Join-Path $JobDir 'install-plan.json') -Raw
