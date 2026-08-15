// Gemeinsame Hilfsfunktionen fuer den Admin-Passwortschutz beider Dashboards
// (dashboard/index.html UND dashboard/standorte.html teilen sich dasselbe
// Passwort/denselben localStorage-Eintrag -- einmal auf einem Geraet
// eingegeben, entsperrt es beide Seiten). Die Seiten-spezifische Lock-
// Screen-UI liegt in dashboard-auth.js bzw. standorte-auth.js.
//
// WICHTIG: Der Hash ist keine Client-seitige Sicherheitsmassnahme mehr wie
// frueher (siehe alte Version von standorte-auth.js) -- er wird bei jedem
// privilegierten Zugriff an die Edge Functions locations-admin/events-admin
// geschickt und DORT serverseitig gegen das Secret ADMIN_PASSWORD_HASH
// geprueft (siehe supabase/functions/_shared/admin-auth.ts). Ein falscher
// Hash kann also wirklich nichts lesen/schreiben/loeschen, nicht nur die
// UI nicht sehen.

const ADMIN_HASH_KEY = "loomonia_admin_pw_hash";
const LOCATIONS_ADMIN_URL = `${SUPABASE_URL}/functions/v1/locations-admin`;
const EVENTS_ADMIN_URL = `${SUPABASE_URL}/functions/v1/events-admin`;

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getAdminHash() {
  return localStorage.getItem(ADMIN_HASH_KEY) || "";
}

function setAdminHash(hash) {
  localStorage.setItem(ADMIN_HASH_KEY, hash);
}

function clearAdminHash() {
  localStorage.removeItem(ADMIN_HASH_KEY);
}

// Wrapper um fetch() gegen die Edge Functions: haengt den Admin-Hash als
// Header an und faengt eine 401-Antwort (falscher/fehlender Hash) zentral
// ab -- loescht dann den lokal gemerkten Hash und zeigt die Sperre erneut,
// statt dass jede Aufrufstelle das selbst behandeln muesste. reshowAdminLock
// wird von der jeweiligen Seite (dashboard-auth.js / standorte-auth.js)
// global definiert.
async function fetchWithAdminAuth(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options && options.headers), "x-admin-password-hash": getAdminHash() },
  });
  if (res.status === 401) {
    clearAdminHash();
    if (typeof window.reshowAdminLock === "function") {
      window.reshowAdminLock("Passwort falsch oder abgelaufen. Bitte erneut eingeben.");
    }
  }
  return res;
}
