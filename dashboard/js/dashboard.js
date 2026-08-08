// Haendler-Dashboard: Store-Auswahl (kein Passwort) + laufende Anzeige der
// Zahlen direkt aus Supabase (REST-API einer gehosteten Postgres-Tabelle,
// siehe ../js/supabase-config.js) — kein eigener Server noetig, laeuft
// identisch lokal und auf GitHub Pages.

const STORE_KEY = "loomonia_dashboard_store"; // sessionStorage
const DAYS_WINDOW = 14;
const REFRESH_MS = 30000;

let refreshTimer = null;

function storeDisplayName(key) {
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

  document.getElementById("sidebar-store-name").textContent = storeDisplayName(storeKey);
  document.getElementById("sidebar-store-id").textContent =
    storeKey === "all" ? "Store-ID: ALLE" : `Store-ID: ${storeKey.toUpperCase()}`;
  document.getElementById("info-store").textContent = storeDisplayName(storeKey);
  document.getElementById("today-date").textContent =
    "Heute, " + new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  loadStats(storeKey);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadStats(storeKey), REFRESH_MS);
}

function fetchEvents(storeKey) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (DAYS_WINDOW - 1));
  cutoff.setHours(0, 0, 0, 0);

  let url =
    `${SUPABASE_URL}/rest/v1/events?select=type,player_id,ts,item_key` +
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
    const distinctPlayers = new Set(selected.map((e) => e.player_id)).size;
    return { date, playersSelected: distinctPlayers, freeItemsReceived: items.length };
  });

  const itemCounts = {};
  events
    .filter((e) => e.type === "item_free_received")
    .forEach((e) => {
      itemCounts[e.item_key] = (itemCounts[e.item_key] || 0) + 1;
    });
  const topItems = Object.entries(itemCounts)
    .map(([itemKey, count]) => ({ itemKey, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // events ist ts-aufsteigend sortiert (order=ts.asc) -> letztes Element
  // ist das juengste Event.
  const lastEventTs = events.length > 0 ? events[events.length - 1].ts : null;

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
    kpis: {
      playersToday: todayStat.playersSelected,
      itemsToday: todayStat.freeItemsReceived,
      growthPct,
      lastEventTs,
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
}

function renderStats(data) {
  const kpis = data.kpis || {};
  document.getElementById("kpi-players").textContent = kpis.playersToday ?? 0;
  document.getElementById("kpi-items").textContent = kpis.itemsToday ?? 0;
  document.getElementById("kpi-growth").textContent = formatGrowth(kpis.growthPct);
  document.getElementById("kpi-last").textContent = formatAgo(kpis.lastEventTs);
  document.getElementById("info-last-event").textContent = formatAgo(kpis.lastEventTs);

  renderChart(data.days || []);
  renderTopItems(data.topItems || []);
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

function renderTopItems(topItems) {
  const body = document.getElementById("top-items-body");
  body.innerHTML = "";

  if (topItems.length === 0) {
    body.innerHTML = `<tr><td colspan="4" style="color:#6b7280;padding:14px 4px;">Noch keine Items vergeben.</td></tr>`;
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

function renderChart(days) {
  const svg = document.getElementById("chart-svg");
  const W = 640, H = 260;
  const padL = 34, padR = 10, padT = 14, padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxVal = Math.max(1, ...days.map((d) => Math.max(d.playersSelected, d.freeItemsReceived)));
  const totalEvents = days.reduce((sum, d) => sum + d.playersSelected + d.freeItemsReceived, 0);

  if (totalEvents === 0) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#9aa1b5" font-size="14">Noch keine Daten — im Spiel einen Store besuchen, um hier Zahlen zu sehen.</text>`;
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
    gridLines += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e8f0" stroke-width="1" />`;
  }

  let xLabels = "";
  const labelEvery = Math.ceil(days.length / 5);
  days.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== days.length - 1) return;
    const [x] = toXY(0, i);
    const label = d.date.slice(5).replace("-", ".");
    xLabels += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#6b7280">${label}</text>`;
  });

  const playersPath = linePath("playersSelected");
  const itemsPath = linePath("freeItemsReceived");

  svg.innerHTML = `
    ${gridLines}
    <path d="${playersPath}" fill="none" stroke="#3b5bdb" stroke-width="2.5" />
    <path d="${itemsPath}" fill="none" stroke="#22c55e" stroke-width="2.5" />
    ${xLabels}
  `;
}

function init() {
  renderStoreGrid();

  document.getElementById("nav-switch-store").onclick = switchStore;
  document.querySelectorAll(".nav-item[data-target]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-item[data-target]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.target);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });

  const saved = sessionStorage.getItem(STORE_KEY);
  if (saved) {
    showDashboard(saved);
  }
}

document.addEventListener("DOMContentLoaded", init);
