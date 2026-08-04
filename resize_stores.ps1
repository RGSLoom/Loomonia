# Verkleinert die echten Store-Fotos (1600x1600, ~3 MB PNG) auf eine fuers
# Web sinnvolle Groesse und speichert sie als JPEG (kleinere Dateigroesse).

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$srcDir = Join-Path $root "assets\stores"
$outDir = Join-Path $root "assets\generated"

$map = @{
  "Supermarkt.png" = "store_feinkost_real.jpg"
  "Juwellier.png"  = "store_juwelier_real.jpg"
  "Streetwear.png" = "store_sneaker_real.jpg"
  "Fashion.png"    = "store_fashion_real.jpg"
  "Bank.png"       = "store_bank_real.jpg"
  "Cafe.png"       = "store_cafe_real.jpg"
}

$targetSize = 900

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 85L)

foreach ($entry in $map.GetEnumerator()) {
  $srcPath = Join-Path $srcDir $entry.Key
  $outPath = Join-Path $outDir $entry.Value

  $img = [System.Drawing.Bitmap]::FromFile($srcPath)
  $resized = New-Object System.Drawing.Bitmap($targetSize, $targetSize)
  $g = [System.Drawing.Graphics]::FromImage($resized)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $targetSize, $targetSize)
  $g.Dispose()

  $resized.Save($outPath, $jpegCodec, $encParams)
  $resized.Dispose()
  $img.Dispose()

  $sizeKb = [math]::Round((Get-Item $outPath).Length / 1KB)
  Write-Output "$($entry.Key) -> $($entry.Value) (${targetSize}x${targetSize}, ${sizeKb} KB)"
}
