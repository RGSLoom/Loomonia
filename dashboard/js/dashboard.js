// Haendler-Dashboard: Store-Auswahl (kein Passwort) + laufende Anzeige der
// Zahlen direkt aus Supabase (REST-API einer gehosteten Postgres-Tabelle,
// siehe ../js/supabase-config.js) — kein eigener Server noetig, laeuft
// identisch lokal und auf GitHub Pages. Aggregations-/Rendering-Logik
// (Charts, KPI-Karten, Tabellen) liegt gemeinsam mit store-view.js in
// dashboard-render.js.

const STORE_KEY = "loomonia_dashboard_store"; // sessionStorage
const REFRESH_MS = 30000;

let refreshTimer = null;

function storeDisplayName(key) {
  // "Alle Stores" ist die Beschriftung fuer die Phase-2-Auswahlkachel
  // (Grosskonzern vergleicht mehrere Filialen); im aktuellen Ein-Store-
  // Pitch-Modus (siehe init()) steht derselbe interne "all"-Schluessel
  // fuer "das eine Dashboard dieses Shops" -> passendere Beschriftung an
  // der einzigen Stelle, wo er dafuer benutzt wird (showDashboard()).
  if (key === "all") return "Alle Stores";
  return (DASHBOARD_STORES[key] && DASHBOARD_STORES[key].name) || key;
}

function renderStoreGrid() {
  const grid = document.getElementById("store-grid");
  grid.innerHTML = "";

  const allTile = document.createElement("button");
  allTile.className = "store-tile store-tile-all";
  allTile.textContent = "Alle Stores";
  allTile.onclick = () => selectStore("all");
  grid.appendChild(allTile);

  Object.keys(DASHBOARD_STORES).forEach((key) => {
    const tile = document.createElement("button");
    tile.className = "store-tile";
    tile.textContent = DASHBOARD_STORES[key].name;
    tile.onclick = () => selectStore(key);
    grid.appendChild(tile);
  });
}

function selectStore(key) {
  sessionStorage.setItem(STORE_KEY, key);
  showDashboard(key);
}

function switchStore() {
  sessionStorage.removeItem(STORE_KEY);
  if (refreshTimer) clearInterval(refreshTimer);
  document.getElementById("screen-dashboard").style.display = "none";
  document.getElementById("screen-select").style.display = "flex";
}

function showDashboard(storeKey) {
  document.getElementById("screen-select").style.display = "none";
  document.getElementById("screen-dashboard").style.display = "flex";

  const dateLabel = "Heute, " + new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  document.getElementById("today-date").textContent = dateLabel;
  document.getElementById("today-date-umsatz").textContent = dateLabel;

  loadStats(storeKey);
  loadStoreIdentity();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadStats(storeKey), REFRESH_MS);
}

