$candidates = [ordered]@{
  pinokioPython = @('C:\pinokio\bin\miniconda\python.exe')
  pinokioGit = @('C:\pinokio\bin\miniconda\Library\mingw64\bin\git.exe','C:\pinokio\bin\miniconda\git.exe')
  pinokioUv = @('C:\pinokio\bin\miniconda\Library\bin\uv.exe','C:\pinokio\bin\miniconda\Scripts\uv.exe')
  pinokioHf = @('C:\pinokio\bin\miniconda\Scripts\huggingface-cli.exe','C:\pinokio\bin\miniconda\Library\bin\huggingface-cli.exe','C:\pinokio\bin\miniconda\Library\bin\hf.exe')
}

$result = [ordered]@{
  toolchain = @()
  readyForInstall = $true
  notes = @()
}

foreach($k in $candidates.Keys){
  $found = $candidates[$k] | Where-Object { Test-Path $_ } | Select-Object -First 1
  $exists = [bool]$found
  $result.toolchain += [ordered]@{ name=$k; path=if($found){$found}else{$candidates[$k][0]}; exists=$exists }
  if(-not $exists -and $k -in @('pinokioPython','pinokioGit','pinokioUv')){
    $result.readyForInstall = $false
  }
}

if(-not $result.readyForInstall){
  $result.notes += 'Core install toolchain is incomplete.'
} else {
  $result.notes += 'Core install toolchain files are present.'
}
if(-not (($result.toolchain | Where-Object { $_.name -eq 'pinokioHf' }).exists)){
  $result.notes += 'huggingface-cli is not present in the checked Pinokio locations.'
}

$result | ConvertTo-Json -Depth 5
