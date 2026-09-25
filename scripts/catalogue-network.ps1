Set-StrictMode -Version 2.0

function Test-CatalogueIPv4Value {
    param([AllowNull()][AllowEmptyString()][string]$Address)

    if ([string]::IsNullOrWhiteSpace($Address)) {
        return $false
    }

    $parsedAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($Address.Trim(), [ref]$parsedAddress)) {
        return $false
    }
    if ($parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        return $false
    }

    $bytes = $parsedAddress.GetAddressBytes()
    if ($bytes[0] -eq 0 -or $bytes[0] -eq 127) {
        return $false
    }
    if ($bytes[0] -eq 169 -and $bytes[1] -eq 254) {
        return $false
    }
    if ($bytes[0] -ge 224) {
        return $false
    }

    return $true
}

function Get-CatalogueIPv4SortKey {
    param([Parameter(Mandatory)][string]$Address)

    $parsedAddress = [System.Net.IPAddress]::Parse($Address)
    $bytes = $parsedAddress.GetAddressBytes()
    return "{0:D3}.{1:D3}.{2:D3}.{3:D3}" -f $bytes[0], $bytes[1], $bytes[2], $bytes[3]
}

function Test-CatalogueLanIPv4Address {
    param([Parameter(Mandatory)]$Candidate)

    if (-not (Test-CatalogueIPv4Value -Address ([string]$Candidate.Address))) {
        return $false
    }
    if ([string]$Candidate.ConnectionState -ne "Connected") {
        return $false
    }
    if ([string]$Candidate.AddressState -ne "Preferred") {
        return $false
    }
    if ([bool]$Candidate.SkipAsSource) {
        return $false
    }
    if ([string]::IsNullOrWhiteSpace([string]$Candidate.NextHop) -or [string]$Candidate.NextHop -eq "0.0.0.0") {
        return $false
    }

    $interfaceName = [string]$Candidate.InterfaceAlias
    if ($interfaceName -match "(?i)(loopback|tunnel|teredo|isatap|6to4)") {
        return $false
    }

    return $true
}

function Select-CatalogueLanIPv4Address {
    param([AllowNull()][object[]]$Candidates)

    $selected = @($Candidates) |
        Where-Object { $_ -and (Test-CatalogueLanIPv4Address -Candidate $_) } |
        Sort-Object `
            @{ Expression = { [int64]$_.RouteMetric + [int64]$_.InterfaceMetric } }, `
            @{ Expression = { [int]$_.InterfaceIndex } }, `
            @{ Expression = { Get-CatalogueIPv4SortKey -Address ([string]$_.Address) } } |
        Select-Object -First 1

    if (-not $selected) {
        return $null
    }
    return [string]$selected.Address
}

function Get-CatalogueLanIPv4Address {
    [CmdletBinding()]
    param()

    $routes = @(
        Get-NetRoute `
            -AddressFamily IPv4 `
            -DestinationPrefix "0.0.0.0/0" `
            -ErrorAction SilentlyContinue
    )
    $interfaces = @(
        Get-NetIPInterface `
            -AddressFamily IPv4 `
            -ErrorAction SilentlyContinue
    )
    $addresses = @(
        Get-NetIPAddress `
            -AddressFamily IPv4 `
            -ErrorAction SilentlyContinue
    )

    $candidates = foreach ($route in $routes) {
        $networkInterface = $interfaces |
            Where-Object { $_.InterfaceIndex -eq $route.InterfaceIndex } |
            Select-Object -First 1
        if (-not $networkInterface) {
            continue
        }

        foreach ($address in ($addresses | Where-Object { $_.InterfaceIndex -eq $route.InterfaceIndex })) {
            [pscustomobject]@{
                Address = [string]$address.IPAddress
                InterfaceIndex = [int]$route.InterfaceIndex
                InterfaceAlias = [string]$route.InterfaceAlias
                RouteMetric = [int]$route.RouteMetric
                InterfaceMetric = [int]$networkInterface.InterfaceMetric
                NextHop = [string]$route.NextHop
                ConnectionState = [string]$networkInterface.ConnectionState
                AddressState = [string]$address.AddressState
                SkipAsSource = [bool]$address.SkipAsSource
            }
        }
    }

    return Select-CatalogueLanIPv4Address -Candidates @($candidates)
}

function ConvertTo-CatalogueOrigin {
    param([Parameter(Mandatory)][string]$Value)

    $candidate = $Value.Trim()
    $uri = $null
    if (-not [System.Uri]::TryCreate($candidate, [System.UriKind]::Absolute, [ref]$uri)) {
        throw "Catalogue public URL must be an absolute HTTP or HTTPS origin. Received: '$Value'."
    }
    if ($uri.Scheme -notin @("http", "https") -or [string]::IsNullOrWhiteSpace($uri.Host)) {
        throw "Catalogue public URL must use HTTP or HTTPS and include a host. Received: '$Value'."
    }
    if (-not [string]::IsNullOrWhiteSpace($uri.UserInfo)) {
        throw "Catalogue public URL must not contain credentials. Received: '$Value'."
    }
    if ($uri.AbsolutePath -notin @("", "/") -or -not [string]::IsNullOrWhiteSpace($uri.Query) -or -not [string]::IsNullOrWhiteSpace($uri.Fragment)) {
        throw "Catalogue public URL must be an origin without a path, query, or fragment. Received: '$Value'."
    }

    return $uri.GetLeftPart([System.UriPartial]::Authority)
}

