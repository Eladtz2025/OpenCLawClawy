$ErrorActionPreference = 'Stop'

$workspace = 'C:\Users\Itzhak\.openclaw\workspace'
$root = Join-Path $workspace 'disk_audit'
$outDir = Join-Path $workspace 'organizer\reports'

$filteredSummaryPath = Join-Path $root 'filtered_summary.json'
$packageSummaryPath = Join-Path $root 'approval_packages_summary.html'
$package3Path = Join-Path $root 'package3_review.html'
$outPath = Join-Path $outDir 'computer-approval-packages.md'

if (-not (Test-Path $filteredSummaryPath)) {
    throw 'filtered_summary.json missing'
}

$summary = Get-Content $filteredSummaryPath -Raw | ConvertFrom-Json
$safeDelete = $summary.emptyDirCandidates + $summary.zeroFileCandidates
$archive = $summary.coldFileCandidates
$manualReview = ($summary.notableCold | Measure-Object).Count

$txt = @(
    '# Computer Approval Packages',
    '',
    "Generated: $(Get-Date -Format s)",
    '',
    "- Safe delete candidates: $safeDelete",
    "- Archive candidates: $archive",
    "- Manual review candidates: $manualReview",
    '',
    "HTML summary: $packageSummaryPath",
    "Detailed package 3 review: $package3Path"
)
$txt -join "`r`n" | Set-Content -Path $outPath -Encoding UTF8
Write-Output $outPath
