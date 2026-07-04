$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outDir = "D:\yansir\mockups\ui-pages-refined-2026-06-09"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Get-ChildItem -LiteralPath $outDir -Filter "*-refined.png" -ErrorAction SilentlyContinue | Remove-Item -Force

$W = 430
$H = 932
$fontLogo = New-Object System.Drawing.Font("Segoe UI", 25, [System.Drawing.FontStyle]::Bold)
$fontTitle = New-Object System.Drawing.Font("Segoe UI", 21, [System.Drawing.FontStyle]::Bold)
$fontH = New-Object System.Drawing.Font("Segoe UI", 17, [System.Drawing.FontStyle]::Bold)
$fontB = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$fontM = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Regular)
$fontS = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$fontTiny = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Regular)

$C = @{
  bg = [System.Drawing.Color]::FromArgb(239,244,249)
  bg2 = [System.Drawing.Color]::FromArgb(247,250,252)
  panel = [System.Drawing.Color]::White
  soft = [System.Drawing.Color]::FromArgb(246,248,251)
  ink = [System.Drawing.Color]::FromArgb(15,23,42)
  ink2 = [System.Drawing.Color]::FromArgb(42,52,70)
  muted = [System.Drawing.Color]::FromArgb(103,116,135)
  line = [System.Drawing.Color]::FromArgb(216,226,238)
  blue = [System.Drawing.Color]::FromArgb(39,94,233)
  blue2 = [System.Drawing.Color]::FromArgb(20,55,140)
  green = [System.Drawing.Color]::FromArgb(15,139,111)
  greenSoft = [System.Drawing.Color]::FromArgb(229,248,240)
  red = [System.Drawing.Color]::FromArgb(218,74,93)
  violet = [System.Drawing.Color]::FromArgb(104,83,225)
}

