$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateRoot = Join-Path $projectRoot ".local\run"
foreach ($service in @("frontend", "backend")) {
    $pidFile = Join-Path $stateRoot "$service.pid"
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $servicePid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $servicePid" -ErrorAction SilentlyContinue
    if ($processInfo -and $processInfo.CommandLine -like "*$projectRoot*") {
        Stop-Process -Id $servicePid -ErrorAction SilentlyContinue
        Write-Host "$service stopped (PID $servicePid)."
    } elseif ($processInfo) {
        Write-Warning "Did not stop PID $servicePid because it does not belong to this workspace."
    }
    Remove-Item -LiteralPath $pidFile -Force
}
