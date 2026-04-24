$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$runLog = ".\logs\last-run-$ts.txt"

node .\scripts\validate-config.js *> $runLog
node .\scripts\run-checks.js *>> $runLog
Copy-Item $runLog .\logs\last-run.txt -Force
