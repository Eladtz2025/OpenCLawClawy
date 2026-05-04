[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('scan','plan','approve','apply','doctor')]
    [string]$Verb,
    [int]$MaxSeconds = 90,
    [switch]$NoDryRun,
    [string]$ApproveAll
)

$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\..\..\lib\module-runtime.ps1"

$mod = 'computer'
$P = Get-ModulePaths $mod
$ScanRoot = 'C:\Users\Itzhak'
$DesktopDir   = Join-Path $ScanRoot 'Desktop'
$DownloadsDir = Join-Path $ScanRoot 'Downloads'
$TempDirs = @(
    (Join-Path $env:LOCALAPPDATA 'Temp'),
    'C:\Windows\Temp'
)
# Cap on items per category to keep scan bounded.
$CAP_LARGE_FILES        = 100
$CAP_DUPLICATE_GROUPS   = 50
$CAP_OLD_DOWNLOADS      = 200
$CAP_DESKTOP_CLUTTER    = 200
$CAP_TEMP_FILES         = 500

# ============================================================================
# helpers
# ============================================================================
function Get-DiskSnapshot {
    Get-PSDrive -PSProvider FileSystem | ForEach-Object {
        [pscustomobject]@{
            name      = $_.Name
            root      = $_.Root
            usedBytes = [long]([long]$_.Used)
            freeBytes = [long]([long]$_.Free)
            totalBytes = [long](([long]$_.Used) + ([long]$_.Free))
            usedHuman  = (Format-Bytes ([long]$_.Used))
            freeHuman  = (Format-Bytes ([long]$_.Free))
        }
    }
}

function Get-LargeFiles([int]$Limit, [int]$MinMB = 100, [datetime]$Deadline) {
    # Targeted scan — avoid recursing AppData (where most of 600K files live).
    # Walk known clutter-prone roots, recursive but bounded, plus skip patterns.
    $minBytes = [long]$MinMB * 1MB
    $skipDirs = @('node_modules', '.git', '__pycache__', 'AppData', '.docker', '.cache', '.openclaw\agents', '$Recycle.Bin')
    $roots = @(
        $DownloadsDir,
        $DesktopDir,
        (Join-Path $ScanRoot 'Documents'),
        (Join-Path $ScanRoot 'OneDrive'),
        (Join-Path $ScanRoot 'Videos'),
        (Join-Path $ScanRoot 'Pictures'),
        (Join-Path $ScanRoot 'Music')
    ) | Where-Object { Test-Path $_ }

    $candidates = New-Object System.Collections.Generic.List[object]
    foreach ($r in $roots) {
        if ((Get-Date) -gt $Deadline) { break }
        try {
            Get-ChildItem -Path $r -File -Recurse -Force -ErrorAction SilentlyContinue |
                Where-Object {
                    if ((Get-Date) -gt $Deadline) { return $false }
                    if ($_.Length -lt $minBytes) { return $false }
                    foreach ($s in $skipDirs) { if ($_.FullName -match [regex]::Escape($s)) { return $false } }
                    $true
                } |
                ForEach-Object {
                    $candidates.Add([pscustomobject]@{
                        path = $_.FullName
                        sizeBytes = [long]$_.Length
                        sizeHuman = (Format-Bytes ([long]$_.Length))
                        lastWriteUtc = $_.LastWriteTimeUtc.ToString('o')
                        extension = $_.Extension.ToLower()
                    })
                }
        } catch {}
    }
    $top = $candidates | Sort-Object sizeBytes -Descending | Select-Object -First $Limit
    return ,@($top)
}

function Get-OldDownloads([int]$Limit, [datetime]$Deadline, [int]$MinAgeDays = 90) {
    if (-not (Test-Path $DownloadsDir)) { return @() }
    $cutoff = (Get-Date).AddDays(-1 * $MinAgeDays)
    $out = @()
    Get-ChildItem -Path $DownloadsDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Sort-Object LastWriteTime |
        Select-Object -First $Limit |
        ForEach-Object {
            if ((Get-Date) -gt $Deadline) { return }
            $out += [pscustomobject]@{
                path = $_.FullName
                sizeBytes = [long]$_.Length
                sizeHuman = (Format-Bytes [long]$_.Length)
                lastWriteUtc = $_.LastWriteTimeUtc.ToString('o')
                ageDays = [int]((Get-Date) - $_.LastWriteTime).TotalDays
            }
        }
    return ,$out
}

