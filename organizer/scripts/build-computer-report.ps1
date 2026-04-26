$root = 'C:\Users\Itzhak\.openclaw\workspace\disk_audit'
$out = 'C:\Users\Itzhak\.openclaw\workspace\organizer\reports\computer-latest.md'
$summary = Get-Content (Join-Path $root 'filtered_summary.json') -Raw | ConvertFrom-Json
$txt = @()
$txt += '# Computer Pipeline'
$txt += ''
$txt += "Generated: $(Get-Date -Format s)"
$txt += ''
$txt += "- Empty dir candidates: $($summary.emptyDirCandidates)"
$txt += "- Zero-byte candidates: $($summary.zeroFileCandidates)"
$txt += "- Cold file candidates: $($summary.coldFileCandidates)"
$txt += ''
$txt += 'Current mode: approval packages only, no destructive action without approval.'
Set-Content -Path $out -Value ($txt -join "`r`n") -Encoding UTF8
Write-Output $out