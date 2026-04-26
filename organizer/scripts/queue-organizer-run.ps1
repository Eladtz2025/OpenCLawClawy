$ErrorActionPreference = 'Stop'

$queuePath = 'C:\Users\Itzhak\.openclaw\workspace\organizer\state\run-queue.json'
$continuationPath = 'C:\Users\Itzhak\.openclaw\workspace\organizer\state\continuation-state.json'

$queue = Get-Content $queuePath -Raw | ConvertFrom-Json
$continuation = Get-Content $continuationPath -Raw | ConvertFrom-Json

$runId = [guid]::NewGuid().ToString()
$run = [pscustomobject]@{
    id = $runId
    createdAt = (Get-Date).ToString('s')
    status = 'queued'
    goal = 'Organizer V2 run-to-completion'
    phases = @('computer','gmail','photos','finalize')
}

$pending = @()
if ($queue.pendingRuns) { $pending += $queue.pendingRuns }
$pending += $run
$queue.pendingRuns = $pending

if (-not $queue.activeRun) {
    $queue.activeRun = $run
    $queue.pendingRuns = @($queue.pendingRuns | Where-Object { $_.id -ne $runId })
    $continuation.currentRunId = $runId
    $continuation.currentPhase = 'computer'
}

$queue | ConvertTo-Json -Depth 10 | Set-Content -Path $queuePath -Encoding UTF8
$continuation.lastTickAt = (Get-Date).ToString('s')
$continuation | ConvertTo-Json -Depth 10 | Set-Content -Path $continuationPath -Encoding UTF8

Write-Output $runId
