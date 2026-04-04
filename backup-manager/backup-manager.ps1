[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backup', 'list', 'restore', 'restore-preview', 'prune', 'status', 'health-check', 'install-schedule', 'uninstall-schedule', 'self-test')]
    [string]$Command,

    [string]$Root,
    [string]$BackupDir,
    [int]$Keep = 3,
    [string]$Snapshot,
    [string]$TaskName = 'OpenClaw Daily Backup',
    [string]$DailyAt = '03:30',
    [switch]$Verify,
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Json([object]$Value) {
    $Value | ConvertTo-Json -Depth 30
}

function Get-ScheduleMetadataPath {
    return Join-Path $PSScriptRoot 'schedule.json'
}

function Get-ScheduleMetadata {
    $scheduleMetadataPath = Get-ScheduleMetadataPath
    if (-not (Test-Path -LiteralPath $scheduleMetadataPath)) {
        return $null
    }

    try {
        return (Get-Content -LiteralPath $scheduleMetadataPath -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Initialize-Paths {
    $script:ScheduleMetadata = Get-ScheduleMetadata

    $scheduleRoot = $null
    $scheduleScriptPath = $null
    $scheduleBackupDir = $null
    if ($script:ScheduleMetadata) {
        $rootProp = $script:ScheduleMetadata.PSObject.Properties['root']
        if ($rootProp) { $scheduleRoot = [string]$rootProp.Value }
        $scriptPathProp = $script:ScheduleMetadata.PSObject.Properties['scriptPath']
        if ($scriptPathProp) { $scheduleScriptPath = [string]$scriptPathProp.Value }
        $backupDirProp = $script:ScheduleMetadata.PSObject.Properties['backupDir']
        if ($backupDirProp) { $scheduleBackupDir = [string]$backupDirProp.Value }
    }

    if ([string]::IsNullOrWhiteSpace($Root)) {
        if (-not [string]::IsNullOrWhiteSpace($scheduleRoot)) {
            $script:Root = $scheduleRoot
        }
        elseif (-not [string]::IsNullOrWhiteSpace($scheduleScriptPath)) {
            $scriptRootDir = Split-Path -Parent $scheduleScriptPath
            $workspaceDir = Split-Path -Parent $scriptRootDir
            $workspaceParent = Split-Path -Parent $workspaceDir
            $script:Root = $workspaceParent
        }
        else {
            $script:Root = Join-Path $env:USERPROFILE '.openclaw'
        }
    }
    else {
        $script:Root = $Root
    }

    if ([string]::IsNullOrWhiteSpace($BackupDir)) {
        if (-not [string]::IsNullOrWhiteSpace($scheduleBackupDir)) {
            $script:BackupDir = $scheduleBackupDir
        }
        else {
            $rootParent = Split-Path -Parent $script:Root
            $script:BackupDir = Join-Path $rootParent 'OpenClawBackups'
        }
    }
    else {
        $script:BackupDir = $BackupDir
    }
}

function Assert-OpenClawCli {
    $cmd = Get-Command openclaw -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw 'openclaw CLI not found in PATH.'
    }
    return $cmd.Source
}

function Ensure-Directory([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Get-TimestampUtc {
    return (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH-mm-ss.fffZ')
}

function Get-SnapshotPrefix([string]$FileName) {
    if ($FileName -match '^(?<prefix>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z)-openclaw-backup\.tar\.gz$') {
        return $Matches.prefix
    }
    return [System.IO.Path]::GetFileNameWithoutExtension([System.IO.Path]::GetFileNameWithoutExtension($FileName))
}

function Get-MetadataPath([string]$ArchivePath) {
    return "$ArchivePath.metadata.json"
}

function Get-ManifestPath([string]$ArchivePath) {
    return "$ArchivePath.manifest.json"
}

function Get-RestoreCandidateItems {
    return @(
        'agents',
        'canvas',
        'completions',
        'credentials',
        'delivery-queue',
        'devices',
        'identity',
        'logs',
        'media',
        'memory',
        'tasks',
        'telegram',
        'workspace',
        'exec-approvals.json',
        'gateway.cmd',
        'openclaw.json',
        'openclaw.json.bak',
        'openclaw.json.bak.1',
        'openclaw.json.bak.2',
        'openclaw.json.bak.3',
        'openclaw.json.bak.4',
        'update-check.json'
    )
}

function Get-OpenClawVersion {
    return (& openclaw --version | Select-Object -First 1)
}

function Get-ManifestEntries {
    $items = Get-RestoreCandidateItems
    $manifest = @()

    foreach ($item in $items) {
        $path = Join-Path $script:Root $item
        if (-not (Test-Path -LiteralPath $path)) {
            continue
        }

        $entry = Get-Item -LiteralPath $path -Force
        $manifest += [pscustomobject]@{
            item = $item
            path = $path
            type = if ($entry.PSIsContainer) { 'directory' } else { 'file' }
            lastWriteTimeUtc = $entry.LastWriteTimeUtc.ToString('o')
            sizeBytes = if ($entry.PSIsContainer) { $null } else { [int64]$entry.Length }
        }
    }

    return @($manifest)
}

function Get-Snapshots {
    Ensure-Directory $script:BackupDir

    $archives = Get-ChildItem -LiteralPath $script:BackupDir -File -Filter '*-openclaw-backup.tar.gz' |
        Sort-Object LastWriteTimeUtc -Descending

    $result = foreach ($archive in $archives) {
        $metadataPath = Get-MetadataPath $archive.FullName
        $manifestPath = Get-ManifestPath $archive.FullName
        $metadata = $null
        if (Test-Path -LiteralPath $metadataPath) {
            try {
                $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
            }
            catch {
                $metadata = $null
            }
        }

        [pscustomobject]@{
            Name = $archive.Name
            ArchivePath = $archive.FullName
            MetadataPath = if (Test-Path -LiteralPath $metadataPath) { $metadataPath } else { $null }
            ManifestPath = if (Test-Path -LiteralPath $manifestPath) { $manifestPath } else { $null }
            SizeBytes = $archive.Length
            LastWriteTimeUtc = $archive.LastWriteTimeUtc
            CreatedAtUtc = if ($metadata) { $metadata.createdAtUtc } else { $null }
            Verified = if ($metadata) { [bool]$metadata.verified } else { $false }
            OpenClawVersion = if ($metadata) { $metadata.openclawVersion } else { $null }
            Root = if ($metadata) { $metadata.root } else { $null }
            Host = if ($metadata) { $metadata.host } else { $null }
            SnapshotId = if ($metadata) { $metadata.snapshotId } else { Get-SnapshotPrefix $archive.Name }
        }
    }

    return @($result)
}

function Resolve-Snapshot {
    param([string]$Value)

    $snapshots = @(Get-Snapshots)
    if (-not $snapshots.Count) {
        throw 'No snapshots found.'
    }

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -eq 'latest') {
        return $snapshots | Select-Object -First 1
    }

    $direct = $snapshots | Where-Object {
        $_.Name -eq $Value -or
        $_.SnapshotId -eq $Value -or
        $_.ArchivePath -eq $Value
    } | Select-Object -First 1

    if ($direct) {
        return $direct
    }

    throw "Snapshot not found: $Value"
}

function Get-ExtractRoot([string]$ExtractDir) {
    $archiveRoot = Get-ChildItem -LiteralPath $ExtractDir -Directory | Select-Object -First 1
    if (-not $archiveRoot) {
        throw 'Extracted archive root not found.'
    }
    return $archiveRoot.FullName
}

function Get-ExtractedStateRoot([string]$ExtractDir) {
    $archiveRoot = Get-ExtractRoot $ExtractDir
    $payloadDir = Join-Path $archiveRoot 'payload'
    if (-not (Test-Path -LiteralPath $payloadDir)) {
        throw "Archive payload folder missing: $payloadDir"
    }

    $candidates = Get-ChildItem -LiteralPath $payloadDir -Directory -Recurse | Where-Object {
        $_.FullName -match '\\.openclaw$'
    } | Sort-Object FullName

    if (-not $candidates) {
        throw 'Unable to locate .openclaw state root inside extracted archive.'
    }

    return $candidates[0].FullName
}

function Get-ScheduleTaskInfo {
    $taskNameValue = $TaskName

    try {
        $task = Get-ScheduledTask -TaskName $taskNameValue -ErrorAction Stop | Select-Object -First 1
        if ($task) {
            return [pscustomobject]@{
                taskName = $task.TaskName
                taskPath = $task.TaskPath
                state = [string]$task.State
                source = 'Get-ScheduledTask -TaskName'
                triggers = @($task.Triggers | ForEach-Object {
                    [pscustomobject]@{
                        frequency = $_.Frequency
                        startBoundary = $_.StartBoundary
                        daysInterval = $_.DaysInterval
                    }
                })
                actions = @($task.Actions | ForEach-Object {
                    [pscustomobject]@{
                        execute = $_.Execute
                        arguments = $_.Arguments
                        workingDirectory = $_.WorkingDirectory
                    }
                })
            }
        }
    }
    catch {
    }

    try {
        $query = schtasks.exe /Query /TN $taskNameValue /V /FO CSV 2>$null
        if ($LASTEXITCODE -eq 0 -and $query) {
            $rows = $query | ConvertFrom-Csv
            $row = $rows | Select-Object -First 1
            if ($row) {
                return [pscustomobject]@{
                    taskName = $row.TaskName
                    taskPath = '\'
                    state = $row.Status
                    source = 'schtasks.exe'
                    triggers = @()
                    actions = @(
                        [pscustomobject]@{
                            execute = $null
                            arguments = $row.'Task To Run'
                            workingDirectory = $null
                        }
                    )
                }
            }
        }
    }
    catch {
    }

    return $null
}

function Get-BackupStatus {
    $snapshots = @(Get-Snapshots)
    $latest = $snapshots | Select-Object -First 1
    $taskInfo = Get-ScheduleTaskInfo

    return [pscustomobject]@{
        Root = $script:Root
        BackupDir = $script:BackupDir
        Keep = $Keep
        SnapshotCount = $snapshots.Count
        Latest = $latest
        Snapshots = $snapshots
        Schedule = $taskInfo
        ScheduleMetadata = $script:ScheduleMetadata
    }
}

function Invoke-Prune {
    param(
        [switch]$PassThru
    )

    $snapshots = @(Get-Snapshots)
    $toRemove = @($snapshots | Select-Object -Skip $Keep)
    $removed = @()

    foreach ($snapshot in $toRemove) {
        if (Test-Path -LiteralPath $snapshot.ArchivePath) {
            Remove-Item -LiteralPath $snapshot.ArchivePath -Force
        }
        if ($snapshot.MetadataPath -and (Test-Path -LiteralPath $snapshot.MetadataPath)) {
            Remove-Item -LiteralPath $snapshot.MetadataPath -Force
        }
        if ($snapshot.ManifestPath -and (Test-Path -LiteralPath $snapshot.ManifestPath)) {
            Remove-Item -LiteralPath $snapshot.ManifestPath -Force
        }
        $removed += $snapshot
    }

    $result = [pscustomobject]@{
        keep = $Keep
        removedCount = $removed.Count
        removed = $removed
        remaining = @(Get-Snapshots)
    }

    if ($PassThru) {
        return $result
    }

    if ($Json) {
        Write-Json $result
    }
    else {
        $result
    }
}

function Invoke-Backup {
    Assert-OpenClawCli | Out-Null
    Ensure-Directory $script:BackupDir

    $snapshotId = Get-TimestampUtc
    $archivePath = Join-Path $script:BackupDir ("$snapshotId-openclaw-backup.tar.gz")

    $args = @('backup', 'create', '--output', $archivePath, '--json')
    if ($Verify) {
        $args += '--verify'
    }

    $jsonRaw = & openclaw @args
    if ($LASTEXITCODE -ne 0) {
        throw "openclaw backup create failed with exit code $LASTEXITCODE"
    }

    $backupResult = $jsonRaw | ConvertFrom-Json
    $cliVersion = Get-OpenClawVersion
    $verified = [bool]$backupResult.verified

    if (-not $verified) {
        $verifyJson = & openclaw backup verify $backupResult.archivePath --json
        if ($LASTEXITCODE -ne 0) {
            throw "openclaw backup verify failed with exit code $LASTEXITCODE"
        }
        $verifyResult = $verifyJson | ConvertFrom-Json
        $verified = [bool]$verifyResult.ok
    }
    else {
        $verifyResult = [pscustomobject]@{ ok = $true; archivePath = $backupResult.archivePath }
    }

    $manifest = [pscustomobject]@{
        snapshotId = $snapshotId
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        root = $script:Root
        items = @(Get-ManifestEntries)
    }

    $metadata = [pscustomobject]@{
        snapshotId = $snapshotId
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        archivePath = $backupResult.archivePath
        archiveRoot = $backupResult.archiveRoot
        verified = $verified
        includeWorkspace = [bool]$backupResult.includeWorkspace
        onlyConfig = [bool]$backupResult.onlyConfig
        root = $script:Root
        backupDir = $script:BackupDir
        keep = $Keep
        host = $env:COMPUTERNAME
        openclawVersion = $cliVersion
        assets = $backupResult.assets
        skipped = $backupResult.skipped
        verify = $verifyResult
        manifestPath = (Get-ManifestPath $backupResult.archivePath)
    }

    $metadataPath = Get-MetadataPath $backupResult.archivePath
    $manifestPath = Get-ManifestPath $backupResult.archivePath
    $metadata | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $metadataPath -Encoding UTF8
    $manifest | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    $pruneResult = Invoke-Prune -PassThru

    return [pscustomobject]@{
        backup = $backupResult
        verify = $verifyResult
        metadataPath = $metadataPath
        manifestPath = $manifestPath
        prune = $pruneResult
    }
}

function New-RestorePlanEntry {
    param(
        [string]$Item,
        [string]$Source,
        [string]$Destination,
        [bool]$ExistsInArchive,
        [bool]$ExistsOnDisk
    )

    $action = if ($ExistsInArchive -and $ExistsOnDisk) {
        'overwrite'
    }
    elseif ($ExistsInArchive -and -not $ExistsOnDisk) {
        'add'
    }
    elseif (-not $ExistsInArchive -and $ExistsOnDisk) {
        'remove'
    }
    else {
        'skip'
    }

    return [pscustomobject]@{
        item = $Item
        source = $Source
        destination = $Destination
        existsInArchive = $ExistsInArchive
        existsOnDisk = $ExistsOnDisk
        action = $action
    }
}

function Invoke-SafeCopyRestore {
    param(
        [string]$StateRoot,
        [switch]$Apply
    )

    $items = Get-RestoreCandidateItems
    $plan = @()

    foreach ($item in $items) {
        $source = Join-Path $StateRoot $item
        $destination = Join-Path $script:Root $item
        $existsInArchive = Test-Path -LiteralPath $source
        $existsOnDisk = Test-Path -LiteralPath $destination
        $entry = New-RestorePlanEntry -Item $item -Source $source -Destination $destination -ExistsInArchive:$existsInArchive -ExistsOnDisk:$existsOnDisk
        $plan += $entry

        if (-not $Apply) {
            continue
        }

        if ($existsOnDisk) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        if ($existsInArchive) {
            Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
        }
    }

    return @($plan)
}

function Get-RestorePlanSummary {
    param(
        [object[]]$Plan
    )

    $overwrite = @($Plan | Where-Object { $_.action -eq 'overwrite' })
    $add = @($Plan | Where-Object { $_.action -eq 'add' })
    $remove = @($Plan | Where-Object { $_.action -eq 'remove' })
    $skip = @($Plan | Where-Object { $_.action -eq 'skip' })

    return [pscustomobject]@{
        total = @($Plan).Count
        overwriteCount = $overwrite.Count
        addCount = $add.Count
        removeCount = $remove.Count
        skipCount = $skip.Count
        overwriteItems = @($overwrite | ForEach-Object { [string]$_.item })
        addItems = @($add | ForEach-Object { [string]$_.item })
        removeItems = @($remove | ForEach-Object { [string]$_.item })
        skipItems = @($skip | ForEach-Object { [string]$_.item })
    }
}

function ConvertTo-StringArray([object]$Value) {
    if ($null -eq $Value) {
        return @()
    }
    if ($Value -is [System.Array]) {
        return @($Value | ForEach-Object { [string]$_ })
    }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        return @($Value | ForEach-Object { [string]$_ })
    }
    return @([string]$Value)
}

function Format-RestorePreviewText {
    param(
        [object]$Preview
    )

    $lines = @()
    $lines += "Snapshot: $($Preview.snapshot.SnapshotId)"
    $lines += "Archive: $($Preview.snapshot.ArchivePath)"
    $lines += "Root: $($Preview.root)"
    $lines += "Plan: total=$($Preview.summary.total), overwrite=$($Preview.summary.overwriteCount), add=$($Preview.summary.addCount), remove=$($Preview.summary.removeCount), skip=$($Preview.summary.skipCount)"

    if ($Preview.versionWarning) {
        $lines += "Warning: $($Preview.versionWarning)"
    }
    if ($Preview.removeGuardWarning) {
        $lines += "Warning: $($Preview.removeGuardWarning)"
    }

    foreach ($section in @(
        @{ Name = 'Overwrite'; Items = (ConvertTo-StringArray $Preview.summary.overwriteItems) },
        @{ Name = 'Add'; Items = (ConvertTo-StringArray $Preview.summary.addItems) },
        @{ Name = 'Remove'; Items = (ConvertTo-StringArray $Preview.summary.removeItems) }
    )) {
        $items = @($section.Items | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($items.Count) {
            $lines += ($section.Name + ': ' + ($items -join ', '))
        }
    }

    return ($lines -join [Environment]::NewLine)
}

function Get-VersionWarning {
    param([object]$Snapshot)

    $currentVersion = Get-OpenClawVersion
    if ($Snapshot.OpenClawVersion -and $Snapshot.OpenClawVersion -ne $currentVersion) {
        return "snapshot version $($Snapshot.OpenClawVersion) differs from current version $currentVersion"
    }
    return $null
}

function Get-RestorePreview {
    param([string]$SnapshotValue)

    $target = Resolve-Snapshot $SnapshotValue
    $restoreRoot = Join-Path $env:TEMP ("openclaw-preview-$([guid]::NewGuid().ToString('N'))")
    Ensure-Directory $restoreRoot

    try {
        tar -xzf $target.ArchivePath -C $restoreRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to extract archive: $($target.ArchivePath)"
        }

        $stateRoot = Get-ExtractedStateRoot $restoreRoot
        $plan = Invoke-SafeCopyRestore -StateRoot $stateRoot
        $summary = Get-RestorePlanSummary -Plan $plan
        $versionWarning = Get-VersionWarning -Snapshot $target
        $removeGuardWarning = if ($summary.removeCount -gt 0) { "restore would remove $($summary.removeCount) item(s) from current state" } else { $null }

        return [pscustomobject]@{
            snapshot = $target
            root = $script:Root
            extractedStateRoot = $stateRoot
            summary = $summary
            versionWarning = $versionWarning
            removeGuardWarning = $removeGuardWarning
            plan = $plan
            previewText = $null
        }
    }
    finally {
        if (Test-Path -LiteralPath $restoreRoot) {
            Remove-Item -LiteralPath $restoreRoot -Recurse -Force
        }
    }
}

function Invoke-Restore {
    if (-not $Force) {
        throw 'Restore requires -Force to avoid accidental overwrite.'
    }

    $preview = Get-RestorePreview -SnapshotValue $Snapshot
    if ($preview.summary.removeCount -gt 0) {
        throw "Restore blocked: preview indicates $($preview.summary.removeCount) removals. Review with -Command restore-preview first and adjust intentionally."
    }

    $target = $preview.snapshot
    Assert-OpenClawCli | Out-Null

    $restoreRoot = Join-Path $env:TEMP ("openclaw-restore-$([guid]::NewGuid().ToString('N'))")
    Ensure-Directory $restoreRoot

    try {
        tar -xzf $target.ArchivePath -C $restoreRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to extract archive: $($target.ArchivePath)"
        }

        $stateRoot = Get-ExtractedStateRoot $restoreRoot

        $preRestoreDir = Join-Path $script:BackupDir 'pre-restore'
        Ensure-Directory $preRestoreDir
        $preRestoreArchive = Join-Path $preRestoreDir ("$(Get-TimestampUtc)-pre-restore-openclaw-backup.tar.gz")
        $preJsonRaw = & openclaw backup create --output $preRestoreArchive --json
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create pre-restore backup. Exit code: $LASTEXITCODE"
        }
        $preBackup = $preJsonRaw | ConvertFrom-Json

        $plan = Invoke-SafeCopyRestore -StateRoot $stateRoot -Apply
        $summary = Get-RestorePlanSummary -Plan $plan

        return [pscustomobject]@{
            restoredSnapshot = $target
            preRestoreBackup = $preBackup.archivePath
            root = $script:Root
            summary = $summary
            versionWarning = $preview.versionWarning
            plan = $plan
        }
    }
    finally {
        if (Test-Path -LiteralPath $restoreRoot) {
            Remove-Item -LiteralPath $restoreRoot -Recurse -Force
        }
    }
}

function Test-RestorePlan {
    $preview = Get-RestorePreview -SnapshotValue $Snapshot
    return [pscustomobject]@{
        snapshot = $preview.snapshot
        extractedStateRoot = $preview.extractedStateRoot
        planCount = @($preview.plan).Count
        summary = $preview.summary
        versionWarning = $preview.versionWarning
        removeGuardWarning = $preview.removeGuardWarning
        plan = $preview.plan
    }
}

function Install-DailySchedule {
    $parts = $DailyAt.Split(':')
    if ($parts.Count -ne 2) {
        throw 'DailyAt must be in HH:mm format.'
    }

    $hour = [int]$parts[0]
    $minute = [int]$parts[1]
    $start = Get-Date -Hour $hour -Minute $minute -Second 0
    if ($start -lt (Get-Date)) {
        $start = $start.AddDays(1)
    }

    $scriptPath = Join-Path $PSScriptRoot 'backup-manager.ps1'
    $execute = 'powershell.exe'
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Command backup -Verify"
    $action = New-ScheduledTaskAction -Execute $execute -Argument $arguments -WorkingDirectory $PSScriptRoot
    $trigger = New-ScheduledTaskTrigger -Daily -At $start
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    try {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    }
    catch {
        schtasks.exe /Create /F /SC DAILY /TN $TaskName /TR ('powershell.exe ' + $arguments) /ST $DailyAt | Out-Null
    }

    $metadata = [pscustomobject]@{
        taskName = $TaskName
        dailyAt = $DailyAt
        scriptPath = $scriptPath
        root = $script:Root
        installedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        backupDir = $script:BackupDir
        keep = $Keep
    }
    $metadata | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Get-ScheduleMetadataPath) -Encoding UTF8
    $script:ScheduleMetadata = $metadata

    return [pscustomobject]@{
        taskName = $TaskName
        dailyAt = $DailyAt
        scriptPath = $scriptPath
        root = $script:Root
        backupDir = $script:BackupDir
    }
}

function Uninstall-DailySchedule {
    try {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    }
    catch {
    }

    $scheduleMetadataPath = Get-ScheduleMetadataPath
    if (Test-Path -LiteralPath $scheduleMetadataPath) {
        Remove-Item -LiteralPath $scheduleMetadataPath -Force
    }
    $script:ScheduleMetadata = $null

    return [pscustomobject]@{
        taskName = $TaskName
        removed = $true
    }
}

function Invoke-SelfTest {
    Assert-OpenClawCli | Out-Null

    $backupResult = Invoke-Backup
    $snapshots = @(Get-Snapshots)
    $latest = $snapshots | Select-Object -First 1
    $verifyJson = & openclaw backup verify $latest.ArchivePath --json
    if ($LASTEXITCODE -ne 0) {
        throw "openclaw backup verify failed with exit code $LASTEXITCODE"
    }
    $verifyResult = $verifyJson | ConvertFrom-Json
    $restoreResult = Test-RestorePlan -Snapshot $latest.SnapshotId

    return [pscustomobject]@{
        backup = $backupResult
        verify = $verifyResult
        restoreTest = $restoreResult
        status = Get-BackupStatus
    }
}

function Invoke-HealthCheck {
    $status = Get-BackupStatus
    $snapshots = @($status.Snapshots)
    $latest = $snapshots | Select-Object -First 1
    $issues = @()
    $checks = @()

    $rootExists = Test-Path -LiteralPath $script:Root
    $checks += [pscustomobject]@{ name = 'root_exists'; ok = $rootExists; details = $script:Root }
    if (-not $rootExists) { $issues += "root missing: $($script:Root)" }

    $backupDirExists = Test-Path -LiteralPath $script:BackupDir
    $checks += [pscustomobject]@{ name = 'backup_dir_exists'; ok = $backupDirExists; details = $script:BackupDir }
    if (-not $backupDirExists) { $issues += "backup dir missing: $($script:BackupDir)" }

    $hasScheduleMetadata = $null -ne $script:ScheduleMetadata
    $checks += [pscustomobject]@{ name = 'schedule_metadata'; ok = $hasScheduleMetadata; details = $script:ScheduleMetadata }
    if (-not $hasScheduleMetadata) { $issues += 'schedule metadata missing' }

    $hasSnapshots = $snapshots.Count -gt 0
    $checks += [pscustomobject]@{ name = 'has_snapshots'; ok = $hasSnapshots; details = $snapshots.Count }
    if (-not $hasSnapshots) { $issues += 'no snapshots found' }

    $retentionOk = $snapshots.Count -le $Keep
    $checks += [pscustomobject]@{ name = 'retention'; ok = $retentionOk; details = "count=$($snapshots.Count), keep=$Keep" }
    if (-not $retentionOk) { $issues += "retention exceeded: $($snapshots.Count) > $Keep" }

    $latestVerified = $false
    if ($latest) { $latestVerified = [bool]$latest.Verified }
    $checks += [pscustomobject]@{ name = 'latest_verified'; ok = $latestVerified; details = if ($latest) { $latest.Name } else { $null } }
    if ($latest -and -not $latestVerified) { $issues += "latest snapshot not verified: $($latest.Name)" }

    $scheduleTask = Get-ScheduleTaskInfo
    $scheduleOk = $null -ne $scheduleTask
    $checks += [pscustomobject]@{ name = 'schedule_task'; ok = $scheduleOk; details = $scheduleTask }
    if (-not $scheduleOk) { $issues += 'scheduled task not found' }

    $latestPreview = $null
    if ($latest) {
        $latestPreview = Get-RestorePreview -SnapshotValue $latest.SnapshotId
        $checks += [pscustomobject]@{ name = 'restore_preview'; ok = $true; details = $latestPreview.summary }
        if ($latestPreview.versionWarning) {
            $issues += $latestPreview.versionWarning
        }
        if ($latestPreview.removeGuardWarning) {
            $issues += $latestPreview.removeGuardWarning
        }
    }

    $manifestOk = $false
    if ($latest -and $latest.ManifestPath -and (Test-Path -LiteralPath $latest.ManifestPath)) {
        $manifestOk = $true
    }
    $checks += [pscustomobject]@{ name = 'manifest'; ok = $manifestOk; details = if ($latest) { $latest.ManifestPath } else { $null } }
    if ($latest -and -not $manifestOk) { $issues += 'latest snapshot manifest missing' }

    return [pscustomobject]@{
        ok = ($issues.Count -eq 0)
        root = $script:Root
        backupDir = $script:BackupDir
        keep = $Keep
        latestSnapshot = $latest
        latestPreviewSummary = if ($latestPreview) { $latestPreview.summary } else { $null }
        checks = $checks
        issues = $issues
    }
}

Initialize-Paths

switch ($Command) {
    'backup' {
        $result = Invoke-Backup
        if ($Json) { Write-Json $result } else { $result }
    }
    'list' {
        $result = @(Get-Snapshots)
        if ($Json) { Write-Json $result } else { $result }
    }
    'prune' {
        Invoke-Prune
    }
    'status' {
        $result = Get-BackupStatus
        if ($Json) { Write-Json $result } else { $result }
    }
    'health-check' {
        $result = Invoke-HealthCheck
        if ($Json) { Write-Json $result } else { $result }
    }
    'restore-preview' {
        $result = Get-RestorePreview -SnapshotValue $Snapshot
        $result.previewText = Format-RestorePreviewText -Preview $result
        if ($Json) { Write-Json $result } else { $result.previewText }
    }
    'restore' {
        $result = Invoke-Restore
        if ($Json) { Write-Json $result } else { $result }
    }
    'install-schedule' {
        $result = Install-DailySchedule
        if ($Json) { Write-Json $result } else { $result }
    }
    'uninstall-schedule' {
        $result = Uninstall-DailySchedule
        if ($Json) { Write-Json $result } else { $result }
    }
    'self-test' {
        $result = Invoke-SelfTest
        if ($Json) { Write-Json $result } else { $result }
    }
    default {
        throw "Unsupported command: $Command"
    }
}
