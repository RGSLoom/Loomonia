// Profil-Hub: echte Komponenten (Glas-Kacheln, dasselbe System wie
// Map-HUD/Untermenues) statt des frueheren Baked-Bilds. Die sechs Kacheln
// oeffnen eigene Vollbild-Unterseiten mit eigenem Zurueck-Button.

function renderActiveBoostsBanner() {
  const rows = Object.entries(gameState.activeEffects || {})
    .map(([effectType, entry]) => {
      const value = getActiveEffectValue(effectType); // raeumt abgelaufene Eintraege mit auf
      if (!entry || Date.now() >= entry.expiresAt) return "";
      const label = ACTIVE_EFFECT_LABELS[effectType] || effectType;
      const valueText = value > 0 ? ` +${Math.round(value * 100)}%` : "";
      return `<div class="active-boost-row">
        <span>${label}${valueText}</span>
        <span class="active-boost-time">noch ${formatRemainingTime(entry.expiresAt - Date.now())}</span>
      </div>`;
    })
    .join("");
  if (!rows) return "";
  return `<div class="active-boosts-banner">${rows}</div>`;
}

const OUTFIT_SLOT_LABELS = {
  kopfteil: "Kopfteil",
  oberteil: "Oberteil",
  hose: "Hose",
  sneaker: "Sneaker",
  accessoire: "Accessoire",
  outfit: "Outfit",
};

// Platzhalter-Ganzkoerpersilhouette fuer die Avatar-Buehne — es gibt noch
// keine echte, auf den Avatar-Body zugeschnittene Grafik (siehe
// AVATAR_SINGLE_SLOTS in data.js). Sobald echte Body-Art vorliegt, ersetzt
// ein <img> diese Silhouette; die Ebenen-Positionierung (.avatar-layer--*
// in style.css) bleibt unveraendert.
const AVATAR_SILHOUETTE_SVG = `<svg class="avatar-silhouette" viewBox="0 0 100 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="50" cy="34" r="26" fill="rgba(246,243,255,0.16)" />
  <path d="M22 200 L26 96 Q50 78 74 96 L78 200 Z" fill="rgba(246,243,255,0.12)" />
  <path d="M30 200 L33 130 L45 130 L43 200 Z" fill="rgba(246,243,255,0.16)" />
  <path d="M70 200 L67 130 L55 130 L57 200 Z" fill="rgba(246,243,255,0.16)" />
</svg>`;

// Baut die Ganzkoerper-Buehne mit den aktuell angezogenen Items als Ebenen
// (siehe .avatar-layer--* in style.css fuer die grobe Positionierung pro
// Slot). Aktives Outfit ersetzt alle Einzelteil-Ebenen komplett, weil sich
// Outfit und Einzelteile laut Ausschluss-Logik nie gleichzeitig ueberschneiden
// (siehe equipItem() in state.js).
function renderAvatarStage() {
  const equipped = gameState.avatarEquipped;
  // ITEMS[key] kann fehlen, wenn ein angezogenes Item nachtraeglich aus der
  // Item-Definition entfernt/umbenannt wurde (veralteter State) -- ohne
  // diese Guards stuerzte das Rendern der Avatar-Buehne (Outfit-Tab UND
  // jede Slot-Detailansicht) mit einem TypeError ab (siehe QA-Bug-Liste).
  // Ein fehlendes Outfit-Item faellt auf die Einzelteil-Ansicht zurueck,
  // ein fehlendes Einzelteil-Item wird wie ein leerer Slot behandelt --
  // derselbe defensive Umgang wie renderOutfitGrid() bereits an anderer
  // Stelle.
  if (equipped.outfit && ITEMS[equipped.outfit]) {
    const item = ITEMS[equipped.outfit];
    return `<div class="avatar-stage-figure">
      ${AVATAR_SILHOUETTE_SVG}
      <div class="avatar-layer avatar-layer--outfit"><img src="${item.icon}" alt="${item.name}" /></div>
    </div>`;
  }
  const layers = AVATAR_SINGLE_SLOTS
    .map((slot) => {
      const key = equipped[slot];
      const item = key ? ITEMS[key] : null;
      if (!item) return "";
      return `<div class="avatar-layer avatar-layer--${slot}"><img src="${item.icon}" alt="${item.name}" /></div>`;
    })
    .join("");
  return `<div class="avatar-stage-figure">
    ${AVATAR_SILHOUETTE_SVG}
    ${layers}
  </div>`;
}

