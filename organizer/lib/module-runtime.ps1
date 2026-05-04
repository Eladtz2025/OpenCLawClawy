# Shared helpers for Organizer V2 modules.
# Dot-source from a module script:
#   . "$PSScriptRoot\..\..\lib\module-runtime.ps1"

$WorkspaceRoot = 'C:\Users\Itzhak\.openclaw\workspace'
$OrganizerRoot = Join-Path $WorkspaceRoot 'organizer'

function Get-ModulePaths([string]$Name) {
    $base    = Join-Path (Join-Path $OrganizerRoot 'modules') $Name
    $reports = Join-Path $base 'reports'
    $logs    = Join-Path $base 'logs'
    if (-not (Test-Path $reports)) { New-Item -ItemType Directory -Force -Path $reports | Out-Null }
    if (-not (Test-Path $logs))    { New-Item -ItemType Directory -Force -Path $logs    | Out-Null }
    return [pscustomobject]@{
        base    = $base
        reports = $reports
        logs    = $logs
        state   = Join-Path $base 'state.json'
        scanJson    = Join-Path $reports 'scan-summary.json'
        scanReport  = Join-Path $reports 'scan-report.md'
        planJson    = Join-Path $reports 'plan.json'
        planReport  = Join-Path $reports 'plan.md'
        approvalJson   = Join-Path $reports 'approval-package.json'
        approvalReport = Join-Path $reports 'approval-package.md'
        applyJson   = Join-Path $reports 'apply-log.json'
        applyReport = Join-Path $reports 'apply-log.md'
        log         = Join-Path $logs 'module.log'
    }
}

function Save-Json([string]$Path, $Obj) {
    $Obj | ConvertTo-Json -Depth 30 | Set-Content -Path $Path -Encoding UTF8
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    return (Get-Content $Path -Raw | ConvertFrom-Json)
}

function Append-Log([string]$Path, [string]$Line) {
    $stamp = (Get-Date).ToUniversalTime().ToString('o')
    Add-Content -Path $Path -Value "$stamp $Line" -Encoding UTF8
}

function Format-Bytes([long]$Bytes) {
    if ($Bytes -ge 1TB) { return ('{0:N2} TB' -f ($Bytes / 1TB)) }
    if ($Bytes -ge 1GB) { return ('{0:N2} GB' -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ('{0:N2} MB' -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ('{0:N2} KB' -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

function New-ModuleState() {
    return [ordered]@{
        lastScanAt        = $null
        lastScanItems     = 0
        lastPlanAt        = $null
        lastPlanItems     = 0
        lastApprovalAt    = $null
        lastApprovalSha   = $null
        lastApplyAt       = $null
        lastApplyDryRun   = $true
        lastApplyResult   = $null
    }
}

function Update-ModuleState([string]$Path, [hashtable]$Patch) {
    # Always rebuild from a clean stub; only allow known keys to survive.
    $stub = New-ModuleState
    $obj = [ordered]@{}
    foreach ($k in $stub.Keys) { $obj[$k] = $stub[$k] }
    $current = Read-JsonFile $Path
    if ($current) {
        foreach ($prop in $current.PSObject.Properties) {
            if ($obj.Contains($prop.Name)) { $obj[$prop.Name] = $prop.Value }
        }
    }
    foreach ($k in $Patch.Keys) { $obj[$k] = $Patch[$k] }
    Save-Json $Path ([pscustomobject]$obj)
}

function Get-ContentSha1([string]$Path) {
    try {
        $h = Get-FileHash -Algorithm SHA1 -Path $Path -ErrorAction Stop
        return $h.Hash
    } catch {
        return $null
    }
}

function Test-PathInsideRecycleBin([string]$Path) {
    return ($Path -match '\\[$]Recycle\.Bin\\')
}
