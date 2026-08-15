// Gemeinsame CORS-Header fuer alle Edge Functions dieses Projekts. Der
// eigentliche Zugriffsschutz laeuft NICHT ueber CORS (das ist ohnehin nur
// eine Browser-Regel, kein Server-Schutz -- ein Skript ausserhalb des
// Browsers ignoriert CORS komplett), sondern ueber den Passwort-Hash-Check
// in admin-auth.ts. CORS ist hier nur offen genug gehalten, damit das
// Dashboard (GitHub Pages) und die lokale Entwicklung ohne Extra-Konfig
// funktionieren.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, prefer, x-admin-password-hash",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
