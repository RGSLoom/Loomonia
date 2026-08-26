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

// Eigenes, bereits eng zugeschnittenes Profilbild fuer den kleinen Avatar-
// Kreis im Map-HUD (Profil-mann_icon.png/profil-frau_icon.png) -- bewusst
// NICHT dieselbe Datei wie avatarHeroImageSrc() oben (das grosse Ganzkoerper-
// Hero-Bild), das fuer einen winzigen Kreis viel zu weit herausgezoomt waere.
function hudAvatarIconSrc() {
  return gameState.avatarGender === "female"
    ? "assets/oberflächen/profil-frau_icon.png"
    : "assets/oberflächen/Profil-mann_icon.png";
}

// Setzt die Bildquelle des Avatar-Kreises im Map-HUD (siehe #hud-avatar-img
// in index.html). Einmal beim App-Start gesetzt (main.js init()) und erneut
// nach dem Onboarding-Dialog, falls sich die Geschlechts-Auswahl gerade erst
// geaendert hat.
function updateHudAvatarImage() {
  const img = document.getElementById("hud-avatar-img");
  if (img) img.src = hudAvatarIconSrc();
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
    updateHudAvatarImage();
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
      document.getElementById("trophies-content").innerHTML = renderTrophiesList();
      attachTrophiesListHandlers();
      showScreen("screen-trophies");
      break;
    case "habitat":
      document.getElementById("habitat-content").innerHTML = renderHabitatContent();
      attachHabitatHandlers();
      showScreen("screen-habitat");
      break;
  }
}

// Sortierrichtung im Items-Screen (siehe RARITY_ORDER in js/data.js) --
// bewusst nur Session-State statt gameState-Feld, da es sich um eine reine
// Anzeige-Einstellung handelt. User-Korrektur: keine feste Position mehr pro
// Item (frueher wurden auch unbesessene Items als leere "locked"-Kachel an
// ihrer festen Stelle angezeigt) -- jetzt nur noch besessene Items, dicht
// gepackt und nach Seltenheitsstufe sortierbar statt in fixer Reihenfolge.
let itemsSortAscending = true;

function renderItemsGrid() {
  const owned = Object.values(ITEMS)
    .filter((item) => (gameState.inventory[item.key] || 0) > 0)
    .sort((a, b) => {
      const diff = RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity);
      return itemsSortAscending ? diff : -diff;
    });
  const cells = owned
    .map((item) => {
      const count = gameState.inventory[item.key];
      const isEquipped = item.slotType && gameState.avatarEquipped[item.slotType] === item.key;
      return `<div class="item-cell${isEquipped ? " equipped" : ""}" data-item="${item.key}" style="--rarity-color:${RARITY_COLORS[item.rarity]}">
        <img src="${item.icon}" alt="${item.name}" /><span class="cell-count">${count}</span>
        <span class="cell-label">${item.name}</span>
        ${isEquipped ? `<span class="cell-equipped-tag">Angezogen</span>` : ""}
      </div>`;
    })
    .join("");
  const emptyNote = owned.length === 0
    ? `<div class="placeholder-note">Noch keine Items gesammelt.</div>`
    : "";
  return `${renderActiveBoostsBanner()}<div class="item-grid">${cells}</div>${emptyNote}`;
}

function attachItemGridHandlers() {
  document.querySelectorAll(".item-cell").forEach((cell) => {
    cell.addEventListener("click", () => showItemDetail(cell.dataset.item));
  });
}

