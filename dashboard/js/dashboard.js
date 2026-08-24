// Haendler-Dashboard: Store-Auswahl (kein Passwort) + laufende Anzeige der
// Zahlen direkt aus Supabase (REST-API einer gehosteten Postgres-Tabelle,
// siehe ../js/supabase-config.js) — kein eigener Server noetig, laeuft
// identisch lokal und auf GitHub Pages. Aggregations-/Rendering-Logik
// (Charts, KPI-Karten, Tabellen) liegt gemeinsam mit store-view.js in
// dashboard-render.js.

const STORE_KEY = "loomonia_dashboard_store"; // sessionStorage
const REFRESH_MS = 30000;

let refreshTimer = null;
// Einmal beim Start geladen (siehe loadStoreList() in init()) -- Liste
// aller echten Store-Standorte (type=store) aus der Standortverwaltung,
// Grundlage sowohl fuer den Store-Selector im Dropdown als auch fuer die
// "Beobachteter Store"-Anzeige (kein zweiter Fetch pro Auswahl noetig).
let knownStores = [];

// Baut den Store-Selector in der Sidebar: "Alle Stores" (GodAdmin-
// Gesamtansicht) plus jeder einzelne echte Store, alphabetisch. Ersetzt
// die fruehere kategorie-basierte Kachel-Auswahl (renderStoreGrid/
// DASHBOARD_STORES) -- die zeigte Branchen statt echter, einzelner
// Standorte und war deshalb fuer "welchen Store will ich sehen" nicht
// nutzbar, sobald mehrere Standorte dieselbe Kategorie teilen (siehe
// QA-Bug-Liste: Kategorie-Filter zeigte faelschlich die Zahlen ALLER
// Stores derselben Kategorie gemeinsam an).
function renderStoreSelector(selectedKey) {
  const select = document.getElementById("store-selector");
  select.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "Alle Stores";
  select.appendChild(allOpt);

  knownStores
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .forEach((store) => {
      const opt = document.createElement("option");
      opt.value = store.id;
      opt.textContent = store.name;
      select.appendChild(opt);
    });

  select.value = knownStores.some((s) => s.id === selectedKey) || selectedKey === "all" ? selectedKey : "all";
}

function selectStore(key) {
  sessionStorage.setItem(STORE_KEY, key);
  showDashboard(key);
}

function showDashboard(storeKey) {
  const dateLabel = "Heute, " + new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  document.getElementById("today-date").textContent = dateLabel;
  document.getElementById("today-date-umsatz").textContent = dateLabel;

  renderStoreSelector(storeKey);
  loadStats(storeKey);
  loadStoreIdentity(storeKey);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadStats(storeKey), REFRESH_MS);
}

