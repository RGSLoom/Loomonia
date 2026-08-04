// Profil-Hub: XP-Anzeige, sechs Icon-Kacheln und ihre Unterseiten

function xpToLevel(xp) {
  return Math.floor(xp / 500) + 1;
}

function renderProfileHeader() {
  const level = xpToLevel(gameState.xp);
  const xpIntoLevel = gameState.xp % 500;
  document.getElementById("profile-level").textContent = `Level ${level}`;
  document.getElementById("xp-bar-fill").style.width = `${(xpIntoLevel / 500) * 100}%`;
  document.getElementById("xp-text").textContent = `${gameState.xp} XP (${xpIntoLevel}/500 bis Level ${level + 1})`;
}

function openProfile() {
  renderProfileHeader();
  document.getElementById("profile-detail").classList.add("hidden");
  document.getElementById("profile-detail").innerHTML = "";
  showScreen("screen-profile");
}

function renderProfileTile(tileKey) {
  const detail = document.getElementById("profile-detail");
  detail.classList.remove("hidden");

  switch (tileKey) {
    case "items":
      detail.innerHTML = renderItemsGrid();
      attachItemGridHandlers();
      break;
    case "loomas":
      detail.innerHTML = renderLoomasGrid();
      break;
    case "settings":
      detail.innerHTML = renderSettings();
      attachSettingsHandlers();
      break;
    case "outfit":
    case "trophies":
    case "habitat":
      detail.innerHTML = `<div class="placeholder-note">Screen folgt als Nächstes</div>`;
      break;
    default:
      detail.innerHTML = "";
  }
}

function renderItemsGrid() {
  const cells = Object.values(ITEMS)
    .map((item) => {
      const count = gameState.inventory[item.key] || 0;
      const owned = count > 0;
      return `<div class="item-cell ${owned ? "" : "locked"}" data-item="${item.key}">
        ${owned ? `<img src="${item.icon}" alt="${item.name}" /><span class="cell-count">${count}</span>` : `<span class="lock-icon">🔒</span>`}
        <span class="cell-label">${owned ? item.name : "?"}</span>
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
  const detail = document.getElementById("profile-detail");
  detail.innerHTML = `
    <button class="back-btn" id="btn-item-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    <img class="detail-card-full" src="${item.card}" alt="${item.name}" />`;
  document.getElementById("btn-item-detail-back").addEventListener("click", () => {
    detail.innerHTML = renderItemsGrid();
    attachItemGridHandlers();
  });
}

function renderLoomasGrid() {
  const cells = Object.values(CREATURES)
    .map((c) => {
      const count = gameState.caughtCreatures[c.key] || 0;
      const owned = count > 0;
      return `<div class="looma-cell ${owned ? "" : "locked"}">
        ${owned ? `<img src="${creatureIconCache[c.key] || c.icon}" alt="${c.name}" /><span class="cell-count">${count}</span>` : `<span class="lock-icon">🔒</span>`}
        <span class="cell-label">${owned ? c.name : "?"}</span>
      </div>`;
    })
    .join("");
  return `<div class="placeholder-note" style="margin-bottom:14px;">Gefangene Wesen: ${totalCaughtCount()}</div><div class="loomas-grid">${cells}</div>`;
}

function renderSettings() {
  return `
    <div class="settings-row">
      <div>
        <div style="font-weight:600;">Item-Minigame überspringen</div>
        <div style="font-size:12px; opacity:0.75;">Bei Store-Besuchen direkt das Item erhalten, ohne Nachmal-Minigame.</div>
      </div>
      <button id="settings-skip-toggle" class="toggle-switch ${gameState.settings.skipMinigame ? "on" : ""}"></button>
    </div>`;
}

function attachSettingsHandlers() {
  const toggle = document.getElementById("settings-skip-toggle");
  toggle.addEventListener("click", () => {
    const newValue = !gameState.settings.skipMinigame;
    setSkipMinigame(newValue);
    toggle.classList.toggle("on", newValue);
  });
}
