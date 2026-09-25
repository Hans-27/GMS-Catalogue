[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

function Get-DefaultParameterValue {
    param([string]$Path, [string]$ParameterName)
    $tokens = $null
    $errors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
    if ($errors.Count) { throw "Could not parse ${Path}: $($errors[0].Message)" }
    $parameter = $ast.ParamBlock.Parameters | Where-Object { $_.Name.VariablePath.UserPath -eq $ParameterName }
    if (-not $parameter -or -not $parameter.DefaultValue) { return $null }
    return $parameter.DefaultValue.SafeGetValue()
}

$environment = @{}
Get-Content -LiteralPath (Join-Path $projectRoot "backend\.env") | ForEach-Object {
    if ($_ -match '^([^#=]+)=(.*)$') { $environment[$matches[1]] = $matches[2] }
}

# Catches a mixed runtime where the frontend is in development but the API
# continues loading production-only behavior.
if ($environment.APP_ENV -ne "development") {
    throw "APP_ENV expected 'development' but found '$($environment.APP_ENV)'."
}

$launcher = Get-Content -LiteralPath (Join-Path $projectRoot "run_platform.ps1") -Raw
$developmentDefault = Get-DefaultParameterValue (Join-Path $projectRoot "run_platform.ps1") "Development"
if ($developmentDefault -ne $true) {
    throw "The combined launcher must default to development mode."
}
if ($launcher -notmatch 'if \(\$Development\) \{ \$apiArguments \+= "--reload" \}') {
    throw "The combined development launcher does not enable backend auto-reload."
}

Write-Output "development_configuration=ok"