function Get-CatalogueDotEnvValue {
    param(
        [AllowNull()][AllowEmptyString()][string]$EnvironmentFile,
        [Parameter(Mandatory)][string]$Name
    )

    if ([string]::IsNullOrWhiteSpace($EnvironmentFile) -or -not (Test-Path -LiteralPath $EnvironmentFile)) {
        return $null
    }

    foreach ($line in Get-Content -LiteralPath $EnvironmentFile) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            return $matches[1].Trim()
        }
    }
    return $null
}

function Get-CatalogueConfiguredValue {
    param(
        [Parameter(Mandatory)][string]$Name,
        [AllowNull()][AllowEmptyString()][string]$EnvironmentFile
    )

    $processValue = [System.Environment]::GetEnvironmentVariable($Name, [System.EnvironmentVariableTarget]::Process)
    if (-not [string]::IsNullOrWhiteSpace($processValue)) {
        return $processValue.Trim()
    }
    return Get-CatalogueDotEnvValue -EnvironmentFile $EnvironmentFile -Name $Name
}

function Merge-CatalogueCorsOrigins {
    param(
        [AllowNull()][AllowEmptyString()][string]$ConfiguredOrigins,
        [Parameter(Mandatory)][string]$PublicAppUrl
    )

    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    $result = New-Object 'System.Collections.Generic.List[string]'

    foreach ($origin in @($ConfiguredOrigins -split ',')) {
        $trimmedOrigin = $origin.Trim()
        if (-not [string]::IsNullOrWhiteSpace($trimmedOrigin) -and $seen.Add($trimmedOrigin)) {
            $result.Add($trimmedOrigin)
        }
    }
    if ($seen.Add($PublicAppUrl)) {
        $result.Add($PublicAppUrl)
    }

    return $result -join ','
}

function Resolve-CatalogueNetworkRuntime {
    [CmdletBinding()]
    param(
        [ValidateRange(1, 65535)]
        [int]$FrontendPort = 3000,

        [AllowNull()][AllowEmptyString()]
        [string]$PublicAppUrl,

        [AllowNull()][AllowEmptyString()]
        [string]$EnvironmentFile,

        [scriptblock]$AddressResolver = { Get-CatalogueLanIPv4Address }
    )

    $lanAddress = $null
    $warning = $null
    $source = $null
    $resolvedOrigin = $null

    if (-not [string]::IsNullOrWhiteSpace($PublicAppUrl)) {
        $resolvedOrigin = ConvertTo-CatalogueOrigin -Value $PublicAppUrl
        $source = "explicit"
    }
    else {
        $detectedAddress = & $AddressResolver
        if (Test-CatalogueIPv4Value -Address ([string]$detectedAddress)) {
            $lanAddress = [string]$detectedAddress
            $resolvedOrigin = "http://${lanAddress}:$FrontendPort"
            $source = "detected"
        }
        else {
            $configuredOrigin = Get-CatalogueConfiguredValue -Name "PUBLIC_APP_URL" -EnvironmentFile $EnvironmentFile
            if (-not [string]::IsNullOrWhiteSpace($configuredOrigin)) {
                try {
                    $resolvedOrigin = ConvertTo-CatalogueOrigin -Value $configuredOrigin
                    $source = "configured"
                    $warning = "No usable LAN IPv4 address was detected. Using configured PUBLIC_APP_URL '$resolvedOrigin'; verify that other office devices can reach it."
                }
                catch {
                    $warning = "No usable LAN IPv4 address was detected, and configured PUBLIC_APP_URL '$configuredOrigin' is invalid."
                }
            }

            if (-not $resolvedOrigin) {
                $resolvedOrigin = "http://127.0.0.1:$FrontendPort"
                $source = "local_fallback"
                $localWarning = "Using local-only catalogue origin '$resolvedOrigin'; other devices cannot open these links."
                if ($warning) {
                    $warning = "$warning $localWarning"
                }
                else {
                    $warning = "No usable LAN IPv4 address was detected. $localWarning"
                }
            }
        }
    }

    $configuredCors = Get-CatalogueConfiguredValue -Name "CORS_ORIGINS" -EnvironmentFile $EnvironmentFile
    $corsOrigins = Merge-CatalogueCorsOrigins -ConfiguredOrigins $configuredCors -PublicAppUrl $resolvedOrigin

    return [pscustomobject]@{
        LanAddress = $lanAddress
        PublicAppUrl = $resolvedOrigin
        CorsOrigins = $corsOrigins
        Source = $source
        Warning = $warning
    }
}
