// Haendler-Dashboard: Store-Auswahl (kein Passwort) + laufende Anzeige der
// Zahlen direkt aus Supabase (REST-API einer gehosteten Postgres-Tabelle,
// siehe ../js/supabase-config.js) — kein eigener Server noetig, laeuft
// identisch lokal und auf GitHub Pages.

const STORE_KEY = "loomonia_dashboard_store"; // sessionStorage
const DAYS_WINDOW = 14;
const REFRESH_MS = 30000;
const COMMISSION_RATE = 0.01; // 1% Haendler-Provision auf den geschaetzten Umsatz

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

function fetchEvents(storeKey) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (DAYS_WINDOW - 1));
  cutoff.setHours(0, 0, 0, 0);

  let url =
    `${SUPABASE_URL}/rest/v1/events?select=type,player_id,ts,item_key,amount_cents` +
    `&ts=gte.${encodeURIComponent(cutoff.toISOString())}&order=ts.asc&limit=10000`;
  if (storeKey !== "all") {
    url += `&category=eq.${encodeURIComponent(storeKey)}`;
  }

  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`Supabase request failed: ${r.status}`);
    return r.json();
  });
}

// Zusatzabfrage ohne Zeitfenster fuer "seit Erfassungsbeginn"-Kennzahlen
// (Umsatz/Provision/Kaeufer gesamt) und fuer die Events-Ansicht (Teilnahmen/
// Abschluesse der automatischen Bon-Scan-Aktion). Bewusst getrennt von
// fetchEvents(), da dort nur die letzten DAYS_WINDOW Tage geladen werden.
function fetchAllTimeTotals(storeKey) {
  let url =
    `${SUPABASE_URL}/rest/v1/events?select=type,player_id,amount_cents` +
    `&type=in.(item_receipt_scanned,trophy_unlocked)&limit=50000`;
  if (storeKey !== "all") {
    url += `&category=eq.${encodeURIComponent(storeKey)}`;
  }

  return fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  }).then((r) => {
    if (!r.ok) throw new Error(`Supabase request failed: ${r.status}`);
    return r.json();
  });
}

function aggregateAllTimeTotals(events) {
  const receiptEvents = events.filter((e) => e.type === "item_receipt_scanned");
  const trophyEvents = events.filter((e) => e.type === "trophy_unlocked");
  const revenueCents = receiptEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
  return {
    revenueCents,
    provisionCents: Math.round(revenueCents * COMMISSION_RATE),
    buyers: new Set(receiptEvents.map((e) => e.player_id)).size,
    completers: new Set(trophyEvents.map((e) => e.player_id)).size,
  };
}

