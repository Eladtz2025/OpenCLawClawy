$value = $null
try {
  $reg = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -ErrorAction Stop
  $value = [int]$reg.LongPathsEnabled
} catch {
  $value = $null
}

$result = [ordered]@{
  longPathsEnabled = $value
  risk = if($value -eq 1){ 'LOW' } elseif($value -eq 0){ 'HIGH' } else { 'UNKNOWN' }
  notes = @()
}

if($value -eq 0){
  $result.notes += 'Windows LongPathsEnabled is disabled; this may break deep repo installs or model/tool setup.'
} elseif($value -eq 1){
  $result.notes += 'Windows long paths support is enabled.'
} else {
  $result.notes += 'Could not determine LongPathsEnabled.'
}

$result | ConvertTo-Json -Depth 5
