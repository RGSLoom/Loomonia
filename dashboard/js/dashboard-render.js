// Gemeinsame Aggregations- und Rendering-Logik fuer beide Dashboard-Seiten:
// dashboard/index.html (Store Manager, Admin-Passwort) UND
// dashboard/store-view.html (Magic-Link pro Store, kein Passwort -- seit dem
// Artikelstammdaten-Feature nicht mehr komplett rein lesend, siehe
// renderArticleEditorFields() unten). Beide zeigen dieselben KPI-Karten/
// Charts/Tabellen/Formulare mit denselben DOM-IDs -- nur WOHER die rohen
// Events/Artikel kommen (Edge Function + Admin-Header vs. Edge Function +
// Token) unterscheidet sich und bleibt in dashboard.js bzw. store-view.js.

const DAYS_WINDOW = 14;
const COMMISSION_RATE = 0.01; // 1% Haendler-Provision auf den geschaetzten Umsatz

// Gemeinsamer Hinweis-Banner (siehe #data-error-banner in dashboard/index.html
// UND dashboard/store-view.html), falls ein Datenabruf fehlschlaegt --
// vorher fielen dashboard.js/store-view.js bei jedem Fehler still auf leere
// Werte ("0"/"–") zurueck, ohne dass ein Admin "keine Aktivitaet" von
// "Datenabruf kaputt" (fehlendes Secret, kaputtes Deployment, Netzwerk)
// unterscheiden konnte (siehe QA-Bug-Liste). failureCount zaehlt
// AUFEINANDERFOLGENDE Fehlschlaege eines einzelnen Ladevorgangs -- ein
// einzelner kurzer Ausrutscher (z.B. Cold-Start-Timeout) soll nicht sofort
// eine Fehlermeldung zeigen, der naechste automatische Refresh-Tick klappt
// meist schon wieder.
const DATA_ERROR_BANNER_THRESHOLD = 2;
let dataErrorStreak = 0;

function reportDataLoadSuccess() {
  dataErrorStreak = 0;
  const el = document.getElementById("data-error-banner");
  if (el) el.classList.add("hidden");
}

function reportDataLoadFailure() {
  dataErrorStreak++;
  if (dataErrorStreak < DATA_ERROR_BANNER_THRESHOLD) return;
  const el = document.getElementById("data-error-banner");
  if (el) el.classList.remove("hidden");
}

// ============ Artikelverwaltung (geteilt zwischen beiden Dashboards) ============
// Reines DOM-Rendering/-Auslesen der 15 Artikel-Eingabefelder -- IDENTISCH
// auf beiden Dashboard-Seiten (siehe Briefing: "Artikelverwaltung muss auf
// beiden Ebenen technisch identisch funktionieren"). WIE die aktuelle Liste
// geladen/gespeichert wird (Admin-Edge-Function+Passwort-Hash vs.
// Store-View-Token) unterscheidet sich je nach Seite und bleibt in
// dashboard.js bzw. store-view.js.
const ARTICLE_EDITOR_MAX_COUNT = 15;

// Items, die ein Store bei der Artikel-Hinterlegung als Belohnung fuer einen
// Treffer waehlen kann -- bewusst nur Ungewoehnlich (gruen) und Selten
// (blau): Gewoehnlich bleibt exklusiv ueber das kostenlose Standort-
// Minigame erreichbar, Episch/Legendaer bleiben Trophaeen vorbehalten
// (siehe TROPHY_EXCLUSIVE_ITEM_KEYS in js/data.js). Entspricht ALLEN
// Ungewoehnlich/Selten-Items aus ITEMS in js/data.js (die 4 urspruenglichen
// Bon-Scan-Items PLUS die neueren, mit unlockType "kauf" explizit fuer
// echte Kaeufe vorgesehenen Items) -- eigene, dashboard-seitige Liste (wie
// DASHBOARD_ITEMS in stores-config.js) statt eines Verweises auf js/data.js,
// dieses Projekt haelt Spiel- und Dashboard-Code bewusst unabhaengig
// voneinander. Bei einem neuen Ungewoehnlich/Selten-Item in js/data.js hier
// UND in DASHBOARD_ITEMS (stores-config.js) nachziehen.
const ARTICLE_ITEM_CHOICES = [
  // Ungewoehnlich (gruen)
  "energiesnack", "gesundheitspaket", "vitaminsaft", "energieriegel_plus", "hose", "oberteil", "wasserflasche_plus",
  // Selten (blau)
  "sneaker", "rucksack", "suessigkeit", "stylische_kappe", "kraeuterelixier",
];

