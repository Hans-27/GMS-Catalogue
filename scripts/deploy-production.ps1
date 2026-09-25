[CmdletBinding()]
param(
    [string]$EnvFile = "",
    [switch]$ValidateOnly,
    [switch]$ConfigurationOnly
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $repositoryRoot "docker-compose.production.yml"
if (-not $EnvFile) {
    $EnvFile = Join-Path $repositoryRoot ".env.production"
}
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Production environment file not found: $EnvFile. Copy .env.production.example to .env.production first."
}
$resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path

function Read-EnvironmentFile([string]$Path) {
    $values = @{}
    foreach ($rawLine in Get-Content -LiteralPath $Path) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#")) { continue }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            throw "Invalid environment entry in ${Path}: $rawLine"
        }
        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if (
            $value.Length -ge 2 -and
            (($value.StartsWith('"') -and $value.EndsWith('"')) -or
             ($value.StartsWith("'") -and $value.EndsWith("'")))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

$environment = Read-EnvironmentFile $resolvedEnvFile
$requiredKeys = @(
    "POSTGRES_PASSWORD",
    "SECRET_KEY",
    "PUBLIC_APP_URL",
    "NEXT_PUBLIC_API_URL",
    "CORS_ORIGINS"
)
foreach ($key in $requiredKeys) {
    if (-not $environment.ContainsKey($key) -or -not $environment[$key]) {
        throw "$key is required in $resolvedEnvFile."
    }
}

$placeholderPattern = "replace-with|change-me|example\.com"
foreach ($key in @("POSTGRES_PASSWORD", "SECRET_KEY", "PUBLIC_APP_URL", "CORS_ORIGINS")) {
    if ($environment[$key] -match $placeholderPattern) {
        throw "$key still contains a placeholder value."
    }
}
if ($environment["POSTGRES_PASSWORD"].Length -lt 24 -or $environment["POSTGRES_PASSWORD"] -notmatch '^[A-Za-z0-9_-]+$') {
    throw "POSTGRES_PASSWORD must contain at least 24 URL-safe characters (letters, digits, underscore or hyphen)."
}
if ($environment["SECRET_KEY"].Length -lt 32) {
    throw "SECRET_KEY must contain at least 32 characters."
}

$publicUri = $null
if (-not [Uri]::TryCreate($environment["PUBLIC_APP_URL"], [UriKind]::Absolute, [ref]$publicUri) -or $publicUri.Scheme -ne "https") {
    throw "PUBLIC_APP_URL must be an absolute HTTPS URL."
}
$publicOrigin = $publicUri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
$corsOrigins = @($environment["CORS_ORIGINS"].Split(",") | ForEach-Object { $_.Trim().TrimEnd("/") } | Where-Object { $_ })
if ($publicOrigin -notin $corsOrigins) {
    throw "CORS_ORIGINS must include the PUBLIC_APP_URL origin: $publicOrigin"
}
foreach ($origin in $corsOrigins) {
    $originUri = $null
    if (-not [Uri]::TryCreate($origin, [UriKind]::Absolute, [ref]$originUri) -or $originUri.Scheme -ne "https") {
        throw "Every CORS_ORIGINS entry must be an absolute HTTPS origin."
    }
}
if ($environment["NEXT_PUBLIC_API_URL"] -ne "/api") {
    throw "NEXT_PUBLIC_API_URL must be /api so browsers use the same-origin backend proxy."
}

$appPort = if ($environment.ContainsKey("APP_PORT") -and $environment["APP_PORT"]) { $environment["APP_PORT"] } else { "3000" }
$parsedPort = 0
if (-not [int]::TryParse($appPort, [ref]$parsedPort) -or $parsedPort -lt 1 -or $parsedPort -gt 65535) {
    throw "APP_PORT must be between 1 and 65535."
}

Write-Output "production_environment=valid public_origin=$publicOrigin app_port=$parsedPort"
if ($ConfigurationOnly) { exit 0 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker is not installed or is not available on PATH."
}
& docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Docker Compose is unavailable." }

$composeArguments = @("compose", "--env-file", $resolvedEnvFile, "-f", $composeFile)
& docker @composeArguments config --quiet
if ($LASTEXITCODE -ne 0) { throw "Docker Compose rejected the production configuration." }
Write-Output "production_compose=valid"
if ($ValidateOnly) { exit 0 }

& docker @composeArguments up -d --build --remove-orphans
if ($LASTEXITCODE -ne 0) { throw "Production containers did not start successfully." }

$bindAddress = if ($environment.ContainsKey("APP_BIND_ADDRESS") -and $environment["APP_BIND_ADDRESS"]) { $environment["APP_BIND_ADDRESS"] } else { "127.0.0.1" }
$healthHost = if ($bindAddress -eq "0.0.0.0") { "127.0.0.1" } else { $bindAddress }
$localOrigin = "http://${healthHost}:$parsedPort"
$lastError = $null
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $health = Invoke-RestMethod -Uri "$localOrigin/api/health" -TimeoutSec 5
        $login = Invoke-WebRequest -UseBasicParsing -Uri "$localOrigin/login" -TimeoutSec 5
        if ($health.status -eq "ok" -and $health.database -eq "connected" -and $health.environment -eq "production" -and $login.StatusCode -eq 200) {
            Write-Output "deployment=healthy frontend=$($login.StatusCode) api=$($health.status) database=$($health.database)"
            & docker @composeArguments ps
            exit 0
        }
    }
    catch {
        $lastError = $_.Exception.Message
    }
    Start-Sleep -Seconds 4
}

& docker @composeArguments ps
throw "Deployment started but did not become healthy at $localOrigin within 120 seconds. Last error: $lastError"