// Zeigt in der "Beobachteter Store"-Karte den aktuell im Store-Selector
// gewaehlten Store (Name + Adresse) -- rein aus der bereits geladenen
// knownStores-Liste, kein weiterer Fetch. "Alle Stores" zeigt bewusst
// keine einzelne Adresse. GodAdmin selbst hat KEINEN eigenen Standorteintrag
// (mehr) -- die Sidebar-Identitaet ("GodAdmin") ist fest im HTML hinterlegt,
// unabhaengig davon, welcher Store hier gerade betrachtet wird.
function loadStoreIdentity(storeKey) {
  const infoNameEl = document.getElementById("info-store");
  const infoAddressEl = document.getElementById("info-store-address");

  const store = storeKey !== "all" ? knownStores.find((s) => s.id === storeKey) : null;
  const name = storeKey === "all" ? "Alle Stores" : (store && store.name) || "Unbekannter Store";
  infoNameEl.textContent = name;

  const address = store && store.address;
  infoAddressEl.textContent = address || "";
  infoAddressEl.classList.toggle("hidden", !address);
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
  // store_id statt category filtern: mehrere Stores koennen sich dieselbe
  // Kategorie teilen (z.B. EDEKA/REWE/Kaufland alle "supermarkt"), ein
  // Kategorie-Filter zeigte deshalb faelschlich die Zahlen ALLER Stores
  // derselben Kategorie gemeinsam an, sobald mehr als ein echter Store
  // waehlbar ist (siehe QA-Bug-Liste). store_id wird beim Tracking bereits
  // zuverlaessig gesetzt (siehe js/tracking.js), exakt wie im Store-View-
  // Dashboard der Partner (supabase/functions/store-view/index.ts).
  if (storeKey !== "all") {
    url += `&store_id=eq.${encodeURIComponent(storeKey)}`;
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
  // store_id statt category filtern: mehrere Stores koennen sich dieselbe
  // Kategorie teilen (z.B. EDEKA/REWE/Kaufland alle "supermarkt"), ein
  // Kategorie-Filter zeigte deshalb faelschlich die Zahlen ALLER Stores
  // derselben Kategorie gemeinsam an, sobald mehr als ein echter Store
  // waehlbar ist (siehe QA-Bug-Liste). store_id wird beim Tracking bereits
  // zuverlaessig gesetzt (siehe js/tracking.js), exakt wie im Store-View-
  // Dashboard der Partner (supabase/functions/store-view/index.ts).
  if (storeKey !== "all") {
    url += `&store_id=eq.${encodeURIComponent(storeKey)}`;
  }

  return fetchWithAdminAuth(url).then((r) => {
    if (!r.ok) throw new Error(`Events-Function-Aufruf fehlgeschlagen: ${r.status}`);
    return r.json();
  });
}

function loadStats(storeKey) {
  fetchEvents(storeKey)
    .then((events) => {
      renderStats(aggregateEvents(events, DAYS_WINDOW));
      reportDataLoadSuccess();
    })
    .catch(() => {
      // Supabase evtl. kurz nicht erreichbar/Config fehlt noch — beim
      // naechsten Refresh-Tick automatisch erneut versuchen. Nach mehreren
      // Fehlschlagen in Folge zeigt reportDataLoadFailure() den
      // #data-error-banner, damit ein Admin einen dauerhaft kaputten
      // Datenabruf nicht mit "einfach keine Aktivitaet" verwechselt.
      reportDataLoadFailure();
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

  // Bestaetigungstext spiegelt jetzt den tatsaechlichen Scope (store_id-
  // gefiltert, siehe confirmResetTestData) statt pauschal "ALLE" zu sagen --
  // bei ausgewaehltem Einzelstore waere das sonst irrefuehrend.
  const storeKey = sessionStorage.getItem(STORE_KEY) || "all";
  const store = storeKey !== "all" ? knownStores.find((s) => s.id === storeKey) : null;
  const scopeText = storeKey === "all" ? "ALLE Stores" : `nur „${store ? store.name : storeKey}“`;
  document.querySelector(".reset-confirm-text").textContent =
    `Wirklich die Aktivitätsdaten (Spieler, Items, Bon-Scans, Umsatz) für ${scopeText} unwiderruflich löschen? Store-Standorte bleiben in jedem Fall erhalten.`;
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
    // Auf den aktuell im Store-Selector gewaehlten Store scopen (wie
    // fetchEvents/fetchAllTimeTotals oben, per store_id statt category --
    // siehe dortigen Kommentar) -- ohne diesen Filter loescht "Testdaten
    // zuruecksetzen" IMMER die komplette events-Tabelle, unabhaengig davon,
    // welcher Store gerade ausgewaehlt ist. storeKey "all" (GodAdmin-
    // Gesamtansicht) loescht bewusst weiterhin alles, dort gibt es keinen
    // engeren Scope.
    const storeKey = sessionStorage.getItem(STORE_KEY) || "all";
    let url = `${EVENTS_ADMIN_URL}?ts=lt.2099-01-01T00:00:00Z`;
    if (storeKey !== "all") {
      url += `&store_id=eq.${encodeURIComponent(storeKey)}`;
    }
    const res = await fetchWithAdminAuth(url, {
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

// Laedt die echten Store-Standorte einmal beim Start (oeffentlich lesbar,
// wie in der Standortverwaltung) -- GodAdmin selbst hat keinen eigenen
// Eintrag hier (mehr), taucht also bewusst nicht in der Liste auf. Rein
// informativ: schlaegt der Fetch fehl, bleibt der Selector einfach bei nur
// "Alle Stores" stehen, statt das Dashboard zu blockieren.
function loadStoreList() {
  return fetch(
    `${SUPABASE_URL}/rest/v1/locations?select=id,name,address,store_number&type=eq.store&order=name.asc`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
  )
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) => {
      knownStores = Array.isArray(rows) ? rows : [];
    })
    .catch(() => {
      knownStores = [];
    });
}

// GodAdmin ist das interne Gesamt-Portal (kein eigener Store-Partner) --
// zeigt per Default die zusammengefasste "Alle Stores"-Ansicht, kann aber
// ueber den Store-Selector in der Sidebar jederzeit auf einen einzelnen
// echten Store wechseln (per store_id gefiltert, siehe fetchEvents/
// fetchAllTimeTotals oben). Die Auswahl bleibt fuer die Sitzung gemerkt
// (sessionStorage), fällt aber auf "Alle Stores" zurueck, falls der zuletzt
// gewaehlte Store inzwischen geloescht wurde.
async function init() {
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

  document.getElementById("store-selector").addEventListener("change", (e) => {
    selectStore(e.target.value);
  });

  await loadStoreList();
  const remembered = sessionStorage.getItem(STORE_KEY) || "all";
  const initialKey = remembered === "all" || knownStores.some((s) => s.id === remembered) ? remembered : "all";
  showDashboard(initialKey);
}

// Erst nach Entsperren der Passwortsperre starten (siehe dashboard-auth.js) --
// vorher darf gar nicht erst versucht werden, Daten zu laden.
document.addEventListener("dashboard-unlocked", init);