function Get-DesktopClutter([int]$Limit, [datetime]$Deadline) {
    if (-not (Test-Path $DesktopDir)) { return @() }
    $out = @()
    Get-ChildItem -Path $DesktopDir -ErrorAction SilentlyContinue |
        Where-Object { -not $_.PSIsContainer -and $_.Extension -notin @('.lnk','.url','.exe') } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First $Limit |
        ForEach-Object {
            if ((Get-Date) -gt $Deadline) { return }
            $out += [pscustomobject]@{
                path = $_.FullName
                sizeBytes = [long]$_.Length
                sizeHuman = (Format-Bytes [long]$_.Length)
                lastWriteUtc = $_.LastWriteTimeUtc.ToString('o')
                extension = $_.Extension.ToLower()
            }
        }
    return ,$out
}

function Get-TempCacheFiles([int]$Limit, [datetime]$Deadline, [int]$MinAgeDays = 14) {
    $out = @()
    $cutoff = (Get-Date).AddDays(-1 * $MinAgeDays)
    foreach ($d in $TempDirs) {
        if (-not (Test-Path $d)) { continue }
        try {
            Get-ChildItem -Path $d -File -Recurse -Force -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -lt $cutoff } |
                Select-Object -First ($Limit - $out.Count) |
                ForEach-Object {
                    if ((Get-Date) -gt $Deadline) { return }
                    $out += [pscustomobject]@{
                        path = $_.FullName
                        sizeBytes = [long]$_.Length
                        sizeHuman = (Format-Bytes [long]$_.Length)
                        lastWriteUtc = $_.LastWriteTimeUtc.ToString('o')
                    }
                }
        } catch {}
        if ($out.Count -ge $Limit) { break }
    }
    return ,$out
}

function Get-DuplicateGroups([object[]]$Files, [int]$LimitGroups, [datetime]$Deadline) {
    # SHA1 only files in the same exact size bucket; same-size collisions are very rare otherwise.
    $bySize = $Files | Group-Object -Property sizeBytes | Where-Object { $_.Count -ge 2 }
    $groups = @()
    foreach ($g in $bySize) {
        if ((Get-Date) -gt $Deadline) { break }
        if ($groups.Count -ge $LimitGroups) { break }
        $byHash = @{}
        foreach ($item in $g.Group) {
            try {
                if ((Get-Date) -gt $Deadline) { break }
                $h = (Get-FileHash -Algorithm SHA1 -Path $item.path -ErrorAction Stop).Hash
                if (-not $byHash.ContainsKey($h)) { $byHash[$h] = New-Object System.Collections.Generic.List[object] }
                $byHash[$h].Add($item)
            } catch {}
        }
        foreach ($k in $byHash.Keys) {
            if ($byHash[$k].Count -lt 2) { continue }
            $groups += [pscustomobject]@{
                sha1 = $k
                sizeBytes = [long]$g.Name
                sizeHuman = (Format-Bytes ([long]$g.Name))
                count = $byHash[$k].Count
                paths = $byHash[$k] | ForEach-Object { $_.path }
            }
            if ($groups.Count -ge $LimitGroups) { break }
        }
    }
    return ,$groups
}

function Get-StartupApps {
    $entries = @()
    $hives = @(
        @{ name='HKCU\Run'; path='HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' },
        @{ name='HKLM\Run'; path='HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' },
        @{ name='HKLM\WOW6432Run'; path='HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' }
    )
    foreach ($h in $hives) {
        try {
            $vals = Get-ItemProperty -Path $h.path -ErrorAction SilentlyContinue
            if ($null -eq $vals) { continue }
            foreach ($prop in $vals.PSObject.Properties) {
                if ($prop.Name -in @('PSPath','PSParentPath','PSChildName','PSDrive','PSProvider')) { continue }
                $entries += [pscustomobject]@{ source = $h.name; name = $prop.Name; command = [string]$prop.Value }
            }
        } catch {}
    }
    return ,$entries
}

