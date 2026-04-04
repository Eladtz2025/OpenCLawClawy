param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$engineInfoPath = Join-Path $JobDir 'engine-detection.json'
if(-not (Test-Path $engineInfoPath)){
  throw 'engine-detection.json not found'
}

$engineInfo = Get-Content $engineInfoPath -Raw | ConvertFrom-Json
$selected = $engineInfo.selectedEngine

$result = [ordered]@{
  status = 'not-wired'
  selectedEngine = $selected
  executionMode = $null
  notes = @()
}

if($selected){
  switch ($selected.name) {
    'ComfyUI' {
      $result.executionMode = 'api-or-mainpy'
      $result.notes += 'Prepare ComfyUI workflow JSON execution here.'
    }
    'InvokeAI' {
      $result.executionMode = 'cli-or-api'
      $result.notes += 'Prepare InvokeAI invocation here.'
    }
    'stable-diffusion-webui-forge' {
      $result.executionMode = 'webui-api'
      $result.notes += 'Prepare Forge API call or startup wiring here.'
    }
    default {
      $result.executionMode = 'unknown'
      $result.notes += 'Engine detected but adapter not implemented.'
    }
  }
} else {
  $result.notes += 'No selected engine available.'
}

$result | ConvertTo-Json -Depth 5
