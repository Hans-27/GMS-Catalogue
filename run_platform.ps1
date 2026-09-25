[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$ApiPort = 8001,

    [string]$ApiHost = "0.0.0.0",

    [ValidateRange(1, 65535)]
    [int]$FrontendPort = 3000,

    [AllowNull()][AllowEmptyString()]
    [string]$PublicAppUrl,

    [switch]$Development = $true,

    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDirectory = Join-Path $projectRoot "backend"
$frontendDirectory = Join-Path $projectRoot "frontend"
$pythonPath = Join-Path $backendDirectory ".venv\Scripts\python.exe"
$requirementsPath = Join-Path $backendDirectory "requirements.txt"
$nodeModulesPath = Join-Path $frontendDirectory "node_modules"
$runtimeDirectory = Join-Path $projectRoot ".local"
$environmentFile = Join-Path $backendDirectory ".env"
$networkHelperPath = Join-Path $projectRoot "scripts\catalogue-network.ps1"
$apiUrl = "http://127.0.0.1:$ApiPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"

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

function Test-PlatformUrl {
    param([Parameter(Mandatory)][string]$Url)

    try {
        $response = Invoke-WebRequest `
            -UseBasicParsing `
            -Uri $Url `
            -TimeoutSec 3
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Wait-ForPlatformUrl {
    param(
        [Parameter(Mandatory)][string]$Url,
        [Parameter(Mandatory)][string]$ServiceName
    )

    foreach ($attempt in 1..30) {
        if (Test-PlatformUrl -Url $Url) {
            return
        }
        Start-Sleep -Milliseconds 500
    }
    throw "$ServiceName did not become ready. Check the log files in $runtimeDirectory."
}

New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $pythonPath)) {
    Write-Host "Creating the backend environment..." -ForegroundColor Cyan
    & python -m venv (Join-Path $backendDirectory ".venv")
}

& $pythonPath -c "import fastapi, sqlalchemy, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
    & $pythonPath -m pip install -r $requirementsPath
}

$apiHealthUrl = "$apiUrl/api/health"
if (-not (Test-PlatformUrl -Url $apiHealthUrl)) {
    $apiListener = Get-NetTCPConnection `
        -State Listen `
        -LocalPort $ApiPort `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($apiListener) {
        throw "Port $ApiPort is occupied by process $($apiListener.OwningProcess), but the catalogue API is not responding."
    }

    Write-Host "Starting the catalogue database API..." -ForegroundColor Cyan
    $apiArguments = @(
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        $ApiHost,
        "--port",
        $ApiPort.ToString()
    )
    if ($Development) { $apiArguments += "--reload" }
    Start-Process `
        -FilePath $pythonPath `
        -ArgumentList $apiArguments `
        -WorkingDirectory $backendDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $runtimeDirectory "api.log") `
        -RedirectStandardError (Join-Path $runtimeDirectory "api-error.log")
    Wait-ForPlatformUrl -Url $apiHealthUrl -ServiceName "Catalogue API"
}
else {
    Write-Warning "The existing API process is being reused and cannot receive new environment values. Stop and relaunch it after the computer's LAN address changes."
}

if (-not (Test-Path -LiteralPath $nodeModulesPath)) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    & npm.cmd install --prefix $frontendDirectory
}

# FastAPI owns the ERP synchronization and catalogue export workers through its
# lifespan. Starting additional processes here duplicates polling and can leave
# stale workers behind after a restart.
Write-Host "ERP synchronization and catalogue exports are managed by the API." -ForegroundColor DarkGray

$loginUrl = "$frontendUrl/login"
if (-not (Test-PlatformUrl -Url $loginUrl)) {
    $frontendListener = Get-NetTCPConnection `
        -State Listen `
        -LocalPort $FrontendPort `
        -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($frontendListener) {
        throw "Port $FrontendPort is occupied by process $($frontendListener.OwningProcess), but the catalogue frontend is not responding."
    }

    $frontendScript = if ($Development) { "dev" } else { "start" }
    $frontendMode = if ($Development) { "development" } else { "production" }
    if (-not $Development) {
        Write-Host "Building the optimized catalogue frontend..." -ForegroundColor Cyan
        & npm.cmd run build --prefix $frontendDirectory
        if ($LASTEXITCODE -ne 0) {
            throw "The optimized catalogue frontend build failed."
        }
    }

    Write-Host "Starting the catalogue frontend in $frontendMode mode..." -ForegroundColor Cyan
    $frontendArguments = @("run", $frontendScript)
    if ($FrontendPort -ne 3000) {
        $frontendArguments += @("--", "-H", "0.0.0.0", "-p", $FrontendPort.ToString())
    }
    Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList $frontendArguments `
        -WorkingDirectory $frontendDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $runtimeDirectory "frontend.log") `
        -RedirectStandardError (Join-Path $runtimeDirectory "frontend-error.log")
    Wait-ForPlatformUrl -Url $loginUrl -ServiceName "Catalogue frontend"
}

Write-Host ""
Write-Host "GMS Catalogue is ready." -ForegroundColor Green
if ($networkRuntime.LanAddress) {
    Write-Host "LAN address:      $($networkRuntime.LanAddress)"
}
Write-Host "Catalogue origin: $($networkRuntime.PublicAppUrl)"
Write-Host "Management:       $loginUrl"
Write-Host "API:              $apiHealthUrl"
Write-Host "Database:         connected"
Write-Host "Frontend:         $(if ($Development) { 'development server' } else { 'optimized production server' })"
Write-Host "ERP sync:         API-managed worker (every 180 seconds)"
Write-Host "Exports:          API-managed Catalogue Studio worker"

if (-not $NoBrowser) {
    try {
        Start-Process $loginUrl -ErrorAction Stop
    }
    catch {
        Write-Warning "The browser could not be opened automatically. Open $loginUrl manually."
    }
}
