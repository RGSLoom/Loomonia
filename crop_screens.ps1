# Schneidet einzelne Icon-/Bildbausteine aus den Referenz-Screens in
# assets/oberflaechen/ aus (Portrait, Kachel-Icons, Avatar/Rucksack-Icons),
# damit die echte App optisch 1:1 dem Original entspricht.

Add-Type -AssemblyName System.Drawing

$root = $PSScriptRoot
# Umlaute im Ordnernamen ("oberflächen") vermeiden wir im Skripttext direkt
# zu tippen (Encoding-Probleme bei .ps1 ohne BOM) und suchen stattdessen
# per Wildcard nach dem Ordner.
$srcDir = Get-ChildItem -Path (Join-Path $root "assets") -Directory -Filter "oberfl*chen" | Select-Object -First 1 -ExpandProperty FullName
$outDir = Join-Path $root "assets\generated"

function Crop-Fraction {
  param(
    [System.Drawing.Bitmap]$Img,
    [double]$X1, [double]$Y1, [double]$X2, [double]$Y2,
    [string]$OutPath
  )
  $w = $Img.Width
  $h = $Img.Height
  $left = [int]($X1 * $w)
  $top = [int]($Y1 * $h)
  $right = [int]($X2 * $w)
  $bottom = [int]($Y2 * $h)
  $cw = $right - $left
  $ch = $bottom - $top
  $rect = New-Object System.Drawing.Rectangle($left, $top, $cw, $ch)
  $cropped = New-Object System.Drawing.Bitmap($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($cropped)
  $g.DrawImage($Img, (New-Object System.Drawing.Rectangle(0,0,$cw,$ch)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $cropped.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $cropped.Dispose()
  Write-Output "OK: $OutPath ($cw x $ch)"
}

$avatarPath = Get-ChildItem -Path $srcDir -Filter "*bersicht*.png" | Select-Object -First 1 -ExpandProperty FullName
$avatarImg = [System.Drawing.Bitmap]::FromFile($avatarPath)
$outfitImg = [System.Drawing.Bitmap]::FromFile((Join-Path $srcDir "Outfit.png"))
$startImg  = [System.Drawing.Bitmap]::FromFile((Join-Path $srcDir "Startbildschirm.png"))

# --- Avatarübersicht: Portrait + 6 Kachel-Icons (kalibriert) ---
Crop-Fraction -Img $avatarImg -X1 0.12 -Y1 0.11 -X2 0.88 -Y2 0.50 -OutPath (Join-Path $outDir "portrait_luna.png")

Crop-Fraction -Img $avatarImg -X1 0.034 -Y1 0.535 -X2 0.339 -Y2 0.650 -OutPath (Join-Path $outDir "tile_outfit.png")
Crop-Fraction -Img $avatarImg -X1 0.356 -Y1 0.535 -X2 0.661 -Y2 0.650 -OutPath (Join-Path $outDir "tile_items.png")
Crop-Fraction -Img $avatarImg -X1 0.678 -Y1 0.535 -X2 0.983 -Y2 0.650 -OutPath (Join-Path $outDir "tile_trophies.png")
Crop-Fraction -Img $avatarImg -X1 0.034 -Y1 0.710 -X2 0.339 -Y2 0.825 -OutPath (Join-Path $outDir "tile_loomas.png")
Crop-Fraction -Img $avatarImg -X1 0.356 -Y1 0.710 -X2 0.661 -Y2 0.825 -OutPath (Join-Path $outDir "tile_habitat.png")
Crop-Fraction -Img $avatarImg -X1 0.678 -Y1 0.710 -X2 0.983 -Y2 0.825 -OutPath (Join-Path $outDir "tile_settings.png")

# --- Outfit: 6 Kachel-Icons + Buehnen-Hintergrund (kalibriert) ---
Crop-Fraction -Img $outfitImg -X1 0.028 -Y1 0.090 -X2 0.328 -Y2 0.287 -OutPath (Join-Path $outDir "tile_kopfteil.png")
Crop-Fraction -Img $outfitImg -X1 0.345 -Y1 0.090 -X2 0.655 -Y2 0.287 -OutPath (Join-Path $outDir "tile_oberteil.png")
Crop-Fraction -Img $outfitImg -X1 0.672 -Y1 0.090 -X2 0.983 -Y2 0.287 -OutPath (Join-Path $outDir "tile_hose.png")
Crop-Fraction -Img $outfitImg -X1 0.028 -Y1 0.375 -X2 0.328 -Y2 0.572 -OutPath (Join-Path $outDir "tile_outfitfigur.png")
Crop-Fraction -Img $outfitImg -X1 0.345 -Y1 0.375 -X2 0.655 -Y2 0.572 -OutPath (Join-Path $outDir "tile_outfitsneaker.png")
Crop-Fraction -Img $outfitImg -X1 0.672 -Y1 0.375 -X2 0.983 -Y2 0.572 -OutPath (Join-Path $outDir "tile_accessoire.png")
Crop-Fraction -Img $outfitImg -X1 0.0 -Y1 0.65 -X2 1.0 -Y2 1.0 -OutPath (Join-Path $outDir "bg_outfit_stage.png")

# --- Startbildschirm: Avatar- + Rucksack-Icon fuers Karten-HUD ---
Crop-Fraction -Img $startImg -X1 0.01 -Y1 0.005 -X2 0.21 -Y2 0.14 -OutPath (Join-Path $outDir "hud_avatar.png")
Crop-Fraction -Img $startImg -X1 0.79 -Y1 0.005 -X2 0.99 -Y2 0.14 -OutPath (Join-Path $outDir "hud_backpack.png")

$avatarImg.Dispose()
$outfitImg.Dispose()
$startImg.Dispose()
