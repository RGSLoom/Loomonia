# Schneidet aus den vollstaendigen Item-Detailkarten-Screenshots (mit Titel/
# Effekttext) ein quadratisches Icon-Motiv (Icon + Leucht-Sockel, ohne Text)
# fuer Grid-Kacheln und Erfolgsmeldung aus.

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
$srcDir = Join-Path $root "assets\items"
$outDir = Join-Path $root "assets\generated"

$map = @{
  "Obstkorb.png"          = "icon_fruchtkorb_real.png"
  "Sprachbuch.png"        = "icon_sprachbuch_real.png"
  "Burger.png"            = "icon_energiesnack_real.png"
  "Health.png"            = "icon_gesundheitspaket_real.png"
  "Sneaker.png"           = "icon_sneaker_real.png"
  "Abenteuerrucksack.png" = "icon_rucksack_real.png"
  "Hoodie.png"            = "icon_hoodie_real.png"
  "Armband.png"           = "icon_armband_real.png"
}

# Individuelle Korrekturen, wo das Standard-Band (27%-66%) Titel- oder
# Effekttext mit erwischt hat (je nach Zeilenzahl im Untertitel variiert).
$overrides = @{
  "Sneaker.png"    = @{ topFrac = 0.27; bottomFrac = 0.58 }
  "Sprachbuch.png" = @{ topFrac = 0.33; bottomFrac = 0.66 }
}

foreach ($entry in $map.GetEnumerator()) {
  $srcPath = Join-Path $srcDir $entry.Key
  $outPath = Join-Path $outDir $entry.Value

  $img = [System.Drawing.Bitmap]::FromFile($srcPath)
  $w = $img.Width
  $h = $img.Height

  $topFrac = 0.27
  $bottomFrac = 0.66
  if ($overrides.ContainsKey($entry.Key)) {
    $topFrac = $overrides[$entry.Key].topFrac
    $bottomFrac = $overrides[$entry.Key].bottomFrac
  }

  $top = [int]($h * $topFrac)
  $bottom = [int]($h * $bottomFrac)
  $bandHeight = $bottom - $top
  $size = $bandHeight
  $left = [int](($w - $size) / 2)
  if ($left -lt 0) { $left = 0 }
  if ($size -gt $w) { $size = $w }

  $cropRect = New-Object System.Drawing.Rectangle($left, $top, $size, $size)
  $cropped = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($cropped)
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle(0,0,$size,$size)), $cropRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()

  $cropped.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $cropped.Dispose()
  $img.Dispose()

  Write-Output "Zugeschnitten: $($entry.Key) -> $($entry.Value) ($size x $size, top=$top)"
}
