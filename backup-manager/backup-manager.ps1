[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backup', 'list', 'restore', 'prune', 'status', 'install-schedule', 'uninstall-schedule', 'self-test')]
    [string]$Command,

    [string]$Root = "$env:USERPROFILE\.openclaw",
    [string]$BackupDir = "$env:USERPROFILE\OpenClawBackups",
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
    $Value | ConvertTo-Json -Depth 20
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

function Get-ScheduleMetadataPath {
    return Join-Path $PSScriptRoot 'schedule.json'
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

function Get-Snapshots {
    Ensure-Directory $BackupDir

    $archives = Get-ChildItem -LiteralPath $BackupDir -File -Filter '*-openclaw-backup.tar.gz' |
        Sort-Object LastWriteTimeUtc -Descending

    $result = foreach ($archive in $archives) {
        $metadataPath = Get-MetadataPath $archive.FullName
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

function Get-BackupStatus {
    $snapshots = @(Get-Snapshots)
    $latest = $snapshots | Select-Object -First 1
    $scheduleMetadata = $null
    $scheduleMetadataPath = Get-ScheduleMetadataPath
    if (Test-Path -LiteralPath $scheduleMetadataPath) {
        try {
            $scheduleMetadata = Get-Content -LiteralPath $scheduleMetadataPath -Raw | ConvertFrom-Json
        }
        catch {
            $scheduleMetadata = $null
        }
    }

    $taskInfo = $null
    try {
        $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $taskInfo = [pscustomobject]@{
            taskName = $task.TaskName
            state = [string]$task.State
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
    catch {
        $taskInfo = $null
    }

    return [pscustomobject]@{
        Root = $Root
        BackupDir = $BackupDir
        Keep = $Keep
        SnapshotCount = $snapshots.Count
        Latest = $latest
        Snapshots = $snapshots
        Schedule = $taskInfo
        ScheduleMetadata = $scheduleMetadata
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
    Ensure-Directory $BackupDir

    $snapshotId = Get-TimestampUtc
    $archivePath = Join-Path $BackupDir ("$snapshotId-openclaw-backup.tar.gz")

    $args = @('backup', 'create', '--output', $archivePath, '--json')
    if ($Verify) {
        $args += '--verify'
    }

    $jsonRaw = & openclaw @args
    if ($LASTEXITCODE -ne 0) {
        throw "openclaw backup create failed with exit code $LASTEXITCODE"
    }

    $backupResult = $jsonRaw | ConvertFrom-Json
    $cliVersion = (& openclaw --version | Select-Object -First 1)
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

    $metadata = [pscustomobject]@{
        snapshotId = $snapshotId
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        archivePath = $backupResult.archivePath
        archiveRoot = $backupResult.archiveRoot
        verified = $verified
        includeWorkspace = [bool]$backupResult.includeWorkspace
        onlyConfig = [bool]$backupResult.onlyConfig
        root = $Root
        backupDir = $BackupDir
        keep = $Keep
        host = $env:COMPUTERNAME
        openclawVersion = $cliVersion
        assets = $backupResult.assets
        skipped = $backupResult.skipped
        verify = $verifyResult
    }

    $metadataPath = Get-MetadataPath $backupResult.archivePath
    $metadata | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

    $pruneResult = Invoke-Prune -PassThru

    return [pscustomobject]@{
        backup = $backupResult
        verify = $verifyResult
        metadataPath = $metadataPath
        prune = $pruneResult
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
        $destination = Join-Path $Root $item
        $existsInArchive = Test-Path -LiteralPath $source
        $existsOnDisk = Test-Path -LiteralPath $destination
        $entry = [pscustomobject]@{
            item = $item
            source = $source
            destination = $destination
            existsInArchive = $existsInArchive
            existsOnDisk = $existsOnDisk
            action = if ($existsInArchive) { 'restore' } elseif ($existsOnDisk) { 'remove' } else { 'skip' }
        }
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

function Invoke-Restore {
    if (-not $Force) {
        throw 'Restore requires -Force to avoid accidental overwrite.'
    }

    $target = Resolve-Snapshot $Snapshot
    Assert-OpenClawCli | Out-Null

    $restoreRoot = Join-Path $env:TEMP ("openclaw-restore-$([guid]::NewGuid().ToString('N'))")
    Ensure-Directory $restoreRoot

    try {
        tar -xzf $target.ArchivePath -C $restoreRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to extract archive: $($target.ArchivePath)"
        }

        $stateRoot = Get-ExtractedStateRoot $restoreRoot

        $preRestoreDir = Join-Path $BackupDir 'pre-restore'
        Ensure-Directory $preRestoreDir
        $preRestoreArchive = Join-Path $preRestoreDir ("$(Get-TimestampUtc)-pre-restore-openclaw-backup.tar.gz")
        $preJsonRaw = & openclaw backup create --output $preRestoreArchive --json
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create pre-restore backup. Exit code: $LASTEXITCODE"
        }
        $preBackup = $preJsonRaw | ConvertFrom-Json

        $plan = Invoke-SafeCopyRestore -StateRoot $stateRoot -Apply

        return [pscustomobject]@{
            restoredSnapshot = $target
            preRestoreBackup = $preBackup.archivePath
            root = $Root
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
    $target = Resolve-Snapshot $Snapshot
    $restoreRoot = Join-Path $env:TEMP ("openclaw-selftest-$([guid]::NewGuid().ToString('N'))")
    Ensure-Directory $restoreRoot

    try {
        tar -xzf $target.ArchivePath -C $restoreRoot
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to extract archive: $($target.ArchivePath)"
        }
        $stateRoot = Get-ExtractedStateRoot $restoreRoot
        $plan = Invoke-SafeCopyRestore -StateRoot $stateRoot
        return [pscustomobject]@{
            snapshot = $target
            extractedStateRoot = $stateRoot
            planCount = $plan.Count
            plan = $plan
        }
    }
    finally {
        if (Test-Path -LiteralPath $restoreRoot) {
            Remove-Item -LiteralPath $restoreRoot -Recurse -Force
        }
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
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null

    $metadata = [pscustomobject]@{
        taskName = $TaskName
        dailyAt = $DailyAt
        scriptPath = $scriptPath
        installedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        backupDir = $BackupDir
        keep = $Keep
    }
    $metadata | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Get-ScheduleMetadataPath) -Encoding UTF8

    return [pscustomobject]@{
        taskName = $TaskName
        dailyAt = $DailyAt
        scriptPath = $scriptPath
        backupDir = $BackupDir
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