// Zeigt in Sidebar und "Beobachteter Store"-Karte den zuletzt ueber die
// Standortverwaltung (dashboard/standorte.html) angelegten Store mit
// seinem echten Namen, optionaler Store-Nummer und Adresse. Ersetzt die
// vorherige generische "Mein Store"/"Store-ID: DEMO"-Platzhalterzeile, die
// zusaetzlich zum echten Namen darunter stand -> jetzt genau EINE
// Store-Identitaet. Rein informativ -> darf das Dashboard nie blockieren,
// wenn Supabase kurz nicht erreichbar ist oder noch kein Store hinterlegt
// wurde.
function loadStoreIdentity() {
  const nameEl = document.getElementById("sidebar-store-name");
  const idEl = document.getElementById("sidebar-store-id");
  const addressEl = document.getElementById("sidebar-store-address");
  const infoNameEl = document.getElementById("info-store");
  const infoAddressEl = document.getElementById("info-store-address");

  fetch(
    `${SUPABASE_URL}/rest/v1/locations?select=name,address,store_number&type=eq.store&order=created_at.desc&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  )
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      const row = rows[0];
      const name = row ? row.name : "Noch kein Store hinterlegt";
      nameEl.textContent = name;
      infoNameEl.textContent = name;

      const hasId = !!(row && row.store_number);
      idEl.textContent = hasId ? `Store-ID: ${row.store_number}` : "";
      idEl.classList.toggle("hidden", !hasId);

      const address = row ? row.address : null;
      addressEl.textContent = address || "";
      addressEl.classList.toggle("hidden", !address);
      infoAddressEl.textContent = address || "";
      infoAddressEl.classList.toggle("hidden", !address);
    })
    .catch(() => {});
}

// Liest ueber die Edge Function events-admin statt direkt gegen die Tabelle
// (siehe supabase/functions/events-admin/) -- der anon-Key darf events seit
// dem RLS-Lockdown nicht mehr lesen, nur noch neue Zeilen anlegen.
function fetchEvents(storeKey) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (DAYS_WINDOW - 1));
  cutoff.setHours(0, 0, 0, 0);

  let url =
    `${EVENTS_ADMIN_URL}?select=type,player_id,ts,item_key,amount_cents,product_text` +
    `&ts=gte.${encodeURIComponent(cutoff.toISOString())}&order=ts.asc&limit=10000`;
  if (storeKey !== "all") {
    url += `&category=eq.${encodeURIComponent(storeKey)}`;
  }

  return fetchWithAdminAuth(url).then((r) => {
    if (!r.ok) throw new Error(`Events-Function-Aufruf fehlgeschlagen: ${r.status}`);
    return r.json();
  });
}

// Zusatzabfrage ohne Zeitfenster fuer "seit Erfassungsbeginn"-Kennzahlen
// (Umsatz/Provision/Kaeufer gesamt) und fuer die Events-Ansicht (Teilnahmen/
// Abschluesse der automatischen Bon-Scan-Aktion). Bewusst getrennt von
// fetchEvents(), da dort nur die letzten DAYS_WINDOW Tage geladen werden.
function fetchAllTimeTotals(storeKey) {
  let url =
    `${EVENTS_ADMIN_URL}?select=type,player_id,amount_cents,item_key` +
    `&type=in.(item_receipt_scanned,trophy_unlocked)&limit=50000`;
  if (storeKey !== "all") {
    url += `&category=eq.${encodeURIComponent(storeKey)}`;
  }

  return fetchWithAdminAuth(url).then((r) => {
    if (!r.ok) throw new Error(`Events-Function-Aufruf fehlgeschlagen: ${r.status}`);
    return r.json();
  });
}

function loadStats(storeKey) {
  fetchEvents(storeKey)
    .then((events) => renderStats(aggregateEvents(events, DAYS_WINDOW)))
    .catch(() => {
      // Supabase evtl. kurz nicht erreichbar/Config fehlt noch — beim
      // naechsten Refresh-Tick automatisch erneut versuchen.
    });

  fetchAllTimeTotals(storeKey)
    .then((events) => renderAllTimeStats(aggregateAllTimeTotals(events)))
    .catch(() => {});
}

// Aktivitaets-Reset (Einstellungen-Panel): loescht AUSSCHLIESSLICH die
// "events"-Tabelle (Spieler, Items, Bon-Scans, daraus berechneter Umsatz).
// Die "locations"-Tabelle (Standortverwaltung, dashboard/standorte.html)
// wird hier nie referenziert und bleibt in jedem Fall unangetastet — die
// dort angelegten Standorte sind pro Pitch bewusst dauerhaft.
//
// Zweistufige Bestaetigung als eigenes UI-Element im Panel statt
// window.confirm(): natives confirm() wird auf manchen Geraeten/Browsern
// (z.B. eingebettete/PWA-Kontexte) automatisch verworfen, ohne dass der
// Nutzer etwas davon sieht -> die Funktion brach dann lautlos ab, was wie
// "Button tut nichts" wirkte. Mit einer eigenen Bestaetigungs-Box im Panel
// gibt es dieses Risiko nicht mehr.
//
// ts=lt.<weit in der Zukunft> statt eines Primary-Key-Filters, da wir den
// genauen Spaltennamen der ID nicht kennen, "ts" aber garantiert auf jede
// Zeile zutrifft.
function openResetConfirm() {
  document.getElementById("reset-step-initial").classList.add("hidden");
  document.getElementById("reset-step-confirm").classList.remove("hidden");
  setResetStatus("", "");
}

function cancelResetConfirm() {
  document.getElementById("reset-step-confirm").classList.add("hidden");
  document.getElementById("reset-step-initial").classList.remove("hidden");
}

function setResetStatus(msg, kind) {
  const el = document.getElementById("reset-status");
  el.textContent = msg || "";
  el.className = "reset-status" + (kind ? " " + kind : "");
}

async function confirmResetTestData() {
  const btn = document.getElementById("btn-reset-confirm");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Lösche…";

  try {
    const res = await fetchWithAdminAuth(`${EVENTS_ADMIN_URL}?ts=lt.2099-01-01T00:00:00Z`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${body ? " – " + body : ""}`);
    }
    loadStats(sessionStorage.getItem(STORE_KEY) || "all");
    cancelResetConfirm();
    setResetStatus("Testdaten wurden zurückgesetzt.", "success");
  } catch (err) {
    setResetStatus(
      "Zurücksetzen fehlgeschlagen: " + (err && err.message ? err.message : err),
      "error"
    );
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ============ Artikelverwaltung (Einstellungen-Panel) ============
// Bis zu 15 vom Store selbst hinterlegte Artikelbezeichnungen, gegen die
// das Spiel jeden Bon-Scan per Fuzzy-Match prueft (siehe
// matchLineToConfiguredStores in js/bonscan.js). Rendering/Auslesen der
// Felder kommt aus dashboard-render.js (geteilt mit store-view.js) -- hier
// nur noch das WOHER/WOHIN: Admin-Bereich verwaltet aktuell ausschliesslich
// den GodAdmin-Teststore (store_key "godadmin", siehe
// supabase/store_articles_setup.sql). Echte Retailer-Standorte pflegen ihre
// eigene Liste seit dem Self-Service-Feature selbst ueber ihren
// Store-View-Magic-Link (siehe store-view.js loadArticleEditor/
// saveArticleEditor dort), nicht mehr hier.
const ARTICLE_EDITOR_STORE_KEY = "godadmin";

// Direkt mit dem anon-Key gelesen (oeffentlich lesbar, siehe
// supabase/store_articles_setup.sql store_articles_public_select) -- kein
// Admin-Zugriff zum Vorbefuellen des Formulars noetig.
function loadArticleEditor() {
  fetch(
    `${SUPABASE_URL}/rest/v1/store_articles?select=articles&store_key=eq.${encodeURIComponent(ARTICLE_EDITOR_STORE_KEY)}`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  )
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      const articles = (rows[0] && Array.isArray(rows[0].articles)) ? rows[0].articles : [];
      fillArticleEditorFields(articles);
    })
    .catch(() => {
      // Tabelle/Function evtl. noch nicht angelegt -- Formular bleibt dann
      // einfach leer, das Speichern legt die Zeile beim ersten Mal per
      // Upsert an.
    });
}