function Brush($c) { New-Object System.Drawing.SolidBrush $c }
function PenC($c, [float]$w = 1) {
  $p = New-Object System.Drawing.Pen $c, $w
  $p.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $p.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $p
}
function RR($g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r, $fill, $stroke = $null) {
  if ($r -le 0) {
    $g.FillRectangle((Brush $fill), $x, $y, $w, $h)
    if ($stroke) { $g.DrawRectangle((PenC $stroke), $x, $y, $w, $h) }
    return
  }
  $r = [Math]::Min($r, [Math]::Floor([Math]::Min($w, $h) / 2))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath((Brush $fill), $path)
  if ($stroke) { $g.DrawPath((PenC $stroke), $path) }
  $path.Dispose()
}
function GR($g, [float]$x, [float]$y, [float]$w, [float]$h, [float]$r, $c1, $c2, [float]$angle = 45, $stroke = $null) {
  $rect = New-Object System.Drawing.Rectangle([int]$x, [int]$y, [int]$w, [int]$h)
  $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, $angle)
  if ($r -le 0) {
    $g.FillRectangle($br, $rect)
    if ($stroke) { $g.DrawRectangle((PenC $stroke), $x, $y, $w, $h) }
    $br.Dispose()
    return
  }
  $r = [Math]::Min($r, [Math]::Floor([Math]::Min($w, $h) / 2))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($br, $path)
  if ($stroke) { $g.DrawPath((PenC $stroke), $path) }
  $br.Dispose()
  $path.Dispose()
}
function T($g, [string]$s, [float]$x, [float]$y, $font, $color, [float]$max = 0) {
  if ($max -gt 0) {
    $sf = New-Object System.Drawing.StringFormat
    $sf.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
    $rect = New-Object System.Drawing.RectangleF($x, $y, $max, 120)
    $g.DrawString($s, $font, (Brush $color), $rect, $sf)
    $sf.Dispose()
  } else {
    $g.DrawString($s, $font, (Brush $color), $x, $y)
  }
}
function Dot($g, [float]$x, [float]$y, [float]$s, $fill, $stroke = $null) {
  $g.FillEllipse((Brush $fill), $x, $y, $s, $s)
  if ($stroke) { $g.DrawEllipse((PenC $stroke), $x, $y, $s, $s) }
}
function Icon($g, [string]$type, [float]$x, [float]$y, [float]$s, $color) {
  $pen = PenC $color ([Math]::Max(2, [int]($s / 12)))
  switch ($type) {
    "radar" {
      $g.DrawEllipse($pen, $x + 3, $y + 3, $s - 6, $s - 6)
      $g.DrawEllipse((PenC ([System.Drawing.Color]::FromArgb(150, $color.R, $color.G, $color.B)) 1), $x + 11, $y + 11, $s - 22, $s - 22)
      $g.DrawLine($pen, $x + $s / 2, $y + $s / 2, $x + $s - 8, $y + 10)
      Dot $g ($x + $s / 2 - 3) ($y + $s / 2 - 3) 6 $color
    }
    "data" {
      $g.DrawEllipse($pen, $x + 5, $y + 4, $s - 10, 10)
      $g.DrawLine($pen, $x + 5, $y + 9, $x + 5, $y + $s - 10)
      $g.DrawLine($pen, $x + $s - 5, $y + 9, $x + $s - 5, $y + $s - 10)
      $g.DrawArc($pen, $x + 5, $y + $s - 16, $s - 10, 12, 0, 180)
      $g.DrawLine($pen, $x + 8, $y + $s / 2, $x + $s - 8, $y + $s / 2)
    }
    "claw" {
      Dot $g ($x + 4) ($y + $s - 12) 8 $color
      Dot $g ($x + $s / 2 - 4) ($y + 5) 8 $color
      Dot $g ($x + $s - 12) ($y + $s - 12) 8 $color
      $g.DrawLine($pen, $x + 12, $y + $s - 12, $x + $s / 2, $y + 13)
      $g.DrawLine($pen, $x + $s - 12, $y + $s - 12, $x + $s / 2, $y + 13)
      $g.DrawLine($pen, $x + 12, $y + $s - 12, $x + $s - 12, $y + $s - 12)
    }
    "bell" {
      $g.DrawArc($pen, $x + 8, $y + 8, $s - 16, $s - 8, 200, 140)
      $g.DrawLine($pen, $x + 8, $y + $s - 13, $x + $s - 8, $y + $s - 13)
      $g.DrawLine($pen, $x + 10, $y + $s - 13, $x + 15, $y + 18)
      $g.DrawLine($pen, $x + $s - 10, $y + $s - 13, $x + $s - 15, $y + 18)
      Dot $g ($x + $s / 2 - 3) ($y + $s - 8) 6 $color
    }
    "user" {
      $g.DrawEllipse($pen, $x + $s / 2 - 7, $y + 6, 14, 14)
      $g.DrawArc($pen, $x + 8, $y + 21, $s - 16, $s - 8, 205, 130)
    }
    "coin" {
      Dot $g $x $y $s ([System.Drawing.Color]::FromArgb(238,244,255)) $color
      $coinFont = New-Object System.Drawing.Font("Arial", [int]($s / 2), [System.Drawing.FontStyle]::Bold)
      $g.DrawString("$", $coinFont, (Brush $color), $x + $s * 0.31, $y + $s * 0.16)
      $coinFont.Dispose()
    }
    "shield" {
      $pts = @(
        (New-Object System.Drawing.Point([int]($x + $s / 2), [int]($y + 2))),
        (New-Object System.Drawing.Point([int]($x + $s - 4), [int]($y + 10))),
        (New-Object System.Drawing.Point([int]($x + $s - 8), [int]($y + $s - 9))),
        (New-Object System.Drawing.Point([int]($x + $s / 2), [int]($y + $s - 2))),
        (New-Object System.Drawing.Point([int]($x + 8), [int]($y + $s - 9))),
        (New-Object System.Drawing.Point([int]($x + 4), [int]($y + 10)))
      )
      $g.DrawPolygon($pen, $pts)
      $g.DrawLine($pen, $x + $s * 0.32, $y + $s * 0.52, $x + $s * 0.45, $y + $s * 0.65)
      $g.DrawLine($pen, $x + $s * 0.45, $y + $s * 0.65, $x + $s * 0.72, $y + $s * 0.34)
    }
  }
}
function Header($g, [string]$tag, [string]$icon) {
  GR $g 0 0 430 78 0 $C.bg2 ([System.Drawing.Color]::FromArgb(246,250,255)) 90 $C.line
  T $g "SignalOS" 20 21 $fontLogo $C.ink
  RR $g 267 21 108 30 15 ([System.Drawing.Color]::FromArgb(235,242,255)) ([System.Drawing.Color]::FromArgb(215,228,255))
  Icon $g $icon 282 27 18 $C.blue
  T $g $tag 306 28 $fontTiny $C.blue
  RR $g 383 18 36 36 13 $C.panel $C.line
  $g.DrawEllipse((PenC $C.ink 3), 393, 28, 13, 13)
  $g.DrawLine((PenC $C.blue 4), 404, 40, 412, 48)
}
function Nav($g, [string]$active) {
  RR $g 0 856 430 76 0 ([System.Drawing.Color]::FromArgb(252,253,255)) $C.line
  $items = @(
    [pscustomobject]@{Label="Data"; Icon="data"},
    [pscustomobject]@{Label="Claw"; Icon="claw"},
    [pscustomobject]@{Label="AI"; Icon="radar"},
    [pscustomobject]@{Label="Alert"; Icon="bell"},
    [pscustomobject]@{Label="Me"; Icon="user"}
  )
  for ($i = 0; $i -lt $items.Count; $i++) {
    $x = 30 + $i * 86
    $sel = $items[$i].Label -eq $active
    $color = if ($sel) { $C.blue } else { [System.Drawing.Color]::FromArgb(142,153,168) }
    if ($items[$i].Label -eq "AI") {
      GR $g ($x - 11) 818 60 60 30 $C.blue $C.blue2 45 ([System.Drawing.Color]::White)
      T $g "AI" ($x + 3) 834 $fontH ([System.Drawing.Color]::White)
    } else {
      Icon $g $items[$i].Icon ($x + 3) 866 22 $color
    }
    T $g $items[$i].Label $x 896 $fontS $(if ($sel) { $C.ink } else { [System.Drawing.Color]::FromArgb(112,124,140) })
  }
}
function Canvas([string]$tag, [string]$active, [string]$icon) {
  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear($C.bg)
  Header $g $tag $icon
  Nav $g $active
  @($bmp, $g)
}
function Save($bmp, $g, [string]$name) {
  $g.Dispose()
  $bmp.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}
