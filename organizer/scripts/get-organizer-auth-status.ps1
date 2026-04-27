$ErrorActionPreference = 'Stop'

$photosToken = 'C:\Users\Itzhak\.openclaw\workspace\token_photos.pickle'
$gmailAppData = 'C:\Users\Itzhak\AppData\Roaming\google-workspace-mcp'
$gmailLogsDir = 'C:\Users\Itzhak\AppData\Roaming\google-workspace-mcp\logs'

$gmailAppDataExists = Test-Path $gmailAppData
$gmailLogsExists = Test-Path $gmailLogsDir
$gmailLogsLastWriteUtc = $null
if ($gmailLogsExists) {
    $gmailLogsLastWriteUtc = (Get-Item $gmailLogsDir).LastWriteTimeUtc.ToString('s')
}

$result = [pscustomobject]@{
    generatedAt = (Get-Date).ToString('s')
    gmail = [pscustomobject]@{
        appDataExists = $gmailAppDataExists
        logsDirExists = $gmailLogsExists
        logsLastWriteUtc = $gmailLogsLastWriteUtc
    }
    photos = [pscustomobject]@{
        tokenExists = (Test-Path $photosToken)
        tokenPath = $photosToken
    }
}

$result | ConvertTo-Json -Depth 5
