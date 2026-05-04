#requires -Version 5.1
<#
.SYNOPSIS
  Manage the OpenClaw Control Dashboard remote-access token.

.DESCRIPTION
  Generates / rotates / shows / removes the bearer token used by the
  Tailscale-only remote listener. The token is stored at
  $env:USERPROFILE\.openclaw\dashboard-remote.token with an ACL that grants
  read access to the current user only.

  The dashboard reads this file on every request, so rotation takes effect
  immediately - no restart needed.

.PARAMETER Rotate
  Generates a NEW token (replaces any existing one). Old token stops working
  on the next request.

.PARAMETER Show
  Prints the current token to stdout. Use sparingly; pipe into clip when needed.

.PARAMETER Disable
  Removes the token file. The remote listener will refuse to start (or stop
  accepting requests after the next process restart). Local 127.0.0.1:7777
  is unaffected.

.EXAMPLE
  .\remote-token-setup.ps1                     # create token if missing
  .\remote-token-setup.ps1 -Rotate             # generate a new token
  .\remote-token-setup.ps1 -Show               # print current token
  .\remote-token-setup.ps1 -Show | Set-Clipboard
  .\remote-token-setup.ps1 -Disable            # delete the token file
#>

[CmdletBinding(DefaultParameterSetName = 'Default')]
param(
  [Parameter(ParameterSetName = 'Rotate')]  [switch] $Rotate,
  [Parameter(ParameterSetName = 'Show')]    [switch] $Show,
  [Parameter(ParameterSetName = 'Disable')] [switch] $Disable
)

$ErrorActionPreference = 'Stop'

$ConfigDir  = Join-Path $env:USERPROFILE '.openclaw'
$TokenPath  = Join-Path $ConfigDir 'dashboard-remote.token'

function New-Token {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

function Lock-File([string] $Path) {
  # Strip inheritance, grant the current user FullControl, drop everyone else.
  try {
    $acl = Get-Acl $Path
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRule($rule) }
    $user = "$env:USERDOMAIN\$env:USERNAME"
    if ([string]::IsNullOrWhiteSpace($env:USERDOMAIN)) { $user = $env:USERNAME }
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $user, 'FullControl', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -Path $Path -AclObject $acl
  } catch {
    Write-Warning "Could not tighten ACL on ${Path}: $($_.Exception.Message)"
  }
}

function Read-Token([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $raw = (Get-Content -LiteralPath $Path -Raw).Trim()
  if ($raw.StartsWith('{')) {
    try {
      $j = $raw | ConvertFrom-Json
      if ($j.token) { return [string]$j.token }
    } catch {}
  }
  return ($raw -split '\s+')[0]
}

function Write-TokenFile([string] $Path, [string] $Token, [string] $Mode) {
  $existed = Test-Path -LiteralPath $Path
  $createdAt = $null
  if ($existed) {
    try {
      $old = Get-Content -LiteralPath $Path -Raw
      if ($old.Trim().StartsWith('{')) {
        $oj = $old | ConvertFrom-Json
        if ($oj.createdAt) { $createdAt = [string]$oj.createdAt }
      }
    } catch {}
  }
  if (-not $createdAt) { $createdAt = (Get-Date).ToUniversalTime().ToString('o') }
  $payload = [pscustomobject]@{
    token     = $Token
    createdAt = $createdAt
    rotatedAt = (Get-Date).ToUniversalTime().ToString('o')
    note      = 'OpenClaw dashboard remote-access bearer token. Tailscale-only.'
  } | ConvertTo-Json -Depth 4
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  Set-Content -LiteralPath $Path -Value $payload -Encoding utf8 -NoNewline
  Lock-File $Path
  Write-Host "Token $Mode at $Path"
}

# ---- Disable --------------------------------------------------------
if ($Disable) {
  if (Test-Path -LiteralPath $TokenPath) {
    Remove-Item -LiteralPath $TokenPath -Force
    Write-Host "Token removed. Remote access disabled (local 127.0.0.1 unaffected)."
  } else {
    Write-Host "No token file found at $TokenPath. Already disabled."
  }
  return
}

# ---- Show -----------------------------------------------------------
if ($Show) {
  $tok = Read-Token $TokenPath
  if (-not $tok) {
    Write-Error "No token configured. Run this script with no flags to create one, or with -Rotate."
  }
  # Print only the token, no trailing newline, so it pipes cleanly to Set-Clipboard.
  [Console]::Out.Write($tok)
  return
}

# ---- Rotate ---------------------------------------------------------
if ($Rotate) {
  $tok = New-Token
  Write-TokenFile -Path $TokenPath -Token $tok -Mode 'rotated'
  Write-Host ""
  Write-Host "New token (copy now - it will not be shown again unless you use -Show):"
  Write-Host $tok
  return
}

# ---- Default: create if missing -------------------------------------
if (Test-Path -LiteralPath $TokenPath) {
  $existing = Read-Token $TokenPath
  if ($existing) {
    Write-Host "Token already exists at $TokenPath"
    Write-Host "Use -Show to print it, -Rotate to replace it, or -Disable to remove it."
    return
  }
}

$tok = New-Token
Write-TokenFile -Path $TokenPath -Token $tok -Mode 'created'
Write-Host ""
Write-Host "Token (copy now - store it in your phone browser bookmark):"
Write-Host $tok