// Vollflaechige illustrierte Icons statt der frueheren schlichten Linien-
// Icons (siehe Hero-Bild-Briefing) -- freigestellte PNGs mit echtem
// transparentem Hintergrund, Rahmen/Hintergrund/Label bleiben Sache der
// Kachel selbst (.tile in css/style.css).
const PROFILE_TILE_ICON_SRC = {
  outfit: "assets/oberflächen/outfit_icon.png",
  items: "assets/oberflächen/inventar-rucksack_icon.png",
  trophies: "assets/oberflächen/trophaeen_icon.png",
  loomas: "assets/oberflächen/Loomas_icon.png",
  habitat: "assets/oberflächen/habitat_icon.png",
  settings: "assets/oberflächen/setup_icon.png",
};

// Hero-Bild vor Skyline (Mann_icon.png/Frau_icon.png) je nach gespeicherter
// Geschlechts-Auswahl (siehe gameState.avatarGender, Onboarding-Dialog
// unten) -- vor der ersten Auswahl faellt es auf das maennliche Bild zurueck.
function avatarHeroImageSrc() {
  return gameState.avatarGender === "female"
    ? "assets/oberflächen/Frau_icon.png"
    : "assets/oberflächen/Mann_icon.png";
}

function renderProfileHub() {
  const level = xpToLevel(gameState.xp);
  const isMaxLevel = level >= LEVEL_CAP;
  const levelFloor = xpForLevel(level);
  const levelCeil = isMaxLevel ? MAX_LEVEL_XP : xpForLevel(level + 1);
  const xpIntoLevel = gameState.xp - levelFloor;
  const xpPct = isMaxLevel ? 100 : Math.round((xpIntoLevel / (levelCeil - levelFloor)) * 100);
  // Object.keys(gameState.inventory) statt Object.values(ITEMS) gefiltert
  // nach Bestand>0 (aequivalent), damit ein veralteter itemKey im State
  // (nicht mehr in ITEMS vorhanden) die Kachel nicht auf "X/Y Sorten" mit
  // X > Y hochzaehlt (siehe QA-Bug-Liste).
  const itemsOwnedTypes = Object.keys(gameState.inventory).filter((key) => ITEMS[key]).length;
  const totalItemTypes = Object.keys(ITEMS).length;
  const loomasCaught = totalCaughtCount();
  const trophiesUnlocked = Object.keys(gameState.trophies || {}).length;
  const totalTrophies = Object.keys(TROPHIES).length;
  const habitatCompanion = getActiveCompanion();
  const habitatSub = !habitatCompanion
    ? "Begleiter wählen"
    : gameState.restedXpRemaining > 0
      ? "😴 Ausgeruht"
      : habitatCompanion.name;

  const tiles = [
    { key: "outfit", label: "Outfit", sub: "Anpassen" },
    { key: "items", label: "Items", sub: `${itemsOwnedTypes}/${totalItemTypes} Sorten` },
    { key: "trophies", label: "Trophäen", sub: `${trophiesUnlocked}/${totalTrophies} freigeschaltet` },
    { key: "loomas", label: "Loomas", sub: `${loomasCaught} gefangen` },
    { key: "habitat", label: "Habitat", sub: habitatSub },
    { key: "settings", label: "Einstellungen", sub: "" },
  ]
    .map(
      (t) => `<button class="tile glass" data-tile="${t.key}">
        <div class="tile-icon-wrap"><img src="${PROFILE_TILE_ICON_SRC[t.key]}" alt="" /></div>
        <span>${t.label}</span><small>${t.sub || "&nbsp;"}</small>
      </button>`
    )
    .join("");

  return `
    <div class="profile-hero">
      <img class="profile-hero-img" src="${avatarHeroImageSrc()}" alt="" />
      <button class="back-circle glass profile-hero-back" id="hotspot-profile-back" aria-label="Zurück">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="profile-hero-overlay">
        <div class="profile-hero-top">
          <div>
            <div class="profile-hero-name">${gameState.playerName || "Spieler"}</div>
            <div class="profile-hero-lvl">LEVEL ${level}${isMaxLevel ? " · MAX" : ""}</div>
          </div>
          <div class="profile-hero-coins">🪙 ${formatNumber(gameState.coins || 0)}</div>
        </div>
        <div class="profile-hero-xp-track"><div class="profile-hero-xp-fill" style="width:${xpPct}%"></div></div>
      </div>
    </div>
    <div class="profile-tiles-area">
      <div class="tile-grid">${tiles}</div>
    </div>`;
}

// Einmaliger Avatar-Onboarding-Dialog: Gamer-Name + Geschlecht, bevor das
// Hero-Bild sinnvoll dargestellt werden kann (siehe gameState.playerName/
// avatarGender in js/state.js). Erscheint bei jedem Oeffnen des Profils,
// solange eines der beiden Felder noch nicht gesetzt ist -- bis dahin zeigt
// der Hub selbst schon ein Standardbild (maennlich) + "Spieler" an (siehe
// renderProfileHub() oben).
function maybeShowOnboarding() {
  const modal = document.getElementById("onboarding-modal");
  const needsOnboarding = !gameState.playerName || !gameState.avatarGender;
  modal.classList.toggle("hidden", !needsOnboarding);
}