function Get-InstalledApps {
    $apps = @()
    $keys = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    foreach ($k in $keys) {
        try {
            Get-ItemProperty -Path $k -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
                $apps += [pscustomobject]@{
                    name = $_.DisplayName
                    publisher = $_.Publisher
                    version = $_.DisplayVersion
                    installDate = $_.InstallDate
                    estimatedSizeKb = $_.EstimatedSize
                    uninstallString = $_.UninstallString
                }
            }
        } catch {}
    }
    return ,($apps | Sort-Object -Property name -Unique)
}

function Get-WindowsHealthSnapshot {
    $h = [ordered]@{}
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $h.osCaption = $os.Caption
            $h.osVersion = $os.Version
            $h.osArchitecture = $os.OSArchitecture
            if ($os.LastBootUpTime) {
                $h.lastBootUpTimeUtc = $os.LastBootUpTime.ToUniversalTime().ToString('o')
                $h.uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
            }
            $h.totalMemoryGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
            $h.freeMemoryGb  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
        }
    } catch {}
    try {
        $h.pendingRebootApprox = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending')
    } catch { $h.pendingRebootApprox = $null }
    try {
        $defender = Get-MpComputerStatus -ErrorAction SilentlyContinue
        if ($defender) {
            $h.defenderRealTimeProtection = [bool]$defender.RealTimeProtectionEnabled
            $h.defenderSignaturesAgeDays = $defender.AntivirusSignatureAge
        }
    } catch {}
    return ,([pscustomobject]$h)
}

function Get-ProcessHotspots([int]$TopN = 15) {
    try {
        $procs = Get-Process | Sort-Object -Property WS -Descending | Select-Object -First $TopN
        $cpuTop = Get-Process | Sort-Object -Property CPU -Descending | Select-Object -First $TopN
        return [pscustomobject]@{
            byMemory = ($procs | ForEach-Object { [pscustomobject]@{ name=$_.ProcessName; pid=$_.Id; wsMb=[math]::Round($_.WorkingSet64/1MB,1); cpu=$_.CPU } })
            byCpu    = ($cpuTop | ForEach-Object { [pscustomobject]@{ name=$_.ProcessName; pid=$_.Id; wsMb=[math]::Round($_.WorkingSet64/1MB,1); cpu=$_.CPU } })
        }
    } catch { return $null }
}

function Get-ExistingDiskAuditSummary {
    $p = Join-Path $WorkspaceRoot 'disk_audit\filtered_summary.json'
    if (Test-Path $p) {
        try { return (Get-Content $p -Raw | ConvertFrom-Json) } catch { return $null }
    }
    return $null
}