// Umschalt-Sortierung fuer den Items-Screen-Topbar-Button (siehe #btn-items-
// sort in index.html, Bindung in main.js init()).
function toggleItemsSort() {
  itemsSortAscending = !itemsSortAscending;
  document.getElementById("items-content").innerHTML = renderItemsGrid();
  attachItemGridHandlers();
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

// Merkt sich jeweils, wohin Loomas/Habitat selbst zurueckfuehren sollen,
// BEVOR openHabitatForLooma()/attachHabitatHandlers() unten subScreenReturnTo
// fuer die naechste Ebene ueberschreiben -- ohne das haengt man nach Loomas
// -> Habitat -> zurueck fest (subScreenReturnTo zeigte sonst dauerhaft auf
// "screen-loomas" statt auf Loomas' eigentlichen Einstiegspunkt, siehe
// User-Bug-Report: "komme aus dem Menü nicht mehr raus"). Wird in main.js im
// sub-back-btn-Handler wieder zurueckgeschrieben, sobald die jeweils
// zugehoerige Ebene tatsaechlich erreicht wird.
let loomasBackTarget = "screen-profile";
let habitatBackTarget = "screen-profile";

// Fuehrt direkt in das Habitat des Loomas -- setActiveCompanion() waehlt
// dabei automatisch die hoechst-levelnde besessene Instanz dieser Art
// (siehe Kommentar dort in js/state.js), falls mehrere Exemplare vorhanden
// sind. NICHT der Klick-Handler der Loomas-Uebersicht selbst (User-
// Korrektur: das wuerde "Als Begleiter wählen"/"Level aufsteigen"/
// Eintauschen unerreichbar machen) -- stattdessen nur ueber das Antippen
// des grossen Looma-Bilds IN der Detailkarte (siehe showLoomaExchangeDetail()
// unten) und ueber das Antippen des Loomas IM Habitat-Fenster selbst (siehe
// attachHabitatHandlers() unten, fuer den umgekehrten Weg).
function openHabitatForLooma(key) {
  if (!setActiveCompanion(key)) return;
  loomasBackTarget = subScreenReturnTo;
  subScreenReturnTo = "screen-loomas";
  document.getElementById("habitat-content").innerHTML = renderHabitatContent();
  attachHabitatHandlers();
  showScreen("screen-habitat");
}

// Gegenstueck: das Looma IM Habitat-Fenster antippen oeffnet dessen alte
// Detailkarte (Level aufsteigen/Eintauschen/als Begleiter waehlen), siehe
// openHabitatForLooma() oben. Zurueck-Pfeil oben fuehrt danach wieder zurueck
// zum Habitat statt zum Profil-Hub.
function attachHabitatHandlers() {
  const img = document.getElementById("habitat-companion-img");
  if (!img) return;
  img.addEventListener("click", () => {
    const companion = getActiveCompanion();
    if (!companion) return;
    habitatBackTarget = subScreenReturnTo;
    subScreenReturnTo = "screen-habitat";
    showLoomaExchangeDetail(companion.key);
    showScreen("screen-loomas");
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
      <img id="looma-detail-icon" src="${creatureIconCache[key] || creature.icon}" alt="${creature.name}" class="detail-card-icon" title="Zum Habitat" />
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

  // Antippen des grossen Looma-Bilds fuehrt direkt ins Habitat (User-Wunsch,
  // siehe openHabitatForLooma() oben) -- die Buttons darunter (Als Begleiter
  // waehlen/Level aufsteigen/Eintauschen) bleiben dabei unveraendert hier
  // erreichbar.
  document.getElementById("looma-detail-icon").addEventListener("click", () => openHabitatForLooma(key));
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

  if (!companion) {
    return `<div class="habitat-window habitat-window--empty glass">
      <div class="habitat-window-empty-text">Wähle im Loomas-Screen einen aktiven Begleiter, damit sein Habitat hier erscheint.</div>
    </div>`;
  }

  const companionInstance = getActiveCompanionInstance();
  const cap = restedXpCap();
  const remaining = Math.round(gameState.restedXpRemaining || 0);
  const isResting = remaining > 0;
  const pct = cap > 0 ? Math.min(100, Math.round((remaining / cap) * 100)) : 0;
  const atMaxLevel = companionInstance.level >= LOOMA_MAX_LEVEL;
  const stats = loomaStatsAtLevel(companion.rarity, companionInstance.level);
  const power = loomaCombatPower(stats);

  // Nur EIN Habitat-Fenster statt aller sechs Elemente nebeneinander --
  // der Spieler hat immer nur einen aktiven Begleiter, die anderen fuenf
  // Habitate waeren also zwangslaeufig immer leer (siehe User-Feedback: "so
  // macht das keinen Sinn"). Zeigt das zum Begleiter-Element passende
  // Habitat gross, das Looma darauf auf dem Podest, alle Werte (Level,
  // Kampfkraft, Kernattribute, Ausgeruht-Status) als eigene Karte direkt IM
  // Fenster statt in separaten Karten darueber (User-Wunsch) -- Hintergrund
  // je Element ueber data-habitat-element in css/style.css.
  const habitatElement = habitatElementForCreature(companion);
  const habitatInfo = HABITATS.find((h) => h.element === habitatElement);

  return `
    <div class="habitat-window glass" data-habitat-element="${habitatElement}">
      <span class="habitat-window-element-badge">${habitatInfo.icon} ${habitatInfo.element}</span>
      <img id="habitat-companion-img" class="habitat-window-companion-img" src="${creatureIconCache[companion.key] || companion.icon}" alt="${companion.name}" />
      <div class="habitat-stats-panel">
        <div class="habitat-stats-top">
          <span class="habitat-stats-name">${companion.name}</span>
          <span class="habitat-stats-level">Level ${companionInstance.level}${atMaxLevel ? " · MAX" : ""}</span>
        </div>
        <div class="habitat-stats-power">💪 Kampfkraft <b>${formatNumber(power)}</b></div>
        <div class="habitat-stats-row">
          <span>⚔️ ${formatNumber(stats.angriff)}</span>
          <span>🛡️ ${formatNumber(stats.verteidigung)}</span>
          <span>❤️ ${formatNumber(stats.gesundheit)}</span>
        </div>
        <div class="habitat-stats-rested">
          <span class="habitat-stats-rested-label">${isResting ? "😴 Ausgeruht" : "🌤️ Wach"}</span>
          <div class="habitat-rested-bar"><div class="habitat-rested-fill" style="width:${pct}%"></div></div>
        </div>
      </div>
    </div>`;
}

// Checkmark fuer erledigte Zeilen -- eigenes kleines Icon statt TROPHY_ICON_PATH
// (das bleibt das Kategorie-/Rarity-Icon links), analog zur .icon-Konvention.
const TROPHY_CHECK_ICON_PATH = '<path d="M20 6 9 17l-5-5"/>';

// Sortier-Rang je Zeile: offene Trophaeen mit sichtbarem Fortschritt zuerst
// (der Spieler sieht sofort, woran er als naechstes arbeitet), dann offene
// ohne Zaehler, erledigte ganz unten. Siehe Sortier-Vorgabe im Trophaeen-
// Listen-Briefing.
function trophyRowRank(trophy, unlocked) {
  if (unlocked) return 2;
  return trophy.progressType ? 0 : 1;
}

function renderTrophiesList() {
  const rows = Object.values(TROPHIES)
    .slice()
    .sort((a, b) => {
      const unlockedA = !!(gameState.trophies && gameState.trophies[a.key]);
      const unlockedB = !!(gameState.trophies && gameState.trophies[b.key]);
      return trophyRowRank(a, unlockedA) - trophyRowRank(b, unlockedB);
    })
    .map((trophy) => {
      const unlocked = !!(gameState.trophies && gameState.trophies[trophy.key]);
      const color = RARITY_COLORS[trophy.rarity];
      const progress = unlocked ? null : getTrophyProgress(trophy.key);
      const progressHtml = progress
        ? `<div class="trophy-row-progress">
            <div class="trophy-row-progress-bar"><div class="trophy-row-progress-fill" style="width:${(progress.current / progress.goal) * 100}%"></div></div>
            <span class="trophy-row-progress-count">${progress.current}/${progress.goal}</span>
          </div>`
        : "";
      const statusHtml = unlocked
        ? `<svg class="icon trophy-row-check" viewBox="0 0 24 24" aria-hidden="true">${TROPHY_CHECK_ICON_PATH}</svg>`
        : "";
      return `<div class="trophy-row${unlocked ? "" : " locked"}" data-trophy="${trophy.key}" style="--rarity-color:${color}">
        <svg class="icon trophy-row-icon" viewBox="0 0 24 24" aria-hidden="true">${TROPHY_ICON_PATH}</svg>
        <div class="trophy-row-body">
          <div class="trophy-row-name">${trophy.name}</div>
          <div class="trophy-row-desc">${trophy.description}</div>
          ${progressHtml}
        </div>
        <div class="trophy-row-status">${statusHtml}</div>
      </div>`;
    })
    .join("");
  return `<div class="trophy-list">${rows}</div>`;
}

function attachTrophiesListHandlers() {
  document.querySelectorAll(".trophy-row[data-trophy]").forEach((row) => {
    row.addEventListener("click", () => {
      const key = row.dataset.trophy;
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
  content.innerHTML = `
    <button class="back-btn" id="btn-trophy-detail-back" style="margin-bottom:12px;">← Übersicht</button>
    <div class="detail-card-synthetic">
      <div class="detail-card-name">${trophy.name}</div>
      <div class="detail-card-rarity" style="color:${RARITY_COLORS[trophy.rarity]}">${trophy.rarity}-Trophäe</div>
      <svg class="icon detail-card-icon trophy-detail-icon" viewBox="0 0 24 24" aria-hidden="true" style="color:${RARITY_COLORS[trophy.rarity]}">${TROPHY_ICON_PATH}</svg>
      <div class="detail-card-effect">${trophy.description}</div>
      <div class="detail-card-hint">Belohnung: +${formatNumber(trophy.xp)} XP</div>
      ${renderTrophyRewardHtml(trophy)}
    </div>`;
  document.getElementById("btn-trophy-detail-back").addEventListener("click", () => {
    content.innerHTML = renderTrophiesList();
    attachTrophiesListHandlers();
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

// Baut eine einzelne Ausruestungs-Kachel (belegt oder leer) -- gemeinsam
// genutzt von linker und rechter Slot-Spalte in renderOutfitGrid(), damit
// beide Spalten exakt dieselbe Kachel-Logik verwenden.
function renderOutfitCell(slotKey, label) {
  const equippedKey = gameState.avatarEquipped[slotKey];
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
    return `<button class="outfit-cell equipped" data-slot="${slotKey}" style="--rarity-color:${RARITY_COLORS[equippedItem.rarity]}; --equip-level:${level}">
      <div class="outfit-cell-filled">
        <img src="${equippedItem.icon}" alt="${equippedItem.name}" />
        <span class="outfit-cell-caption">${label} · Lvl ${level}</span>
      </div>
    </button>`;
  }
  return `<button class="outfit-cell empty" data-slot="${slotKey}">
    <div class="outfit-cell-filled">
      <svg class="icon outfit-cell-empty-icon" viewBox="0 0 24 24" aria-hidden="true">${OUTFIT_SLOT_EMPTY_ICONS[slotKey]}</svg>
      <span class="outfit-cell-caption">${label}</span>
    </div>
  </button>`;
}

// Anzeigetexte + Icon je Bonus-Effekttyp, den ausgeruestete Mode-Items ueber
// ITEMS[key].equipBonuses beisteuern koennen (siehe getEquippedBonusTotal()
// in state.js) -- bewusst eigene, kompaktere Badge-Texte statt der
// ACTIVE_EFFECT_LABELS aus utils.js, die fuer die zeitlich befristeten
// Verbrauchsitem-Boosts gedacht sind.
const OUTFIT_BONUS_TYPES = [
  { key: "xp_boost", icon: "⭐", label: "XP" },
  { key: "fangchance_boost", icon: "🎯", label: "Fangchance" },
];

// Boni-Uebersicht unterhalb von Avatar + Kacheln: summiert alle equipBonuses
// der aktuell ausgeruesteten Mode-Items. Leerer Zustand bleibt sichtbar
// statt komplett zu verschwinden.
function renderOutfitBonusBar() {
  const badges = OUTFIT_BONUS_TYPES
    .map((b) => {
      const value = getEquippedBonusTotal(b.key);
      if (value <= 0) return "";
      return `<div class="outfit-bonus-badge"><span>${b.icon}</span><span>+${Math.round(value * 100)}% ${b.label}</span></div>`;
    })
    .join("");
  return badges || `<div class="outfit-bonus-empty">Keine aktiven Boni</div>`;
}

// Ausruestungs-Uebersicht: gewaehlter Avatar-Charakter (Mann_icon.png/
// Frau_icon.png, siehe avatarHeroImageSrc() oben) mittig als Hintergrund-
// Figur, je 3 Slot-Kacheln links/rechts daneben, darunter die Boni-
// Uebersicht -- alles auf einen Bildschirm ohne Scrollen (siehe #screen-outfit
// in style.css). Reihenfolge der Kacheln orientiert sich an der Position am
// Koerper: Kopf oben, Beine unten links; Accessoire (Armband) auf Hoehe des
// Handgelenks ueber dem Sneaker (Fuesse) ganz unten rechts.
function renderOutfitGrid() {
  const leftSlots = [
    { key: "kopfteil", label: "Kopfteil" },
    { key: "oberteil", label: "Oberteil" },
    { key: "hose", label: "Hose" },
  ];
  const rightSlots = [
    { key: "outfit", label: "Outfit" },
    { key: "accessoire", label: "Accessoire" },
    { key: "sneaker", label: "Sneaker" },
  ];
  return `
    <img class="outfit-hero-img" src="${avatarHeroImageSrc()}" alt="Avatar" />
    <div class="outfit-hero-area">
      <div class="outfit-slot-col outfit-slot-col--left">
        ${leftSlots.map((s) => renderOutfitCell(s.key, s.label)).join("")}
      </div>
      <div class="outfit-slot-col outfit-slot-col--right">
        ${rightSlots.map((s) => renderOutfitCell(s.key, s.label)).join("")}
      </div>
    </div>
    <div class="outfit-bonus-bar">${renderOutfitBonusBar()}</div>`;
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

// Vorschau des aktuell ausgeruesteten Items im Slot (User-Korrektur: die
// vorherige Silhouette-Buehne + Level/Feed-Karte wirkten wie ein Uebrigbleibsel
// aus einer frueheren Version) -- zeigt nur noch Icon + Name/Level bzw. einen
// leeren Platzhalter, direkt ueber der Auswahl-Kachelliste.
function renderOutfitSlotCurrent(slotKey, equippedKey) {
  const item = equippedKey ? ITEMS[equippedKey] : null;
  if (!item) {
    return `<div class="outfit-slot-current outfit-slot-current--empty">
      <svg class="icon outfit-slot-current-icon" viewBox="0 0 24 24" aria-hidden="true">${OUTFIT_SLOT_EMPTY_ICONS[slotKey]}</svg>
      <div class="outfit-slot-current-label">Nichts ausgerüstet</div>
    </div>`;
  }
  const level = getEquipmentLevelState(equippedKey).level;
  return `<div class="outfit-slot-current" style="--rarity-color:${RARITY_COLORS[item.rarity]}">
    <img src="${item.icon}" alt="${item.name}" />
    <div class="outfit-slot-current-label">${item.name} · Lvl ${level}</div>
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
    <div class="outfit-slot-title">${OUTFIT_SLOT_LABELS[slotKey]}</div>
    ${renderOutfitSlotCurrent(slotKey, equippedKey)}
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
