$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$reportPath = Join-Path $workspace 'organizer\reports\photos-auth-bootstrap.md'
$credPath = Join-Path $workspace 'credentials.json'
$tokenPath = Join-Path $workspace 'token_photos.pickle'
$skillRoot = Join-Path $workspace 'skills\google-photos'
$scriptPath = Join-Path $skillRoot 'scripts\gphotos.py'

$lines = @(
    '# Photos Auth Bootstrap',
    '',
    "Generated: $(Get-Date -Format s)",
    '',
    "Credentials file exists: $(Test-Path $credPath)",
    "Token file exists: $(Test-Path $tokenPath)",
    "Skill script exists: $(Test-Path $scriptPath)",
    '',
    'Next manual auth/run command:',
    "python `"$scriptPath`" --action list --credentials `"$credPath`" --token `"$tokenPath`""
)
$lines -join "`r`n" | Set-Content -Path $reportPath -Encoding UTF8
Write-Output $reportPath
