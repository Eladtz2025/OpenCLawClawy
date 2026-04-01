[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('backup', 'list', 'restore', 'prune', 'status')]
    [string]$Command,

    [string]$Root = "$env:USERPROFILE\.openclaw",
    [string]$BackupDir = "$env:USERPROFILE\OpenClawBackups",
    [int]$Keep = 3,
    [string]$Snapshot,
    [switch]$Verify,
    [switch]$Force,
    [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Write-Json([object]$Value) {
    $Value | ConvertTo-Json -Depth 10
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

function Get-BackupStatus {
    $snapshots = @(Get-Snapshots)
    $latest = $snapshots | Select-Object -First 1

    return [pscustomobject]@{
        Root = $Root
        BackupDir = $BackupDir
        Keep = $Keep
        SnapshotCount = @($snapshots).Count
        Latest = $latest
        Snapshots = $snapshots
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

    $metadata = [pscustomobject]@{
        snapshotId = $snapshotId
        createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        archivePath = $backupResult.archivePath
        archiveRoot = $backupResult.archiveRoot
        verified = [bool]$backupResult.verified
        includeWorkspace = [bool]$backupResult.includeWorkspace
        onlyConfig = [bool]$backupResult.onlyConfig
        root = $Root
        backupDir = $BackupDir
        keep = $Keep
        host = $env:COMPUTERNAME
        openclawVersion = $cliVersion
        assets = $backupResult.assets
        skipped = $backupResult.skipped
    }

    $metadataPath = Get-MetadataPath $backupResult.archivePath
    $metadata | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $metadataPath -Encoding UTF8

    $pruneResult = Invoke-Prune -PassThru

    return [pscustomobject]@{
        backup = $backupResult
        metadataPath = $metadataPath
        prune = $pruneResult
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

function Resolve-Snapshot {
    param([string]$Value)

    $snapshots = @(Get-Snapshots)
    if (-not @($snapshots).Count) {
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

function Invoke-Restore {
    if (-not $Force) {
        throw 'Restore requires -Force to avoid accidental overwrite.'
    }

    $target = Resolve-Snapshot $Snapshot
    Assert-OpenClawCli | Out-Null

    $restoreRoot = Join-Path $Root '_restore-staging'
    if (Test-Path -LiteralPath $restoreRoot) {
        Remove-Item -LiteralPath $restoreRoot -Recurse -Force
    }
    Ensure-Directory $restoreRoot

    $tarRoot = Join-Path $restoreRoot 'archive'
    Ensure-Directory $tarRoot

    tar -xzf $target.ArchivePath -C $tarRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to extract archive: $($target.ArchivePath)"
    }

    $payloadRoot = Get-ChildItem -LiteralPath $tarRoot -Directory | Select-Object -First 1
    if (-not $payloadRoot) {
        throw 'Extracted archive root not found.'
    }

    $stateRoot = Join-Path $payloadRoot.FullName 'payload\windows\C\Users\Itzhak\.openclaw'
    if (-not (Test-Path -LiteralPath $stateRoot)) {
        throw "Expected state root not found in archive: $stateRoot"
    }

    $preRestoreDir = Join-Path $BackupDir 'pre-restore'
    Ensure-Directory $preRestoreDir
    $preRestoreArchive = Join-Path $preRestoreDir ("$(Get-TimestampUtc)-pre-restore-openclaw-backup.tar.gz")
    $preArgs = @('backup', 'create', '--output', $preRestoreArchive, '--json')
    $preJsonRaw = & openclaw @preArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to create pre-restore backup. Exit code: $LASTEXITCODE"
    }
    $preBackup = $preJsonRaw | ConvertFrom-Json

    $items = @(
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

    foreach ($item in $items) {
        $destination = Join-Path $Root $item
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        $source = Join-Path $stateRoot $item
        if (Test-Path -LiteralPath $source) {
            Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
        }
    }

    Remove-Item -LiteralPath $restoreRoot -Recurse -Force

    return [pscustomobject]@{
        restoredSnapshot = $target
        preRestoreBackup = $preBackup.archivePath
        root = $Root
    }
}

switch ($Command) {
    'backup' {
        $result = Invoke-Backup
        if ($Json) { Write-Json $result } else { $result }
    }
    'list' {
        $result = Get-Snapshots
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
    default {
        throw "Unsupported command: $Command"
    }
}
