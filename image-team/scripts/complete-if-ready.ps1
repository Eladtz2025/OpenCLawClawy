param(
  [Parameter(Mandatory=$true)][string]$JobDir
)

$ready = Get-Content (Join-Path $JobDir 'production-ready.json') -Raw | ConvertFrom-Json
if($ready.ready){
  'READY'
} else {
  'NOT_READY'
}
