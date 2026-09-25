$ErrorActionPreference = "Stop"

$outputDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pptxPath = Join-Path $outputDir "GMS-Customer-Portal-Step-by-Step.pptx"
$pdfPath = Join-Path $outputDir "GMS-Customer-Portal-Step-by-Step.pdf"

function Color([int]$r, [int]$g, [int]$b) {
    return $r + (256 * $g) + (65536 * $b)
}

$C = @{
    DeepGreen = Color 0 77 51
    Green = Color 13 122 76
    BrightGreen = Color 29 161 99
    Mint = Color 221 243 231
    PaleMint = Color 239 249 243
    OffWhite = Color 247 249 247
    White = Color 255 255 255
    Ink = Color 16 38 29
    Slate = Color 73 94 85
    SoftLine = Color 210 224 216
    Amber = Color 246 196 83
    Red = Color 203 62 62
    Blue = Color 48 111 173
}

$ppLayoutBlank = 12
$msoTextOrientationHorizontal = 1
$msoShapeRectangle = 1
$msoShapeRoundedRectangle = 5
$msoShapeOval = 9
$msoShapeRightArrow = 33
$msoTrue = -1
$msoFalse = 0
$ppAlignLeft = 1
$ppAlignCenter = 2
$ppAlignRight = 3
$msoAnchorTop = 1
$msoAnchorMiddle = 3

function Set-ShapeStyle($shape, [int]$fill, [int]$line, [double]$radius = 0) {
    $shape.Fill.Visible = $msoTrue
    $shape.Fill.Solid()
    $shape.Fill.ForeColor.RGB = $fill
    if ($line -lt 0) {
        $shape.Line.Visible = $msoFalse
    } else {
        $shape.Line.Visible = $msoTrue
        $shape.Line.ForeColor.RGB = $line
        $shape.Line.Weight = 1
    }
}

function Add-Box($slide, [double]$x, [double]$y, [double]$w, [double]$h, [int]$fill, [int]$line = -1, [bool]$rounded = $true) {
    $shapeType = if ($rounded) { $msoShapeRoundedRectangle } else { $msoShapeRectangle }
    $shape = $slide.Shapes.AddShape($shapeType, $x, $y, $w, $h)
    Set-ShapeStyle $shape $fill $line
    return $shape
}

function Add-Text($slide, [string]$text, [double]$x, [double]$y, [double]$w, [double]$h, [double]$size = 18, [int]$color = $C.Ink, [bool]$bold = $false, [int]$align = $ppAlignLeft, [int]$anchor = $msoAnchorTop, [string]$font = "Aptos") {
    $shape = $slide.Shapes.AddTextbox($msoTextOrientationHorizontal, $x, $y, $w, $h)
    $shape.TextFrame.WordWrap = $msoTrue
    $shape.TextFrame.MarginLeft = 0
    $shape.TextFrame.MarginRight = 0
    $shape.TextFrame.MarginTop = 0
    $shape.TextFrame.MarginBottom = 0
    $shape.TextFrame.AutoSize = 0
    $shape.TextFrame.VerticalAnchor = $anchor
    $range = $shape.TextFrame.TextRange
    $range.Text = $text
    $range.Font.Name = $font
    $range.Font.Size = $size
    $range.Font.Bold = if ($bold) { $msoTrue } else { $msoFalse }
    $range.Font.Color.RGB = $color
    $range.ParagraphFormat.Alignment = $align
    return $shape
}

function Add-Pill($slide, [string]$text, [double]$x, [double]$y, [double]$w, [int]$fill = $C.Mint, [int]$color = $C.DeepGreen) {
    $shape = Add-Box $slide $x $y $w 25 $fill -1 $true
    [void](Add-Text $slide $text ($x + 8) ($y + 1) ($w - 16) 23 10 $color $true $ppAlignCenter $msoAnchorMiddle)
    return $shape
}

function Add-StepNumber($slide, [int]$number, [double]$x, [double]$y, [int]$fill = $C.Green) {
    $circle = $slide.Shapes.AddShape($msoShapeOval, $x, $y, 34, 34)
    Set-ShapeStyle $circle $fill -1
    [void](Add-Text $slide ([string]$number) $x $y 34 34 15 $C.White $true $ppAlignCenter $msoAnchorMiddle)
}

