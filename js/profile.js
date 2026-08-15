// Profil-Hub: echte Komponenten (Glas-Kacheln, dasselbe System wie
// Map-HUD/Untermenues) statt des frueheren Baked-Bilds. Die sechs Kacheln
// oeffnen eigene Vollbild-Unterseiten mit eigenem Zurueck-Button.

const PROFILE_TILE_ICONS = {
  outfit: '<path d="M6 7l6-3 6 3v3H6V7Z"/><path d="M6 10v10h12V10"/>',
  items: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M4 8l2-4h12l2 4"/>',
  trophies: TROPHY_ICON_PATH,
  loomas: '<circle cx="12" cy="9" r="3"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  habitat: '<path d="M3 20c2-6 6-9 9-9s7 3 9 9"/><circle cx="12" cy="7" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V19.5a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H4.5a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H10a1.7 1.7 0 0 0 1-1.55V4.5a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V10a1.7 1.7 0 0 0 1.55 1h.09a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/>',
};

function renderProfileHub() {
  const level = xpToLevel(gameState.xp);
  const isMaxLevel = level >= LEVEL_CAP;
  const levelFloor = xpForLevel(level);
  const levelCeil = isMaxLevel ? MAX_LEVEL_XP : xpForLevel(level + 1);
  const xpIntoLevel = gameState.xp - levelFloor;
  const xpPct = isMaxLevel ? 100 : Math.round((xpIntoLevel / (levelCeil - levelFloor)) * 100);
  const itemsOwnedTypes = Object.keys(gameState.inventory).length;
  const totalItemTypes = Object.keys(ITEMS).length;
  const loomasCaught = totalCaughtCount();
  const trophiesUnlocked = Object.keys(gameState.trophies || {}).length;
  const totalTrophies = Object.keys(TROPHIES).length;

  const tiles = [
    { key: "outfit", label: "Outfit", sub: "Anpassen" },
    { key: "items", label: "Items", sub: `${itemsOwnedTypes}/${totalItemTypes} Sorten` },
    { key: "trophies", label: "Trophäen", sub: `${trophiesUnlocked}/${totalTrophies} freigeschaltet` },
    { key: "loomas", label: "Loomas", sub: `${loomasCaught} gefangen` },
    { key: "habitat", label: "Habitat", sub: "Bald verfügbar" },
    { key: "settings", label: "Einstellungen", sub: "" },
  ]
    .map(
      (t) => `<button class="tile glass" data-tile="${t.key}" style="border-radius:16px;">
        <div class="tile-icon-wrap"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${PROFILE_TILE_ICONS[t.key]}</svg></div>
        <span>${t.label}</span><small>${t.sub || "&nbsp;"}</small>
      </button>`
    )
    .join("");

  return `
    <div class="profile-top">
      <button class="back-circle glass" id="hotspot-profile-back" aria-label="Zurück" style="border-radius:50%;">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="profile-id">
        <div class="profile-avatar"><img src="assets/generated/hud_avatar.png" alt="" /></div>
        <div>
          <div class="profile-name">Dein Profil</div>
          <div class="profile-lvl">LEVEL ${level}${isMaxLevel ? " · MAX" : ""}</div>
        </div>
      </div>
    </div>
    <div class="xp-card glass" style="border-radius:14px;">
      <div class="xp-card-top"><span>${formatNumber(xpIntoLevel)} XP</span><span>${isMaxLevel ? "Levelcap erreicht" : `${formatNumber(levelCeil - levelFloor)} XP`}</span></div>
      <div class="xp-track2"><div class="xp-fill2" style="width:${xpPct}%"></div></div>
    </div>
    <div class="tile-grid">${tiles}</div>
    <button class="scan-strip glass" id="hotspot-scan" style="border-radius:14px;">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z"/></svg>
      <span class="scan-strip-text"><b>Aktiviere dich im Store</b>Bon scannen für dein nächstes Item</span>
    </button>`;
}

// Rucksack-Button im Map-HUD — oeffnet Items direkt, ohne Umweg ueber den
// Profil-Hub. Zurueck fuehrt dann auch direkt zur Karte.
function openItemsFromHud() {
  openSubScreen("items", "screen-map");
}

function openProfile() {
  document.getElementById("profile-content").innerHTML = renderProfileHub();
  document.getElementById("hotspot-profile-back").addEventListener("click", () => showScreen("screen-map"));
  document.getElementById("hotspot-scan").addEventListener("click", openScanScreen);
  document.querySelectorAll(".tile[data-tile]").forEach((tile) => {
    tile.addEventListener("click", () => openSubScreen(tile.dataset.tile));
  });
  showScreen("screen-profile");
}