function MiniChip($g, [float]$x, [float]$y, [string]$text, $color) {
  RR $g $x $y 78 24 12 ([System.Drawing.Color]::FromArgb(238,244,255)) $null
  T $g $text ($x + 18) ($y + 5) $fontTiny $color
}
function Metric($g, [float]$x, [float]$y, [string]$label, [string]$value, [string]$icon, $color) {
  RR $g $x $y 122 86 18 $C.panel $C.line
  Dot $g ($x + 14) ($y + 14) 30 ([System.Drawing.Color]::FromArgb(238,244,255))
  Icon $g $icon ($x + 20) ($y + 20) 18 $color
  T $g $label ($x + 14) ($y + 50) $fontTiny $C.muted
  T $g $value ($x + 70) ($y + 18) $fontH $color
}

# Radar
$cv = Canvas "Radar" "AI" "radar"; $bmp = $cv[0]; $g = $cv[1]
T $g "Anomaly Radar" 20 102 $fontTitle $C.ink
T $g "Funds, price, OI, funding and strategy score in one action panel" 20 135 $fontM $C.muted 380
GR $g 18 174 394 172 22 ([System.Drawing.Color]::White) ([System.Drawing.Color]::FromArgb(242,248,255)) 30 $C.line
Icon $g "shield" 38 205 58 $C.green
T $g "Risk posture" 112 196 $fontS $C.muted
T $g "Risk Low" 112 220 $fontTitle $C.green
T $g "Next scan 08:25" 112 258 $fontB $C.ink
MiniChip $g 112 288 "5m cycle" $C.blue
MiniChip $g 198 288 "128 coins" $C.green
Icon $g "radar" 318 214 62 $C.blue
$rows = @(
  [pscustomobject]@{S="UB"; Score="91"; Title="FOMO"; Desc="Volume spike, OI expansion"; Color=$C.green},
  [pscustomobject]@{S="ETH"; Score="84"; Title="Contract"; Desc="Active short-term funds"; Color=$C.green},
  [pscustomobject]@{S="BTC"; Score="72"; Title="Crowded"; Desc="Long crowded, pullback risk"; Color=$C.red}
)
for ($i=0; $i -lt $rows.Count; $i++) {
  $y = 374 + $i * 104
  RR $g 18 $y 394 86 18 $C.panel $C.line
  Icon $g "coin" 38 ($y + 21) 42 $rows[$i].Color
  T $g $rows[$i].S 92 ($y + 15) $fontH $C.ink
  T $g $rows[$i].Title 92 ($y + 43) $fontB $rows[$i].Color
  T $g $rows[$i].Desc 174 ($y + 43) $fontS $C.muted 130
  T $g $rows[$i].Score 340 ($y + 16) $fontTitle $rows[$i].Color
  MiniChip $g 318 ($y + 54) "Detail" $C.blue
}
RR $g 18 710 188 50 16 $C.panel $C.blue
Icon $g "bell" 46 724 20 $C.blue
T $g "Preview" 82 724 $fontB $C.blue
GR $g 224 710 188 50 16 $C.blue $C.blue2 30 $null
Icon $g "claw" 252 724 20 ([System.Drawing.Color]::White)
T $g "Push alert" 288 724 $fontB ([System.Drawing.Color]::White)
Save $bmp $g "01-radar-refined.png"

