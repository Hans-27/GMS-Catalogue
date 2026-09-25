[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$helperPath = Join-Path $PSScriptRoot "catalogue-network.ps1"

if (-not (Test-Path -LiteralPath $helperPath)) {
    throw "Catalogue network helper not found: $helperPath"
}

. $helperPath

function Assert-Equal {
    param(
        [Parameter(Mandatory)][string]$Name,
        $Actual,
        $Expected
    )

    if ($Actual -ne $Expected) {
        throw "$Name expected '$Expected' but found '$Actual'."
    }
}

function Assert-Throws {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Action
    )

    try {
        & $Action
    }
    catch {
        return
    }
    throw "$Name expected an exception."
}

function New-TestCandidate {
    param(
        [string]$Address,
        [int]$InterfaceIndex,
        [int]$RouteMetric,
        [int]$InterfaceMetric,
        [string]$NextHop = "10.0.0.1",
        [string]$ConnectionState = "Connected",
        [string]$AddressState = "Preferred",
        [bool]$SkipAsSource = $false,
        [string]$InterfaceAlias = "Ethernet"
    )

    [pscustomobject]@{
        Address = $Address
        InterfaceIndex = $InterfaceIndex
        RouteMetric = $RouteMetric
        InterfaceMetric = $InterfaceMetric
        NextHop = $NextHop
        ConnectionState = $ConnectionState
        AddressState = $AddressState
        SkipAsSource = $SkipAsSource
        InterfaceAlias = $InterfaceAlias
    }
}

$selected = Select-CatalogueLanIPv4Address -Candidates @(
    (New-TestCandidate -Address "192.168.10.20" -InterfaceIndex 9 -RouteMetric 10 -InterfaceMetric 20)
    (New-TestCandidate -Address "10.185.179.43" -InterfaceIndex 12 -RouteMetric 0 -InterfaceMetric 15)
)
Assert-Equal "lowest combined metric" $selected "10.185.179.43"

$selected = Select-CatalogueLanIPv4Address -Candidates @(
    (New-TestCandidate -Address "192.168.55.105" -InterfaceIndex 41 -RouteMetric 1 -InterfaceMetric 1 -NextHop "0.0.0.0" -InterfaceAlias "GMS Tunnel")
    (New-TestCandidate -Address "10.185.179.43" -InterfaceIndex 12 -RouteMetric 0 -InterfaceMetric 50)
)
Assert-Equal "on-link tunnel route excluded" $selected "10.185.179.43"

$invalidCandidates = @(
    (New-TestCandidate -Address "127.0.0.1" -InterfaceIndex 1 -RouteMetric 0 -InterfaceMetric 1 -InterfaceAlias "Loopback Pseudo-Interface")
    (New-TestCandidate -Address "169.254.12.4" -InterfaceIndex 2 -RouteMetric 0 -InterfaceMetric 1)
    (New-TestCandidate -Address "10.0.0.2" -InterfaceIndex 3 -RouteMetric 0 -InterfaceMetric 1 -ConnectionState "Disconnected")
    (New-TestCandidate -Address "10.0.0.3" -InterfaceIndex 4 -RouteMetric 0 -InterfaceMetric 1 -AddressState "Tentative")
    (New-TestCandidate -Address "10.0.0.4" -InterfaceIndex 5 -RouteMetric 0 -InterfaceMetric 1 -SkipAsSource $true)
)
Assert-Equal "invalid candidates rejected" (Select-CatalogueLanIPv4Address -Candidates $invalidCandidates) $null

$selected = Select-CatalogueLanIPv4Address -Candidates @(
    (New-TestCandidate -Address "10.0.0.20" -InterfaceIndex 8 -RouteMetric 10 -InterfaceMetric 10)
    (New-TestCandidate -Address "10.0.0.10" -InterfaceIndex 7 -RouteMetric 10 -InterfaceMetric 10)
    (New-TestCandidate -Address "10.0.0.5" -InterfaceIndex 7 -RouteMetric 10 -InterfaceMetric 10)
)
Assert-Equal "deterministic precedence" $selected "10.0.0.5"

