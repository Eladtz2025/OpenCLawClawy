$ErrorActionPreference = 'Continue'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$reportPath = Join-Path $workspace 'organizer\reports\gmail-capability-probe.md'
$gmailAuditRoot = Join-Path $workspace 'gmail-audit'
$mcporter = Join-Path $gmailAuditRoot 'node_modules\.bin\mcporter.cmd'

$lines = @()
$lines += '# Gmail Capability Probe'
$lines += ''
$lines += "Generated: $(Get-Date -Format s)"
$lines += ''

$mcporterOk = Test-Path $mcporter
$lines += "mcporter local binary: $mcporterOk"
if ($mcporterOk) {
    $me = & $mcporter call --server google-workspace --tool people.getMe 2>&1 | Out-String
    $meCode = $LASTEXITCODE
    $search = & $mcporter call --server google-workspace --tool gmail.search query="is:inbox newer_than:30d" maxResults=3 2>&1 | Out-String
    $searchCode = $LASTEXITCODE
    $lines += "mcporter people.getMe exit: $meCode"
    $lines += 'mcporter people.getMe output:'
    $lines += '```'
    $lines += $me.Trim()
    $lines += '```'
    $lines += "mcporter gmail.search exit: $searchCode"
    $lines += 'mcporter gmail.search output:'
    $lines += '```'
    $lines += $search.Trim()
    $lines += '```'
}

$gwsCmd = Get-Command gws -ErrorAction SilentlyContinue
$gwsOk = $null -ne $gwsCmd
$lines += "gws binary: $gwsOk"
if ($gwsOk) {
    $profile = & gws gmail users getProfile 2>&1 | Out-String
    $profileCode = $LASTEXITCODE
    $lines += "gws gmail users getProfile exit: $profileCode"
    $lines += 'gws gmail users getProfile output:'
    $lines += '```'
    $lines += $profile.Trim()
    $lines += '```'
}

$lines -join "`r`n" | Set-Content -Path $reportPath -Encoding UTF8
Write-Output $reportPath
