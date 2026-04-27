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

& $mcporter @cmdArgs
