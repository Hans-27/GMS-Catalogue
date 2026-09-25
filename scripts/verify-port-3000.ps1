[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"
$baseUrl = "http://127.0.0.1:$FrontendPort"

$frontend = Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "$baseUrl/login" `
    -TimeoutSec 15
if ($frontend.StatusCode -ne 200) {
    throw "Frontend returned HTTP $($frontend.StatusCode) on port $FrontendPort."
}

$health = Invoke-RestMethod `
    -Uri "$baseUrl/api/health" `
    -Method Get `
    -TimeoutSec 15
if ($health.status -ne "ok" -or $health.database -ne "connected") {
    throw "The same-origin API proxy is not healthy on port $FrontendPort."
}

Write-Output "frontend_status=$($frontend.StatusCode)"
Write-Output "api_status=$($health.status) database_status=$($health.database)"
