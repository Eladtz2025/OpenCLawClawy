$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$gmailAuditRoot = Join-Path $workspace 'gmail-audit'
$reportPath = Join-Path $workspace 'organizer\reports\gmail-auth-bootstrap.md'

New-Item -ItemType Directory -Force -Path $gmailAuditRoot | Out-Null

Push-Location $gmailAuditRoot
try {
    if (-not (Test-Path 'package.json')) {
        npm init -y | Out-Null
    }

    npm install mcporter @presto-ai/google-workspace-mcp --no-fund --no-audit | Out-Null

    $mcporter = Join-Path $gmailAuditRoot 'node_modules\.bin\mcporter.cmd'
    if (-not (Test-Path $mcporter)) {
        throw 'mcporter local binary not found after install'
    }

    & $mcporter config add google-workspace --command "npx" --arg "-y" --arg "@presto-ai/google-workspace-mcp" --scope home 2>$null | Out-Null

    $lines = @(
        '# Gmail Auth Bootstrap',
        '',
        "Generated: $(Get-Date -Format s)",
        '',
        'Status: bootstrap_ready',
        "mcporter: $mcporter",
        'Next manual auth command:',
        "mcporter call --server google-workspace --tool people.getMe"
    )
    $lines -join "`r`n" | Set-Content -Path $reportPath -Encoding UTF8
    Write-Output $reportPath
}
finally {
    Pop-Location
}
