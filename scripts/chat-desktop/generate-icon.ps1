#requires -Version 5
# Gera os assets de ícone do OneClick Chat Desktop a partir do arquivo-fonte
# assets/icon-source.png (entregue pelo design). Cria:
#   - assets/icon.png       (256x256) — usado pela janela, Linux AppImage
#   - assets/tray-icon.png  (32x32)   — system tray do Windows
#   - assets/icon.ico       multi-tamanho (16, 32, 48, 64, 128, 256) — .exe,
#                                         atalhos do menu Iniciar / área de
#                                         trabalho / notificações nativas
#
# Pra trocar o ícone, basta substituir assets/icon-source.png e rodar
# `npm run generate-icon` (ou `npm run build` que já chama isso antes).

Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path $PSScriptRoot 'assets'
$sourcePath = Join-Path $assetsDir 'icon-source.png'
if (-not (Test-Path $sourcePath)) {
  throw "icon-source.png não encontrado em $assetsDir. Coloque o PNG da arte (quadrado, alta resolução) ali antes de rodar."
}

$source = [System.Drawing.Image]::FromFile($sourcePath)

function Resize-IconSource {
  param([int]$size)

  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($source, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
  $g.Dispose()
  return $bmp
}

# PNG 256x256 (janela + Linux AppImage)
$pngPath = Join-Path $assetsDir 'icon.png'
$bmpLarge = Resize-IconSource -size 256
$bmpLarge.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  PNG salvo: $pngPath ($($bmpLarge.Width)x$($bmpLarge.Height))"
$bmpLarge.Dispose()

# Tray PNG 32x32
$trayPath = Join-Path $assetsDir 'tray-icon.png'
$bmpTray = Resize-IconSource -size 32
$bmpTray.Save($trayPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Host "  Tray PNG salvo: $trayPath"
$bmpTray.Dispose()

# ICO multi-tamanho (formato Windows com PNG embutido em cada entry)
$icoPath = Join-Path $assetsDir 'icon.ico'
$sizes = @(16, 32, 48, 64, 128, 256)
$bitmaps = @()
$pngBytes = @()

foreach ($s in $sizes) {
  $b = Resize-IconSource -size $s
  $bitmaps += $b
  $ms = New-Object System.IO.MemoryStream
  $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes += ,([byte[]]$ms.ToArray())
  $ms.Dispose()
}

$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($stream)
$bw.Write([uint16]0)            # reserved
$bw.Write([uint16]1)            # type (ICO)
$bw.Write([uint16]$sizes.Count) # count

$dataOffset = 6 + (16 * $sizes.Count)

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

foreach ($bytes in $pngBytes) { $bw.Write($bytes) }

$bw.Dispose()
$stream.Dispose()
foreach ($b in $bitmaps) { $b.Dispose() }
$source.Dispose()

Write-Host "  ICO salvo: $icoPath (sizes: $($sizes -join ', '))"
Write-Host "Done."
