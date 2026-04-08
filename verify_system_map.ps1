$files = @(
  'C:\Users\Itzhak\.openclaw\workspace\system-map\SYSTEM_MAP.md',
  'C:\Users\Itzhak\.openclaw\workspace\system-map\systems.json',
  'C:\Users\Itzhak\.openclaw\workspace\system-map\dashboard-data.json'
)
$results = foreach ($f in $files) {
  if (Test-Path $f) {
    Get-Item $f | Select-Object FullName, Length, LastWriteTime
  }
  else {
    [pscustomobject]@{
      FullName = $f
      Length = $null
      LastWriteTime = $null
      Missing = $true
    }
  }
}
$results | ConvertTo-Json -Depth 4