function updateOnboardingConfirmState() {
  const selected = document.querySelector(".onboarding-gender-btn.selected");
  const name = document.getElementById("onboarding-name-input").value.trim();
  document.getElementById("btn-onboarding-confirm").disabled = !selected || !name;
}

function initOnboardingModal() {
  document.querySelectorAll(".onboarding-gender-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".onboarding-gender-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      updateOnboardingConfirmState();
    });
  });
  document.getElementById("onboarding-name-input").addEventListener("input", updateOnboardingConfirmState);
  document.getElementById("btn-onboarding-confirm").addEventListener("click", () => {
    const selected = document.querySelector(".onboarding-gender-btn.selected");
    const name = document.getElementById("onboarding-name-input").value.trim();
    if (!selected || !name) return;
    setAvatarGender(selected.dataset.gender);
    setPlayerName(name);
    document.getElementById("onboarding-modal").classList.add("hidden");
    document.getElementById("profile-content").innerHTML = renderProfileHub();
    attachProfileHubHandlers();
  });
}

// Rucksack-Button im Map-HUD — oeffnet Items direkt, ohne Umweg ueber den
// Profil-Hub. Zurueck fuehrt dann auch direkt zur Karte.
function openItemsFromHud() {
  openSubScreen("items", "screen-map");
}

function attachProfileHubHandlers() {
  document.getElementById("hotspot-profile-back").addEventListener("click", () => showScreen("screen-map"));
  document.querySelectorAll(".tile[data-tile]").forEach((tile) => {
    tile.addEventListener("click", () => openSubScreen(tile.dataset.tile));
  });
}