// Woher ein Unterseiten-Zurueck-Button kommen soll — normalerweise der
// Profil-Hub, aber z.B. der Rucksack-Button im Map-HUD oeffnet Items direkt
// und will dann auch direkt zurueck zur Karte (siehe openItemsFromHud()).
let subScreenReturnTo = "screen-profile";

function openSubScreen(tileKey, returnTo = "screen-profile") {
  subScreenReturnTo = returnTo;
  switch (tileKey) {
    case "items":
      document.getElementById("items-content").innerHTML = renderItemsGrid();
      attachItemGridHandlers();
      showScreen("screen-items");
      break;
    case "outfit":
      document.getElementById("outfit-content").innerHTML = renderOutfitGrid();
      attachOutfitGridHandlers();
      showScreen("screen-outfit");
      break;
    case "loomas":
      document.getElementById("loomas-content").innerHTML = renderLoomasGrid();
      attachLoomasGridHandlers();
      showScreen("screen-loomas");
      break;
    case "settings":
      document.getElementById("settings-content").innerHTML = renderSettings();
      attachSettingsHandlers();
      showScreen("screen-settings");
      break;
    case "trophies":
      document.getElementById("trophies-content").innerHTML = renderTrophiesGrid();
      attachTrophiesGridHandlers();
      showScreen("screen-trophies");
      break;
    case "habitat":
      showScreen("screen-habitat");
      break;
  }
}

function renderItemsGrid() {
  const cells = Object.values(ITEMS)
    .map((item) => {
      const count = gameState.inventory[item.key] || 0;
      const owned = count > 0;
      if (!owned) return `<div class="item-cell locked" data-item="${item.key}"></div>`;
      return `<div class="item-cell" data-item="${item.key}" style="--rarity-color:${RARITY_COLORS[item.rarity]}">
        <img src="${item.icon}" alt="${item.name}" /><span class="cell-count">${count}</span>
        <span class="cell-label">${item.name}</span>
      </div>`;
    })
    .join("");
  return `<div class="item-grid">${cells}</div>`;
}

function attachItemGridHandlers() {
  document.querySelectorAll(".item-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const key = cell.dataset.item;
      const owned = (gameState.inventory[key] || 0) > 0;
      if (!owned) return;
      showItemDetail(key);
    });
  });
}

function showItemDetail(key) {
  const item = ITEMS[key];
  const content = document.getElementById("items-content");
  // Fuer die 8 Items mit echtem Referenzfoto zeigen wir die echte
  // Detailkarte 1:1. Fuer neue Items ohne Foto (z.B. Lockduft-Flakon)
  // bauen wir eine Karte im selben kosmischen Stil aus den Rohdaten.
  const cardHtml = item.card
    ? `<img class="detail-card-full" src="${item.card}" alt="${item.name}" />`
    : `<div class="detail-card-synthetic">
        <div class="detail-card-name">${item.name}</div>
        <div class="detail-card-rarity" style="color:${RARITY_COLORS[item.rarity]}">${item.rarity}</div>
        <img src="${item.icon}" alt="${item.name}" class="detail-card-icon" />
        <div class="detail-card-effect">${item.effect}</div>
        <div class="detail-card-hint">Dieses Item kann durch reale Käufe im Handel aktiviert werden.</div>
      </div>`;
  const owned = gameState.inventory[key] || 0;
  let deleteBtnHtml = "";
  if (gameState.settings.allowItemDeletion) {
    deleteBtnHtml = owned > 1
      ? `<button id="btn-item-delete-one" class="danger-btn" style="margin-top:14px;">🗑 1 Stück löschen</button>
         <button id="btn-item-delete-all" class="danger-btn" style="margin-top:10px;">🗑 Ganzen Stapel löschen (${owned})</button>`
      : `<button id="btn-item-delete-one" class="danger-btn" style="margin-top:14px;">🗑 Item löschen</button>`;
  }
  content.innerHTML = `
    <button class="back-btn" id="btn-item-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    ${cardHtml}
    ${deleteBtnHtml}`;
  document.getElementById("btn-item-detail-back").addEventListener("click", () => {
    content.innerHTML = renderItemsGrid();
    attachItemGridHandlers();
  });
  const deleteOneBtn = document.getElementById("btn-item-delete-one");
  if (deleteOneBtn) {
    deleteOneBtn.addEventListener("click", () => showDeleteItemConfirm(key, "one"));
  }
  const deleteAllBtn = document.getElementById("btn-item-delete-all");
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener("click", () => showDeleteItemConfirm(key, "all"));
  }
}

