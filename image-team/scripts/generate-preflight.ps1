param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$bringup = Get-Content (Join-Path $JobDir 'bringup.json') -Raw | ConvertFrom-Json
$cap = Get-Content (Join-Path $JobDir 'engine-capabilities.json') -Raw | ConvertFrom-Json
$toolchainJson = & (Join-Path $PSScriptRoot 'detect-install-toolchain.ps1')
$toolchainJson | Set-Content -Path (Join-Path $JobDir 'install-toolchain.json') -Encoding UTF8
$toolchain = $toolchainJson | ConvertFrom-Json

$result = [ordered]@{
  installPossible = $toolchain.readyForInstall
  bringupPossible = $bringup.canAttemptBringup
  executionPossible = $cap.runnable
  notes = @()
}
if($result.installPossible){ $result.notes += 'Install prerequisites appear present.' } else { $result.notes += 'Install prerequisites are incomplete.' }
if($result.bringupPossible){ $result.notes += 'Bring-up prerequisites appear present.' } else { $result.notes += 'Bring-up prerequisites are missing.' }
if($result.executionPossible){ $result.notes += 'Engine appears runnable.' } else { $result.notes += 'Engine is not yet runnable.' }

$result | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $JobDir 'preflight.json') -Encoding UTF8
Get-Content (Join-Path $JobDir 'preflight.json') -Raw
