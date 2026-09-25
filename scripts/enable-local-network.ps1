[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    Write-Host "Administrator permission is required to configure Windows Firewall." -ForegroundColor Yellow
    $process = Start-Process `
        -FilePath "powershell.exe" `
        -Verb RunAs `
        -ArgumentList @(
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            ('"{0}"' -f $PSCommandPath)
        ) `
        -Wait `
        -PassThru
    exit $process.ExitCode
}

$rules = @(
    @{
        Name = "GMS-Catalogue-Frontend-3000"
        DisplayName = "GMS Catalogue Frontend (LAN 3000)"
        Port = 3000
    },
    @{
        Name = "GMS-Catalogue-API-8001"
        DisplayName = "GMS Catalogue API (LAN 8001)"
        Port = 8001
    }
)

# Remove the former frontend rule after migrating the application to port 3000.
Get-NetFirewallRule -Name "GMS-Catalogue-Frontend-80" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule

foreach ($rule in $rules) {
    Get-NetFirewallRule -Name $rule.Name -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule

    New-NetFirewallRule `
        -Name $rule.Name `
        -DisplayName $rule.DisplayName `
        -Direction Inbound `
        -Action Allow `
        -Protocol TCP `
        -LocalPort $rule.Port `
        -Profile Any `
        -RemoteAddress LocalSubnet | Out-Null
}

Write-Host "Local-network access is enabled." -ForegroundColor Green
Write-Host "Frontend: http://172.16.0.211:3000"
Write-Host "API:      http://172.16.0.211:8001/api/health"
Write-Host "Only devices on the local subnet are allowed by these rules."
