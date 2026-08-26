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

// Vergleicht ueber eine FESTE Laenge (unabhaengig von a.length/b.length), damit
// die Laufzeit nicht verraet, ob/wie sehr die Laenge des mitgeschickten Werts
// vom erwarteten SHA-256-Hex-Digest (64 Zeichen) abweicht -- ein fruehes
// "return false" bei ungleicher Laenge waere technisch nicht komplett
// konstant-zeitig gewesen (in der Praxis vernachlaessigbares Risiko, da beide
// Seiten hier immer feste 64-Zeichen-Hex-Digests sind, aber der Funktionsname
// verspricht "timing-safe" -- das sollte dann auch fuer die Laenge gelten).
function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length, 64);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
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
