[CmdletBinding()]
param(
    [string]$FrontendUrl = "http://127.0.0.1:3000",
    [string]$ApiUrl = ""
)

$ErrorActionPreference = "Stop"

# The production backend is intentionally private. By default, test it through
# the frontend's same-origin /api proxy; ApiUrl remains available for diagnostics.
if (-not $ApiUrl) {
    $ApiUrl = $FrontendUrl
}

# Catches a deployment that serves the app but leaves either the API or Next.js in development mode.
$health = Invoke-RestMethod -Uri "$ApiUrl/api/health" -TimeoutSec 10
if ($health.status -ne "ok" -or $health.database -ne "connected") {
    throw "The production API health check is not healthy."
}
if ($health.environment -ne "production") {
    throw "API environment expected 'production' but found '$($health.environment)'."
}

$login = Invoke-WebRequest -UseBasicParsing -Uri "$FrontendUrl/login" -TimeoutSec 15
if ($login.StatusCode -ne 200) {
    throw "Production frontend login returned HTTP $($login.StatusCode)."
}

try {
    $hmr = Invoke-WebRequest -UseBasicParsing -Uri "$FrontendUrl/_next/webpack-hmr" -TimeoutSec 10
    $hmrStatus = $hmr.StatusCode
}
catch {
    $hmrStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}
if ($hmrStatus -ne 404) {
    throw "Next.js development HMR endpoint should be absent in production; received HTTP $hmrStatus."
}

Write-Output "production_runtime=ok frontend=$($login.StatusCode) api=$($health.status) database=$($health.database) hmr=$hmrStatus"
