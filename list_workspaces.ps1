$roots = @(
  'C:\Users\Itzhak\.openclaw\workspace',
  'C:\Users\Openclaw\.openclaw\workspace'
)
$exclude = @('.git','.clawhub','.openclaw','memory','state','skills','output','.trash')
$result = foreach ($root in $roots) {
  Get-ChildItem -LiteralPath $root -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $exclude -notcontains $_.Name } |
    Select-Object @{Name='Root';Expression={$root}}, FullName, Name, LastWriteTime
}
$result | Sort-Object Root, Name | ConvertTo-Json -Depth 4