function Add-Header($slide, [string]$title, [string]$subtitle, [int]$slideNumber) {
    [void](Add-Text $slide "GMS  /  CUSTOMER PORTAL" 48 24 300 18 9 $C.Green $true)
    [void](Add-Text $slide $title 48 52 850 42 28 $C.Ink $true)
    if ($subtitle) {
        [void](Add-Text $slide $subtitle 48 98 850 28 13 $C.Slate $false)
    }
    [void](Add-Text $slide ([string]$slideNumber).PadLeft(2, '0') 875 495 36 18 10 $C.Slate $true $ppAlignRight)
    [void](Add-Text $slide "GMS Customer Portal  |  09 Sep 2026" 48 495 260 18 9 $C.Slate)
}

function Add-FlowArrow($slide, [double]$x1, [double]$y1, [double]$x2, [double]$y2, [int]$color = $C.Green) {
    $line = $slide.Shapes.AddLine($x1, $y1, $x2, $y2)
    $line.Line.ForeColor.RGB = $color
    $line.Line.Weight = 2.25
    $line.Line.EndArrowheadStyle = 3
}

function Add-FlowCard($slide, [string]$number, [string]$title, [string]$detail, [double]$x, [double]$y, [double]$w, [double]$h, [int]$fill = $C.White) {
    $card = Add-Box $slide $x $y $w $h $fill $C.SoftLine $true
    $badge = $slide.Shapes.AddShape($msoShapeOval, ($x + 14), ($y + 15), 30, 30)
    Set-ShapeStyle $badge $C.Green -1
    [void](Add-Text $slide $number ($x + 14) ($y + 15) 30 30 12 $C.White $true $ppAlignCenter $msoAnchorMiddle)
    [void](Add-Text $slide $title ($x + 55) ($y + 14) ($w - 68) 23 14 $C.Ink $true)
    [void](Add-Text $slide $detail ($x + 16) ($y + 55) ($w - 32) ($h - 66) 11 $C.Slate)
    return $card
}

function Add-TableRow($slide, [string[]]$cells, [double[]]$widths, [double]$x, [double]$y, [double]$height, [bool]$header = $false, [int]$accent = $C.Green) {
    $cursor = $x
    for ($i = 0; $i -lt $cells.Count; $i++) {
        $fill = if ($header) { $C.DeepGreen } elseif (($y / $height) % 2 -lt 1) { $C.White } else { $C.PaleMint }
        [void](Add-Box $slide $cursor $y $widths[$i] $height $fill $C.SoftLine $false)
        $textColor = if ($header) { $C.White } elseif ($i -eq ($cells.Count - 1)) { $accent } else { $C.Ink }
        [void](Add-Text $slide $cells[$i] ($cursor + 10) ($y + 2) ($widths[$i] - 20) ($height - 4) 11 $textColor ($header -or $i -eq ($cells.Count - 1)) $ppAlignLeft $msoAnchorMiddle)
        $cursor += $widths[$i]
    }
}

function Add-BulletList($slide, [string[]]$items, [double]$x, [double]$y, [double]$w, [double]$lineHeight = 38, [int]$color = $C.Ink) {
    for ($i = 0; $i -lt $items.Count; $i++) {
        $dot = $slide.Shapes.AddShape($msoShapeOval, $x, ($y + $i * $lineHeight + 7), 10, 10)
        Set-ShapeStyle $dot $C.BrightGreen -1
        [void](Add-Text $slide $items[$i] ($x + 22) ($y + $i * $lineHeight) ($w - 22) ($lineHeight - 2) 13 $color $false $ppAlignLeft $msoAnchorMiddle)
    }
}

$powerPoint = $null
$presentation = $null

