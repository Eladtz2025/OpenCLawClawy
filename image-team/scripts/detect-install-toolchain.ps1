$paths = [ordered]@{
  pinokioPython = 'C:\pinokio\bin\miniconda\python.exe'
  pinokioGit = 'C:\pinokio\bin\miniconda\Library\mingw64\bin\git.exe'
  pinokioUv = 'C:\pinokio\bin\miniconda\Scripts\uv.exe'
  pinokioHf = 'C:\pinokio\bin\miniconda\Scripts\huggingface-cli.exe'
}

$result = [ordered]@{
  toolchain = @()
  readyForInstall = $true
  notes = @()
}

foreach($k in $paths.Keys){
  $exists = Test-Path $paths[$k]
  $result.toolchain += [ordered]@{ name=$k; path=$paths[$k]; exists=$exists }
  if(-not $exists -and $k -in @('pinokioPython','pinokioGit','pinokioUv')){
    $result.readyForInstall = $false
  }
}

if(-not $result.readyForInstall){
  $result.notes += 'Core install toolchain is incomplete.'
} else {
  $result.notes += 'Core install toolchain files are present.'
}
if(-not (Test-Path $paths.pinokioHf)){
  $result.notes += 'huggingface-cli is not present at the expected path.'
}

$result | ConvertTo-Json -Depth 5
