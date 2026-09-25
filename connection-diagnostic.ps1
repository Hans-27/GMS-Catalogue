$ErrorActionPreference = 'Continue'

$workspace = 'C:\Project GMS\catalogue-main'
$backend = Join-Path $workspace 'backend'
$frontend = Join-Path $workspace 'frontend'
$reportPath = Join-Path $workspace 'connection-diagnostic.txt'
$imagePath = Join-Path $workspace 'connection-diagnostic.png'

$lines = [System.Collections.Generic.List[string]]::new()
function Add-ReportLine([string]$value) {
    if ($null -eq $value) { return }
    $safe = $value -replace '(?i)(password|secret|token|key)\s*[:=]\s*\S+', '$1=[REDACTED]'
    $lines.Add($safe)
}

Add-ReportLine ('Generated: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
foreach ($port in 80, 8001) {
    $listening = [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
    Add-ReportLine ("Port ${port} listening: ${listening}")
}

foreach ($url in 'http://127.0.0.1/login','http://127.0.0.1/dashboard','http://127.0.0.1:8001/docs','http://127.0.0.1:8001/openapi.json') {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        Add-ReportLine ("HTTP $($response.StatusCode): ${url}")
    } catch {
        $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 'FAILED' }
        Add-ReportLine ("HTTP ${status}: ${url} -- $($_.Exception.Message)")
    }
}

Add-ReportLine ''
Add-ReportLine 'Frontend public API configuration:'
foreach ($fileName in '.env.local','.env','.env.development') {
    $filePath = Join-Path $frontend $fileName
    if (Test-Path -LiteralPath $filePath) {
        Add-ReportLine ("[$fileName]")
        Get-Content -LiteralPath $filePath | Where-Object { $_ -match '^(NEXT_PUBLIC_.*(API|BACKEND|ORIGIN|URL)|API_URL)=' } | ForEach-Object { Add-ReportLine $_ }
    }
}

Add-ReportLine ''
Add-ReportLine 'Backend recent output:'
foreach ($logName in 'backend-live.err.log','backend-live.out.log','uvicorn.err.log','uvicorn.out.log') {
    $logPath = Join-Path (Join-Path $backend '.local') $logName
    if (Test-Path -LiteralPath $logPath) {
        Add-ReportLine ("[$logName]")
        Get-Content -LiteralPath $logPath -Tail 20 | ForEach-Object { Add-ReportLine $_ }
    }
}

$lines | Set-Content -LiteralPath $reportPath -Encoding UTF8

Add-Type -AssemblyName System.Drawing
$bitmap = [System.Drawing.Bitmap]::new(1800, 1400)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$font = [System.Drawing.Font]::new('Consolas', 16)
$brush = [System.Drawing.Brushes]::Black
$y = 20
foreach ($line in $lines) {
    $segments = if ($line.Length -gt 150) {
        [regex]::Matches($line, '.{1,150}') | ForEach-Object { $_.Value }
    } else { @($line) }
    foreach ($segment in $segments) {
        $graphics.DrawString($segment, $font, $brush, 20, $y)
        $y += 24
        if ($y -gt 1360) { break }
    }
    if ($y -gt 1360) { break }
}
$bitmap.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
