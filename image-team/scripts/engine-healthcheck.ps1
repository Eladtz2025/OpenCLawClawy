param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$services = Get-Content (Join-Path $JobDir 'local-services.json') -Raw | ConvertFrom-Json
$healthy = $services | Where-Object { $_.ok }
$result = [ordered]@{
  anyServiceUp = (@($healthy).Count -gt 0)
  livePorts = @($healthy | ForEach-Object { $_.port })
  notes = @()
}
if($result.anyServiceUp){
  $result.notes += 'At least one local image service port is responding.'
} else {
  $result.notes += 'No local image service is currently responding.'
}
$result | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $JobDir 'healthcheck.json') -Encoding UTF8
Get-Content (Join-Path $JobDir 'healthcheck.json') -Raw
