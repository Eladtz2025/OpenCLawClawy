$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = ".\logs\investigation-$ts.txt"
node .\scripts\investigate-incident.js *> $out
Copy-Item $out .\logs\last-investigation.txt -Force
Write-Output "investigation completed"