# Data
$cv = Canvas "Data" "Data" "data"; $bmp = $cv[0]; $g = $cv[1]
T $g "Funds & On-chain Data" 20 102 $fontTitle $C.ink
T $g "Market rows, capital flow and factor interpretation" 20 135 $fontM $C.muted
Metric $g 18 174 "Symbols" "128" "data" $C.blue
Metric $g 154 174 "Risk" "17" "shield" $C.red
Metric $g 290 174 "Quota" "1616" "bell" $C.green
RR $g 18 286 394 46 16 $C.panel $C.line
$tabs = @("Funds","Chain","Sector","Ratio")
for ($i=0; $i -lt 4; $i++) {
  if ($i -eq 0) {
    GR $g (28 + $i * 94) 294 74 30 15 $C.ink $C.ink2 0 $null
    T $g $tabs[$i] (48 + $i * 94) 300 $fontS ([System.Drawing.Color]::White)
  } else {
    T $g $tabs[$i] (48 + $i * 94) 300 $fontS $C.muted
  }
}
$market = @(
  [pscustomobject]@{S="BTC"; P="76984.71"; State="Long crowded"; Ch="+1.20%"},
  [pscustomobject]@{S="ETH"; P="3606.80"; State="Trend up"; Ch="+3.86%"},
  [pscustomobject]@{S="UB"; P="0.1543"; State="First FOMO"; Ch="+28.78%"},
  [pscustomobject]@{S="XRP"; P="1.36"; State="Watch"; Ch="+0.01%"}
)
for ($i=0; $i -lt $market.Count; $i++) {
  $y = 360 + $i * 76
  RR $g 18 $y 394 60 16 $C.panel $C.line
  Icon $g "coin" 38 ($y + 14) 32 $C.blue
  T $g $market[$i].S 82 ($y + 10) $fontB $C.ink
  T $g $market[$i].State 82 ($y + 33) $fontTiny $C.muted
  T $g $market[$i].P 174 ($y + 18) $fontB $C.ink
  T $g $market[$i].Ch 300 ($y + 18) $fontB $C.green
  Dot $g 372 ($y + 19) 22 $C.blue
  T $g ">" 379 ($y + 17) $fontB ([System.Drawing.Color]::White)
}
T $g "Market Factors" 20 686 $fontH $C.ink
RR $g 18 722 394 70 18 $C.panel $C.line
Icon $g "shield" 38 740 30 $C.green
T $g "OI anomaly" 82 734 $fontB $C.ink
T $g "Open interest expands above recent baseline" 82 758 $fontS $C.muted
T $g "34.2%" 330 742 $fontH $C.green
Save $bmp $g "02-data-refined.png"

