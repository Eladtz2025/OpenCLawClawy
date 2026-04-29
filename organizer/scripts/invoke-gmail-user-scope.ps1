param(
    [Parameter(Mandatory=$true)]
    [string]$Tool,
    [string[]]$ToolArgs = @()
)

$ErrorActionPreference = 'Stop'

$mcporter = 'C:\Users\Itzhak\.openclaw\workspace\gmail-audit\node_modules\.bin\mcporter.cmd'
if (-not (Test-Path $mcporter)) {
    throw 'mcporter local binary not found'
}

$env:USERPROFILE = 'C:\Users\Itzhak'
$env:APPDATA = 'C:\Users\Itzhak\AppData\Roaming'
$env:LOCALAPPDATA = 'C:\Users\Itzhak\AppData\Local'

$cmdArgs = @('call', '--server', 'google-workspace', '--tool', $Tool)
$cmdArgs += $ToolArgs

$output = & $mcporter @cmdArgs 2>&1
$exitCode = $LASTEXITCODE

if ($exitCode -eq 0 -and $Tool -eq 'people.getMe') {
    $markerDir = 'C:\Users\Itzhak\.openclaw\workspace\organizer\state'
    $markerPath = Join-Path $markerDir 'gmail-user-session-success.json'
    $marker = [pscustomobject]@{
        generatedAt = (Get-Date).ToString('s')
        tool = $Tool
        toolArgs = $ToolArgs
        source = 'invoke-gmail-user-scope.ps1'
        success = $true
    }
    $marker | ConvertTo-Json -Depth 10 | Set-Content -Path $markerPath -Encoding UTF8
}

$output
exit $exitCode
