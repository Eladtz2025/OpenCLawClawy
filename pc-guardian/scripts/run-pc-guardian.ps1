$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$runLog = ".\logs\last-run-$ts.txt"
$publishLog = ".\logs\last-publish-$ts.txt"

node .\scripts\run-checks.js *> $runLog
Copy-Item $runLog .\logs\last-run.txt -Force
powershell -ExecutionPolicy Bypass -File .\scripts\run-investigation.ps1 *> .\logs\last-investigation-runner.txt
powershell -ExecutionPolicy Bypass -File .\scripts\publish-dashboard.ps1 *> $publishLog
Copy-Item $publishLog .\logs\last-publish.txt -Force