async function saveArticleEditor() {
  const btn = document.getElementById("btn-articles-save");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Speichere…";
  setArticleEditorStatus("article-editor-status", "", "");

  const articles = readArticleEditorValues();

  try {
    const res = await fetchWithAdminAuth(STORE_ARTICLES_ADMIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({ store_key: ARTICLE_EDITOR_STORE_KEY, articles }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${body ? " – " + body : ""}`);
    }
    setArticleEditorStatus("article-editor-status", `Artikelliste gespeichert (${articles.length} von ${ARTICLE_EDITOR_MAX_COUNT} Feldern befüllt).`, "success");
  } catch (err) {
    setArticleEditorStatus("article-editor-status", "Speichern fehlgeschlagen: " + (err && err.message ? err.message : err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// Fuer den Pitch hat jeder teilnehmende Shop nur EIN Konto/EIN Dashboard —
// die Store-Auswahl (renderStoreGrid/switchStore, fuers spaetere Phase-2-
// Szenario "Grosskonzern vergleicht seine Filialen") wird deshalb aktuell
// uebersprungen und direkt die zusammengefasste "Alle Stores"-Ansicht
// gezeigt, die ohnehin alle Scans unabhaengig von der erkannten Kategorie
// sammelt. Die Auswahl-Funktionen bleiben im Code fuer spaeter, werden nur
// nicht mehr verdrahtet/angezeigt.
function init() {
  document.getElementById("btn-reset-open").onclick = openResetConfirm;
  document.getElementById("btn-reset-confirm").onclick = confirmResetTestData;
  document.getElementById("btn-reset-cancel").onclick = cancelResetConfirm;

  renderArticleEditorFields("article-editor-fields");
  loadArticleEditor();
  document.getElementById("btn-articles-save").onclick = saveArticleEditor;

  document.querySelectorAll(".nav-item[data-target]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-item[data-target]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view-panel").forEach((p) => p.classList.remove("active"));
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add("active");
    };
  });

  showDashboard("all");
}

// Erst nach Entsperren der Passwortsperre starten (siehe dashboard-auth.js) --
// vorher darf gar nicht erst versucht werden, Daten zu laden.
document.addEventListener("dashboard-unlocked", init);
