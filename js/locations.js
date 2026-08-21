// Laedt Standorte (Stores + Landmarks) aus der Supabase-Tabelle "locations"
// (siehe dashboard/js/locations-admin.js fuers Eintragen neuer Orte).
// Ersetzt die frueher fest im Code hinterlegte STORE_LOCATIONS-Liste, damit
// neue Orte ohne Code-Deploy im Spiel erscheinen. Wird von initMap() in
// js/map.js parallel zur Geolocation-Anfrage gestartet; onFirstFix() wartet
// auf das zurueckgegebene Promise, bevor Marker gezeichnet werden.

function mapLocationRow(row) {
  return {
    id: row.id,
    type: row.type === "landmark" ? "landmark" : "store",
    categoryKey: row.category_key || null,
    landmarkIcon: row.landmark_icon || null,
    name: row.name || row.id,
    // Fuer die Bon-Header-Adressabgleichung beim Scannen (siehe
    // matchReceiptHeaderToStore in js/bonscan.js) -- verhindert, dass ein
    // Bon-Treffer versehentlich einem anderen, nicht besuchten Store
    // zugeschrieben wird.
    address: row.address || null,
    coords: row.lat != null && row.lon != null ? { lat: row.lat, lon: row.lon } : null,
    // ISO-Zeitstempel der letzten Aenderung -> Cache-Invalidierung in
    // ensureStorePositions() (js/map.js), damit ein im Dashboard
    // verschobener Standort auch bei Spielern mit bereits gecachter
    // Position ankommt, statt fuer immer an der alten Stelle zu bleiben.
    updatedAt: row.updated_at || null,
  };
}

function loadStoreLocations() {
  return fetch(`${SUPABASE_URL}/rest/v1/locations?select=*`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  })
    .then((r) => {
      if (!r.ok) throw new Error(`Supabase request failed: ${r.status}`);
      return r.json();
    })
    .then((rows) => {
      // Nur ersetzen, wenn die Tabelle tatsaechlich etwas liefert -> eine
      // (noch) leere oder fehlkonfigurierte Tabelle darf die Karte nie
      // leerraeumen, STORE_LOCATIONS_FALLBACK bleibt dann aktiv.
      if (Array.isArray(rows) && rows.length > 0) {
        STORE_LOCATIONS = rows.map(mapLocationRow);
      }
    })
    .catch(() => {
      // Supabase kurzzeitig nicht erreichbar/Tabelle fehlt noch -> Fallback
      // bleibt aktiv, das Spiel darf dadurch nie blockieren oder abstuerzen.
    });
}
