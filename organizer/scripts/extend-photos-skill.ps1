$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$skillScript = Join-Path $workspace 'skills\google-photos\scripts\gphotos.py'
$backupPath = Join-Path $workspace 'skills\google-photos\scripts\gphotos.py.bak.organizer'

if (-not (Test-Path $backupPath)) {
    Copy-Item $skillScript $backupPath -Force
}

Write-Output $backupPath