# Claw
$cv = Canvas "Claw" "Claw" "claw"; $bmp = $cv[0]; $g = $cv[1]
T $g "Professional analysis by chat" 20 102 $fontH $C.blue
T $g "Market read, backtest, scheduled tasks and personal assistant" 20 132 $fontM $C.ink
GR $g 18 166 394 494 24 $C.panel ([System.Drawing.Color]::FromArgb(248,251,255)) 90 $C.line
Dot $g 38 188 9 ([System.Drawing.Color]::FromArgb(248,105,93))
Dot $g 56 188 9 ([System.Drawing.Color]::FromArgb(247,201,72))
Dot $g 74 188 9 ([System.Drawing.Color]::FromArgb(87,189,120))
Icon $g "claw" 155 183 22 $C.blue
T $g "ValueClaw" 184 181 $fontB $C.ink
RR $g 38 230 354 52 14 $C.soft $C.line
T $g "What coins should I watch today?" 58 246 $fontM $C.ink
RR $g 38 310 96 26 13 $C.greenSoft $null
T $g "Analyzed" 62 315 $fontTiny $C.green
T $g "2026-06-09 12:23" 146 315 $fontTiny $C.muted
T $g "Coins worth attention" 38 354 $fontB $C.ink
$items = @("ARC: 24h +49.2%, score 60","RIVER: active capital flow","DOGE: 15m/30m funds warming")
for ($i=0; $i -lt $items.Count; $i++) {
  Dot $g 48 (386 + $i * 34) 6 $C.green
  T $g $items[$i] 66 (378 + $i * 34) $fontM $C.ink
}
T $g "My suggestion" 38 505 $fontB $C.green
T $g "Focus on strong short-term names, control position size. AI signal only; not investment advice." 56 536 $fontM $C.muted 320
RR $g 38 688 354 58 16 $C.panel $C.line
Icon $g "coin" 56 700 28 $C.blue
T $g "BTC latest data" 96 698 $fontB $C.ink
T $g "76984.71 - +1.20% - score 72" 96 722 $fontTiny $C.muted
Save $bmp $g "03-valueclaw-refined.png"

