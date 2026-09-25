[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8001,

    [string]$ListenAddress = "127.0.0.1",

    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3000,

    [AllowNull()][AllowEmptyString()]
    [string]$PublicAppUrl,

    [switch]$NoReload
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDirectory = Join-Path $projectRoot "backend"
$virtualEnvironmentPython = Join-Path $backendDirectory ".venv\Scripts\python.exe"
$requirementsFile = Join-Path $backendDirectory "requirements.txt"
$environmentFile = Join-Path $backendDirectory ".env"
$networkHelperPath = Join-Path $projectRoot "scripts\catalogue-network.ps1"

if (-not (Test-Path -LiteralPath $backendDirectory)) {
    throw "Backend directory not found: $backendDirectory"
}
if (-not (Test-Path -LiteralPath $networkHelperPath)) {
    throw "Catalogue network helper not found: $networkHelperPath"
}

. $networkHelperPath
$networkRuntime = Resolve-CatalogueNetworkRuntime `
    -FrontendPort $FrontendPort `
    -PublicAppUrl $PublicAppUrl `
    -EnvironmentFile $environmentFile
$env:PUBLIC_APP_URL = $networkRuntime.PublicAppUrl
$env:CORS_ORIGINS = $networkRuntime.CorsOrigins

if ($networkRuntime.Warning) {
    Write-Warning $networkRuntime.Warning
}

$existingListener = Get-NetTCPConnection `
    -State Listen `
    -LocalPort $Port `
    -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($existingListener) {
    Write-Host "The API is already listening on port $Port." -ForegroundColor Yellow
    Write-Warning "An existing API process cannot receive the resolved catalogue origin. Stop and relaunch it after the computer's LAN address changes."
    Write-Host "Requested catalogue origin: $($networkRuntime.PublicAppUrl)"
    Write-Host "API documentation: http://127.0.0.1:$Port/docs"
    exit 0
}

if (-not (Test-Path -LiteralPath $virtualEnvironmentPython)) {
    Write-Host "Creating the Python virtual environment..." -ForegroundColor Cyan
    & python -m venv (Join-Path $backendDirectory ".venv")
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create the Python virtual environment."
    }
}

Write-Host "Checking API dependencies..." -ForegroundColor Cyan
& $virtualEnvironmentPython -c "import fastapi, sqlalchemy, psycopg, uvicorn" 2>$null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing API dependencies..." -ForegroundColor Cyan
    & $virtualEnvironmentPython -m pip install -r $requirementsFile
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency installation failed."
    }
}

if (-not (Test-Path -LiteralPath $environmentFile)) {
    $localDataDirectory = Join-Path $backendDirectory ".local"
    New-Item -ItemType Directory -Path $localDataDirectory -Force | Out-Null

    $env:DATABASE_URL = "sqlite+pysqlite:///./.local/catalogue_demo.db"
    $env:SECRET_KEY = "local-development-$([guid]::NewGuid().ToString('N'))"
    $env:AUTO_CREATE_TABLES = "true"

    Write-Warning "backend/.env was not found. Using the local demo database."
}

$uvicornArguments = @(
    "-m",
    "uvicorn",
    "app.main:app",
    "--host",
    $ListenAddress,
    "--port",
    $Port.ToString()
)

if (-not $NoReload) {
    $uvicornArguments += "--reload"
}

Write-Host ""
Write-Host "Starting GMS Catalogue API..." -ForegroundColor Green
if ($networkRuntime.LanAddress) {
    Write-Host "LAN address:      $($networkRuntime.LanAddress)"
}
Write-Host "Catalogue origin: $($networkRuntime.PublicAppUrl)"
Write-Host "Frontend:         $($networkRuntime.PublicAppUrl)"
Write-Host "API:              http://127.0.0.1:$Port/api/health"
Write-Host "Docs:             http://127.0.0.1:$Port/docs"
Write-Host "Press Ctrl+C to stop the API."
Write-Host ""

Push-Location $backendDirectory
try {
    & $virtualEnvironmentPython @uvicornArguments
}
finally {
    Pop-Location
}