// Aktive Rueckfrage vor dem Loeschen (siehe Einstellungen "Items löschen
// erlauben") — ersetzt die Detailkarte kurzzeitig durch einen Ja/Abbrechen-
// Schritt, statt sofort zu loeschen. mode "one" entfernt ein Exemplar,
// mode "all" den kompletten Stapel auf einmal.
function showDeleteItemConfirm(key, mode) {
  const item = ITEMS[key];
  const owned = gameState.inventory[key] || 0;
  const content = document.getElementById("items-content");
  const confirmText = mode === "all"
    ? `Alle ${owned}× „${item.name}“ werden unwiderruflich aus deinem Inventar entfernt.`
    : `1× „${item.name}“ wird unwiderruflich aus deinem Inventar entfernt.`;
  content.innerHTML = `
    <div class="confirm-card">
      <div class="confirm-title">${mode === "all" ? "Ganzen Stapel löschen?" : "Item löschen?"}</div>
      <div class="confirm-text">${confirmText}</div>
      <div class="confirm-actions">
        <button id="btn-item-delete-cancel" class="secondary-btn">Abbrechen</button>
        <button id="btn-item-delete-confirm" class="danger-btn">Ja, löschen</button>
      </div>
    </div>`;
  document.getElementById("btn-item-delete-cancel").addEventListener("click", () => showItemDetail(key));
  document.getElementById("btn-item-delete-confirm").addEventListener("click", () => {
    if (mode === "all") {
      removeAllOfItem(key);
    } else {
      removeItem(key);
    }
    content.innerHTML = renderItemsGrid();
    attachItemGridHandlers();
  });
}

function renderLoomasGrid() {
  const cells = Object.values(CREATURES)
    .map((c) => {
      const count = gameState.caughtCreatures[c.key] || 0;
      const owned = count > 0;
      if (!owned) return `<div class="looma-cell locked"></div>`;
      return `<div class="looma-cell" data-creature="${c.key}" style="--rarity-color:${RARITY_COLORS[c.rarity]}">
        <img src="${creatureIconCache[c.key] || c.icon}" alt="${c.name}" /><span class="cell-count">${count}</span>
        <span class="cell-label">${c.name}</span>
      </div>`;
    })
    .join("");
  return `
    <div class="essence-banner">🌑 Schatten-Essenz: <span id="essence-total">${gameState.shadowEssence}</span></div>
    <div class="placeholder-note" style="margin-bottom:14px;">Gefangene Wesen: ${totalCaughtCount()}</div>
    <div class="loomas-grid">${cells}</div>`;
}

function attachLoomasGridHandlers() {
  document.querySelectorAll(".looma-cell[data-creature]").forEach((cell) => {
    cell.addEventListener("click", () => {
      showLoomaExchangeDetail(cell.dataset.creature);
    });
  });
}

function showLoomaExchangeDetail(key) {
  const creature = CREATURES[key];
  const content = document.getElementById("loomas-content");
  const owned = gameState.caughtCreatures[key] || 0;
  if (owned < 1) return;

  content.innerHTML = `
    <button class="back-btn" id="btn-looma-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    <div class="detail-card-synthetic looma-exchange-card">
      <div class="detail-card-name">${creature.name}</div>
      <div class="detail-card-rarity" style="color:${RARITY_COLORS[creature.rarity]}">${creature.rarity}</div>
      <img src="${creatureIconCache[key] || creature.icon}" alt="${creature.name}" class="detail-card-icon" />
      <div class="looma-exchange-owned">Gefangen: ${owned}</div>
      <div class="looma-exchange-rate">1 Wesen = ${SHADOW_ESSENCE_PER_CREATURE} Schatten-Essenz</div>
      <div class="looma-exchange-slider-row">
        <input type="range" id="looma-exchange-slider" min="1" max="${owned}" value="1" step="1" ${owned === 1 ? "disabled" : ""} />
      </div>
      <div class="looma-exchange-preview">
        <span id="looma-exchange-qty">1</span> Wesen → <span id="looma-exchange-result">${SHADOW_ESSENCE_PER_CREATURE}</span> Schatten-Essenz
      </div>
      <button id="btn-looma-exchange-confirm" class="primary-btn">Eintauschen</button>
    </div>`;

  const slider = document.getElementById("looma-exchange-slider");
  const qtyLabel = document.getElementById("looma-exchange-qty");
  const resultLabel = document.getElementById("looma-exchange-result");
  slider.addEventListener("input", () => {
    const qty = Number(slider.value);
    qtyLabel.textContent = qty;
    resultLabel.textContent = qty * SHADOW_ESSENCE_PER_CREATURE;
  });

  document.getElementById("btn-looma-exchange-confirm").addEventListener("click", () => {
    const qty = Number(slider.value);
    if (!exchangeCreatureForEssence(key, qty)) return;
    content.innerHTML = renderLoomasGrid();
    attachLoomasGridHandlers();
  });

  document.getElementById("btn-looma-detail-back").addEventListener("click", () => {
    content.innerHTML = renderLoomasGrid();
    attachLoomasGridHandlers();
  });
}

