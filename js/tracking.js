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
      // "unbekannt" statt null: die Spalte "category" hat serverseitig eine
      // NOT-NULL-Bedingung. Bon-Scans bei nicht gelisteten Retailern (siehe
      // ANY_STORE_ITEM_POOL/"Retailer nicht gelistet" in js/bonscan.js)
      // senden bewusst payload.category=null -- das liess bisher JEDEN
      // einzelnen Datensatz dieses Scans lautlos mit HTTP 400 an der
      // Datenbank abprallen (fetch().catch() faengt nur Netzwerkfehler ab,
      // keine 4xx-Antworten), obwohl das Spiel-Item lokal trotzdem vergeben
      // wurde. Betraf jeden nicht im Store-Katalog hinterlegten Laden --
      // real beobachtet bei einem Rossmann-Bon.
      category: payload.category || "unbekannt",
      item_key: payload.itemKey || null,
      rarity: payload.rarity || null,
      amount_cents: payload.amountCents ?? null,
      product_text: payload.productText || null,
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
