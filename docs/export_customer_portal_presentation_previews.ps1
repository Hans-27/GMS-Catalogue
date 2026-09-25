$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$presentationPath = Join-Path $root "docs\GMS-Customer-Portal-Step-by-Step.pptx"
$previewDir = Join-Path $root ".codex_tmp\customer-portal-presentation-preview"

if (-not (Test-Path -LiteralPath $previewDir)) {
    [void](New-Item -ItemType Directory -Path $previewDir)
}

$powerPoint = $null
$presentation = $null
try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $presentation = $powerPoint.Presentations.Open($presentationPath, 0, 0, 0)
    for ($index = 1; $index -le $presentation.Slides.Count; $index++) {
        $path = Join-Path $previewDir ("slide-{0:D2}.png" -f $index)
        $presentation.Slides.Item($index).Export($path, "PNG", 1600, 900)
        if ($index -in @(4, 8)) {
            foreach ($shape in $presentation.Slides.Item($index).Shapes) {
                if ($shape.Top -lt 130) {
                    $shapeText = ""
                    if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
                        $shapeText = $shape.TextFrame.TextRange.Text.Replace("`r", " ").Replace("`n", " ")
                    }
                    Write-Output ("Slide {0} top shape: {1}; left={2}; top={3}; width={4}; height={5}; text={6}" -f $index, $shape.Name, [math]::Round($shape.Left), [math]::Round($shape.Top), [math]::Round($shape.Width), [math]::Round($shape.Height), $shapeText)
                    if ($index -eq 8 -and $shape.Name -eq "TextBox 3") {
                        for ($charIndex = 1; $charIndex -le 8; $charIndex++) {
                            $character = $shape.TextFrame.TextRange.Characters($charIndex, 1)
                            Write-Output ("Slide 8 title char {0}: text={1}; color={2}; size={3}" -f $charIndex, $character.Text, $character.Font.Color.RGB, $character.Font.Size)
                        }
                    }
                }
            }
        }
    }
    Write-Output "Slides: $($presentation.Slides.Count)"
    Write-Output "Preview directory: $previewDir"
}
finally {
    if ($presentation) { $presentation.Close() }
    if ($powerPoint) { $powerPoint.Quit() }
    if ($presentation) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
    if ($powerPoint) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