Assert-Equal "origin normalization" `
    (ConvertTo-CatalogueOrigin -Value "http://10.10.5.8:3100/") `
    "http://10.10.5.8:3100"
Assert-Equal "HTTPS origin accepted" `
    (ConvertTo-CatalogueOrigin -Value "https://catalogue.office.example") `
    "https://catalogue.office.example"

foreach ($invalidOrigin in @(
    "ftp://10.10.5.8",
    "catalogue.local",
    "http://user:password@10.10.5.8:3000",
    "http://10.10.5.8:3000/catalogue",
    "http://10.10.5.8:3000?test=1",
    "http://10.10.5.8:3000#section"
)) {
    Assert-Throws "invalid origin $invalidOrigin" {
        ConvertTo-CatalogueOrigin -Value $invalidOrigin | Out-Null
    }
}

$temporaryEnvironment = Join-Path ([System.IO.Path]::GetTempPath()) "catalogue-network-$([guid]::NewGuid().ToString('N')).env"
try {
    Set-Content -LiteralPath $temporaryEnvironment -Value @(
        "PUBLIC_APP_URL=http://192.168.1.50:3000"
        "CORS_ORIGINS=http://localhost:3000, http://127.0.0.1:3000,HTTP://LOCALHOST:3000"
    )

    $explicit = Resolve-CatalogueNetworkRuntime `
        -FrontendPort 3000 `
        -PublicAppUrl "https://catalogue.office.example/" `
        -EnvironmentFile $temporaryEnvironment `
        -AddressResolver { "10.20.30.40" }
    Assert-Equal "explicit origin precedence" $explicit.PublicAppUrl "https://catalogue.office.example"
    Assert-Equal "explicit source" $explicit.Source "explicit"

    $automatic = Resolve-CatalogueNetworkRuntime `
        -FrontendPort 3100 `
        -EnvironmentFile $temporaryEnvironment `
        -AddressResolver { "10.20.30.40" }
    Assert-Equal "automatic origin" $automatic.PublicAppUrl "http://10.20.30.40:3100"
    Assert-Equal "automatic address" $automatic.LanAddress "10.20.30.40"
    Assert-Equal "automatic source" $automatic.Source "detected"

    $configured = Resolve-CatalogueNetworkRuntime `
        -FrontendPort 3000 `
        -EnvironmentFile $temporaryEnvironment `
        -AddressResolver { $null }
    Assert-Equal "configured fallback" $configured.PublicAppUrl "http://192.168.1.50:3000"
    Assert-Equal "configured fallback source" $configured.Source "configured"
    if ([string]::IsNullOrWhiteSpace($configured.Warning)) {
        throw "Configured fallback must include a warning."
    }

    $corsValues = $automatic.CorsOrigins -split ','
    Assert-Equal "CORS value count" $corsValues.Count 3
    Assert-Equal "CORS preserves localhost" $corsValues[0] "http://localhost:3000"
    Assert-Equal "CORS preserves loopback" $corsValues[1] "http://127.0.0.1:3000"
    Assert-Equal "CORS appends selected origin" $corsValues[2] "http://10.20.30.40:3100"

    Set-Content -LiteralPath $temporaryEnvironment -Value "CORS_ORIGINS=http://localhost:3000"
    $localOnly = Resolve-CatalogueNetworkRuntime `
        -FrontendPort 3200 `
        -EnvironmentFile $temporaryEnvironment `
        -AddressResolver { $null }
    Assert-Equal "local-only fallback" $localOnly.PublicAppUrl "http://127.0.0.1:3200"
    Assert-Equal "local-only source" $localOnly.Source "local_fallback"
    if ([string]::IsNullOrWhiteSpace($localOnly.Warning)) {
        throw "Local-only fallback must include a warning."
    }
}
finally {
    Remove-Item -LiteralPath $temporaryEnvironment -Force -ErrorAction SilentlyContinue
}

Write-Output "catalogue_network_tests=passed"