// Baut aus den rohen Supabase-Zeilen dieselbe Struktur, die renderStats()
// erwartet (Tage-Liste, Top-Items, KPIs) — Aggregation laeuft komplett
// client-seitig, da GitHub Pages keinen eigenen Server ausfuehren kann.
// Lokales (nicht UTC-) Datum als "YYYY-MM-DD" — toISOString() wuerde bei
// Zeitzonen oestlich von UTC den "heutigen" Tag falsch auf gestern
// zurueckrechnen (z.B. 00:30 CEST lokal ist noch 22:30 UTC am Vortag).
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function aggregateEvents(events, daysWindow) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayList = [];
  for (let i = daysWindow - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dayList.push(localDateKey(d));
  }

  const days = dayList.map((date) => {
    const dayEvents = events.filter((e) => localDateKey(new Date(e.ts)) === date);
    const selected = dayEvents.filter((e) => e.type === "store_selected");
    const items = dayEvents.filter((e) => e.type === "item_free_received");
    const receiptEvents = dayEvents.filter((e) => e.type === "item_receipt_scanned");
    const distinctPlayers = new Set(selected.map((e) => e.player_id)).size;
    const distinctBuyers = new Set(receiptEvents.map((e) => e.player_id)).size;
    // amount_cents haengt nur an einem Event pro Bon-Scan (siehe
    // js/bonscan.js grantReceiptItems) -> einfaches Aufsummieren ueber alle
    // Events des Tages zaehlt jeden Bon trotzdem nur einmal.
    const revenueCents = receiptEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
    const provisionCents = Math.round(revenueCents * COMMISSION_RATE);
    return {
      date,
      playersSelected: distinctPlayers,
      freeItemsReceived: items.length,
      realBuyers: distinctBuyers,
      realItemsReceived: receiptEvents.length,
      revenueCents,
      provisionCents,
    };
  });

  const countByItemKey = (evts) => {
    const counts = {};
    evts.forEach((e) => {
      counts[e.item_key] = (counts[e.item_key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([itemKey, count]) => ({ itemKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const topItems = countByItemKey(events.filter((e) => e.type === "item_free_received"));
  const topReceiptItems = countByItemKey(events.filter((e) => e.type === "item_receipt_scanned"));

  // events ist ts-aufsteigend sortiert (order=ts.asc) -> letztes Element je
  // Typ ist das juengste Event dieses Typs.
  const lastOfType = (type) => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === type) return events[i].ts;
    }
    return null;
  };
  const lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;
  const lastReceiptTs = lastOfType("item_receipt_scanned");

  const todayStat = days[days.length - 1];
  const yesterdayStat = days.length >= 2 ? days[days.length - 2] : null;
  let growthPct = null;
  if (yesterdayStat && yesterdayStat.playersSelected > 0) {
    growthPct =
      Math.round(((todayStat.playersSelected - yesterdayStat.playersSelected) / yesterdayStat.playersSelected) * 1000) / 10;
  }

  return {
    days,
    topItems,
    topReceiptItems,
    kpis: {
      playersToday: todayStat.playersSelected,
      itemsToday: todayStat.freeItemsReceived,
      growthPct,
      lastEventTs,
      buyersToday: todayStat.realBuyers,
      purchaseItemsToday: todayStat.realItemsReceived,
      revenueCentsToday: todayStat.revenueCents,
      provisionCentsToday: todayStat.provisionCents,
      lastReceiptTs,
    },
  };
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

function renderStats(data) {
  const kpis = data.kpis || {};
  document.getElementById("kpi-players").textContent = kpis.playersToday ?? 0;
  document.getElementById("kpi-items").textContent = kpis.itemsToday ?? 0;
  document.getElementById("kpi-growth").textContent = formatGrowth(kpis.growthPct);
  document.getElementById("kpi-last").textContent = formatAgo(kpis.lastEventTs);
  document.getElementById("info-last-event").textContent = formatAgo(kpis.lastEventTs);

  document.getElementById("kpi-buyers").textContent = kpis.buyersToday ?? 0;
  document.getElementById("kpi-purchase-items").textContent = kpis.purchaseItemsToday ?? 0;
  document.getElementById("kpi-revenue").textContent = formatEuro(kpis.revenueCentsToday);
  document.getElementById("kpi-provision").textContent = formatEuro(kpis.provisionCentsToday);
  document.getElementById("kpi-purchase-last").textContent = formatAgo(kpis.lastReceiptTs);

  renderChart(document.getElementById("chart-svg"), data.days || [], [
    { key: "playersSelected", color: "#2656A3" },
    { key: "freeItemsReceived", color: "#00354E" },
  ]);
  renderChart(document.getElementById("revenue-chart-svg"), data.days || [], [
    { key: "revenueCents", color: "#2656A3" },
  ]);

  renderTopItems("top-items-body", data.topItems || [], "Noch keine Items vergeben.");
  renderTopItems("top-purchase-items-body", data.topReceiptItems || [], "Noch keine Bon-Scans erfasst.");
}

function renderAllTimeStats(totals) {
  document.getElementById("kpi-revenue-total").textContent = formatEuro(totals.revenueCents);
  document.getElementById("kpi-buyers-total").textContent = totals.buyers ?? 0;
  document.getElementById("kpi-provision-total").textContent = formatEuro(totals.provisionCents);

  renderEventsTable(totals);
}

// Events-Ansicht: aktuell existiert im Spiel genau eine automatisch
// erfasste Aktion (die Tutorial-Quest "Erster Schritt", die per Bon-Scan
// ausgeloest wird, siehe js/bonscan.js TROPHIES.erster_schritt). Teilnahmen
// = Spieler mit mind. einem Bon-Scan, Abschluesse = Spieler mit
// freigeschalteter Trophaee. Absichtlich keine erfundenen weiteren
// Kampagnen, solange es dafuer keine echte Datenquelle gibt.
function renderEventsTable(totals) {
  const body = document.getElementById("events-active-body");
  if (!body) return;

  const participants = totals.buyers ?? 0;
  const completions = totals.completers ?? 0;
  const conversion = participants > 0 ? Math.round((completions / participants) * 1000) / 10 : null;

  body.innerHTML = `
    <tr>
      <td>Erster Schritt <span class="card-title-sub">Bon-Scan schaltet Bronze-Trophäe + Sonderitem frei</span></td>
      <td><span class="status-pill status-pill-active">Aktiv</span></td>
      <td>${participants}</td>
      <td>${completions}</td>
      <td>${conversion === null ? "–" : conversion + " %"}</td>
    </tr>
  `;
}

function formatEuro(cents) {
  if (!cents) return "0,00 €";
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function formatGrowth(pct) {
  if (pct === null || pct === undefined) return "–";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct} %`;
}

function formatAgo(ts) {
  if (!ts) return "–";
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "gerade eben";
  if (mins < 60) return `vor ${mins} Min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.round(hours / 24);
  return `vor ${days} Tag(en)`;
}

function renderTopItems(bodyId, topItems, emptyText) {
  const body = document.getElementById(bodyId);
  body.innerHTML = "";

  if (topItems.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-note">${emptyText}</td></tr>`;
    return;
  }

  topItems.forEach((entry, i) => {
    const meta = DASHBOARD_ITEMS[entry.itemKey] || { name: entry.itemKey, rarity: "Gewöhnlich" };
    const color = DASHBOARD_RARITY_COLORS[meta.rarity] || "#6b7280";
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${i + 1}</td>
      <td>${meta.name}</td>
      <td><span class="rarity-pill" style="background:${color}">${meta.rarity}</span></td>
      <td>${entry.count}</td>
    `;
    body.appendChild(row);
  });
}

// series: [{ key, color }, ...] — welche Tages-Felder als Linien gezeichnet
// werden. So teilen sich Aktivitaets- und Umsatz-Chart dieselbe Logik.
function renderChart(svg, days, series) {
  const W = 640, H = 260;
  const padL = 34, padR = 10, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(1, ...days.flatMap((d) => series.map((s) => d[s.key])));
  const totalEvents = days.reduce((sum, d) => sum + series.reduce((s2, s) => s2 + d[s.key], 0), 0);

  if (totalEvents === 0) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#85898f" font-size="14">Noch keine Daten — im Spiel einen Store besuchen, um hier Zahlen zu sehen.</text>`;
    return;
  }

  const xStep = days.length > 1 ? innerW / (days.length - 1) : 0;
  const toXY = (value, i) => {
    const x = padL + i * xStep;
    const y = padT + innerH - (value / maxVal) * innerH;
    return [x, y];
  };

  const linePath = (key) =>
    days.map((d, i) => toXY(d[key], i)).map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  let gridLines = "";
  for (let g = 0; g <= 2; g++) {
    const y = padT + (innerH / 2) * g;
    gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E1E6EE" stroke-width="1" />`;
  }

  let xLabels = "";
  const labelEvery = Math.ceil(days.length / 5);
  days.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== days.length - 1) return;
    const [x] = toXY(0, i);
    const label = d.date.slice(5).replace("-", ".");
    xLabels += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#85898f">${label}</text>`;
  });

  const paths = series
    .map((s) => `<path d="${linePath(s.key)}" fill="none" stroke="${s.color}" stroke-width="2.5" />`)
    .join("");

  svg.innerHTML = `${gridLines}${paths}${xLabels}`;
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
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events?ts=lt.2099-01-01T00:00:00Z`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
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

document.addEventListener("DOMContentLoaded", init);
