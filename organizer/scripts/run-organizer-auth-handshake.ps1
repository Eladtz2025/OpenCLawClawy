param(
    [string]$PhotosAuthCode
)

$ErrorActionPreference = 'Stop'

Write-Host 'Organizer V2 auth handshake' -ForegroundColor Cyan
Write-Host ''
Write-Host "Run this script only from Elad's real Windows user session." -ForegroundColor Yellow
Write-Host ''

$gmailScript = 'C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-gmail-user-scope.ps1'
$photosScript = 'C:\Users\Itzhak\.openclaw\workspace\organizer\scripts\invoke-photos-auth.ps1'
$photosToken = 'C:\Users\Itzhak\.openclaw\workspace\token_photos.pickle'
$gmailAppData = 'C:\Users\Itzhak\AppData\Roaming\google-workspace-mcp'
$gmailLogsDir = 'C:\Users\Itzhak\AppData\Roaming\google-workspace-mcp\logs'

if (-not (Test-Path $gmailScript)) { throw "Missing $gmailScript" }
if (-not (Test-Path $photosScript)) { throw "Missing $photosScript" }

$gmailOk = $false
$photosOk = $false
$gmailBaselineTicks = $null
if (Test-Path $gmailLogsDir) {
    $gmailBaselineTicks = (Get-Item $gmailLogsDir).LastWriteTimeUtc.Ticks
}

Write-Host 'Step 1/2: Gmail OAuth' -ForegroundColor Green
try {
    powershell -ExecutionPolicy Bypass -File $gmailScript -Tool people.getMe
    $gmailDataExists = Test-Path $gmailAppData
    $gmailLogsTouched = $false
    if (Test-Path $gmailLogsDir) {
        $gmailCurrentTicks = (Get-Item $gmailLogsDir).LastWriteTimeUtc.Ticks
        if ($gmailBaselineTicks) {
            $gmailLogsTouched = $gmailCurrentTicks -gt $gmailBaselineTicks
        }
    }
    $gmailOk = $gmailDataExists -and $gmailLogsTouched
    if ($gmailOk) {
        Write-Host 'Gmail auth step completed, user-scoped app data and fresh log activity detected.' -ForegroundColor Green
    } elseif ($gmailDataExists) {
        Write-Host 'Gmail auth command finished, but no fresh Google Workspace log activity was detected.' -ForegroundColor Yellow
    } else {
        Write-Host 'Gmail auth command finished, but user-scoped app data was not detected.' -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Gmail auth failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ''
Write-Host 'Step 2/2: Google Photos OAuth' -ForegroundColor Green
try {
    if ($PhotosAuthCode) {
        powershell -ExecutionPolicy Bypass -File $photosScript -AuthCode $PhotosAuthCode
    } else {
        powershell -ExecutionPolicy Bypass -File $photosScript
    }
    $photosOk = Test-Path $photosToken
    if ($photosOk) {
        Write-Host 'Photos auth completed, token file detected.' -ForegroundColor Green
    } else {
        Write-Host 'Photos auth command finished, but token_photos.pickle is still missing.' -ForegroundColor Yellow
    }
}
catch {
    Write-Host "Photos auth failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ''
Write-Host 'Summary' -ForegroundColor Cyan
Write-Host ("- Gmail ready: " + $gmailOk)
Write-Host ("- Photos ready: " + $photosOk)

if ($gmailOk -and $photosOk) {
    Write-Host 'Both auth steps look ready. Rerun Organizer continuation.' -ForegroundColor Green
    exit 0
}

Write-Host 'At least one auth step is still incomplete. Re-run this script interactively after finishing the browser/code steps.' -ForegroundColor Yellow
if (-not $photosOk -and -not $PhotosAuthCode) {
    Write-Host 'Tip: you can rerun with -PhotosAuthCode "PASTE_CODE_HERE" after completing the Google Photos consent page.' -ForegroundColor Yellow
}
exit 1
