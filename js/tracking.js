// Sendet anonyme Spiel-Events direkt an Supabase (REST-API einer gehosteten
// Postgres-Tabelle, siehe js/supabase-config.js) fuers Haendler-Dashboard
// (siehe /dashboard). Kein eigener Server noetig -> funktioniert identisch
// lokal und auf GitHub Pages. Darf das Spiel nie blockieren oder zum
// Absturz bringen — Fehler (z.B. offline, CORS, falsche Config) werden
// verschluckt.

function trackEvent(type, payload) {
  try {
    const body = JSON.stringify({
      type,
      player_id: getPlayerId(),
      ts: new Date().toISOString(),
      store_id: payload.storeId,
      category: payload.category,
      item_key: payload.itemKey || null,
      rarity: payload.rarity || null,
    });
    fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Prefer": "return=minimal",
      },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch (e) {
    // Tracking ist rein optional, nie das Spiel stoeren
  }
}
