# Deploy-Anleitung: locations-admin / events-admin / store-articles-admin

Diese drei Edge Functions sind der Ersatz für die bisherigen direkten
Schreib-/Lese-/Lösch-Zugriffe der Dashboards über den öffentlichen anon-Key.
Sie laufen bei Supabase (nicht auf GitHub Pages) und nutzen dort den
Service-Role-Key, der **nie** im Client-Code stehen darf.

Ich (Claude Code) habe hier keinen Zugriff auf die Supabase-CLI-Anmeldung
oder die Projekt-Credentials — die folgenden Schritte musst du einmalig
selbst ausführen, in genau dieser Reihenfolge. Node.js muss installiert
sein (für `npx`), eine globale Installation der Supabase-CLI ist nicht
nötig.

## 1. Ein Admin-Passwort festlegen und dessen Hash berechnen

Wähle ein Passwort (gilt für beide Dashboards gemeinsam, ersetzt die
bisherige "wer zuerst kommt legt es fest"-Lösung). Berechne seinen
SHA-256-Hash, z.B. in der PowerShell:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "DEIN_PASSWORT_HIER"
```

Den Hash brauchst du gleich für Schritt 3 — das Klartext-Passwort selbst
wird nirgends gespeichert oder committed.

## 2. Bei Supabase einloggen und Functions deployen

```bash
npx supabase login
npx supabase functions deploy locations-admin --project-ref oztsymfskxaeonxqggfb
npx supabase functions deploy events-admin --project-ref oztsymfskxaeonxqggfb
npx supabase functions deploy store-articles-admin --project-ref oztsymfskxaeonxqggfb
```

## 3. Secret setzen

```bash
npx supabase secrets set ADMIN_PASSWORD_HASH=<Hash aus Schritt 1> --project-ref oztsymfskxaeonxqggfb
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` müssen NICHT manuell gesetzt
werden — die stellt Supabase jeder Edge Function automatisch als Umgebungsvariable
bereit. store-articles-admin nutzt denselben `ADMIN_PASSWORD_HASH` wie die
beiden anderen Functions, kein zusätzliches Secret nötig — vorher aber
`supabase/store_articles_setup.sql` im SQL-Editor ausführen (legt die Tabelle
inkl. RLS-Policy für die neue Function an).

## 4. Erst DANACH: RLS-Policies verschärfen

Jetzt erst `supabase/rls_lockdown.sql` im SQL-Editor ausführen
(https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new).
Vorher ausführen würde Standortverwaltung und Dashboard-Reset bis zum
Deploy der Functions funktionsunfähig machen.

## 5. Verifizieren

Diese beiden Aufrufe sollten nach Schritt 4 fehlschlagen (der anon-Key darf
nicht mehr lesen/löschen):

```bash
# events lesen mit anon-Key -> muss jetzt fehlschlagen/leer sein (RLS)
curl -s "https://oztsymfskxaeonxqggfb.supabase.co/rest/v1/events?select=*&limit=1" \
  -H "apikey: sb_publishable_eLpKDhCusR_w3Fc6eh_0Lw_k8aiE-oO"

# locations schreiben mit anon-Key -> muss jetzt fehlschlagen
curl -s -X POST "https://oztsymfskxaeonxqggfb.supabase.co/rest/v1/locations" \
  -H "apikey: sb_publishable_eLpKDhCusR_w3Fc6eh_0Lw_k8aiE-oO" \
  -H "Content-Type: application/json" \
  -d '{"id":"test_should_fail","type":"landmark","name":"Test","landmark_icon":"📍"}'
```

Und diese beiden sollten weiterhin funktionieren:

```bash
# locations lesen mit anon-Key -> muss weiterhin klappen (Spiel braucht das)
curl -s "https://oztsymfskxaeonxqggfb.supabase.co/rest/v1/locations?select=id,name&limit=1" \
  -H "apikey: sb_publishable_eLpKDhCusR_w3Fc6eh_0Lw_k8aiE-oO"

