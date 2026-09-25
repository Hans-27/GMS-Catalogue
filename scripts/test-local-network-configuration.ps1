[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Assert-Equal {
    param([string]$Name, $Actual, $Expected)
    if ($Actual -ne $Expected) {
        throw "$Name expected '$Expected' but found '$Actual'."
    }
}

function Get-ParameterAst {
    param([string]$Path, [string]$ParameterName)
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw "Could not parse ${Path}: $($errors[0].Message)" }
    $parameter = $ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq $ParameterName }
    if (-not $parameter) { throw "Missing parameter $ParameterName in $Path." }
    return $parameter
}

function Get-DefaultParameterValue {
    param([string]$Path, [string]$ParameterName)
    $parameter = Get-ParameterAst -Path $Path -ParameterName $ParameterName
    if (-not $parameter.DefaultValue) { throw "Missing default for $ParameterName in $Path." }
    return $parameter.DefaultValue.SafeGetValue()
}

function Assert-ContainsPattern {
    param([string]$Name, [string]$Content, [string]$Pattern)
    if ($Content -notmatch $Pattern) {
        throw "$Name is missing expected pattern: $Pattern"
    }
}

$runApiPath = Join-Path $projectRoot "run_api.ps1"
$runPlatformPath = Join-Path $projectRoot "run_platform.ps1"
$runApi = Get-Content -LiteralPath $runApiPath -Raw
$runPlatform = Get-Content -LiteralPath $runPlatformPath -Raw

Assert-Equal "backend bind address" `
    (Get-DefaultParameterValue (Join-Path $projectRoot "scripts\start-backend.ps1") "HostAddress") `
    "0.0.0.0"
Assert-Equal "platform backend bind address" `
    (Get-DefaultParameterValue $runPlatformPath "ApiHost") `
    "0.0.0.0"
Assert-Equal "API launcher frontend port" `
    (Get-DefaultParameterValue $runApiPath "FrontendPort") `
    3000
Assert-Equal "platform launcher frontend port" `
    (Get-DefaultParameterValue $runPlatformPath "FrontendPort") `
    3000

foreach ($launcher in @(
    @{ Name = "API launcher"; Path = $runApiPath; Content = $runApi },
    @{ Name = "platform launcher"; Path = $runPlatformPath; Content = $runPlatform }
)) {
    $publicUrlParameter = Get-ParameterAst -Path $launcher.Path -ParameterName "PublicAppUrl"
    if ($publicUrlParameter.DefaultValue) {
        throw "$($launcher.Name) PublicAppUrl must not have a static default."
    }

    Assert-ContainsPattern "$($launcher.Name) network helper" $launcher.Content 'scripts[\\/]catalogue-network\.ps1'
    Assert-ContainsPattern "$($launcher.Name) runtime resolver" $launcher.Content 'Resolve-CatalogueNetworkRuntime'
    Assert-ContainsPattern "$($launcher.Name) public URL environment" $launcher.Content '\$env:PUBLIC_APP_URL\s*=\s*\$networkRuntime\.PublicAppUrl'
    Assert-ContainsPattern "$($launcher.Name) CORS environment" $launcher.Content '\$env:CORS_ORIGINS\s*=\s*\$networkRuntime\.CorsOrigins'

    if ($launcher.Content -match '172\.16\.1\.94|retiree-bobble-emerald\.ngrok-free\.dev') {
        throw "$($launcher.Name) still contains a retired catalogue origin."
    }
}

$helperPath = Join-Path $projectRoot "scripts\catalogue-network.ps1"
. $helperPath
$networkRuntime = Resolve-CatalogueNetworkRuntime `
    -FrontendPort 3000 `
    -EnvironmentFile (Join-Path $projectRoot "backend\.env")
if ([string]::IsNullOrWhiteSpace($networkRuntime.PublicAppUrl)) {
    throw "The runtime resolver did not produce a catalogue origin."
}

Write-Output "lan_configuration=$($networkRuntime.LanAddress) public_catalogue_origin=$($networkRuntime.PublicAppUrl)"
