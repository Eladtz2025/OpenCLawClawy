$ErrorActionPreference = 'SilentlyContinue'

$results = [ordered]@{
  timestamp = (Get-Date).ToString('s')
  commands = @()
  directories = @()
  selectedEngine = $null
  notes = @()
}

$commandNames = @('python','python3','ComfyUI','invokeai','forge','webui-user')
foreach($name in $commandNames){
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if($cmd){
    $results.commands += [ordered]@{ name=$name; path=$cmd.Source }
  }
}

$scanRoots = @('C:\Users\Itzhak','C:\pinokio')
$patterns = @('ComfyUI','InvokeAI','stable-diffusion-webui','stable-diffusion-webui-forge','Forge','AUTOMATIC1111','comfy')
foreach($root in $scanRoots){
  if(Test-Path $root){
    Get-ChildItem -Path $root -Directory -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $patterns -contains $_.Name } |
      Select-Object -First 50 |
      ForEach-Object {
        $results.directories += [ordered]@{ name=$_.Name; path=$_.FullName }
      }
  }
}

$preferred = @('ComfyUI','comfy','InvokeAI','stable-diffusion-webui-forge','Forge','stable-diffusion-webui','AUTOMATIC1111')
foreach($pref in $preferred){
  $match = $results.directories | Where-Object { $_.name -eq $pref } | Select-Object -First 1
  if($match){
    $results.selectedEngine = $match
    break
  }
}

if(-not $results.selectedEngine){
  $results.notes += 'No preferred engine directory detected.'
}

$results | ConvertTo-Json -Depth 6
