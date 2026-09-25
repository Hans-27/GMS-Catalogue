$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "start-backend.ps1")
& (Join-Path $PSScriptRoot "start-frontend.ps1")
Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot "check-services.ps1")
