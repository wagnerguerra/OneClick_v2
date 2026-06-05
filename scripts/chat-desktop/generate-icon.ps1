#requires -Version 5
# Gera o icon.png + icon.ico (multi-tamanho) do OneClick Chat Desktop.
# Identidade visual: gradient sky→indigo (mesmo do tray + login.html) com
# bolha de chat ao centro. Roda no build pra manter o icone alinhado a
# qualquer mudanca futura sem dependencias externas (ImageMagick etc).

Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path $PSScriptRoot 'assets'
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }

# Cores do gradient (sky-500 → indigo-500)
$colorTop    = [System.Drawing.Color]::FromArgb(255, 14, 165, 233)   # #0EA5E9
$colorBottom = [System.Drawing.Color]::FromArgb(255, 99, 102, 241)   # #6366F1
$white       = [System.Drawing.Color]::White

function New-ChatBitmap {
  param([int]$size)

  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  # Fundo arredondado com gradient diagonal
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $radius = [int]($size * 0.22)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc(0, 0, $d, $d, 180, 90) | Out-Null
  $path.AddArc($size - $d, 0, $d, $d, 270, 90) | Out-Null
  $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90) | Out-Null
  $path.AddArc(0, $size - $d, $d, $d, 90, 90) | Out-Null
  $path.CloseFigure()

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $colorTop, $colorBottom, 135.0)
  $g.FillPath($brush, $path)
  $brush.Dispose()

  # Balão de chat (bubble + cauda triangular embaixo à esquerda)
  $bx = [int]($size * 0.18)
  $by = [int]($size * 0.22)
  $bw = [int]($size * 0.64)
  $bh = [int]($size * 0.50)
  $br = [int]($size * 0.10)
  $bd = $br * 2

  $bubble = New-Object System.Drawing.Drawing2D.GraphicsPath
  $bubble.AddArc($bx, $by, $bd, $bd, 180, 90) | Out-Null
  $bubble.AddArc($bx + $bw - $bd, $by, $bd, $bd, 270, 90) | Out-Null
  $bubble.AddArc($bx + $bw - $bd, $by + $bh - $bd, $bd, $bd, 0, 90) | Out-Null
  $bubble.AddArc($bx, $by + $bh - $bd, $bd, $bd, 90, 90) | Out-Null
  $bubble.CloseFigure()

  $whiteBrush = New-Object System.Drawing.SolidBrush($white)
  $g.FillPath($whiteBrush, $bubble)

  # Cauda do balão (triangulo embaixo à esquerda).
  # PowerShell trata "$tailY - 1" como subtração entre array e int dentro do
  # construtor — variáveis intermediárias resolvem.
  $tailX = [int]($size * 0.26)
  $tailY = $by + $bh
  $ty1 = $tailY - 1
  $ty2 = $tailY + [int]($size * 0.10)
  $p1 = New-Object System.Drawing.Point($tailX, $ty1)
  $p2 = New-Object System.Drawing.Point(($tailX + [int]($size * 0.04)), $ty2)
  $p3 = New-Object System.Drawing.Point(($tailX + [int]($size * 0.12)), $ty1)
  [System.Drawing.Point[]]$tail = @($p1, $p2, $p3)
  $g.FillPolygon($whiteBrush, $tail)
  $whiteBrush.Dispose()

  # Três pontinhos dentro do balão (representando mensagem)
  $dotBrush = New-Object System.Drawing.SolidBrush($colorBottom)
  $dotRadius = [int]($size * 0.035)
  $cy = $by + [int]($bh / 2)
  $spacing = [int]($size * 0.14)
  $cx = $bx + [int]($bw / 2) - $spacing
  for ($i = 0; $i -lt 3; $i++) {
    $g.FillEllipse($dotBrush, $cx - $dotRadius, $cy - $dotRadius, $dotRadius * 2, $dotRadius * 2)
    $cx += $spacing
  }
  $dotBrush.Dispose()

  $g.Dispose()
  return $bmp
}

# Gera PNG 256x256 (usado em vários lugares, incluindo Linux AppImage)
$pngPath = Join-Path $assetsDir 'icon.png'
$bmpLarge = New-ChatBitmap -size 256
$bmpLarge.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  PNG salvo: $pngPath ($($bmpLarge.Width)x$($bmpLarge.Height))"
$bmpLarge.Dispose()

# Gera o tray-icon.png (32x32) — versão pequena pro tray
$trayPath = Join-Path $assetsDir 'tray-icon.png'
$bmpTray = New-ChatBitmap -size 32
$bmpTray.Save($trayPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  Tray PNG salvo: $trayPath"
$bmpTray.Dispose()

# Gera o icon.ico com múltiplos tamanhos (16, 32, 48, 64, 128, 256)
# Header ICO: 6 bytes + 16 bytes por entry + data PNG/BMP por imagem
$icoPath = Join-Path $assetsDir 'icon.ico'
$sizes = @(16, 32, 48, 64, 128, 256)
$bitmaps = @()
$pngBytes = @()

foreach ($s in $sizes) {
  $b = New-ChatBitmap -size $s
  $bitmaps += $b
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes += ,([byte[]]$ms.ToArray())
  $ms.Dispose()
}

$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($stream)
# ICONDIR
$bw.Write([uint16]0)            # reserved
$bw.Write([uint16]1)            # type (1 = ICO)
$bw.Write([uint16]$sizes.Count) # count

# offset depois do ICONDIR (6) + ICONDIRENTRYs (16 cada)
$dataOffset = 6 + (16 * $sizes.Count)

# ICONDIRENTRY x N
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $sizeByte = if ($s -ge 256) { 0 } else { [byte]$s }
  $bw.Write([byte]$sizeByte) # width
  $bw.Write([byte]$sizeByte) # height
  $bw.Write([byte]0)         # color palette
  $bw.Write([byte]0)         # reserved
  $bw.Write([uint16]1)       # color planes
  $bw.Write([uint16]32)      # bits per pixel
  $bw.Write([uint32]$pngBytes[$i].Length)
  $bw.Write([uint32]$dataOffset)
  $dataOffset += $pngBytes[$i].Length
}

# Dados PNG
foreach ($bytes in $pngBytes) { $bw.Write($bytes) }

$bw.Dispose()
$stream.Dispose()
foreach ($b in $bitmaps) { $b.Dispose() }

Write-Host "  ICO salvo: $icoPath (sizes: $($sizes -join ', '))"
Write-Host "Done."
