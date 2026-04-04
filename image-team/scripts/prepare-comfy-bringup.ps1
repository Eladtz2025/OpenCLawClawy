param(
  [Parameter(Mandatory=$true)][string]$EngineRoot
)

$appDir = Join-Path $EngineRoot 'app'
$envDir = Join-Path $EngineRoot 'app\env'
$mainPy = Join-Path $appDir 'main.py'
$outputDir = Join-Path $appDir 'output'

$result = [ordered]@{
  engineRoot = $EngineRoot
  appDir = $appDir
  appDirExists = (Test-Path $appDir)
  envDirExists = (Test-Path $envDir)
  mainPyExists = (Test-Path $mainPy)
  outputDirExists = (Test-Path $outputDir)
  canAttemptBringup = ((Test-Path $appDir) -and (Test-Path $mainPy))
  recommendedCommand = if((Test-Path $mainPy)){ 'python main.py' } else { $null }
  notes = @()
}

if(-not $result.appDirExists){ $result.notes += 'Comfy app directory does not exist yet.' }
if($result.appDirExists -and -not $result.mainPyExists){ $result.notes += 'Comfy app exists but main.py is missing.' }
if($result.canAttemptBringup){ $result.notes += 'A direct Comfy bring-up attempt is now possible.' }

$result | ConvertTo-Json -Depth 5
