param(
    [switch]$Foreground,
    [ValidateRange(1, 65535)]
    [int]$Port = 3000
)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $projectRoot "frontend"
$stateRoot = Join-Path $projectRoot ".local\run"
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
if ($Foreground) {
    Push-Location $frontendRoot
    try { & npm.cmd run dev -- -H 0.0.0.0 -p $Port } finally { Pop-Location }
    exit $LASTEXITCODE
}
$process = Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "dev", "--", "-H", "0.0.0.0", "-p", $Port.ToString()) -WorkingDirectory $frontendRoot -PassThru -WindowStyle Hidden
Set-Content -LiteralPath (Join-Path $stateRoot "frontend.pid") -Value $process.Id
Write-Host "Frontend started (PID $($process.Id)): http://127.0.0.1:$Port"