# Signal
$cv = Canvas "Alert Ops" "Alert" "bell"; $bmp = $cv[0]; $g = $cv[1]
T $g "Signal Center" 20 102 $fontTitle $C.ink
T $g "Scan jobs, Feishu robot, alert rules and delivery history" 20 135 $fontM $C.muted
RR $g 18 174 394 82 20 $C.panel $C.line
Icon $g "radar" 38 196 36 $C.blue
T $g "Scheduled scan stopped" 88 190 $fontB $C.ink
T $g "Start scan cycle and preview Feishu alert" 88 216 $fontS $C.muted
GR $g 332 198 58 34 12 $C.blue $C.blue2 30 $null
T $g "Start" 348 206 $fontS ([System.Drawing.Color]::White)
RR $g 18 280 394 112 20 $C.panel $C.line
Icon $g "bell" 38 306 34 $C.green
T $g "Feishu robot" 88 296 $fontB $C.ink
T $g "Webhook save + test delivery" 88 322 $fontS $C.muted
RR $g 38 350 244 28 9 $C.soft $C.line
T $g "https://open.feishu.cn/..." 52 355 $fontTiny $C.muted
GR $g 294 350 44 28 9 $C.blue $C.blue2 30 $null
T $g "Save" 304 355 $fontTiny ([System.Drawing.Color]::White)
RR $g 346 350 44 28 9 ([System.Drawing.Color]::FromArgb(234,241,255)) $null
T $g "Test" 356 355 $fontTiny $C.blue
RR $g 18 416 394 178 20 $C.panel $C.line
Icon $g "shield" 38 440 34 $C.violet
T $g "Alert rule" 88 430 $fontB $C.ink
$rules = @("Symbols: BTC, ETH, SOL","Timeframe: 5m        Min score: 65","Direction: long / risk / watch","Cooldown: 15 minutes")
for ($i=0; $i -lt $rules.Count; $i++) { T $g $rules[$i] 38 (480 + $i * 28) $fontM $C.ink }
RR $g 18 622 188 50 16 $C.panel $C.blue
Icon $g "radar" 46 636 20 $C.blue
T $g "Preview scan" 82 636 $fontB $C.blue
GR $g 224 622 188 50 16 $C.blue $C.blue2 30 $null
Icon $g "bell" 252 636 20 ([System.Drawing.Color]::White)
T $g "Scan & push" 286 636 $fontB ([System.Drawing.Color]::White)
T $g "Candidate signals" 20 706 $fontH $C.ink
RR $g 18 742 394 58 16 $C.panel $C.line
Icon $g "coin" 38 754 32 $C.blue
T $g "UB" 82 752 $fontB $C.ink
T $g "Active volume, first FOMO pattern" 128 752 $fontTiny $C.muted 170
MiniChip $g 318 759 "Preview" $C.blue
Save $bmp $g "04-signal-refined.png"

# Account
$cv = Canvas "Account" "Me" "user"; $bmp = $cv[0]; $g = $cv[1]
T $g "Account" 20 102 $fontTitle $C.ink
T $g "Subscription, quotas, entitlements and team users" 20 135 $fontM $C.muted
GR $g 18 174 394 148 22 $C.panel ([System.Drawing.Color]::FromArgb(244,248,255)) 30 $C.line
GR $g 42 204 54 54 18 $C.blue $C.blue2 45 $null
T $g "AI" 57 216 $fontH ([System.Drawing.Color]::White)
T $g "YanSir" 116 200 $fontB $C.ink
T $g "138****8821 - Admin" 116 226 $fontS $C.muted
RR $g 326 204 54 28 14 ([System.Drawing.Color]::FromArgb(234,241,255)) $null
T $g "SVIP" 340 210 $fontS $C.blue
T $g "Signal quota 384 / 2000" 38 280 $fontS $C.muted
RR $g 172 283 196 10 5 ([System.Drawing.Color]::FromArgb(229,235,243)) $null
GR $g 172 283 80 10 5 $C.blue $C.green 0 $null
T $g "Plans" 20 354 $fontH $C.ink
$plans = @(
  [pscustomobject]@{N="Free"; Price="Free"; Desc="Basic anomaly filter"; Icon="data"},
  [pscustomobject]@{N="VIP"; Price='$199/mo'; Desc="Realtime signal / Feishu"; Icon="bell"},
  [pscustomobject]@{N="SVIP"; Price='$699/mo'; Desc="Full scan / API / team"; Icon="shield"}
)
for ($i=0; $i -lt $plans.Count; $i++) {
  $y = 386 + $i * 78
  RR $g 18 $y 394 62 16 $(if ($plans[$i].N -eq "SVIP") { [System.Drawing.Color]::FromArgb(238,244,255) } else { $C.panel }) $C.line
  Icon $g $plans[$i].Icon 38 ($y + 16) 30 $C.blue
  T $g $plans[$i].N 82 ($y + 9) $fontB $C.ink
  T $g $plans[$i].Desc 82 ($y + 34) $fontS $C.muted
  T $g $plans[$i].Price 310 ($y + 19) $fontB $C.blue
}
T $g "Account menu" 20 646 $fontH $C.ink
$menus = @(
  [pscustomobject]@{N="Orders"; Icon="coin"},
  [pscustomobject]@{N="Entitlements"; Icon="shield"},
  [pscustomobject]@{N="Alert settings"; Icon="bell"},
  [pscustomobject]@{N="User management"; Icon="user"}
)
for ($i=0; $i -lt $menus.Count; $i++) {
  $y = 680 + $i * 42
  RR $g 18 $y 394 34 11 $C.panel $C.line
  Icon $g $menus[$i].Icon 38 ($y + 8) 18 $C.muted
  T $g $menus[$i].N 68 ($y + 7) $fontM $C.ink
  T $g ">" 382 ($y + 4) $fontB $C.muted
}
Save $bmp $g "05-account-refined.png"

