[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Assert-Equal {
    param([string]$Name, $Actual, $Expected)
    if ($Actual -ne $Expected) { throw "$Name expected '$Expected' but found '$Actual'." }
}

function Get-DefaultParameterValue {
    param([string]$Path, [string]$ParameterName)
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw "Could not parse ${Path}: $($errors[0].Message)" }
    $parameter = $ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq $ParameterName }
    if (-not $parameter -or -not $parameter.DefaultValue) { throw "Missing default for $ParameterName in $Path." }
    return $parameter.DefaultValue.SafeGetValue()
}

# Catches a partial migration where one entry point still starts or exposes port 80.
$package = Get-Content -LiteralPath (Join-Path $projectRoot "frontend\package.json") -Raw | ConvertFrom-Json
Assert-Equal "npm dev port" $package.scripts.dev "next dev -H 0.0.0.0 -p 3000"
Assert-Equal "npm turbopack port" $package.scripts.'dev:turbopack' "next dev -H 0.0.0.0 -p 3000"
Assert-Equal "npm webpack port" $package.scripts.'dev:webpack' "next dev --webpack -H 0.0.0.0 -p 3000"
Assert-Equal "npm production port" $package.scripts.start "next start -H 0.0.0.0 -p 3000"

Assert-Equal "frontend launcher default" (Get-DefaultParameterValue (Join-Path $projectRoot "scripts\start-frontend.ps1") "Port") 3000
Assert-Equal "platform launcher default" (Get-DefaultParameterValue (Join-Path $projectRoot "run_platform.ps1") "FrontendPort") 3000
Assert-Equal "verification default" (Get-DefaultParameterValue (Join-Path $projectRoot "scripts\verify-port-3000.ps1") "FrontendPort") 3000

foreach ($composeName in "docker-compose.yml", "docker-compose.production.yml") {
    $compose = Get-Content -LiteralPath (Join-Path $projectRoot $composeName) -Raw
    if ($compose -notmatch '(?m)^\s+-\s+"3000:3000"\s*$') {
        throw "$composeName does not expose the frontend on port 3000."
    }
}

$dockerfile = Get-Content -LiteralPath (Join-Path $projectRoot "frontend\Dockerfile") -Raw
if ($dockerfile -notmatch '(?m)^EXPOSE 3000\s*$') {
    throw "The frontend Dockerfile does not expose port 3000."
}

$activeEnvironment = @{}
Get-Content -LiteralPath (Join-Path $projectRoot "backend\.env") | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $activeEnvironment[$matches[1]] = $matches[2] }
}
foreach ($origin in ($activeEnvironment.CORS_ORIGINS -split ',')) {
    $originUri = [uri]$origin
    if ($originUri.Scheme -eq "http") {
        Assert-Equal "HTTP CORS origin port for $origin" $originUri.Port 3000
    }
    elseif ($originUri.Scheme -eq "https") {
        Assert-Equal "HTTPS CORS origin port for $origin" $originUri.Port 443
    }
    else {
        throw "CORS origin $origin must use HTTP or HTTPS."
    }
}

$firewallHelper = Get-Content -LiteralPath (Join-Path $projectRoot "scripts\enable-local-network.ps1") -Raw
if ($firewallHelper -notmatch 'Port\s*=\s*3000') {
    throw "The LAN firewall helper does not open frontend port 3000."
}

Write-Output "port_configuration=3000"