# ============================================================================
# verbs
# ============================================================================
function Verb-Scan {
    $deadline = (Get-Date).AddSeconds($MaxSeconds)
    Append-Log $P.log "scan starting maxSeconds=$MaxSeconds"

    $disk = Get-DiskSnapshot
    $largeUserspace = Get-LargeFiles -Limit $CAP_LARGE_FILES -MinMB 200 -Deadline $deadline
    $oldDownloads = Get-OldDownloads -Limit $CAP_OLD_DOWNLOADS -Deadline $deadline
    $desktopClutter = Get-DesktopClutter -Limit $CAP_DESKTOP_CLUTTER -Deadline $deadline
    $tempCache = Get-TempCacheFiles -Limit $CAP_TEMP_FILES -Deadline $deadline
    $duplicateInput = @($largeUserspace + $oldDownloads + $desktopClutter)
    $duplicates = Get-DuplicateGroups -Files $duplicateInput -LimitGroups $CAP_DUPLICATE_GROUPS -Deadline $deadline
    $startup = Get-StartupApps
    $installed = Get-InstalledApps
    $procs = Get-ProcessHotspots -TopN 15
    $health = Get-WindowsHealthSnapshot
    $existingAudit = Get-ExistingDiskAuditSummary

    $totals = [pscustomobject]@{
        largeUserspaceCount  = ($largeUserspace | Measure-Object).Count
        oldDownloadsCount    = ($oldDownloads | Measure-Object).Count
        desktopClutterCount  = ($desktopClutter | Measure-Object).Count
        tempCacheCount       = ($tempCache | Measure-Object).Count
        duplicateGroupsCount = ($duplicates | Measure-Object).Count
        duplicateBytesEst    = (($duplicates | ForEach-Object { ([long]$_.sizeBytes * ([int]$_.count - 1)) }) | Measure-Object -Sum).Sum
        startupAppsCount     = ($startup | Measure-Object).Count
        installedAppsCount   = ($installed | Measure-Object).Count
        scanWindowSeconds    = $MaxSeconds
        timeBudgetExceeded   = (Get-Date) -gt $deadline
    }

    $scanDoc = [ordered]@{
        module      = 'computer'
        version     = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        scanRoot    = $ScanRoot
        disk        = $disk
        windowsHealth = $health
        processHotspots = $procs
        startupApps = $startup
        installedApps = $installed
        largeUserspace = $largeUserspace
        oldDownloads = $oldDownloads
        desktopClutter = $desktopClutter
        tempCacheFiles = $tempCache
        duplicateGroups = $duplicates
        existingDiskAudit = $existingAudit
        totals      = $totals
    }
    Save-Json $P.scanJson ([pscustomobject]$scanDoc)

    $md = @(
        '# Computer scan report', '',
        ("Generated: $($scanDoc.generatedAt)"),
        ("Scan root: $ScanRoot"),
        ("Time budget: $MaxSeconds s (exceeded: $($totals.timeBudgetExceeded))"),
        '', '## Disk usage', '',
        '| Drive | Used | Free | Total |', '|-------|------|------|-------|'
    )
    foreach ($d in $disk) {
        $md += "| $($d.name) | $($d.usedHuman) | $($d.freeHuman) | $((Format-Bytes ([long]$d.totalBytes))) |"
    }
    $md += '', '## Totals', ''
    $md += "- Large userspace files (>=200MB, top $CAP_LARGE_FILES): $($totals.largeUserspaceCount)"
    $md += "- Old downloads (>90d): $($totals.oldDownloadsCount)"
    $md += "- Desktop non-shortcut items: $($totals.desktopClutterCount)"
    $md += "- Temp/cache files (>14d): $($totals.tempCacheCount)"
    $md += "- Duplicate file groups: $($totals.duplicateGroupsCount), reclaimable est: $((Format-Bytes ([long]($totals.duplicateBytesEst | ForEach-Object { if ($_) { $_ } else { 0 } }))))"
    $md += "- Startup apps: $($totals.startupAppsCount)"
    $md += "- Installed apps: $($totals.installedAppsCount)"
    if ($existingAudit) {
        $md += '', '## Inherited from disk_audit', ''
        $md += "- Empty dir candidates: $($existingAudit.emptyDirCandidates)"
        $md += "- Zero-byte file candidates: $($existingAudit.zeroFileCandidates)"
        $md += "- Cold file candidates (>3y untouched): $($existingAudit.coldFileCandidates)"
    }
    if ($health) {
        $md += '', '## Windows health', ''
        $md += "- OS: $($health.osCaption) $($health.osVersion) ($($health.osArchitecture))"
        $md += "- Uptime: $($health.uptimeHours) h"
        $md += "- Memory: $($health.freeMemoryGb) GB free of $($health.totalMemoryGb) GB"
        $md += "- Pending reboot (heuristic): $($health.pendingRebootApprox)"
        $md += "- Defender realtime: $($health.defenderRealTimeProtection); signatures age: $($health.defenderSignaturesAgeDays) d"
    }
    ($md -join "`r`n") | Set-Content -Path $P.scanReport -Encoding UTF8

    Update-ModuleState $P.state @{
        lastScanAt = (Get-Date).ToUniversalTime().ToString('o')
        lastScanItems = ($totals.largeUserspaceCount + $totals.oldDownloadsCount + $totals.desktopClutterCount + $totals.tempCacheCount + ($totals.duplicateGroupsCount * 2))
    }

    Append-Log $P.log "scan complete totals=$($totals.largeUserspaceCount)/$($totals.oldDownloadsCount)/$($totals.desktopClutterCount)/$($totals.tempCacheCount)/$($totals.duplicateGroupsCount)"
    Write-Output $P.scanReport
}