# Symbol detail
$cv = Canvas "Coin" "AI" "coin"; $bmp = $cv[0]; $g = $cv[1]
T $g "BTC Detail" 20 102 $fontTitle $C.ink
$priceFont = New-Object System.Drawing.Font("Arial", 25, [System.Drawing.FontStyle]::Bold)
T $g "76984.71" 20 134 $priceFont $C.red
$priceFont.Dispose()
T $g "BTCUSDT - 24h +1.20% - long crowded" 20 172 $fontM $C.muted
GR $g 18 216 394 224 22 $C.panel ([System.Drawing.Color]::FromArgb(246,250,255)) 90 $C.line
T $g "Price trend / K-line area" 38 238 $fontS $C.muted
for ($i=0; $i -lt 6; $i++) {
  $x = 44 + $i * 56
  $g.DrawLine((PenC ([System.Drawing.Color]::FromArgb(232,238,246)) 1), $x, 264, $x, 412)
}
$pts = @(
  (New-Object System.Drawing.Point 42,386),
  (New-Object System.Drawing.Point 90,322),
  (New-Object System.Drawing.Point 138,348),
  (New-Object System.Drawing.Point 194,288),
  (New-Object System.Drawing.Point 252,310),
  (New-Object System.Drawing.Point 330,254),
  (New-Object System.Drawing.Point 388,276)
)
$g.DrawLines((PenC $C.blue 4), $pts)
foreach ($pt in $pts) { Dot $g ($pt.X - 4) ($pt.Y - 4) 8 $C.blue }
RR $g 18 468 394 48 16 $C.panel $C.line
$tf = @(
  [pscustomobject]@{Label="1m"; X=52; Active=$false},
  [pscustomobject]@{Label="5m"; X=128; Active=$true},
  [pscustomobject]@{Label="15m"; X=210; Active=$false},
  [pscustomobject]@{Label="1h"; X=292; Active=$false},
  [pscustomobject]@{Label="4h"; X=362; Active=$false}
)
foreach ($item in $tf) {
  if ($item.Active) {
    GR $g ($item.X - 18) 476 58 32 16 $C.blue $C.blue2 0 $null
    T $g $item.Label ($item.X + 1) 483 $fontB ([System.Drawing.Color]::White)
  } else {
    T $g $item.Label $item.X 483 $fontB $C.muted
  }
}
T $g "Fund table" 20 556 $fontH $C.ink
RR $g 18 592 394 184 20 $C.panel $C.line
T $g "Time        Inflow       Outflow       Net" 38 616 $fontS $C.muted
$funds = @(
  "5m          18.62w       11.42w        7.20w",
  "15m         42.31w       25.74w        16.57w",
  "30m         66.08w       51.22w        14.86w",
  "1h          120.4w       90.8w         29.6w"
)
for ($i=0; $i -lt $funds.Count; $i++) {
  T $g $funds[$i] 38 (650 + $i * 30) $fontS $C.ink
}
Save $bmp $g "06-symbol-detail-refined.png"

Get-ChildItem -LiteralPath $outDir -Filter "*-refined.png" | Select-Object Name,Length | Format-Table -AutoSize


