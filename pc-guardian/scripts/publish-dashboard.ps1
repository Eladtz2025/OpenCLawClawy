$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$PublishedDir = Join-Path $ProjectRoot 'dashboard\published'
New-Item -ItemType Directory -Force -Path $PublishedDir | Out-Null
Copy-Item .\dashboard\index.html (Join-Path $PublishedDir 'index.html') -Force
Copy-Item .\dashboard\data.json (Join-Path $PublishedDir 'data.json') -Force

$RepoRoot = (git rev-parse --show-toplevel).Trim()
$DocsRoot = Join-Path $RepoRoot 'docs\pc-guardian'
New-Item -ItemType Directory -Force -Path $DocsRoot | Out-Null
Copy-Item .\dashboard\index.html (Join-Path $DocsRoot 'index.html') -Force
Copy-Item .\dashboard\data.json (Join-Path $DocsRoot 'data.json') -Force

$SiteRoot = Join-Path $RepoRoot 'pc-guardian'
New-Item -ItemType Directory -Force -Path $SiteRoot | Out-Null
Copy-Item .\dashboard\index.html (Join-Path $SiteRoot 'index.html') -Force
Copy-Item .\dashboard\data.json (Join-Path $SiteRoot 'data.json') -Force

Write-Output "Published dashboard to $PublishedDir, $DocsRoot and $SiteRoot"