function Verb-Plan {
    $scan = Read-JsonFile $P.scanJson
    if (-not $scan) { throw 'no scan-summary.json — run scan first' }

    $safeTrash = New-Object System.Collections.Generic.List[object]
    $archive   = New-Object System.Collections.Generic.List[object]
    $manualReview = New-Object System.Collections.Generic.List[object]

    # Old downloads → archive bucket (move to archive folder; not delete)
    foreach ($f in $scan.oldDownloads) {
        $archive.Add([pscustomobject]@{
            kind = 'old-download'; path = $f.path; sizeBytes = $f.sizeBytes; sizeHuman = $f.sizeHuman; rationale = "in Downloads, not modified $($f.ageDays)d"
        })
    }

    # Temp/cache → safe-trash (move to recycle bin)
    foreach ($f in $scan.tempCacheFiles) {
        $safeTrash.Add([pscustomobject]@{
            kind = 'temp-cache'; path = $f.path; sizeBytes = $f.sizeBytes; sizeHuman = $f.sizeHuman; rationale = 'temp/cache file >14d old'
        })
    }

    # Duplicates → manual review for the duplicate copies (keep first path, propose moving the rest)
    foreach ($g in $scan.duplicateGroups) {
        $paths = @($g.paths)
        if ($paths.Count -lt 2) { continue }
        $keep = $paths[0]
        for ($i = 1; $i -lt $paths.Count; $i++) {
            $manualReview.Add([pscustomobject]@{
                kind = 'duplicate-copy'; path = $paths[$i]; sizeBytes = $g.sizeBytes; sizeHuman = $g.sizeHuman
                rationale = "exact SHA1 duplicate of $keep"; sha1 = $g.sha1; keepInstead = $keep
            })
        }
    }

    # Large userspace files → manual review (informational; user must approve removal)
    foreach ($f in $scan.largeUserspace) {
        $manualReview.Add([pscustomobject]@{
            kind = 'large-userspace'; path = $f.path; sizeBytes = $f.sizeBytes; sizeHuman = $f.sizeHuman
            rationale = "file >=200MB, last touched $($f.lastWriteUtc)"
        })
    }

    # Desktop clutter → manual review (always conservative; never auto-trash desktop items)
    foreach ($f in $scan.desktopClutter) {
        $manualReview.Add([pscustomobject]@{
            kind = 'desktop-item'; path = $f.path; sizeBytes = $f.sizeBytes; sizeHuman = $f.sizeHuman
            rationale = 'on Desktop — review whether still needed'
        })
    }

    $totals = [pscustomobject]@{
        safeTrashCount    = $safeTrash.Count
        archiveCount      = $archive.Count
        manualReviewCount = $manualReview.Count
        safeTrashBytes    = ($safeTrash | Measure-Object -Property sizeBytes -Sum).Sum
        archiveBytes      = ($archive   | Measure-Object -Property sizeBytes -Sum).Sum
        manualReviewBytes = ($manualReview | Measure-Object -Property sizeBytes -Sum).Sum
    }

    $plan = [ordered]@{
        module = 'computer'; version = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        scanGeneratedAt = $scan.generatedAt
        buckets = [ordered]@{
            safeTrash    = $safeTrash
            archive      = $archive
            manualReview = $manualReview
        }
        totals = $totals
        rules  = @(
            'safeTrash candidates may be moved to the Windows Recycle Bin only; never permadelete.',
            'archive candidates are moved to disk_audit/archive/<YYYY-MM-DD>/<original-relative-path>.',
            'manualReview candidates require explicit per-item human approval; never auto-applied.'
        )
    }
    Save-Json $P.planJson ([pscustomobject]$plan)

    $md = @(
        '# Computer plan', '',
        ("Generated: $($plan.generatedAt) (from scan $($plan.scanGeneratedAt))"),
        '', '## Summary', '',
        "- Safe-trash (recycle bin): $($totals.safeTrashCount) items, $((Format-Bytes ([long]($totals.safeTrashBytes -as [long]))))",
        "- Archive (move aside):     $($totals.archiveCount) items, $((Format-Bytes ([long]($totals.archiveBytes -as [long]))))",
        "- Manual review:            $($totals.manualReviewCount) items, $((Format-Bytes ([long]($totals.manualReviewBytes -as [long]))))",
        '',
        '## Bucket rules',
        ''
    )
    foreach ($r in $plan.rules) { $md += "- $r" }
    ($md -join "`r`n") | Set-Content -Path $P.planReport -Encoding UTF8

    Update-ModuleState $P.state @{
        lastPlanAt = (Get-Date).ToUniversalTime().ToString('o')
        lastPlanItems = $totals.safeTrashCount + $totals.archiveCount + $totals.manualReviewCount
    }
    Append-Log $P.log "plan complete safe=$($totals.safeTrashCount) archive=$($totals.archiveCount) review=$($totals.manualReviewCount)"
    Write-Output $P.planReport
}

