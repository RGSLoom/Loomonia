// Rein lesende Magic-Link-Ansicht (dashboard/store-view.html?token=...).
// Komplett unabhaengig vom Admin-Passwortschutz (dashboard-auth.js) und den
// Edge Functions locations-admin/events-admin -- nutzt ausschliesslich die
// eigene Function store-view (siehe supabase/functions/store-view/), die
// den Token server-seitig zu genau einem Store aufloest. Kein Schreiben,
// kein Loeschen, kein Zugriff auf andere Stores moeglich. Aggregations-/
// Rendering-Logik (Charts, KPI-Karten) teilt sich dieses Skript mit
// dashboard.js in dashboard-render.js.

const REFRESH_MS = 30000;
const STORE_VIEW_URL = `${SUPABASE_URL}/functions/v1/store-view`;
const ACCESS_TOKEN = new URLSearchParams(window.location.search).get("token") || "";

let refreshTimer = null;

function showInvalidScreen(message) {
  if (refreshTimer) clearInterval(refreshTimer);
  document.getElementById("screen-dashboard").classList.add("hidden");
  const invalidScreen = document.getElementById("screen-invalid");
  invalidScreen.classList.remove("hidden");
  if (message) document.getElementById("invalid-message").textContent = message;
}

function fetchStoreView(resource, extraParams) {
  const params = new URLSearchParams(extraParams || {});
  params.set("token", ACCESS_TOKEN);
  params.set("resource", resource);
  return fetch(`${STORE_VIEW_URL}?${params.toString()}`).then((r) => {
    if (r.status === 404) {
      showInvalidScreen();
      throw new Error("invalid-token");
    }
    if (!r.ok) throw new Error(`store-view-Aufruf fehlgeschlagen: ${r.status}`);
    return r.json();
  });
}

function loadStoreIdentity() {
  fetchStoreView("identity")
    .then((store) => {
      const name = store.name || "Store";
      document.getElementById("sidebar-store-name").textContent = name;
      document.getElementById("info-store").textContent = name;

      const idEl = document.getElementById("sidebar-store-id");
      const hasId = !!store.store_number;
      idEl.textContent = hasId ? `Store-ID: ${store.store_number}` : "";
      idEl.classList.toggle("hidden", !hasId);

      const addressEl = document.getElementById("sidebar-store-address");
      const infoAddressEl = document.getElementById("info-store-address");
      addressEl.textContent = store.address || "";
      addressEl.classList.toggle("hidden", !store.address);
      infoAddressEl.textContent = store.address || "";
      infoAddressEl.classList.toggle("hidden", !store.address);
    })
    .catch(() => {});
}

function fetchEvents() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (DAYS_WINDOW - 1));
  cutoff.setHours(0, 0, 0, 0);

  return fetchStoreView("events", {
    select: "type,player_id,ts,item_key,amount_cents",
    ts: `gte.${cutoff.toISOString()}`,
    order: "ts.asc",
    limit: "10000",
  });
}

function fetchAllTimeTotals() {
  return fetchStoreView("events", {
    select: "type,player_id,amount_cents",
    type: "in.(item_receipt_scanned,trophy_unlocked)",
    limit: "50000",
  });
}

function loadStats() {
  fetchEvents()
    .then((events) => renderStats(aggregateEvents(events, DAYS_WINDOW)))
    .catch(() => {});

  fetchAllTimeTotals()
    .then((events) => renderAllTimeStats(aggregateAllTimeTotals(events)))
    .catch(() => {});
}

function init() {
  if (!ACCESS_TOKEN) {
    showInvalidScreen("Kein Zugangscode in diesem Link gefunden.");
    return;
  }

  document.querySelectorAll(".nav-item[data-target]").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-item[data-target]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view-panel").forEach((p) => p.classList.remove("active"));
      const target = document.getElementById(btn.dataset.target);
      if (target) target.classList.add("active");
    };
  });

  document.getElementById("screen-dashboard").classList.remove("hidden");

  const dateLabel = "Heute, " + new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  document.getElementById("today-date").textContent = dateLabel;
  document.getElementById("today-date-umsatz").textContent = dateLabel;

  loadStoreIdentity();
  loadStats();
  refreshTimer = setInterval(loadStats, REFRESH_MS);
}

document.addEventListener("DOMContentLoaded", init);
