$ErrorActionPreference = 'Stop'

Write-Host 'Organizer V2 auth handshake' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Run this script only from Elad\'s real Windows user session.' -ForegroundColor Yellow
Write-Host ''

$gmailScript = 'C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-gmail-user-scope.ps1'
$photosScript = 'C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-photos-auth.ps1'

if (-not (Test-Path $gmailScript)) { throw "Missing $gmailScript" }
if (-not (Test-Path $photosScript)) { throw "Missing $photosScript" }

Write-Host 'Step 1/2: Gmail OAuth' -ForegroundColor Green
powershell -ExecutionPolicy Bypass -File $gmailScript -Tool people.getMe

Write-Host ''
Write-Host 'Step 2/2: Google Photos OAuth' -ForegroundColor Green
powershell -ExecutionPolicy Bypass -File $photosScript

Write-Host ''
Write-Host 'Done. If both succeeded, rerun Organizer continuation.' -ForegroundColor Cyan