function Verb-Approve {
    $plan = Read-JsonFile $P.planJson
    if (-not $plan) { throw 'no plan.json — run plan first' }

    # Approval = take the safeTrash + archive buckets verbatim (manualReview always opt-in per item).
    # If $ApproveAll is provided as 'all', include manualReview items too.
    $approved = @()
    $approved += $plan.buckets.safeTrash
    $approved += $plan.buckets.archive
    if ($ApproveAll -eq 'all') {
        $approved += $plan.buckets.manualReview
    }

    $pkg = [ordered]@{
        module = 'computer'; version = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        planGeneratedAt = $plan.generatedAt
        approveAll = ($ApproveAll -eq 'all')
        items = $approved
        totals = [pscustomobject]@{
            count = ($approved | Measure-Object).Count
            bytes = ($approved | Measure-Object -Property sizeBytes -Sum).Sum
        }
        contractSha1 = ((($approved | ForEach-Object { "$($_.kind)|$($_.path)" }) -join "`n") |
                        ForEach-Object { [System.BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($_))).Replace('-','') })
    }
    Save-Json $P.approvalJson ([pscustomobject]$pkg)

    $md = @(
        '# Computer approval package', '',
        ("Generated: $($pkg.generatedAt) (from plan $($pkg.planGeneratedAt))"),
        ("approveAll: $($pkg.approveAll)"),
        ("Items: $($pkg.totals.count), Bytes: $((Format-Bytes ([long]($pkg.totals.bytes -as [long]))))"),
        ("contractSha1: $($pkg.contractSha1)"),
        ''
    )
    if ($pkg.totals.count -eq 0) {
        $md += '_No approved items — nothing to apply._'
    } else {
        $md += '## Approved items'
        $md += ''
        $md += '| kind | size | path | rationale |'
        $md += '|------|------|------|-----------|'
        foreach ($it in $approved) {
            $kind = $it.kind
            $size = $it.sizeHuman
            $path = $it.path
            $rat = $it.rationale
            $md += "| $kind | $size | $path | $rat |"
        }
    }
    ($md -join "`r`n") | Set-Content -Path $P.approvalReport -Encoding UTF8

    Update-ModuleState $P.state @{
        lastApprovalAt = (Get-Date).ToUniversalTime().ToString('o')
        lastApprovalSha = $pkg.contractSha1
    }
    Append-Log $P.log "approve complete items=$($pkg.totals.count) approveAll=$($pkg.approveAll) contract=$($pkg.contractSha1)"
    Write-Output $P.approvalReport
}

