[CmdletBinding()]
param(
    [string]$ApiUrl = "http://127.0.0.1:8001",
    [string]$PublicOrigin = "https://retiree-bobble-emerald.ngrok-free.dev",
    [string]$DisallowedOrigin = "https://fake.ngrok-free.dev.example.com"
)

$ErrorActionPreference = "Stop"

# Catches a public login origin being rejected by the CSRF/origin guard before validation.
$headers = @{
    Origin = $PublicOrigin
}
$null = Invoke-WebRequest -UseBasicParsing -Uri "$ApiUrl/api/health" -SessionVariable session -TimeoutSec 10
$session.Cookies.Add([System.Net.Cookie]::new("catalogue_session", "origin-probe", "/", "127.0.0.1"))

try {
    $response = Invoke-WebRequest `
        -UseBasicParsing `
        -Method Post `
        -Uri "$ApiUrl/api/auth/login" `
        -Headers $headers `
        -WebSession $session `
        -ContentType "application/json" `
        -Body "{}" `
        -TimeoutSec 10
    $status = $response.StatusCode
}
catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}

if ($status -ne 422) {
    throw "Allowed ngrok login origin should reach request validation (HTTP 422), but received HTTP $status."
}

$preflightHeaders = @{
    Origin = $PublicOrigin
    "Access-Control-Request-Method" = "POST"
    "Access-Control-Request-Headers" = "content-type"
}
$preflight = Invoke-WebRequest `
    -UseBasicParsing `
    -Method Options `
    -Uri "$ApiUrl/api/auth/login" `
    -Headers $preflightHeaders `
    -TimeoutSec 10

if ($preflight.StatusCode -ne 200 -or $preflight.Headers["access-control-allow-origin"] -ne $PublicOrigin) {
    throw "CORS preflight did not allow $PublicOrigin."
}

# Catches an unanchored regex that would trust an attacker-controlled suffix.
try {
    $null = Invoke-WebRequest `
        -UseBasicParsing `
        -Method Post `
        -Uri "$ApiUrl/api/auth/login" `
        -Headers @{ Origin = $DisallowedOrigin } `
        -WebSession $session `
        -ContentType "application/json" `
        -Body "{}" `
        -TimeoutSec 10
    $disallowedStatus = 200
}
catch {
    $disallowedStatus = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
}

if ($disallowedStatus -ne 403) {
    throw "Untrusted lookalike origin should be rejected (HTTP 403), but received HTTP $disallowedStatus."
}

Write-Output "ngrok_login_origin=allowed validation_status=$status preflight=$($preflight.StatusCode) lookalike_status=$disallowedStatus"
