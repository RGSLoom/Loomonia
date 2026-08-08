# Verkleinert die neuen Fangszenen-Hintergruende (assets/hintergrund) auf
# eine web-taugliche Groesse und speichert sie als JPEG.

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$srcDir = Join-Path $root "assets\hintergrund"
$outDir = Join-Path $root "assets\generated"

# Himmel.webp fehlt hier bewusst: GDI+/System.Drawing kann WebP nicht
# lesen ("Nicht genuegend Arbeitsspeicher" ist GDI+'s generischer Fehler
# fuer nicht unterstuetzte Formate). Wird stattdessen unveraendert nach
# assets/generated/bg_enari_real.webp kopiert — Browser koennen WebP
# nativ darstellen, keine Konvertierung noetig.
$map = @{
  "Waldlichtung.png"      = "bg_fauli_real.jpg"
  "Vulkan.png"             = "bg_fifu_real.jpg"
  "Unterwasserwelt.png"    = "bg_nami_real.jpg"
  "Wiesenlandschaft.png"   = "bg_wollypig_real.jpg"
}

$targetWidth = 800

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 85L)

foreach ($entry in $map.GetEnumerator()) {
  $srcPath = Join-Path $srcDir $entry.Key
  $outPath = Join-Path $outDir $entry.Value

  try {
    $img = [System.Drawing.Bitmap]::FromFile($srcPath)
  } catch {
    Write-Output "FEHLER beim Lesen von $($entry.Key): $($_.Exception.Message)"
    continue
  }

  $targetHeight = [int]($targetWidth * $img.Height / $img.Width)
  $resized = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
  $g = [System.Drawing.Graphics]::FromImage($resized)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $targetWidth, $targetHeight)
  $g.Dispose()

  $resized.Save($outPath, $jpegCodec, $encParams)
  $resized.Dispose()
  $img.Dispose()

  $sizeKb = [math]::Round((Get-Item $outPath).Length / 1KB)
  Write-Output "$($entry.Key) -> $($entry.Value) (${targetWidth}x${targetHeight}, ${sizeKb} KB)"
}
