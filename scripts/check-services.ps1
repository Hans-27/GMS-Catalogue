$checks = @(
    @{ Name = "Frontend login"; Url = "http://127.0.0.1/login" },
    @{ Name = "Frontend dashboard"; Url = "http://127.0.0.1/dashboard" },
    @{ Name = "Backend health"; Url = "http://127.0.0.1:8001/api/health" },
    @{ Name = "FastAPI docs"; Url = "http://127.0.0.1:8001/docs" }
)
$failed = $false
foreach ($check in $checks) {
    $status = & curl.exe --silent --show-error --output NUL --write-out "%{http_code}" --max-time 5 $check.Url 2>$null
    $healthy = $LASTEXITCODE -eq 0 -and [int]$status -ge 200 -and [int]$status -lt 500
    if (-not $healthy) { $failed = $true }
    Write-Host ("{0,-22} {1,-3} {2}" -f $check.Name, $(if ($healthy) { "OK" } else { "ERR" }), $(if ($status) { $status } else { "unreachable" }))
}
if ($failed) { exit 1 }