function renderTrophiesGrid() {
  const cells = Object.values(TROPHIES)
    .map((trophy) => {
      const unlocked = !!(gameState.trophies && gameState.trophies[trophy.key]);
      if (!unlocked) return `<div class="item-cell locked" data-trophy="${trophy.key}"></div>`;
      return `<div class="item-cell" data-trophy="${trophy.key}" style="--rarity-color:${TROPHY_TIER_COLORS[trophy.tier]}">
        <svg class="icon trophy-cell-icon" viewBox="0 0 24 24" aria-hidden="true">${TROPHY_ICON_PATH}</svg>
        <span class="cell-label">${trophy.name}</span>
      </div>`;
    })
    .join("");
  return `<div class="item-grid">${cells}</div>`;
}

function attachTrophiesGridHandlers() {
  document.querySelectorAll(".item-cell[data-trophy]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const key = cell.dataset.trophy;
      const unlocked = !!(gameState.trophies && gameState.trophies[key]);
      if (!unlocked) return;
      showTrophyDetail(key);
    });
  });
}

// Item-Belohnung einer Trophaee als Vorschau-Karte(n) — entweder ein festes
// Item (trophy.itemKey) oder mehrere zufaellige Items aus einem Pool
// (trophy.randomItemPool + randomItemCount, siehe claimTrophy() in
// js/state.js und TROPHIES in js/data.js).
function renderTrophyRewardHtml(trophy) {
  if (trophy.itemKey) {
    const item = ITEMS[trophy.itemKey];
    return `<div class="trophy-reward-item">
        <img src="${item.icon}" alt="${item.name}" />
        <div class="trophy-reward-item-info">
          <div class="trophy-reward-item-name">${item.name}</div>
          <span class="rarity-pill" style="background:${RARITY_COLORS[item.rarity]}">${item.rarity}</span>
        </div>
      </div>`;
  }
  if (trophy.randomItemPool) {
    const options = trophy.randomItemPool
      .map((key) => {
        const item = ITEMS[key];
        return `<div class="trophy-reward-mini">
          <img src="${item.icon}" alt="${item.name}" />
          <span>${item.name}</span>
        </div>`;
      })
      .join("");
    return `<div class="trophy-reward-random">
      <div class="trophy-reward-random-label">${trophy.randomItemCount}× zufällig aus:</div>
      <div class="trophy-reward-random-options">${options}</div>
    </div>`;
  }
  return "";
}

function showTrophyDetail(key) {
  const trophy = TROPHIES[key];
  const content = document.getElementById("trophies-content");
  const tierLabel = trophy.tier.charAt(0).toUpperCase() + trophy.tier.slice(1);
  content.innerHTML = `
    <button class="back-btn" id="btn-trophy-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    <div class="detail-card-synthetic">
      <div class="detail-card-name">${trophy.name}</div>
      <div class="detail-card-rarity" style="color:${TROPHY_TIER_COLORS[trophy.tier]}">${tierLabel}-Trophäe</div>
      <svg class="icon detail-card-icon trophy-detail-icon" viewBox="0 0 24 24" aria-hidden="true" style="color:${TROPHY_TIER_COLORS[trophy.tier]}">${TROPHY_ICON_PATH}</svg>
      <div class="detail-card-effect">${trophy.description}</div>
      <div class="detail-card-hint">Belohnung: +${formatNumber(trophy.xp)} XP</div>
      ${renderTrophyRewardHtml(trophy)}
    </div>`;
  document.getElementById("btn-trophy-detail-back").addEventListener("click", () => {
    content.innerHTML = renderTrophiesGrid();
    attachTrophiesGridHandlers();
  });
}

