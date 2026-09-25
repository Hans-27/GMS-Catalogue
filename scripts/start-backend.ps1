param(
    [switch]$Foreground,
    [ValidateRange(1, 65535)]
    [int]$Port = 8001,
    [string]$HostAddress = "0.0.0.0"
)
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot "backend"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"
$stateRoot = Join-Path $projectRoot ".local\run"
if (-not (Test-Path -LiteralPath $python)) { throw "Backend virtual environment not found: $python" }
New-Item -ItemType Directory -Force -Path $stateRoot | Out-Null
$arguments = @("-m", "uvicorn", "app.main:app", "--reload", "--host", $HostAddress, "--port", $Port.ToString())
if ($Foreground) {
    Push-Location $backendRoot
    try { & $python @arguments } finally { Pop-Location }
    exit $LASTEXITCODE
}
$process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $backendRoot -PassThru -WindowStyle Hidden
Set-Content -LiteralPath (Join-Path $stateRoot "backend.pid") -Value $process.Id
Write-Host "Backend started (PID $($process.Id)): http://$HostAddress`:$Port"