try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.Visible = $msoTrue
    $presentation = $powerPoint.Presentations.Add()
    $presentation.PageSetup.SlideWidth = 960
    $presentation.PageSetup.SlideHeight = 540

    # Slide 1 - Title
    $slide = $presentation.Slides.Add(1, $ppLayoutBlank)
    $bg = Add-Box $slide 0 0 960 540 $C.DeepGreen -1 $false
    $orb1 = $slide.Shapes.AddShape($msoShapeOval, 665, -95, 390, 390)
    Set-ShapeStyle $orb1 $C.Green -1
    $orb1.Fill.Transparency = 0.16
    $orb2 = $slide.Shapes.AddShape($msoShapeOval, 760, 290, 240, 240)
    Set-ShapeStyle $orb2 $C.BrightGreen -1
    $orb2.Fill.Transparency = 0.35
    [void](Add-Pill $slide "PRODUCT & PRICING EXPERIENCE" 56 58 225 $C.Mint $C.DeepGreen)
    [void](Add-Text $slide "Customer Portal" 56 120 670 62 38 $C.White $true)
    [void](Add-Text $slide "Step-by-step customer journey, catalogue access, brand pricing and promotions" 56 195 650 70 20 $C.Mint)
    [void](Add-Text $slide "One shared login. A unique customer context. The right price for every brand." 56 318 570 54 17 $C.White $true)
    [void](Add-Text $slide "GMS Catalogue Platform" 56 456 360 26 13 $C.Mint $true)
    [void](Add-Text $slide "09 September 2026" 56 484 300 20 11 $C.Mint)

    # Slide 2 - Goals
    $slide = $presentation.Slides.Add(2, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "What the Customer Portal must achieve" "A simple experience for customers and a controlled source of truth for administrators." 2
    $goals = @(
        @("01", "Simple access", "A shared customer login plus a unique customer link or access code."),
        @("02", "Correct pricing", "Every product resolves price from its own brand mapping and customer profile."),
        @("03", "Published content only", "Customers see catalogues and promotions that are ready for external use."),
        @("04", "Self-service", "Browse, search, save, open and download without admin controls.")
    )
    for ($i = 0; $i -lt $goals.Count; $i++) {
        $x = 48 + (($i % 2) * 438)
        $y = 154 + ([math]::Floor($i / 2) * 146)
        [void](Add-FlowCard $slide $goals[$i][0] $goals[$i][1] $goals[$i][2] $x $y 414 118)
    }

    # Slide 3 - End-to-end journey
    $slide = $presentation.Slides.Add(3, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "End-to-end customer journey" "The customer completes one access step; the platform handles the remaining pricing decisions." 3
    $steps = @(
        @("1", "Shared login", "Authenticate as a Customer Account"),
        @("2", "Secure context", "Open customer link or enter access code"),
        @("3", "Published content", "Load this customer's catalogues"),
        @("4", "Resolved prices", "Brand mapping + promotion = final price")
    )
    for ($i = 0; $i -lt $steps.Count; $i++) {
        $x = 48 + ($i * 220)
        [void](Add-FlowCard $slide $steps[$i][0] $steps[$i][1] $steps[$i][2] $x 178 190 170 $(if($i -eq 3){$C.Mint}else{$C.White}))
        if ($i -lt 3) { Add-FlowArrow $slide ($x + 190) 263 ($x + 218) 263 }
    }
    [void](Add-Box $slide 48 377 850 70 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "Customer result" 70 393 160 20 10 $C.Mint $true)
    [void](Add-Text $slide "The same catalogue can safely show different final prices to different customer profiles." 70 416 780 24 16 $C.White $true)

    # Slide 4 - Step 1
    $slide = $presentation.Slides.Add(4, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 1 - Sign in and identify the customer" "A shared login authenticates the user; the unique access context identifies the commercial profile." 4
    Add-StepNumber $slide 1 48 154
    [void](Add-Text $slide "Customer signs in" 96 154 340 32 20 $C.Ink $true)
    Add-BulletList $slide @("Account type must be Customer Account", "No admin or Catalogue Studio routes are exposed", "Unauthenticated users return to login safely") 57 207 380 48
    [void](Add-Box $slide 486 148 410 270 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "ACCESS CONTEXT" 516 176 200 18 10 $C.Mint $true)
    [void](Add-Text $slide "Siam Retail Co." 516 210 320 36 25 $C.White $true)
    [void](Add-Pill $slide "VIP BKK PRICING" 516 258 150 $C.Mint $C.DeepGreen)
    [void](Add-Text $slide "Resolved from:" 516 309 160 18 11 $C.Mint $true)
    [void](Add-Text $slide "Customer link / access code`n+ customer profile`n+ catalogue audience" 516 337 330 65 14 $C.White)
    [void](Add-Text $slide "Security rule: never select pricing from a URL query alone." 486 441 410 24 11 $C.Red $true $ppAlignCenter)

    # Slide 5 - Portal structure
    $slide = $presentation.Slides.Add(5, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 2 - Land on a focused customer home" "The interface keeps catalogue work visible and removes every internal administration option." 5
    Add-StepNumber $slide 2 48 148
    [void](Add-Text $slide "Customer portal structure" 96 148 370 34 20 $C.Ink $true)
    $frame = Add-Box $slide 48 202 850 252 $C.White $C.SoftLine $true
    [void](Add-Box $slide 48 202 150 252 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "GMS" 68 222 80 30 22 $C.White $true)
    $nav = @("Home", "Catalogues", "Promotions", "Saved", "Downloads", "Help")
    for ($i = 0; $i -lt $nav.Count; $i++) {
        if ($i -eq 0) { [void](Add-Box $slide 61 (273 + $i * 27) 124 24 $C.Green -1 $true) }
        [void](Add-Text $slide $nav[$i] 77 (277 + $i * 27) 100 18 10 $C.White ($i -eq 0))
    }
    [void](Add-Box $slide 198 202 700 42 $C.White $C.SoftLine $false)
    [void](Add-Text $slide "Search catalogues, brands or promotions" 224 215 355 18 10 $C.Slate)
    [void](Add-Text $slide "EN  |  TH     Help     Siam Retail Co." 650 215 220 18 9 $C.Ink $true $ppAlignRight)
    [void](Add-Text $slide "Good morning, Siam Retail" 222 266 480 30 22 $C.Ink $true)
    [void](Add-Pill $slide "VIP BKK PRICING" 222 306 140 $C.Mint $C.DeepGreen)
    for ($i = 0; $i -lt 3; $i++) {
        $x = 222 + $i * 208
        [void](Add-Box $slide $x 353 190 76 $C.PaleMint $C.SoftLine $true)
        [void](Add-Text $slide @("Published catalogues", "Active promotions", "Recent downloads")[$i] ($x + 13) 369 160 18 10 $C.Slate)
        [void](Add-Text $slide @("12", "3", "4")[$i] ($x + 13) 390 50 24 18 $C.DeepGreen $true)
    }

    # Slide 6 - Browse catalogues
    $slide = $presentation.Slides.Add(6, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 3 - Browse only published catalogues" "Every card uses the real cover and the customer-specific public link." 6
    Add-StepNumber $slide 3 48 147
    [void](Add-Text $slide "What customers can do" 96 148 320 32 20 $C.Ink $true)
    Add-BulletList $slide @("Search by catalogue title or brand", "See the full catalogue cover", "Open the customer-priced catalogue", "Save favourites and download PDF") 57 207 380 47
    $card = Add-Box $slide 500 145 350 315 $C.White $C.SoftLine $true
    [void](Add-Box $slide 520 166 128 214 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "NUBWO" 535 211 98 26 18 $C.White $true $ppAlignCenter)
    [void](Add-Text $slide "X-SERIES`n2026" 535 245 98 65 21 $C.Mint $true $ppAlignCenter)
    [void](Add-Text $slide "Nubwo X-Series 2026" 672 176 154 45 16 $C.Ink $true)
    [void](Add-Pill $slide "PUBLISHED" 672 232 100 $C.Mint $C.DeepGreen)
    [void](Add-Text $slide "24 products`nUpdated 12 Aug 2026" 672 273 145 45 11 $C.Slate)
    [void](Add-Box $slide 672 333 152 38 $C.Green -1 $true)
    [void](Add-Text $slide "Open catalogue  >" 684 341 128 22 11 $C.White $true $ppAlignCenter $msoAnchorMiddle)
    [void](Add-Box $slide 672 382 152 38 $C.White $C.Green $true)
    [void](Add-Text $slide "Download PDF" 684 390 128 22 11 $C.DeepGreen $true $ppAlignCenter $msoAnchorMiddle)
    [void](Add-Text $slide "Hidden automatically: Draft | Archived | Expired links" 500 479 350 20 10 $C.Red $true $ppAlignCenter)

    # Slide 7 - Pricing rules
    $slide = $presentation.Slides.Add(7, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 4 - Resolve the correct brand price" "Pricing is decided per product, not once for the whole catalogue." 7
    Add-StepNumber $slide 4 48 147
    [void](Add-Text $slide "Resolution sequence" 96 148 280 32 20 $C.Ink $true)
    $labels = @("Customer profile", "Product brand", "Brand ERP mapping", "Base customer price")
    for ($i = 0; $i -lt $labels.Count; $i++) {
        $x = 49 + $i * 217
        [void](Add-Box $slide $x 216 184 74 $(if($i -eq 3){$C.Mint}else{$C.White}) $C.SoftLine $true)
        [void](Add-Text $slide ([string]($i + 1)).PadLeft(2,'0') ($x + 14) 230 30 16 10 $C.Green $true)
        [void](Add-Text $slide $labels[$i] ($x + 14) 252 155 22 12 $C.Ink $true)
        if ($i -lt 3) { Add-FlowArrow $slide ($x + 184) 253 ($x + 212) 253 }
    }
    [void](Add-Text $slide "Siam Retail pricing profile" 49 330 360 24 15 $C.Ink $true)
    Add-TableRow $slide @("BRAND", "ERP PRICE SOURCE", "RESULT") @(240, 280, 270) 49 365 36 $true
    Add-TableRow $slide @("Nubwo", "SP2", "Use Nubwo SP2 price") @(240, 280, 270) 49 401 36 $false
    Add-TableRow $slide @("Ceflar", "SP5", "Use Ceflar SP5 price") @(240, 280, 270) 49 437 36 $false
    Add-TableRow $slide @("ABBY", "SP3", "Use ABBY SP3 price") @(240, 280, 270) 49 473 36 $false

    # Slide 8 - Multi-brand example
    $slide = $presentation.Slides.Add(8, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 5 - Multi-brand catalogue pricing" "One catalogue may contain many brands; each product follows its own mapping." 8
    Add-StepNumber $slide 5 48 144
    [void](Add-Text $slide "Example: Business Essentials 2026" 96 145 530 32 20 $C.Ink $true)
    $brands = @(
        @("NUBWO", "Gaming headset", "SP2", "THB 2,150"),
        @("CEFLAR", "Audio mixer", "SP5", "THB 6,500"),
        @("ABBY", "Office accessory", "SP3", "THB 1,050")
    )
    for ($i = 0; $i -lt $brands.Count; $i++) {
        $y = 209 + $i * 82
        [void](Add-Box $slide 49 $y 728 64 $C.White $C.SoftLine $true)
        [void](Add-Pill $slide $brands[$i][0] 65 ($y + 19) 90 $(if($i -eq 1){$C.PaleMint}else{$C.Mint}) $C.DeepGreen)
        [void](Add-Text $slide $brands[$i][1] 178 ($y + 17) 220 24 13 $C.Ink $true)
        [void](Add-Text $slide ("ERP " + $brands[$i][2]) 420 ($y + 17) 105 24 12 $C.Slate $true)
        Add-FlowArrow $slide 540 ($y + 32) 600 ($y + 32)
        [void](Add-Text $slide $brands[$i][3] 625 ($y + 15) 120 28 17 $C.Green $true $ppAlignRight)
    }
    [void](Add-Box $slide 799 209 99 228 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "ONE`nCATALOGUE" 813 231 72 46 12 $C.Mint $true $ppAlignCenter)
    [void](Add-Text $slide "3`nbrands" 813 301 72 55 22 $C.White $true $ppAlignCenter)
    [void](Add-Text $slide "3 correct`nprices" 813 379 72 43 12 $C.Mint $true $ppAlignCenter)
    [void](Add-Text $slide "Never force one ERP price level across every brand." 49 466 728 24 12 $C.Red $true)
    [void](Add-Box $slide 0 0 960 128 $C.DeepGreen -1 $false)
    [void](Add-Text $slide "STEP 5  /  PRICE RESOLUTION" 48 22 360 22 10 $C.Mint $true)
    [void](Add-Text $slide "Multi-brand catalogue pricing" 48 51 850 38 27 $C.White $true)
    [void](Add-Text $slide "One catalogue may contain many brands; each product follows its own mapping." 48 96 850 22 12 $C.Mint)

    # Slide 9 - Promotions
    $slide = $presentation.Slides.Add(9, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 6 - Apply an eligible promotion" "Promotions adjust the mapped customer price only when every eligibility rule passes." 9
    Add-StepNumber $slide 6 48 146
    [void](Add-Text $slide "Price calculation" 96 146 300 34 20 $C.Ink $true)
    [void](Add-Box $slide 49 213 235 112 $C.White $C.SoftLine $true)
    [void](Add-Text $slide "Mapped base price" 69 231 190 20 12 $C.Slate $true)
    [void](Add-Text $slide "THB 2,150" 69 264 190 36 26 $C.DeepGreen $true)
    [void](Add-Text $slide "-" 301 247 42 42 27 $C.Green $true $ppAlignCenter)
    [void](Add-Box $slide 354 213 235 112 $C.PaleMint $C.SoftLine $true)
    [void](Add-Text $slide "Eligible promotion" 374 231 190 20 12 $C.Slate $true)
    [void](Add-Text $slide "10% OFF" 374 264 190 36 26 $C.Green $true)
    [void](Add-Text $slide "=" 606 247 42 42 27 $C.Green $true $ppAlignCenter)
    [void](Add-Box $slide 659 213 239 112 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "Final customer price" 679 231 199 20 12 $C.Mint $true)
    [void](Add-Text $slide "THB 1,935" 679 264 199 36 26 $C.White $true)
    [void](Add-Text $slide "Promotion eligibility checks" 49 360 300 23 15 $C.Ink $true)
    Add-BulletList $slide @("Attached to the accessible catalogue", "Matches the customer audience", "Currently active and within date range", "Product included and stock rules satisfied") 57 389 780 25

    # Slide 10 - View, save, download
    $slide = $presentation.Slides.Add(10, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Step 7 - View, save and download" "The public catalogue and PDF use the same customer access context and pricing rules." 10
    Add-StepNumber $slide 7 48 145
    [void](Add-Text $slide "Customer actions" 96 146 300 34 20 $C.Ink $true)
    $actions = @(
        @("OPEN", "View every published page", $C.DeepGreen),
        @("SAVE", "Keep the catalogue in Saved", $C.Green),
        @("PDF", "Download when link allows it", $C.Blue)
    )
    for ($i = 0; $i -lt $actions.Count; $i++) {
        $x = 49 + $i * 283
        [void](Add-Box $slide $x 219 252 126 $C.White $C.SoftLine $true)
        [void](Add-Pill $slide $actions[$i][0] ($x + 18) 239 78 $actions[$i][2] $C.White)
        [void](Add-Text $slide $actions[$i][1] ($x + 18) 281 215 44 13 $C.Ink $true)
    }
    [void](Add-Box $slide 49 377 818 75 $C.Mint -1 $true)
    [void](Add-Text $slide "Consistent output" 72 394 180 18 10 $C.Green $true)
    [void](Add-Text $slide "Browser view and PDF must contain the same pages, covers, mapped prices and eligible promotions." 72 417 750 22 15 $C.Ink $true)

    # Slide 11 - Admin setup
    $slide = $presentation.Slides.Add(11, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Administrator setup - five short steps" "SuperAdmin or Sales Admin prepares the customer experience before sharing access." 11
    $adminSteps = @(
        @("1", "Create profile", "Name + customer code + audience"),
        @("2", "Map brands", "Choose the ERP level for each brand"),
        @("3", "Publish", "Publish the relevant catalogues"),
        @("4", "Attach offer", "Optionally attach an active promotion"),
        @("5", "Share access", "Issue a named customer link/code")
    )
    for ($i = 0; $i -lt $adminSteps.Count; $i++) {
        $x = 48 + ($i * 174)
        [void](Add-FlowCard $slide $adminSteps[$i][0] $adminSteps[$i][1] $adminSteps[$i][2] $x 170 154 190 $(if($i -eq 4){$C.Mint}else{$C.White}))
        if ($i -lt 4) { Add-FlowArrow $slide ($x + 154) 265 ($x + 172) 265 }
    }
    [void](Add-Text $slide "Keep it simple" 48 397 150 20 11 $C.Green $true)
    [void](Add-Text $slide "The customer never chooses a price list. Administrators configure the rules once; the platform resolves them automatically." 48 424 840 44 16 $C.Ink $true)

    # Slide 12 - Security
    $slide = $presentation.Slides.Add(12, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Permissions and security controls" "Customer convenience must not weaken commercial data controls." 12
    [void](Add-Box $slide 48 151 400 293 $C.DeepGreen -1 $true)
    [void](Add-Text $slide "CUSTOMER CAN" 76 179 180 18 10 $C.Mint $true)
    Add-BulletList $slide @("View published catalogues", "Open active promotions", "See resolved account prices", "Save and download allowed content", "Switch EN / TH and get help") 76 218 330 41 $C.White
    [void](Add-Box $slide 473 151 425 293 $C.White $C.SoftLine $true)
    [void](Add-Text $slide "PLATFORM ENFORCES" 501 179 210 18 10 $C.Green $true)
    Add-BulletList $slide @("Customer Account role required", "Named, scoped access link required", "Draft and archived catalogues excluded", "Expired or revoked links rejected", "Admin, edit and pricing controls hidden") 501 218 350 41 $C.Ink
    [void](Add-Text $slide "Access is secure by role + customer context + link status." 48 466 850 24 14 $C.Ink $true $ppAlignCenter)

    # Slide 13 - Exceptions
    $slide = $presentation.Slides.Add(13, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.OffWhite -1 $false)
    Add-Header $slide "Clear fallback rules prevent pricing mistakes" "Every missing or invalid condition produces a predictable customer-safe result." 13
    Add-TableRow $slide @("CONDITION", "PLATFORM RESPONSE", "CUSTOMER EXPERIENCE") @(260, 295, 295) 48 157 40 $true
    Add-TableRow $slide @("Brand mapping exists", "Use mapped ERP level", "Correct brand price") @(260, 295, 295) 48 197 48 $false
    Add-TableRow $slide @("Brand mapping missing", "Use approved default mapping", "Default customer price") @(260, 295, 295) 48 245 48 $false
    Add-TableRow $slide @("No safe mapping", "Return No Price", "Price is hidden") @(260, 295, 295) 48 293 48 $false
    Add-TableRow $slide @("No active promotion", "Keep mapped base price", "Normal account price") @(260, 295, 295) 48 341 48 $false
    Add-TableRow $slide @("Expired/revoked access", "Reject request", "Ask administrator for access") @(260, 295, 295) 48 389 48 $false
    [void](Add-Box $slide 48 458 850 37 $C.Mint -1 $true)
    [void](Add-Text $slide "Rule: never guess a price and never expose another customer's pricing profile." 64 466 818 21 12 $C.DeepGreen $true $ppAlignCenter $msoAnchorMiddle)

    # Slide 14 - Launch checklist
    $slide = $presentation.Slides.Add(14, $ppLayoutBlank)
    [void](Add-Box $slide 0 0 960 540 $C.DeepGreen -1 $false)
    [void](Add-Pill $slide "IMPLEMENTATION CHECKLIST" 54 43 190 $C.Mint $C.DeepGreen)
    [void](Add-Text $slide "Ready for customer rollout" 54 94 660 50 31 $C.White $true)
    [void](Add-Text $slide "Validate the complete journey with one real customer profile before launch." 54 151 700 34 16 $C.Mint)
    $checks = @(
        "Customer Account login routes to /customer",
        "Unique access code resolves the correct profile",
        "Only published catalogues are visible",
        "Multi-brand prices match ERP mappings",
        "Eligible promotions produce the expected final price",
        "Browser view and PDF show the same complete content"
    )
    for ($i = 0; $i -lt $checks.Count; $i++) {
        $col = $i % 2
        $row = [math]::Floor($i / 2)
        $x = 54 + $col * 425
        $y = 222 + $row * 76
        $circle = $slide.Shapes.AddShape($msoShapeOval, $x, $y, 30, 30)
        Set-ShapeStyle $circle $C.Mint -1
        [void](Add-Text $slide "OK" $x $y 30 30 11 $C.DeepGreen $true $ppAlignCenter $msoAnchorMiddle)
        [void](Add-Text $slide $checks[$i] ($x + 45) ($y - 2) 350 38 12 $C.White $true $ppAlignLeft $msoAnchorMiddle)
    }
    [void](Add-Text $slide "GMS Catalogue Platform" 54 491 300 20 11 $C.Mint $true)
    [void](Add-Text $slide "Customer Portal - Step by Step" 610 491 296 20 11 $C.Mint $true $ppAlignRight)

    $presentation.SaveAs($pptxPath)
    try {
        $presentation.SaveAs($pdfPath, 32)
    } catch {
        Write-Warning "PowerPoint was created, but PDF export failed: $($_.Exception.Message)"
    }
    Write-Output "Created: $pptxPath"
    if (Test-Path -LiteralPath $pdfPath) { Write-Output "Created: $pdfPath" }
}
finally {
    if ($presentation) { $presentation.Close() }
    if ($powerPoint) { $powerPoint.Quit() }
    if ($presentation) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation) }
    if ($powerPoint) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
