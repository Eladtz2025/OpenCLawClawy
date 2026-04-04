param(
  [Parameter(Mandatory=$true)][string]$EngineRoot
)

$appDir = Join-Path $EngineRoot 'app'
$webuiBat = Join-Path $appDir 'webui-user.bat'
$apiPy = Join-Path $appDir 'modules\api\api.py'

$result = [ordered]@{
  engineRoot = $EngineRoot
  appDir = $appDir
  appDirExists = (Test-Path $appDir)
  webuiBatExists = (Test-Path $webuiBat)
  apiPyExists = (Test-Path $apiPy)
  canAttemptBringup = ((Test-Path $appDir) -and (Test-Path $webuiBat))
  recommendedCommand = if((Test-Path $webuiBat)){ $webuiBat } else { $null }
  notes = @()
}

if(-not $result.appDirExists){ $result.notes += 'Forge app directory does not exist yet.' }
if($result.appDirExists -and -not $result.webuiBatExists){ $result.notes += 'Forge app exists but webui-user.bat is missing.' }
if($result.canAttemptBringup){ $result.notes += 'A direct Forge bring-up attempt is now possible.' }

$result | ConvertTo-Json -Depth 5
