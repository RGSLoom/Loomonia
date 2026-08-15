// Pruefung des einzigen echten Zugriffsschutzes dieser Uebergangsloesung:
// der Client (dashboard/js/dashboard-auth.js bzw. standorte-auth.js) schickt
// den SHA-256-Hash des vor Ort eingegebenen Admin-Passworts im Header
// "x-admin-password-hash" mit. Das Klartext-Passwort verlaesst den Browser
// nie. Verglichen wird gegen das Secret ADMIN_PASSWORD_HASH, das einmalig
// server-seitig gesetzt wird (siehe supabase/functions/README.md) -- steht
// NIRGENDS im Repo/Client-Code.
//
// Bewusst kein echtes Nutzer-/Rollenkonzept (ein gemeinsames Passwort fuer
// alle, die Zugriff auf beide Dashboards haben) -- das ist laut Auftrag
// explizit eine spaetere, groessere Aufgabe.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get("ADMIN_PASSWORD_HASH");
  // Secret nicht gesetzt -> sicherheitshalber IMMER verweigern, nie offen
  // durchlassen.
  if (!expected) return false;
  const provided = req.headers.get("x-admin-password-hash") || "";
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}