# events schreiben mit anon-Key -> muss weiterhin klappen (Spiel-Tracking)
curl -s -X POST "https://oztsymfskxaeonxqggfb.supabase.co/rest/v1/events" \
  -H "apikey: sb_publishable_eLpKDhCusR_w3Fc6eh_0Lw_k8aiE-oO" \
  -H "Content-Type: application/json" \
  -d '{"type":"test_event","player_id":"test","ts":"2026-01-01T00:00:00Z"}'
```

Und schließlich, mit dem richtigen Admin-Passwort-Hash aus Schritt 1, sollte
die Function funktionieren:

```bash
curl -s "https://oztsymfskxaeonxqggfb.supabase.co/functions/v1/events-admin?select=*&limit=1" \
  -H "x-admin-password-hash: <Hash aus Schritt 1>"
```

Sag mir kurz Bescheid, sobald Schritt 1–4 erledigt sind (oder schick mir die
Ausgabe der Verifikations-Aufrufe) — dann kann ich das nochmal gegenprüfen.

## mapbox-token

Liefert den Mapbox-Access-Token an die Karte (Spielkarte + Standortverwaltung)
aus, ohne ihn im Repo zu hinterlegen. Bewusst öffentlich/ohne Admin-Check,
siehe Kommentar in `mapbox-token/index.ts` — Schutz kommt hier nicht aus
Geheimhaltung, sondern aus der URL-Einschränkung im Mapbox-Konto (siehe unten).

### 1. Mapbox-Konto + Token

- Konto auf mapbox.com anlegen.
- Einen **öffentlichen** Token (`pk.…`) erzeugen oder den Default-Token nutzen.
- Im Mapbox-Konto unter "URL restrictions" die erlaubten Domains eintragen,
  z.B. `https://app.retailgs.de/*` und `http://localhost:8080/*` — damit
  funktioniert der Token ausschließlich auf diesen Seiten, selbst wenn ihn
  jemand aus dem Seitenquelltext kopiert.
- Empfehlenswert: in den Mapbox-Kontoeinstellungen ein monatliches Budget-
  Limit bzw. eine Alert-Mail konfigurieren (Mapbox → Account → Billing/
  Usage), damit ein unerwarteter Kostenanstieg auffällt, bevor er teuer wird.
  Das kostenlose Kontingent liegt aktuell bei 50.000 Kartenaufrufen/Monat,
  danach 5 USD pro weitere 1.000 Aufrufe — vor Produktivsetzung nochmal auf
  der offiziellen Mapbox-Preisseite verifizieren, da sich Konditionen ändern
  können.

### 2. Deploy + Secret setzen

```bash
npx supabase functions deploy mapbox-token --project-ref oztsymfskxaeonxqggfb
npx supabase secrets set MAPBOX_ACCESS_TOKEN=<dein pk.-Token> --project-ref oztsymfskxaeonxqggfb
```

### 3. Verifizieren

```bash
curl -s "https://oztsymfskxaeonxqggfb.supabase.co/functions/v1/mapbox-token"
```

Sollte `{"token":"pk...."}` liefern.

### Warum keine neuen Kartenaufrufe durch Fangmodus/Nachmal-Minigame entstehen

Ein Kartenaufruf bei Mapbox GL JS zählt beim Neu-Initialisieren der Karte
(z.B. Seitenaufruf/Reload), nicht bei Zoom/Pan/Rotieren oder dem Öffnen von
Overlays — eine Sitzung gilt bis zu 12 Stunden. Fangszene (`js/catchgame.js`)
und Nachmal-Minigame (`js/drawgame.js`) sind reine `<section>`-Overlays, die
per CSS-Klasse ein-/ausgeblendet werden (`showScreen()` in `js/main.js`);
die darunterliegende Mapbox-Karte (`#screen-map`) wird dabei nie entfernt
oder neu erzeugt (kein `map.remove()`/Neuaufruf von `initMap()` beim
Wechseln). Ein normaler Spieldurchlauf verursacht dadurch nur einen einzigen
Kartenaufruf pro Sitzung, unabhängig davon, wie oft gefangen/gemalt wird.