function renderArticleEditorFields(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  for (let i = 1; i <= ARTICLE_EDITOR_MAX_COUNT; i++) {
    const field = document.createElement("div");
    field.className = "article-field";
    const label = document.createElement("label");
    label.setAttribute("for", `article-input-${i}`);
    label.textContent = `Artikel ${i}`;
    const input = document.createElement("input");
    input.type = "text";
    input.id = `article-input-${i}`;
    input.maxLength = 120;
    input.placeholder = "Artikeltext";

    const select = document.createElement("select");
    select.id = `article-item-${i}`;
    select.className = "article-item-select";
    ARTICLE_ITEM_CHOICES.forEach((itemKey) => {
      const meta = DASHBOARD_ITEMS[itemKey];
      const opt = document.createElement("option");
      opt.value = itemKey;
      opt.textContent = `${meta.name} (${meta.rarity})`;
      select.appendChild(opt);
    });

    field.append(label, input, select);
    container.appendChild(field);
  }
}

function fillArticleEditorFields(articles) {
  (articles || []).forEach((entry, i) => {
    const input = document.getElementById(`article-input-${i + 1}`);
    const select = document.getElementById(`article-item-${i + 1}`);
    if (!input) return;
    // Abwaertskompatibel: Artikel-Eintraege vor der Item-Auswahl-Erweiterung
    // waren reine Strings -- text kommt dann direkt aus dem String, itemKey
    // bleibt leer (Zufalls-Item als Fallback, siehe pickReceiptMatchRewards
    // in js/bonscan.js).
    const text = typeof entry === "string" ? entry : (entry && entry.text) || "";
    const itemKey = typeof entry === "string" ? null : (entry && entry.itemKey) || null;
    input.value = text;
    if (select && itemKey && ARTICLE_ITEM_CHOICES.includes(itemKey)) select.value = itemKey;
  });
}

function readArticleEditorValues() {
  const articles = [];
  for (let i = 1; i <= ARTICLE_EDITOR_MAX_COUNT; i++) {
    const input = document.getElementById(`article-input-${i}`);
    const select = document.getElementById(`article-item-${i}`);
    const text = ((input && input.value) || "").trim();
    if (!text) continue;
    articles.push({ text, itemKey: select ? select.value : ARTICLE_ITEM_CHOICES[0] });
  }
  return articles;
}

function setArticleEditorStatus(elId, msg, kind) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || "";
  el.className = "form-status" + (kind ? " " + kind : "");
}

// Lokales (nicht UTC-) Datum als "YYYY-MM-DD" — toISOString() wuerde bei
// Zeitzonen oestlich von UTC den "heutigen" Tag falsch auf gestern
// zurueckrechnen (z.B. 00:30 CEST lokal ist noch 22:30 UTC am Vortag).
function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// revenueCents/provisionCents beziehen sich AUSSCHLIESSLICH auf Treffer
// (item_key vorhanden -- ein Store hat den Artikel selbst hinterlegt und
// dafuer ein Item gewaehlt, siehe js/bonscan.js grantReceiptItems).
// unmatchedRevenueCents ist der nicht zugeordnete Umsatz (alle Events mit
// item_key null): im Anker-Modus im Wesentlichen EIN Rest-Event pro Bon
// ("gedruckte Bon-Summe minus Treffer-Summe", product_text null), sonst die
// einzelnen nicht zugeordneten Zeilen mit ihrem OCR-Preis (siehe
// trackReceiptScanForDashboard in js/bonscan.js). Zaehlt bewusst NICHT in
// die Provision ein, wird aber als eigene Zahl ausgewiesen, damit der
// vollstaendige, durch die Plattform ausgeloeste Umsatz sichtbar bleibt.
function aggregateAllTimeTotals(events) {
  const receiptEvents = events.filter((e) => e.type === "item_receipt_scanned");
  const trophyEvents = events.filter((e) => e.type === "trophy_unlocked");
  const matchedEvents = receiptEvents.filter((e) => e.item_key);
  const unmatchedEvents = receiptEvents.filter((e) => !e.item_key);
  const revenueCents = matchedEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
  const unmatchedRevenueCents = unmatchedEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
  return {
    revenueCents,
    unmatchedRevenueCents,
    provisionCents: Math.round(revenueCents * COMMISSION_RATE),
    buyers: new Set(receiptEvents.map((e) => e.player_id)).size,
    completers: new Set(trophyEvents.map((e) => e.player_id)).size,
  };
}

