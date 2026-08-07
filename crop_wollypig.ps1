# Schneidet aus "Wolly Pig.png" (bereits echt freigestellt, Format32bppArgb
# mit Alphakanal) einen quadratischen Ausschnitt zentriert auf das Wesen,
# fuer Kartenmarker und Fangszenen-Vordergrund.

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$src = Join-Path $root "assets\wesen\Wolly Pig.png"
$outDir = Join-Path $root "assets\generated"

$img = [System.Drawing.Bitmap]::FromFile($src)
$w = $img.Width
$h = $img.Height

$x1 = [int](0.085 * $w)
$x2 = [int](0.915 * $w)
$y1 = [int](0.221 * $h)
$y2 = [int](0.775 * $h)
$cw = $x2 - $x1
$ch = $y2 - $y1
$size = [Math]::Min($cw, $ch)

$rect = New-Object System.Drawing.Rectangle($x1, $y1, $size, $size)
$cropped = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($cropped)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()

$outPath = Join-Path $outDir "icon_wollypig.png"
$cropped.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose()
$img.Dispose()

Write-Output "Zugeschnitten: $outPath ($size x $size)"
