// Profil-Hub: eine einzige unveraenderte Grafik (assets/generated/
// profile_hub.png) mit unsichtbaren Hotspots fuer Zurueck und die sechs
// Icon-Kacheln (siehe Spielspezifikation Abschnitt 6) — keine eigene
// Rekonstruktion mit Live-Daten. Die sechs Kacheln oeffnen eigene
// Vollbild-Unterseiten mit eigenem Zurueck-Button.

function xpToLevel(xp) {
  return Math.floor(xp / 500) + 1;
}

function openProfile() {
  showScreen("screen-profile");
}

function openSubScreen(tileKey) {
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
      showScreen("screen-loomas");
      break;
    case "settings":
      document.getElementById("settings-content").innerHTML = renderSettings();
      attachSettingsHandlers();
      showScreen("screen-settings");
      break;
    case "trophies":
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
      return `<div class="item-cell" data-item="${item.key}">
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
  content.innerHTML = `
    <button class="back-btn" id="btn-item-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    ${cardHtml}`;
  document.getElementById("btn-item-detail-back").addEventListener("click", () => {
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
      return `<div class="looma-cell">
        <img src="${creatureIconCache[c.key] || c.icon}" alt="${c.name}" /><span class="cell-count">${count}</span>
        <span class="cell-label">${c.name}</span>
      </div>`;
    })
    .join("");
  return `<div class="placeholder-note" style="margin-bottom:14px;">Gefangene Wesen: ${totalCaughtCount()}</div><div class="loomas-grid">${cells}</div>`;
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
}
