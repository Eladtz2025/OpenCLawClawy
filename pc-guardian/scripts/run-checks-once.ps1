$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

node .\scripts\run-checks.js *> .\logs\last-run.txt
Write-Output "run-checks completed"