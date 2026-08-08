# Einfacher statischer HTTP-Server fuer lokale Tests (kein Node/Python noetig).
# Start:  powershell -ExecutionPolicy Bypass -File server.ps1
# Danach im Browser: http://localhost:8080 (Spiel) bzw. http://localhost:8080/dashboard/
#
# Bewusst ein roher TcpListener statt System.Net.HttpListener: HttpListener
# lehnt Requests ab, deren Host-Header nicht exakt zum registrierten Prefix
# passt (z.B. eine trycloudflare.com-Domain oder die LAN-IP) -> 400 Bad
# Request. Der TcpListener kennt kein Host-Header-Whitelisting und ist daher
# problemlos per Cloudflare-Tunnel (HTTPS, fuers Handy/GPS) oder LAN-IP
# erreichbar.

param(
  [int]$Port = 8080
)

$root = $PSScriptRoot
$fullRoot = (Resolve-Path $root).Path

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)

try {
  $listener.Start()
} catch {
  Write-Host "Konnte Port $Port nicht oeffnen. Ist er bereits belegt?" -ForegroundColor Red
  exit 1
}

Write-Host "Store Walk laeuft auf http://localhost:$Port (Strg+C zum Beenden)" -ForegroundColor Green

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".gif"  = "image/gif"
  ".ico"  = "image/x-icon"
  ".webp" = "image/webp"
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    # Timeout, damit ein haengender/unvollstaendiger Client (z.B. ein
    # Health-Check ohne Daten) nicht den gesamten (single-threaded) Server
    # blockiert.
    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 5000
    $stream = $client.GetStream()
    $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)

    $requestLine = $reader.ReadLine()
    if ([string]::IsNullOrEmpty($requestLine)) { $client.Close(); continue }

    # Restliche Header verwerfen, bis zur Leerzeile (Request-Ende)
    while (($headerLine = $reader.ReadLine()) -ne $null -and $headerLine -ne "") { }

    $parts = $requestLine.Split(" ")
    $rawPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }
    $urlPath = [System.Uri]::UnescapeDataString($rawPath.Split("?")[0])
    # Verzeichnis-Aufrufe (z.B. "/" oder "/dashboard/") auf index.html
    # aufloesen, analog zu GitHub Pages (wo /dashboard/ produktiv landet).
    if ($urlPath.EndsWith("/")) { $urlPath += "index.html" }

    $filePath = Join-Path $root ($urlPath.TrimStart("/"))
    $resolvedPath = [System.IO.Path]::GetFullPath($filePath)

    $writer = New-Object System.IO.BinaryWriter($stream)

    # Exakter Ordner-Grenzcheck (nicht nur String-Prefix) gegen Pfad-Traversal
    # und gegen ein zufaellig gleich beginnendes Nachbarverzeichnis.
    $withinRoot = ($resolvedPath -eq $fullRoot) -or $resolvedPath.StartsWith($fullRoot + [System.IO.Path]::DirectorySeparatorChar)
    if (-not $withinRoot -or -not (Test-Path $resolvedPath -PathType Leaf)) {
      $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
      $headerText = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $writer.Write([System.Text.Encoding]::ASCII.GetBytes($headerText))
      $writer.Write($body)
    } else {
      $ext = [System.IO.Path]::GetExtension($resolvedPath).ToLower()
      $contentType = $mimeTypes[$ext]
      if (-not $contentType) { $contentType = "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($resolvedPath)
      $headerText = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
      $writer.Write([System.Text.Encoding]::ASCII.GetBytes($headerText))
      $writer.Write($bytes)
    }
    $writer.Flush()
  } catch {
    # Verbindungsfehler einzelner Requests ignorieren, Server laeuft weiter
  } finally {
    $client.Close()
  }
}