function renderOutfitGrid() {
  const slots = [
    { key: "kopfteil", label: "Kopfteil", img: "assets/generated/tile_kopfteil.png" },
    { key: "oberteil", label: "Oberteil", img: "assets/generated/tile_oberteil.png" },
    { key: "hose", label: "Hose", img: "assets/generated/tile_hose.png" },
    { key: "outfit", label: "Outfit", img: "assets/generated/tile_outfitfigur.png" },
    { key: "sneaker", label: "Sneaker", img: "assets/generated/tile_outfitsneaker.png" },
    { key: "accessoire", label: "Accessoire", img: "assets/generated/tile_accessoire.png" },
  ];
  const cells = slots
    .map((s) => `<button class="outfit-cell" data-slot="${s.key}"><img src="${s.img}" alt="${s.label}" /></button>`)
    .join("");
  return `
    <div class="outfit-grid">${cells}</div>
    <div class="outfit-stage">
      <img src="assets/generated/bg_outfit_stage.png" alt="" />
    </div>`;
}

function attachOutfitGridHandlers() {
  document.querySelectorAll(".outfit-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const content = document.getElementById("outfit-content");
      content.innerHTML = `
        <button class="back-btn" id="btn-outfit-back" style="margin-bottom:12px;">← Übersicht</button>
        <div class="placeholder-note">Screen folgt als Nächstes</div>`;
      document.getElementById("btn-outfit-back").addEventListener("click", () => {
        content.innerHTML = renderOutfitGrid();
        attachOutfitGridHandlers();
      });
    });
  });
}

function renderSettings() {
  return `
    <div class="settings-row">
      <div>
        <div style="font-weight:600;">Item-Minigame überspringen</div>
        <div style="font-size:12px; opacity:0.75;">Bei Store-Besuchen direkt das Item erhalten, ohne Nachmal-Minigame.</div>
      </div>
      <button id="settings-skip-toggle" class="toggle-switch ${gameState.settings.skipMinigame ? "on" : ""}"></button>
    </div>
    <div class="settings-row">
      <div>
        <div style="font-weight:600;">Kamera-Hintergrund in der Fangszene (AR)</div>
        <div style="font-size:12px; opacity:0.75;">Zeigt beim Fangen dein echtes Kamerabild statt eines festen Fotos. Bild bleibt immer nur lokal auf dem Gerät. Ohne Kamera-Erlaubnis wird automatisch das feste Foto genutzt.</div>
      </div>
      <button id="settings-ar-toggle" class="toggle-switch ${gameState.settings.arCameraEnabled ? "on" : ""}"></button>
    </div>
    <div class="settings-row">
      <div>
        <div style="font-weight:600;">Items löschen erlauben</div>
        <div style="font-size:12px; opacity:0.75;">Zeigt im Items-Screen die Möglichkeit, einzelne Gegenstände zu löschen. Vor dem Löschen wird immer aktiv nachgefragt.</div>
      </div>
      <button id="settings-item-deletion-toggle" class="toggle-switch ${gameState.settings.allowItemDeletion ? "on" : ""}"></button>
    </div>`;
}

function attachSettingsHandlers() {
  const toggle = document.getElementById("settings-skip-toggle");
  toggle.addEventListener("click", () => {
    const newValue = !gameState.settings.skipMinigame;
    setSkipMinigame(newValue);
    toggle.classList.toggle("on", newValue);
  });

  // Derselbe gespeicherte Zustand wie der Kamera-Umschalter direkt in der
  // Fangszene (catchgame.js) — beide halten sich gegenseitig synchron.
  const arToggle = document.getElementById("settings-ar-toggle");
  arToggle.addEventListener("click", () => {
    const newValue = !gameState.settings.arCameraEnabled;
    setArCameraEnabled(newValue);
    arToggle.classList.toggle("on", newValue);
    updateArToggleUI();
  });

  const deletionToggle = document.getElementById("settings-item-deletion-toggle");
  deletionToggle.addEventListener("click", () => {
    const newValue = !gameState.settings.allowItemDeletion;
    setAllowItemDeletion(newValue);
    deletionToggle.classList.toggle("on", newValue);
  });
}
