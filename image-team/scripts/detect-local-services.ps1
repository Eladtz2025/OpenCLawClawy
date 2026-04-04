$ports = @(7860,8188,9090)
$results = @()
foreach($port in $ports){
  try {
    $resp = Invoke-WebRequest -Uri ("http://127.0.0.1:{0}" -f $port) -UseBasicParsing -TimeoutSec 2
    $results += [ordered]@{ port=$port; status=$resp.StatusCode; ok=$true; title=($resp.Content.Substring(0,[Math]::Min(120,$resp.Content.Length))) }
  } catch {
    $results += [ordered]@{ port=$port; status=$null; ok=$false; title=$_.Exception.Message }
  }
}
$results | ConvertTo-Json -Depth 5