function openProfile() {
  document.getElementById("profile-content").innerHTML = renderProfileHub();
  attachProfileHubHandlers();
  maybeShowOnboarding();
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
      document.getElementById("habitat-content").innerHTML = renderHabitatContent();
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
      const isEquipped = item.slotType && gameState.avatarEquipped[item.slotType] === item.key;
      return `<div class="item-cell${isEquipped ? " equipped" : ""}" data-item="${item.key}" style="--rarity-color:${RARITY_COLORS[item.rarity]}">
        <img src="${item.icon}" alt="${item.name}" /><span class="cell-count">${count}</span>
        <span class="cell-label">${item.name}</span>
        ${isEquipped ? `<span class="cell-equipped-tag">Angezogen</span>` : ""}
      </div>`;
    })
    .join("");
  return `${renderActiveBoostsBanner()}<div class="item-grid">${cells}</div>`;
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
  // Fuer Items mit echtem Referenzfoto (item.card) zeigen wir die echte
  // Detailkarte 1:1. Fuer Items ohne eigenes Kartenfoto bauen wir stattdessen
  // eine Karte im selben kosmischen Stil aus den Rohdaten.
  const cardHtml = item.card
    ? `<img class="detail-card-full" src="${item.card}" alt="${item.name}" />`
    : `<div class="detail-card-synthetic">
        <div class="detail-card-name">${item.name}</div>
        <div class="detail-card-rarity" style="color:${RARITY_COLORS[item.rarity]}">${item.rarity}</div>
        <img src="${item.icon}" alt="${item.name}" class="detail-card-icon" />
        ${item.type ? `<div class="detail-card-type">${item.type}</div>` : ""}
        <div class="detail-card-effect">${item.effect}</div>
        <div class="detail-card-hint">${item.unlockText || "Dieses Item kann durch reale Käufe im Handel aktiviert werden."}</div>
      </div>`;
  const owned = gameState.inventory[key] || 0;

  // Anziehen/Ausziehen direkt aus der Item-Detailkarte — nur fuer Items mit
  // slotType (Teil des Outfit-Slot-Systems, siehe equipItem() in state.js).
  const isEquippable = item.type === "Anlegbar" && !!item.slotType;
  const isEquipped = isEquippable && gameState.avatarEquipped[item.slotType] === key;
  const equipBtnHtml = isEquippable
    ? isEquipped
      ? `<button id="btn-item-unequip" class="secondary-btn" style="margin-top:14px;">Ausziehen</button>`
      : `<button id="btn-item-equip" class="primary-btn" style="margin-top:14px;">Anziehen</button>`
    : "";

  // Verwenden-Aktion fuer Verbrauchsitems (siehe Verbrauchsgegenstaende-
  // Briefing): "jederzeit" nutzbare Boost-Items bekommen einen echten
  // Verwenden-Button (siehe applyBoostItem() in js/state.js); kontextgebundene
  // Heilungsitems ("fangsystem_only") werden hier NICHT als nutzbar
  // angeboten, sondern nur als Hinweis ausgegraut — sie lassen sich
  // ausschliesslich aus der aktiven Fangszene heraus einsetzen (siehe
  // useHealItem() in js/catchgame.js).
  let useBtnHtml = "";
  if (item.type === "Verbrauchbar" && owned > 0) {
    if (item.usage_context === "jederzeit") {
      useBtnHtml = `<button id="btn-item-use" class="primary-btn" style="margin-top:14px;">Verwenden</button>`;
    } else if (item.usage_context === "fangsystem_only") {
      useBtnHtml = `<div class="item-detail-usage-hint">Nur während eines aktiven Fangversuchs nutzbar</div>`;
    }
  }

  let deleteBtnHtml = "";
  if (gameState.settings.allowItemDeletion && owned > 0) {
    deleteBtnHtml = owned > 1
      ? `<button id="btn-item-delete-one" class="danger-btn" style="margin-top:14px;">🗑 1 Stück löschen</button>
         <button id="btn-item-delete-all" class="danger-btn" style="margin-top:10px;">🗑 Ganzen Stapel löschen (${owned})</button>`
      : `<button id="btn-item-delete-one" class="danger-btn" style="margin-top:14px;">🗑 Item löschen</button>`;
  }
  content.innerHTML = `
    <button class="back-btn" id="btn-item-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    ${cardHtml}
    ${equipBtnHtml}
    ${useBtnHtml}
    ${deleteBtnHtml}`;
  document.getElementById("btn-item-detail-back").addEventListener("click", () => {
    content.innerHTML = renderItemsGrid();
    attachItemGridHandlers();
  });
  const equipBtn = document.getElementById("btn-item-equip");
  if (equipBtn) {
    equipBtn.addEventListener("click", () => {
      equipItem(key);
      showItemDetail(key);
    });
  }
  const unequipBtn = document.getElementById("btn-item-unequip");
  if (unequipBtn) {
    unequipBtn.addEventListener("click", () => {
      unequipSlot(item.slotType);
      showItemDetail(key);
    });
  }
  const useBtn = document.getElementById("btn-item-use");
  if (useBtn) {
    useBtn.addEventListener("click", () => {
      const result = applyBoostItem(key);
      if (!result) return;
      showToast(`${result.blocked ? "⚠️" : "✅"} ${result.text}`);
      updateCaughtCounter();
      if ((gameState.inventory[key] || 0) > 0) {
        showItemDetail(key);
      } else {
        content.innerHTML = renderItemsGrid();
        attachItemGridHandlers();
      }
    });
  }
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
      const count = caughtInstances(c.key).length;
      const owned = count > 0;
      if (!owned) return `<div class="looma-cell locked"></div>`;
      const isCompanion = gameState.activeCompanion === c.key;
      const companionInstance = isCompanion ? getActiveCompanionInstance() : null;
      return `<div class="looma-cell${isCompanion ? " looma-cell--companion" : ""}" data-creature="${c.key}" style="--rarity-color:${RARITY_COLORS[c.rarity]}">
        <img src="${creatureIconCache[c.key] || c.icon}" alt="${c.name}" /><span class="cell-count">${count}</span>
        <span class="cell-label">${c.name}</span>
        ${isCompanion ? `<span class="cell-companion-tag">Begleiter · Lvl ${companionInstance.level}</span>` : ""}
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
  const owned = caughtInstances(key).length;
  if (owned < 1) return;
  const isCompanion = gameState.activeCompanion === key;
  const essencePerCreature = SHADOW_ESSENCE_PER_CREATURE_BY_RARITY[creature.rarity];
  // Der aktive Begleiter ruht im Habitat und darf nicht mit eingetauscht
  // werden (siehe exchangeableCreatureCount() in js/state.js + User-Feedback:
  // "bei 10 Stück dürfen max nur 9 getauscht werden, da ich einen im Habitat
  // habe"). Bleibt dadurch nichts Eintauschbares uebrig (nur 1 besessen UND
  // aktiver Begleiter), gibt es gar keinen Eintausch-Bereich, nur einen
  // Hinweis statt Slider/Button.
  const exchangeable = exchangeableCreatureCount(key);

  const exchangeSectionHtml = exchangeable > 0
    ? `<div class="looma-exchange-rate">1 Wesen = ${essencePerCreature} Schatten-Essenz</div>
      <div class="looma-exchange-slider-row">
        <input type="range" id="looma-exchange-slider" min="1" max="${exchangeable}" value="1" step="1" ${exchangeable === 1 ? "disabled" : ""} />
      </div>
      <div class="looma-exchange-preview">
        <span id="looma-exchange-qty">1</span> Wesen → <span id="looma-exchange-result">${essencePerCreature}</span> Schatten-Essenz
      </div>
      <button id="btn-looma-exchange-confirm" class="primary-btn">Eintauschen</button>`
    : `<div class="looma-exchange-rate">Dein aktiver Begleiter ist im Habitat reserviert und kann nicht eingetauscht werden.</div>`;

  // Level-Anzeige + Levelaufstieg nur fuer den aktiven Begleiter -- das ist
  // aktuell das einzige Looma, das im Spiel ueberhaupt eine Rolle spielt
  // (Habitat/Rested-XP), andere Exemplare derselben Art sind reine
  // Eintausch-Ware ohne eigene Verwendung.
  let levelSectionHtml = "";
  if (isCompanion) {
    const instance = getActiveCompanionInstance();
    const stats = loomaStatsAtLevel(creature.rarity, instance.level);
    const atMaxLevel = instance.level >= LOOMA_MAX_LEVEL;
    const cost = atMaxLevel ? null : loomaLevelUpCost(instance.level + 1);
    const canAfford = cost !== null && gameState.shadowEssence >= cost;
    levelSectionHtml = `
      <div class="looma-level-card">
        <div class="looma-level-title">Level ${instance.level}${atMaxLevel ? " (Max)" : ""}</div>
        <div class="looma-level-stats">
          <span>⚔️ ${stats.angriff}</span>
          <span>🛡️ ${stats.verteidigung}</span>
          <span>❤️ ${stats.gesundheit}</span>
        </div>
        ${atMaxLevel
          ? ""
          : `<div class="looma-level-cost">Aufstieg auf Level ${instance.level + 1}: ${formatNumber(cost)} Schatten-Essenz</div>
             <button id="btn-looma-level-up" class="primary-btn" ${canAfford ? "" : "disabled"}>Level aufsteigen</button>`}
      </div>`;
  }

  content.innerHTML = `
    <button class="back-btn" id="btn-looma-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    <div class="detail-card-synthetic looma-exchange-card">
      <div class="detail-card-name">${creature.name}</div>
      <div class="detail-card-rarity" style="color:${RARITY_COLORS[creature.rarity]}">${creature.rarity}</div>
      <img src="${creatureIconCache[key] || creature.icon}" alt="${creature.name}" class="detail-card-icon" />
      <div class="looma-exchange-owned">Gefangen: ${owned}${isCompanion ? " (1 als Begleiter reserviert)" : ""}</div>
      ${isCompanion
        ? `<div class="looma-companion-active-note">✓ Aktiver Begleiter</div>`
        : `<button id="btn-looma-set-companion" class="secondary-btn" style="margin-bottom:16px;">Als Begleiter wählen</button>`}
      ${levelSectionHtml}
      ${exchangeSectionHtml}
    </div>`;

  const slider = document.getElementById("looma-exchange-slider");
  if (slider) {
    const qtyLabel = document.getElementById("looma-exchange-qty");
    const resultLabel = document.getElementById("looma-exchange-result");
    slider.addEventListener("input", () => {
      const qty = Number(slider.value);
      qtyLabel.textContent = qty;
      resultLabel.textContent = qty * essencePerCreature;
    });
  }

  const exchangeConfirmBtn = document.getElementById("btn-looma-exchange-confirm");
  if (exchangeConfirmBtn) {
    exchangeConfirmBtn.addEventListener("click", () => {
      const qty = Number(slider.value);
      if (!exchangeCreatureForEssence(key, qty)) return;
      content.innerHTML = renderLoomasGrid();
      attachLoomasGridHandlers();
    });
  }

  const levelUpBtn = document.getElementById("btn-looma-level-up");
  if (levelUpBtn) {
    levelUpBtn.addEventListener("click", () => {
      if (!levelUpActiveCompanion()) return;
      showLoomaExchangeDetail(key);
    });
  }

  const setCompanionBtn = document.getElementById("btn-looma-set-companion");
  if (setCompanionBtn) {
    setCompanionBtn.addEventListener("click", () => {
      setActiveCompanion(key);
      showLoomaExchangeDetail(key);
    });
  }

  document.getElementById("btn-looma-detail-back").addEventListener("click", () => {
    content.innerHTML = renderLoomasGrid();
    attachLoomasGridHandlers();
  });
}

// Habitat-Screen (siehe Habitat-Briefing): zeigt den aktuell aktiven
// Begleiter, den spielerweiten Rested-XP-Status (siehe
// gameState.restedXpRemaining/restedXpCap() in js/state.js) und die sechs
// Element-Habitate, von denen genau eines (das des aktiven Begleiters,
// siehe habitatElementForCreature() in js/data.js) hervorgehoben wird. Die
// Begleiter-AUSWAHL selbst passiert im Loomas-Screen (siehe
// showLoomaExchangeDetail() oben) -- hier nur Anzeige.
function renderHabitatContent() {
  const companion = getActiveCompanion();
  const companionInstance = companion ? getActiveCompanionInstance() : null;
  const cap = restedXpCap();
  const remaining = Math.round(gameState.restedXpRemaining || 0);
  const isResting = remaining > 0;
  const pct = cap > 0 ? Math.min(100, Math.round((remaining / cap) * 100)) : 0;

  const companionBannerHtml = companion
    ? `<div class="habitat-companion-banner glass">
        <img src="${creatureIconCache[companion.key] || companion.icon}" alt="${companion.name}" />
        <div>
          <div class="habitat-companion-name">${companion.name}</div>
          <div class="habitat-companion-sub">Aktiver Begleiter · Level ${companionInstance.level}</div>
        </div>
      </div>`
    : `<div class="habitat-companion-banner glass">
        <div class="habitat-companion-sub">Kein aktiver Begleiter gewählt — wähle im Loomas-Screen eins aus.</div>
      </div>`;

  const restedCardHtml = companion
    ? `<div class="habitat-rested-card glass">
        <div class="habitat-rested-title">${isResting ? "😴 Ausgeruht" : "Wach"}</div>
        <div class="habitat-rested-bar"><div class="habitat-rested-fill" style="width:${pct}%"></div></div>
        <div class="habitat-rested-text">${
          isResting
            ? `Doppelte XP, bis ${formatNumber(remaining)} Bonus-XP verbraucht sind.`
            : "Schließe die App eine Weile, damit dein Begleiter sich in seinem Habitat ausruht und du beim nächsten Spielstart doppelte XP erhältst."
        }</div>
      </div>`
    : "";

  // Nur EIN Habitat-Fenster statt aller sechs Elemente nebeneinander --
  // der Spieler hat immer nur einen aktiven Begleiter, die anderen fuenf
  // Habitate waeren also zwangslaeufig immer leer (siehe User-Feedback: "so
  // macht das keinen Sinn"). Zeigt das zum Begleiter-Element passende
  // Habitat gross, das Looma darin gross zentriert, das Element nur als
  // kleines Badge -- data-habitat-element als Haken fuer spaeter, wenn jedes
  // Habitat optisch (Hintergrund je Element) eigens gestaltet wird.
  const habitatElement = companion && habitatElementForCreature(companion);
  const habitatInfo = habitatElement && HABITATS.find((h) => h.element === habitatElement);
  const habitatWindowHtml = companion
    ? `<div class="habitat-window glass" data-habitat-element="${habitatElement}">
        <span class="habitat-window-element-badge">${habitatInfo.icon} ${habitatInfo.element}</span>
        <img class="habitat-window-companion-img" src="${creatureIconCache[companion.key] || companion.icon}" alt="${companion.name}" />
      </div>`
    : `<div class="habitat-window habitat-window--empty glass">
        <div class="habitat-window-empty-text">Wähle im Loomas-Screen einen aktiven Begleiter, damit sein Habitat hier erscheint.</div>
      </div>`;

  return `${companionBannerHtml}${restedCardHtml}${habitatWindowHtml}`;
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

// Je Slot ein eigenes, schlichtes Linien-Icon fuer unbesetzte Slots (siehe
// .icon-Konvention in style.css: stroke-basiert, 24x24 viewBox) — ersetzt
// die frueheren pseudo-realistischen Platzhalterbilder (tile_kopfteil.png
// etc.), die auf den ersten Blick wie bereits angezogene Kleidung aussahen.
const OUTFIT_SLOT_EMPTY_ICONS = {
  kopfteil: `<path d="M4 15a8 8 0 0 1 16 0"/><path d="M2.5 15h15.5a4 4 0 0 0 4-4"/>`,
  oberteil: `<rect x="8" y="7.5" width="8" height="12.5" rx="1.5"/><rect x="4.5" y="7.5" width="3.2" height="5" rx="1"/><rect x="16.3" y="7.5" width="3.2" height="5" rx="1"/><path d="M9.5 7.5a2.5 2.5 0 0 1 5 0"/>`,
  hose: `<rect x="7" y="3" width="10" height="4" rx="1"/><rect x="7" y="7.5" width="3.8" height="13.5" rx="1"/><rect x="13.2" y="7.5" width="3.8" height="13.5" rx="1"/>`,
  sneaker: `<path d="M3 20v-4.5a2 2 0 0 1 1.4-1.9l3.6-1.2V10h3.3c.9 0 1.8.4 2.3 1.2l1.7 2.4c.3.4.7.7 1.2.9l3 1c1 .3 1.5 1.2 1.5 2.2V20Z"/><path d="M3 20h18"/>`,
  accessoire: `<circle cx="12" cy="12" r="4.5"/><path d="M12 7.5V5"/><path d="M12 16.5V19"/><path d="M9.5 5h5"/><path d="M9.5 19h5"/>`,
  outfit: `<circle cx="12" cy="5" r="2.2"/><path d="M8.5 20 9.5 10h5l1 10"/><path d="M9.5 10 6 13.5"/><path d="M14.5 10 18 13.5"/>`,
};

function renderOutfitGrid() {
  const slots = [
    { key: "kopfteil", label: "Kopfteil" },
    { key: "oberteil", label: "Oberteil" },
    { key: "hose", label: "Hose" },
    { key: "outfit", label: "Outfit" },
    { key: "sneaker", label: "Sneaker" },
    { key: "accessoire", label: "Accessoire" },
  ];
  const cells = slots
    .map((s) => {
      const equippedKey = gameState.avatarEquipped[s.key];
      const equippedItem = equippedKey ? ITEMS[equippedKey] : null;
      // Belegter Slot: die Kachel zeigt das angezogene Item selbst. Leerer
      // Slot: schlichter, gedimmter Platzhalter statt eines detaillierten
      // Bildes, damit auf den ersten Blick klar ist, dass hier nichts
      // angezogen ist.
      if (equippedItem) {
        // Level + Glanz-Effekt (Ausruestungs-Level-System-Briefing): die
        // Glow-Staerke der Kachel skaliert mit --equip-level (siehe
        // .outfit-cell.equipped in style.css), damit hoehere Level auch
        // rein visuell erkennbar sind.
        const level = getEquipmentLevelState(equippedKey).level;
        return `<button class="outfit-cell equipped" data-slot="${s.key}" style="--rarity-color:${RARITY_COLORS[equippedItem.rarity]}; --equip-level:${level}">
          <div class="outfit-cell-filled">
            <img src="${equippedItem.icon}" alt="${equippedItem.name}" />
            <span class="outfit-cell-caption">${s.label} · Lvl ${level}</span>
          </div>
        </button>`;
      }
      return `<button class="outfit-cell empty" data-slot="${s.key}">
        <div class="outfit-cell-filled">
          <svg class="icon outfit-cell-empty-icon" viewBox="0 0 24 24" aria-hidden="true">${OUTFIT_SLOT_EMPTY_ICONS[s.key]}</svg>
          <span class="outfit-cell-caption">${s.label}</span>
        </div>
      </button>`;
    })
    .join("");
  return `
    <div class="outfit-grid">${cells}</div>
    <div class="outfit-stage">${renderAvatarStage()}</div>`;
}

function attachOutfitGridHandlers() {
  document.querySelectorAll(".outfit-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      openOutfitSlotDetail(cell.dataset.slot);
    });
  });
}

// Zeigt fuer einen Slot alle besessenen Items mit passendem slotType, mit
// dem gerade angezogenen Item hervorgehoben. Tippen auf das angezogene Item
// zieht es wieder aus; Tippen auf ein anderes besessenes Item zieht es an
// (equipItem() in state.js kuemmert sich dabei automatisch um den
// Outfit<->Einzelteil-Ausschluss).
function openOutfitSlotDetail(slotKey) {
  const content = document.getElementById("outfit-content");
  content.innerHTML = renderOutfitSlotDetail(slotKey);
  attachOutfitSlotDetailHandlers(slotKey);
}

// Level-Karte des aktuell ausgeruesteten Items in diesem Slot (Ausruestungs-
// Level-System-Briefing) -- Statwerte, Feed-Fortschritt, Verfuettern-Liste
// und Level-aufsteigen-Button. Leerer String ohne ausgeruestetes Item, denn
// laut Briefing lassen sich nur AUSGERUESTETE Teile hochleveln.
function renderEquipmentLevelCard(equippedKey) {
  if (!equippedKey || !ITEMS[equippedKey]) return "";
  const item = ITEMS[equippedKey];
  const level = getEquipmentLevelState(equippedKey).level;
  const atMaxLevel = isEquipmentMaxLevel(equippedKey);
  const stats = equipmentStatsForItem(equippedKey);
  const statsHtml = Object.entries(stats)
    .map(([statKey, value]) => `<span>${EQUIPMENT_STAT_LABELS[statKey]} ${value}</span>`)
    .join("");

  let progressHtml = "";
  let feedListHtml = "";
  if (!atMaxLevel) {
    const req = equipmentLevelUpRequirements(equippedKey);
    const pct = Math.min(100, Math.round((req.feedProgress / req.feedCost) * 100));
    progressHtml = `
      <div class="equip-level-progress-row">Feed-Punkte: ${req.feedProgress}/${req.feedCost} · Münzen: ${req.coins}/${req.coinCost}</div>
      <div class="equip-level-bar"><div class="equip-level-bar-fill" style="width:${pct}%"></div></div>
      <button id="btn-equip-level-up" class="primary-btn" ${req.canLevelUp ? "" : "disabled"}>Level aufsteigen</button>`;

    const feedCandidates = feedableItemsForEquipment(equippedKey);
    feedListHtml = feedCandidates.length > 0
      ? `<div class="equip-feed-list">
          ${feedCandidates
            .map(
              (feedItem) => `<button class="equip-feed-row" data-feed-item="${feedItem.key}">
                <span>${feedItem.name}</span>
                <span class="equip-feed-points">🍽️ +${EQUIPMENT_FEED_POINTS_BY_RARITY[feedItem.rarity]} · Bestand ${gameState.inventory[feedItem.key]}</span>
              </button>`
            )
            .join("")}
        </div>`
      : `<div class="placeholder-note" style="margin-top:10px;">Keine passenden Items im Inventar zum Verfüttern.</div>`;
  }

  return `
    <div class="equip-level-card" style="--rarity-color:${RARITY_COLORS[item.rarity]}; --equip-level:${level}">
      <div class="equip-level-title">Level ${level}${atMaxLevel ? " (Max)" : ""}</div>
      <div class="equip-level-stats">${statsHtml}</div>
      ${progressHtml}
      ${feedListHtml}
    </div>`;
}

function renderOutfitSlotDetail(slotKey) {
  const equippedKey = gameState.avatarEquipped[slotKey];
  // Das angezogene Item selbst bleibt hier auch bei Inventar-Bestand 0
  // sichtbar (Anziehen verbraucht 1 Exemplar, siehe equipItem() in
  // state.js) — sonst liesse es sich nicht mehr ausziehen.
  const ownedItems = Object.values(ITEMS).filter(
    (item) => item.slotType === slotKey && ((gameState.inventory[item.key] || 0) > 0 || item.key === equippedKey)
  );
  const cells = ownedItems
    .map((item) => {
      const isEquipped = item.key === equippedKey;
      return `<div class="item-cell${isEquipped ? " equipped" : ""}" data-outfit-item="${item.key}" style="--rarity-color:${RARITY_COLORS[item.rarity]}">
        <img src="${item.icon}" alt="${item.name}" />
        <span class="cell-label">${item.name}</span>
        ${isEquipped ? `<span class="cell-equipped-tag">Angezogen</span>` : ""}
      </div>`;
    })
    .join("");
  const emptyNote = ownedItems.length === 0
    ? `<div class="placeholder-note">Noch keine passenden Items im Inventar für diesen Slot.</div>`
    : "";
  return `
    <button class="back-btn" id="btn-outfit-slot-back" style="margin-bottom:12px;">← Übersicht</button>
    <div class="outfit-stage" style="margin-top:0; margin-bottom:14px;">${renderAvatarStage()}</div>
    <div class="outfit-slot-title">${OUTFIT_SLOT_LABELS[slotKey]}</div>
    ${renderEquipmentLevelCard(equippedKey)}
    <div class="item-grid">${cells}</div>
    ${emptyNote}`;
}

function attachOutfitSlotDetailHandlers(slotKey) {
  document.getElementById("btn-outfit-slot-back").addEventListener("click", () => {
    const content = document.getElementById("outfit-content");
    content.innerHTML = renderOutfitGrid();
    attachOutfitGridHandlers();
  });
  document.querySelectorAll(".item-cell[data-outfit-item]").forEach((cell) => {
    cell.addEventListener("click", () => {
      const key = cell.dataset.outfitItem;
      if (gameState.avatarEquipped[slotKey] === key) {
        unequipSlot(slotKey);
      } else {
        equipItem(key);
      }
      openOutfitSlotDetail(slotKey);
    });
  });

  const levelUpBtn = document.getElementById("btn-equip-level-up");
  if (levelUpBtn) {
    levelUpBtn.addEventListener("click", () => {
      levelUpEquipmentItem(gameState.avatarEquipped[slotKey]);
      openOutfitSlotDetail(slotKey);
    });
  }
  document.querySelectorAll(".equip-feed-row[data-feed-item]").forEach((row) => {
    row.addEventListener("click", () => {
      feedEquipmentItem(gameState.avatarEquipped[slotKey], row.dataset.feedItem);
      openOutfitSlotDetail(slotKey);
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