function Verb-Apply {
    $pkg = Read-JsonFile $P.approvalJson
    if (-not $pkg) { throw 'no approval-package.json — run approve first' }

    $dryRun = -not $NoDryRun
    $archiveDir = Join-Path (Join-Path $WorkspaceRoot 'disk_audit\archive') ((Get-Date).ToString('yyyy-MM-dd'))
    if (-not $dryRun) {
        if (-not (Test-Path $archiveDir)) { New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null }
    }

    Add-Type -AssemblyName Microsoft.VisualBasic

    $log = New-Object System.Collections.Generic.List[object]
    foreach ($it in $pkg.items) {
        if (-not (Test-Path $it.path)) {
            $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='missing'; dryRun=$dryRun }); continue
        }
        if (Test-PathInsideRecycleBin $it.path) {
            $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='already-in-recycle'; dryRun=$dryRun }); continue
        }

        try {
            if ($dryRun) {
                $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='would-trash-or-archive'; dryRun=$true })
            } elseif ($it.kind -eq 'temp-cache' -or $it.kind -eq 'old-download') {
                if ($it.kind -eq 'old-download') {
                    $rel = ($it.path -replace [regex]::Escape($DownloadsDir + '\'), '')
                    $dst = Join-Path $archiveDir $rel
                    $dstDir = Split-Path -Parent $dst
                    if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
                    Move-Item -LiteralPath $it.path -Destination $dst -Force
                    $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='archived'; archivedTo=$dst; dryRun=$false })
                } else {
                    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
                        $it.path,
                        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
                        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
                    )
                    $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='recycled'; dryRun=$false })
                }
            } else {
                # manual-review and unrecognized kinds → never auto-applied here
                $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='requires-manual'; dryRun=$dryRun })
            }
        } catch {
            $log.Add([pscustomobject]@{ path=$it.path; kind=$it.kind; result='error'; error=$_.Exception.Message; dryRun=$dryRun })
        }
    }

    $applyDoc = [ordered]@{
        module = 'computer'; version = 1
        generatedAt = (Get-Date).ToUniversalTime().ToString('o')
        approvalContractSha1 = $pkg.contractSha1
        dryRun = $dryRun
        archiveDir = $archiveDir
        log = $log
        totals = [pscustomobject]@{
            considered = $log.Count
            archived   = ($log | Where-Object result -eq 'archived').Count
            recycled   = ($log | Where-Object result -eq 'recycled').Count
            wouldDo    = ($log | Where-Object result -eq 'would-trash-or-archive').Count
            errors     = ($log | Where-Object result -eq 'error').Count
            missing    = ($log | Where-Object result -eq 'missing').Count
            requiresManual = ($log | Where-Object result -eq 'requires-manual').Count
        }
    }
    Save-Json $P.applyJson ([pscustomobject]$applyDoc)

    $md = @(
        '# Computer apply log', '',
        ("Generated: $($applyDoc.generatedAt)"),
        ("dryRun: $($applyDoc.dryRun)"),
        ("approvalContractSha1: $($applyDoc.approvalContractSha1)"),
        ("Considered: $($applyDoc.totals.considered) | archived: $($applyDoc.totals.archived) | recycled: $($applyDoc.totals.recycled) | wouldDo: $($applyDoc.totals.wouldDo) | errors: $($applyDoc.totals.errors) | missing: $($applyDoc.totals.missing) | manualSkipped: $($applyDoc.totals.requiresManual)"),
        ''
    )
    ($md -join "`r`n") | Set-Content -Path $P.applyReport -Encoding UTF8

    Update-ModuleState $P.state @{
        lastApplyAt = (Get-Date).ToUniversalTime().ToString('o')
        lastApplyDryRun = $dryRun
        lastApplyResult = ([pscustomobject]@{
            considered=$applyDoc.totals.considered
            archived=$applyDoc.totals.archived
            recycled=$applyDoc.totals.recycled
            wouldDo=$applyDoc.totals.wouldDo
            errors=$applyDoc.totals.errors
        })
    }
    Append-Log $P.log "apply complete dryRun=$dryRun considered=$($applyDoc.totals.considered) archived=$($applyDoc.totals.archived) recycled=$($applyDoc.totals.recycled) errors=$($applyDoc.totals.errors)"
    Write-Output $P.applyReport
}

function Verb-Doctor {
    $state = Read-JsonFile $P.state
    if (-not $state) { Write-Output 'computer module: no state yet (run scan first)'; return }
    Write-Output '=== Computer module doctor ==='
    Write-Output "lastScanAt:     $($state.lastScanAt)"
    Write-Output "lastScanItems:  $($state.lastScanItems)"
    Write-Output "lastPlanAt:     $($state.lastPlanAt)"
    Write-Output "lastPlanItems:  $($state.lastPlanItems)"
    Write-Output "lastApprovalAt: $($state.lastApprovalAt) sha=$($state.lastApprovalSha)"
    Write-Output "lastApplyAt:    $($state.lastApplyAt) dryRun=$($state.lastApplyDryRun)"
    if ($state.lastApplyResult) {
        $r = $state.lastApplyResult
        Write-Output "lastApplyResult: considered=$($r.considered) archived=$($r.archived) recycled=$($r.recycled) errors=$($r.errors)"
    }
}

switch ($Verb) {
    'scan'    { Verb-Scan }
    'plan'    { Verb-Plan }
    'approve' { Verb-Approve }
    'apply'   { Verb-Apply }
    'doctor'  { Verb-Doctor }
}