## receipt-ocr

Liest Bon-Fotos per Cloud-OCR (OCR.space) aus, damit der Bon-Scan im Spiel
Kassenzettel deutlich zuverlässiger erkennt als die bisherige reine
In-Browser-Erkennung mit Tesseract.js. Tesseract (`deu`) bleibt als
automatischer Fallback in `js/bonscan.js` — schlägt diese Function fehl
(Secret nicht gesetzt, offline, Kontingent leer), läuft der Scan wie bisher.
Bewusst öffentlich/ohne Admin-Check (jeder Spieler scannt Bons), siehe
Kommentar in `receipt-ocr/index.ts`.

### 1. Kostenlosen OCR.space-API-Key holen

- Auf <https://ocr.space/ocrapi/freekey> die E-Mail-Adresse eintragen — der
  Key kommt sofort per Mail. **Keine Kreditkarte, kein Abo.**
- Free-Tier: 25.000 Anfragen/Monat, max. 1 MB pro Bild (der Client
  komprimiert das Foto vorher automatisch darunter), zusätzlich ein
  Tageslimit von 500 Anfragen pro ausgehender IP. Für den Prototyp/Demo
  reicht das; bei echtem Traffic ggf. auf den kostenpflichtigen PRO-Plan
  wechseln (dann nur den Secret-Wert austauschen, kein Code-Change nötig).

### 2. Deploy + Secret setzen

Mit Node/`npx` (wie die anderen Functions):

```bash
npx supabase functions deploy receipt-ocr --project-ref oztsymfskxaeonxqggfb
npx supabase secrets set OCR_SPACE_API_KEY=<dein Key aus Schritt 1> --project-ref oztsymfskxaeonxqggfb
```

Ohne lokales Node — alles über das Supabase-Dashboard:

- **Function-Code:** Dashboard → Edge Functions → „Deploy a new function" →
  Name `receipt-ocr`, dann den kompletten Inhalt von
  `supabase/functions/receipt-ocr/index.ts` in den Code-Editor einfügen und
  deployen. (Die Datei importiert `../_shared/cors.ts` — falls das
  Dashboard das nicht mitzieht, den Inhalt von
  `supabase/functions/_shared/cors.ts` oben in die Datei kopieren und die
  `import { corsHeaders } …`-Zeile entfernen.)
- **Secret:** Dashboard → Project Settings → Edge Functions → „Add new
  secret": Name `OCR_SPACE_API_KEY`, Wert = der Key aus Schritt 1.

`verify_jwt = false` ist für diese Function bereits in
`supabase/config.toml` hinterlegt (nötig, damit der Client sie ohne
Login aufrufen kann — wie bei `mapbox-token`).

### 3. Verifizieren

```bash
curl -s -X POST "https://oztsymfskxaeonxqggfb.supabase.co/functions/v1/receipt-ocr" \
  -H "Content-Type: application/json" \
  -d '{"base64Image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="}'
```

- Key gesetzt → `{"text":""}` (das Testbild ist 1 leeres Pixel, also kein
  Text — aber HTTP 200, kein Fehler).
- Key noch nicht gesetzt → `{"error":"OCR_SPACE_API_KEY ist noch nicht als
  Secret gesetzt."}` mit Status 500; der Bon-Scan im Spiel funktioniert dann
  weiterhin über den Tesseract-Fallback.

Danach im Spiel einen echten Bon scannen und in der Browser-Konsole prüfen,
ob die Zeile `Bon-OCR (Cloud / OCR.space): …` erscheint (statt
`Bon-OCR (Tesseract / deu): …`).