// Gruppiert item_receipt_scanned-Events nach dem rohen, per OCR erkannten
// Produkttext (product_text, siehe js/bonscan.js/js/tracking.js) statt
// nach dem festen Fantasie-Item-Katalog wie countByItemKey() — fuers
// "Artikel"-Panel im Store Manager Dashboard (echte Produktnamen statt
// Spiel-Items). Case-insensitiv gruppiert (OCR liest Gross-/Kleinschreibung
// nicht zuverlaessig), Anzeige nutzt die zuerst gesehene Schreibweise.
// Events ohne erkannten Produkttext (product_text null/leer -- der seltene
// Fall "gar keine Kandidatenzeile gefunden", siehe trackReceiptScanForDashboard
// in js/bonscan.js) tauchen hier bewusst NICHT auf -- kein erfundener
// "Unbekannt"-Artikel, siehe renderTopArticles().
//
// NUR echte Treffer (item_key vorhanden, product_text = vom Store
// hinterlegter Artikelname) werden namentlich gruppiert und gelistet. Nicht
// zugeordnete Zeilen (item_key null, product_text = roher OCR-Zeilentext)
// werden NICHT mehr einzeln aufgefuehrt -- der Rohtext ist dort oft Muell
// (Kassennummern, Kopfzeilen-Reste, OCR-Artefakte) und dieselbe Position
// tauchte durch OCR-Schwankungen mehrfach auf. Sie laufen stattdessen in
// EINE Sammelzeile ("unmatched") unter den Treffern zusammen; ihr Umsatz
// zaehlt dort weiterhin voll mit. sharePct bezieht sich jeweils auf den
// Umsatz ALLER item_receipt_scanned-Events im Fenster (Treffer + nicht
// zugeordnet), damit der Anteil wirklich "Anteil am kompletten erfassten
// Umsatz" bedeutet.
function countByProductText(receiptEvents) {
  const totalRevenueCents = receiptEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
  const share = (cents) =>
    totalRevenueCents > 0 ? Math.round((cents / totalRevenueCents) * 1000) / 10 : null;

  const buckets = {};
  // lineCount: Anzahl nicht zugeordneter Bon-ZEILEN (Events mit product_text).
  // revenueCents: gesamter nicht zugeordneter Umsatz -- schliesst das
  // product_text-lose "Rest-Event" mit ein (gedruckte Bon-Summe minus
  // Treffer-Summe, siehe trackReceiptScanForDashboard in js/bonscan.js), das
  // bewusst NICHT als eigene Zeile zaehlt.
  let unmatchedLineCount = 0;
  let unmatchedRevenueCents = 0;
  receiptEvents.forEach((e) => {
    const raw = (e.product_text || "").trim();
    if (!e.item_key) {
      if (raw) unmatchedLineCount++;
      unmatchedRevenueCents += e.amount_cents || 0;
      return;
    }
    if (!raw) return;
    const key = raw.toLowerCase();
    if (!buckets[key]) buckets[key] = { displayText: raw, count: 0, revenueCents: 0 };
    buckets[key].count++;
    buckets[key].revenueCents += e.amount_cents || 0;
  });

  const matched = Object.values(buckets)
    .map((b) => ({
      productText: b.displayText,
      count: b.count,
      revenueCents: b.revenueCents,
      matched: true,
      sharePct: share(b.revenueCents),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const unmatched =
    unmatchedLineCount > 0 || unmatchedRevenueCents > 0
      ? { lineCount: unmatchedLineCount, revenueCents: unmatchedRevenueCents, sharePct: share(unmatchedRevenueCents) }
      : null;

  return { matched, unmatched };
}

// Baut aus den rohen Supabase-Zeilen dieselbe Struktur, die renderStats()
// erwartet (Tage-Liste, Top-Items, KPIs) — Aggregation laeuft komplett
// client-seitig, da GitHub Pages keinen eigenen Server ausfuehren kann.
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
    // Ein Event pro erkannter Bon-Zeile (siehe js/bonscan.js
    // trackReceiptScanForDashboard) -- revenueCents zaehlt NUR Treffer
    // (item_key vorhanden, provisionsrelevant), unmatchedRevenueCents die
    // nicht zugeordneten Zeilen (item_key null, zaehlt als Umsatz, aber
    // nicht in die Provision).
    const matchedReceiptEvents = receiptEvents.filter((e) => e.item_key);
    const unmatchedReceiptEvents = receiptEvents.filter((e) => !e.item_key);
    const revenueCents = matchedReceiptEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
    const unmatchedRevenueCents = unmatchedReceiptEvents.reduce((sum, e) => sum + (e.amount_cents || 0), 0);
    const provisionCents = Math.round(revenueCents * COMMISSION_RATE);
    return {
      date,
      playersSelected: distinctPlayers,
      freeItemsReceived: items.length,
      realBuyers: distinctBuyers,
      // Nur Zeilen mit echtem item_key zaehlen als "vergebenes Spiel-Item"
      // -- seit js/bonscan.js auch reine Artikel-Info-Zeilen ohne Item-
      // Vergabe sendet (item_key: null, siehe grantReceiptItems()), wuerde
      // receiptEvents.length sonst mehr "Items" zeigen, als tatsaechlich
      // im Inventar gelandet sind.
      realItemsReceived: receiptEvents.filter((e) => e.item_key).length,
      revenueCents,
      unmatchedRevenueCents,
      // Erfasster Warenkorb = kompletter ueber Loomonia gemessener Bon-Wert
      // (Treffer + nicht zugeordnet). Entspricht pro Bon der gedruckten
      // Bon-Summe (siehe Umsatz-Anker in js/bonscan.js).
      basketCents: revenueCents + unmatchedRevenueCents,
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
  const receiptScannedEvents = events.filter((e) => e.type === "item_receipt_scanned");
  // Fuer die Fantasie-Item-Liste ("Top Artikel aus echten Kaeufen" im
  // Umsatz-Panel) nur Zeilen mit echtem item_key beruecksichtigen -- sonst
  // wuerde ein "null"-Eintrag als Item-Name auftauchen (DASHBOARD_ITEMS-
  // Lookup faellt bei einem "null"-Schluessel auf den Rohwert zurueck).
  const topReceiptItems = countByItemKey(receiptScannedEvents.filter((e) => e.item_key));
  const topArticles = countByProductText(receiptScannedEvents);

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
    topArticles,
    kpis: {
      playersToday: todayStat.playersSelected,
      itemsToday: todayStat.freeItemsReceived,
      growthPct,
      lastEventTs,
      buyersToday: todayStat.realBuyers,
      purchaseItemsToday: todayStat.realItemsReceived,
      revenueCentsToday: todayStat.revenueCents,
      unmatchedRevenueCentsToday: todayStat.unmatchedRevenueCents,
      provisionCentsToday: todayStat.provisionCents,
      lastReceiptTs,
    },
  };
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

// selector statt id: dieselbe Tabelle kann auf der Startseite UND im
// Umsatz-Tab stehen (siehe setKpiText). Rendert in JEDES passende <tbody>.
function renderTopItems(selector, topItems, emptyText) {
  document.querySelectorAll(selector).forEach((body) => {
  body.innerHTML = "";

  if (topItems.length === 0) {
    body.innerHTML = `<tr><td colspan="4" class="empty-note">${emptyText}</td></tr>`;
    return;
  }

  topItems.forEach((entry, i) => {
    // Faellt bei einem unbekannten itemKey auf den ROHEN Key zurueck (siehe
    // Kommentar in dashboard/js/stores-config.js) -- entry.itemKey kommt aus
    // events.item_key, und die "events"-Tabelle nimmt per RLS-Policy JEDEN
    // INSERT vom oeffentlichen anon-Key ohne Inhaltspruefung an (siehe
    // supabase/rls_lockdown.sql). Ein praeparierter item_key (z.B. per
    // direktem REST-Call ohne das Spiel zu nutzen) ist also nutzer-
    // kontrollierter Inhalt, genau wie product_text bei renderTopArticles()
    // unten -- deshalb hier per textContent statt innerHTML gesetzt (war
    // vorher eine gespeicherte XSS-Luecke, siehe QA-Bug-Liste).
    const meta = DASHBOARD_ITEMS[entry.itemKey] || { name: entry.itemKey, rarity: "Gewöhnlich" };
    const color = DASHBOARD_RARITY_COLORS[meta.rarity] || "#6b7280";
    const row = document.createElement("tr");
    const rankCell = document.createElement("td");
    rankCell.textContent = String(i + 1);
    const nameCell = document.createElement("td");
    nameCell.textContent = meta.name;
    const rarityCell = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = "rarity-pill";
    pill.style.background = color;
    pill.textContent = meta.rarity;
    rarityCell.appendChild(pill);
    const countCell = document.createElement("td");
    countCell.textContent = String(entry.count);
    row.appendChild(rankCell);
    row.appendChild(nameCell);
    row.appendChild(rarityCell);
    row.appendChild(countCell);
    body.appendChild(row);
  });
  });
}

// Anders als renderTopItems() kommt der Artikelname hier NICHT aus dem
// festen DASHBOARD_ITEMS-Katalog, sondern ist roher, per OCR erkannter Text
// von einem Kassenbon-Foto (product_text) — also im Kern nutzerbeeinflusster
// Inhalt. Die Namens-Zelle deshalb bewusst per textContent statt per
// innerHTML-Template gesetzt, damit ein praeparierter Bon (z.B. mit
// "<img onerror=...>" als Produktname) niemals als HTML interpretiert
// werden kann.
// selector statt id -- rendert in JEDES passende <tbody> (Startseite +
// Artikel-Tab), siehe renderTopItems.
function renderTopArticles(selector, data, emptyText) {
  const bodies = document.querySelectorAll(selector);
  if (!bodies.length) return;

  // Abwaertskompatibel: frueher wurde hier ein flaches Array uebergeben,
  // jetzt { matched, unmatched } aus countByProductText().
  const matched = Array.isArray(data) ? data : (data && data.matched) || [];
  const unmatched = Array.isArray(data) ? null : data && data.unmatched;

  bodies.forEach((body) => {
  body.innerHTML = "";

  if (matched.length === 0 && !unmatched) {
    body.innerHTML = `<tr><td colspan="5" class="empty-note">${emptyText}</td></tr>`;
    return;
  }

  matched.forEach((entry, i) => {
    const row = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = String(i + 1);

    const nameTd = document.createElement("td");
    nameTd.textContent = entry.productText;

    const countTd = document.createElement("td");
    countTd.textContent = String(entry.count);

    const shareTd = document.createElement("td");
    shareTd.textContent = entry.sharePct === null ? "–" : `${entry.sharePct} %`;

    // Alle Zeilen hier sind echte Treffer (item_key vorhanden,
    // provisionsrelevant) -- nicht zugeordnete Zeilen stehen nur noch in der
    // Sammelzeile unten. Wiederverwendet die vorhandenen .status-pill-Klassen
    // (siehe dashboard/css/style.css).
    const statusTd = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = "status-pill status-pill-active";
    statusPill.textContent = "Treffer";
    statusTd.appendChild(statusPill);

    row.append(rankTd, nameTd, countTd, shareTd, statusTd);
    body.appendChild(row);
  });

  // Eine einzige Sammelzeile fuer den Rest des erfassten Warenkorbs, der
  // KEINEM hinterlegten Artikel zugeordnet wurde -- zaehlt zum Umsatz, aber
  // ohne Provision/Item (item_key null). Das ist die Summe aus nicht
  // zugeordneten Bon-Zeilen UND der Differenz zwischen gedruckter Bon-Summe
  // und der Summe der Treffer-Zeilen (siehe trackReceiptScanForDashboard in
  // js/bonscan.js). Zusammen mit den Treffer-Zeilen darueber ergibt sie den
  // erfassten Warenkorb. Die "Käufe"-Spalte zeigt die Anzahl nicht
  // zugeordneter Zeilen; kommt der Betrag nur aus der Bon-Differenz (keine
  // eigene Zeile), steht dort "–".
  if (unmatched) {
    const row = document.createElement("tr");

    const rankTd = document.createElement("td");
    rankTd.textContent = "–";

    const nameTd = document.createElement("td");
    nameTd.textContent = "Übriger Warenkorb (kein Treffer)";

    const countTd = document.createElement("td");
    countTd.textContent = unmatched.lineCount > 0 ? String(unmatched.lineCount) : "–";

    const shareTd = document.createElement("td");
    shareTd.textContent = unmatched.sharePct === null ? "–" : `${unmatched.sharePct} %`;

    const statusTd = document.createElement("td");
    const statusPill = document.createElement("span");
    statusPill.className = "status-pill status-pill-planned";
    statusPill.textContent = "Sammelzeile";
    statusTd.appendChild(statusPill);

    row.append(rankTd, nameTd, countTd, shareTd, statusTd);
    body.appendChild(row);
  }
  });
}

// Rundet einen Rohwert auf eine "glatte" Obergrenze (1/2/5 * 10^n) -- damit
// die Y-Achse lesbare Schritte bekommt statt eines krummen Maximums.
function niceCeil(v) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

// series: [{ key, color }, ...] — welche Tages-Felder als Linien gezeichnet
// werden. So teilen sich Aktivitaets- und Umsatz-Chart dieselbe Logik.
// opts.formatY: Formatter fuer die Y-Achsen-Beschriftung (Default: ganze
// Zahl; fuer den Umsatz-Chart z.B. formatEuro).
function renderChart(svg, days, series, opts) {
  opts = opts || {};
  const formatY = opts.formatY || ((v) => String(Math.round(v)));
  const W = 640, H = 260;
  const padL = 58, padR = 14, padT = 14, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const rawMax = Math.max(0, ...days.flatMap((d) => series.map((s) => d[s.key] || 0)));
  const totalEvents = days.reduce((sum, d) => sum + series.reduce((s2, s) => s2 + (d[s.key] || 0), 0), 0);

  if (totalEvents === 0) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#85898f" font-size="14">Noch keine Daten — im Spiel einen Store besuchen, um hier Zahlen zu sehen.</text>`;
    return;
  }

  const maxVal = niceCeil(rawMax);
  const xStep = days.length > 1 ? innerW / (days.length - 1) : 0;
  const toXY = (value, i) => {
    const x = padL + i * xStep;
    const y = padT + innerH - (value / maxVal) * innerH;
    return [x, y];
  };

  // Y-Achse: 5 Schritte mit Wert-Beschriftung links (bisher fehlte die
  // Y-Achse komplett -- man konnte die Groessenordnung des Charts nicht ablesen).
  const TICKS = 5;
  let grid = "";
  let yLabels = "";
  for (let t = 0; t <= TICKS; t++) {
    const val = (maxVal / TICKS) * t;
    const y = padT + innerH - (val / maxVal) * innerH;
    grid += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#E1E6EE" stroke-width="1" />`;
    yLabels += `<text x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#85898f">${formatY(val)}</text>`;
  }
  grid += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${(padT + innerH).toFixed(1)}" stroke="#C9D2E0" stroke-width="1" />`;

  const linePath = (key) =>
    days.map((d, i) => toXY(d[key] || 0, i)).map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const dots = (key, color) =>
    days.map((d, i) => { const [x, y] = toXY(d[key] || 0, i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.4" fill="${color}" />`; }).join("");

  // X-Achse: Datum, ~6 Beschriftungen ueber die 14 Tage plus immer der
  // letzte Tag.
  let xLabels = "";
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));
  days.forEach((d, i) => {
    if (i % labelEvery !== 0 && i !== days.length - 1) return;
    const [x] = toXY(0, i);
    // d.date ist YYYY-MM-DD -> Label als TT.MM. (deutsche Schreibweise).
    const [, mm, dd] = d.date.split("-");
    const label = `${dd}.${mm}.`;
    xLabels += `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#85898f">${label}</text>`;
  });

  const paths = series
    .map((s) => `<path d="${linePath(s.key)}" fill="none" stroke="${s.color}" stroke-width="2.5" />${dots(s.key, s.color)}`)
    .join("");

  svg.innerHTML = `${grid}${yLabels}${paths}${xLabels}`;
}

// Setzt den Text ALLER Elemente mit data-kpi="<name>" -- dieselbe Kennzahl
// kann dadurch gleichzeitig auf der Startseite UND im Umsatz-Tab stehen,
// ohne doppelte id-Kollisionen (getElementById liefert nur das erste).
function setKpiText(name, value) {
  document.querySelectorAll(`[data-kpi="${name}"]`).forEach((el) => {
    el.textContent = value;
  });
}

function renderStats(data) {
  const kpis = data.kpis || {};
  setKpiText("players", kpis.playersToday ?? 0);
  setKpiText("items", kpis.itemsToday ?? 0);
  setKpiText("growth", formatGrowth(kpis.growthPct));
  setKpiText("last-item", formatAgo(kpis.lastEventTs));
  const infoLast = document.getElementById("info-last-event");
  if (infoLast) infoLast.textContent = formatAgo(kpis.lastEventTs);

  setKpiText("buyers", kpis.buyersToday ?? 0);
  setKpiText("purchase-items", kpis.purchaseItemsToday ?? 0);
  setKpiText("revenue", formatEuro(kpis.revenueCentsToday));
  const basketToday = (kpis.revenueCentsToday || 0) + (kpis.unmatchedRevenueCentsToday || 0);
  setKpiText("basket", formatEuro(basketToday));
  // Bestand halten, falls irgendwo noch eine "nicht zugeordnet"-Kachel steht.
  setKpiText("unmatched-revenue", formatEuro(kpis.unmatchedRevenueCentsToday));
  setKpiText("provision", formatEuro(kpis.provisionCentsToday));
  setKpiText("last-receipt", formatAgo(kpis.lastReceiptTs));

  document.querySelectorAll('[data-chart="activity"]').forEach((svg) =>
    renderChart(svg, data.days || [], [
      { key: "playersSelected", color: "#2656A3" },
      { key: "freeItemsReceived", color: "#00354E" },
    ])
  );
  // Umsatz-Chart: erfasster Warenkorb (gesamter Bon-Wert) und der davon auf
  // hinterlegte Artikel entfallende Treffer-Anteil.
  document.querySelectorAll('[data-chart="revenue"]').forEach((svg) =>
    renderChart(
      svg,
      data.days || [],
      [
        { key: "basketCents", color: "#00354E" },
        { key: "revenueCents", color: "#2656A3" },
      ],
      { formatY: (v) => formatEuro(v) }
    )
  );

  renderTopItems('[data-table-body="top-items"]', data.topItems || [], "Noch keine Items vergeben.");
  renderTopItems('[data-table-body="top-purchase-items"]', data.topReceiptItems || [], "Noch keine Bon-Scans erfasst.");
  renderTopArticles(
    '[data-table-body="top-articles"]',
    data.topArticles || { matched: [], unmatched: null },
    "Noch keine Artikel erkannt."
  );
}

function renderAllTimeStats(totals) {
  setKpiText("revenue-total", formatEuro(totals.revenueCents));
  setKpiText(
    "basket-total",
    formatEuro((totals.revenueCents || 0) + (totals.unmatchedRevenueCents || 0))
  );
  setKpiText("unmatched-revenue-total", formatEuro(totals.unmatchedRevenueCents));
  setKpiText("buyers-total", totals.buyers ?? 0);
  setKpiText("provision-total", formatEuro(totals.provisionCents));

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
