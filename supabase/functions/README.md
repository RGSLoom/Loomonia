# Deploy-Anleitung: locations-admin / events-admin

Diese beiden Edge Functions sind der Ersatz für die bisherigen direkten
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
```

## 3. Secret setzen

```bash
npx supabase secrets set ADMIN_PASSWORD_HASH=<Hash aus Schritt 1> --project-ref oztsymfskxaeonxqggfb
```

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` müssen NICHT manuell gesetzt
werden — die stellt Supabase jeder Edge Function automatisch als Umgebungsvariable
bereit.

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
