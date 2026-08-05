$root = $PSScriptRoot
$dir = Get-ChildItem -Path (Join-Path $root "assets") -Directory -Filter "oberfl*chen" | Select-Object -First 1 -ExpandProperty FullName
$src = Get-ChildItem -Path $dir -Filter "*bersicht*.png" | Select-Object -First 1 -ExpandProperty FullName
$dest = Join-Path $root "assets\generated\profile_hub.png"
Copy-Item -Path $src -Destination $dest -Force
Write-Output "Kopiert nach: $dest"
