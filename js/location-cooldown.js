// Serverseitige Abklingzeit (Cooldown) fuer Standort-Interaktionen
// (Abklingzeit-Briefing 2026-09-07): 3 Minuten pro Spieler (nicht pro
// Standort, siehe LOCATION_INTERACTION_COOLDOWN_MS in js/data.js), ueber die
// Edge Function "location-cooldown" server-seitig atomar geprueft UND
// gesetzt (siehe supabase/functions/location-cooldown/index.ts +
// supabase/player_cooldowns_setup.sql). Anders als trackEvent() in
// js/tracking.js (rein optionale Analytics, darf das Spiel NIE blockieren)
// ist der Zweck dieser Datei genau umgekehrt: verbindlich blockieren, bis
// der Server gruenes Licht gibt -- ein rein lokaler Zeitstempel in
// gameState/localStorage liesse sich durch Loeschen/Bearbeiten des
// Spielstands trivial umgehen (Briefing: "Serverseitige Validierung, nicht
// clientseitig, um Manipulation zu verhindern").
const LOCATION_COOLDOWN_URL = `${SUPABASE_URL}/functions/v1/location-cooldown`;

// Prueft den Cooldown fuer den aktuellen Spieler UND beansprucht bei Erfolg
// im selben Server-Aufruf sofort den naechsten 3-Minuten-Slot (atomar,
// siehe Edge Function) -- es gibt bewusst keinen separaten "nur pruefen"-
// Aufruf, sonst koennten zwei schnelle Klicks beide den Cooldown-Check
// bestehen, bevor einer von beiden ihn setzt.
//
// Gibt { allowed: true } zurueck, oder { allowed: false, remainingMs }
// (remainingMs kann null sein, wenn der Server keine genaue Restzeit
// mitgeliefert hat). Bei JEDEM Netzwerk-/Serverfehler wird bewusst
// { allowed: false, remainingMs: null } geliefert (fail-closed) statt die
// Interaktion einfach durchzulassen -- sonst liesse sich der Cooldown durch
// simples Offline-Schalten/Blockieren dieses einen Requests umgehen.
async function claimLocationInteraction() {
  try {
    const res = await fetch(LOCATION_COOLDOWN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ playerId: getPlayerId() }),
    });
    if (!res.ok) return { allowed: false, remainingMs: null };
    const data = await res.json();
    if (data && data.allowed) return { allowed: true };
    return {
      allowed: false,
      remainingMs: typeof (data && data.remainingMs) === "number" ? data.remainingMs : null,
    };
  } catch (e) {
    return { allowed: false, remainingMs: null };
  }
}
