$t = 'C:\Users\Itzhak\.openclaw\workspace\SYSTEM_MAP_DATA'
New-Item -ItemType Directory -Path $t -Force | Out-Null
Get-ChildItem -Path 'C:\Users\Itzhak\.openclaw\cron','C:\Users\Openclaw\.openclaw\cron' -Recurse -Force -ErrorAction SilentlyContinue |
  Select-Object FullName,Name,PSIsContainer,Length,LastWriteTime |
  ConvertTo-Json -Depth 4 |
  Set-Content -Encoding UTF8 (Join-Path $t 'cron.json')
Get-ChildItem -Path 'C:\Users\Itzhak\.openclaw\workspace','C:\Users\Openclaw\.openclaw\workspace' -Force -ErrorAction SilentlyContinue |
  Select-Object FullName,Name,PSIsContainer,LastWriteTime |
  ConvertTo-Json -Depth 4 |
  Set-Content -Encoding UTF8 (Join-Path $t 'workspaces.json')
Get-ChildItem -Path 'C:\Users\Itzhak\.openclaw\logs','C:\Users\Openclaw\.openclaw\logs','C:\ProgramData\OpenClaw\logs' -Force -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending |
  Select-Object FullName,Length,LastWriteTime |
  ConvertTo-Json -Depth 4 |
  Set-Content -Encoding UTF8 (Join-Path $t 'logs.json')
Get-ChildItem -Path 'C:\Users\Itzhak\.openclaw\agents','C:\Users\Openclaw\.openclaw\agents' -Recurse -Force -ErrorAction SilentlyContinue |
  Select-Object FullName,Name,PSIsContainer,LastWriteTime |
  ConvertTo-Json -Depth 4 |
  Set-Content -Encoding UTF8 (Join-Path $t 'agents.json')
Get-ScheduledTask |
  Select-Object TaskName,TaskPath,State,Description,Actions,Triggers |
  ConvertTo-Json -Depth 6 |
  Set-Content -Encoding UTF8 (Join-Path $t 'scheduled_tasks.json')
Get-CimInstance Win32_Process |
  Select-Object ProcessId,Name,CommandLine |
  ConvertTo-Json -Depth 4 |
  Set-Content -Encoding UTF8 (Join-Path $t 'processes.json')
Get-NetTCPConnection -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess |
  Sort-Object LocalPort |
  ConvertTo-Json -Depth 4 |
  Set-Content -Encoding UTF8 (Join-Path $t 'ports.json')
