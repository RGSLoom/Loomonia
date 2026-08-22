// Persistenter Spielzustand (localStorage) — ersetzt die reine
// Sitzungsspeicherung aus dem Chat-Prototyp durch echte Persistenz
// pro Browser/Gerät, ohne dass dafür ein Backend nötig ist.

const STORAGE_KEY = "storewalk_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Konnte Spielstand nicht laden:", e);
  }
  return null;
}

function defaultState() {
  return {
    xp: 0,
    energy: ENERGY_MAX,
    lastEnergyTimestamp: Date.now(),
    caughtCreatures: {}, // key -> count
    inventory: {}, // itemKey -> count
    shadowEssence: 0,
    // Neue Waehrung "Muenzen" (siehe addCoins() unten) — bewusst KEIN
    // Inventar-Item, sondern ein eigener Zaehler mit HUD-Anzeige am Avatar
    // (siehe hud-coins-badge in index.html), da Muenzen spaeter als
    // Zahlungswaehrung dienen sollen statt als sammelbares Item.
    coins: 0,
    settings: {
      skipMinigame: false,
      // AR-Kamera-Hintergrund in der Fangszene — Default aus (Privacy-
      // freundlich, erfordert explizite Kamera-Erlaubnis vom Nutzer).
      arCameraEnabled: false,
      // Loeschoption im Items-Screen — Default aus, um versehentliches
      // Loeschen zu vermeiden; muss explizit in den Einstellungen aktiviert
      // werden. Vor dem eigentlichen Loeschen fragt die UI trotzdem immer
      // aktiv nach (siehe profile.js).
      allowItemDeletion: false,
    },
    // Aktiv angezogene Avatar-Ausruestung: pro Slot entweder eine Item-Key
    // oder null (siehe equipItem()/unequipSlot() unten). "outfit" und die
    // fuenf Einzel-Slots schliessen sich gegenseitig aus — es kann nie
    // gleichzeitig ein Wert in "outfit" UND einem Einzel-Slot stehen.
    avatarEquipped: { kopfteil: null, oberteil: null, hose: null, sneaker: null, accessoire: null, outfit: null },
    storePositions: null, // { [storeKey]: { lat, lon } } — einmalig gesetzt
    playerId: null, // anonyme ID fuers Haendler-Dashboard (siehe tracking.js)
    trophies: {}, // trophyKey -> Freischalt-Zeitstempel (siehe TROPHIES in data.js)
    receiptScanCount: 0, // Anzahl bestaetigter Bon-Scans insgesamt (fuer "treuer_shopper")
  };
}

const gameState = Object.assign(defaultState(), loadState() || {});

// Migration fuers Level-Reward-System (siehe claimLevelRewards() unten):
// Bestandsspielstaende, die vor Einfuehrung dieses Systems schon ein hohes
// Level erreicht hatten, sollen nicht rueckwirkend ALLE laengst passierten
// Level-Belohnungen auf einmal bekommen — nur echte NEUE Levelaufstiege ab
// jetzt zaehlen. Neue Spielstaende starten dadurch automatisch korrekt bei
// Level 1 (xpToLevel(0) === 1).
if (gameState.lastRewardedLevel === undefined) {
  gameState.lastRewardedLevel = xpToLevel(gameState.xp);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (e) {
    console.warn("Konnte Spielstand nicht speichern:", e);
  }
}

function addXp(amount) {
  gameState.xp += amount;
  saveState();
  return claimLevelRewards();
}

// Vergibt die garantierten Level-Belohnungen (siehe LEVEL_REWARDS-Kommentar
// in data.js) fuer jedes seit dem letzten Aufruf neu erreichte Level.
// Idempotent ueber gameState.lastRewardedLevel — sicher aus addXp() bei
// jedem XP-Gewinn aufrufbar, auch mehrfach pro Spielaktion (z.B. Item-XP
// gefolgt von Trophaeen-XP), ohne doppelt zu vergeben. Gibt die
// Erfolgsmeldungs-Eintraege zurueck (leer, wenn kein neues Level erreicht
// wurde) — der Aufrufer haengt sie an seine eigene Erfolgsmeldungs-Queue an,
// analog zu claimTrophy() oben.
function claimLevelRewards() {
  const currentLevel = xpToLevel(gameState.xp);
  const lastRewarded = gameState.lastRewardedLevel;
  if (currentLevel <= lastRewarded) return [];

  const entries = [];
  for (let level = lastRewarded + 1; level <= currentLevel; level++) {
    const reward = levelRewardForLevel(level);
    const rewardText = `Level-Aufstieg auf Level ${level}! 🎉`;
    addCoins(reward.coins);
    entries.push({ type: "coins", amount: reward.coins, storeText: rewardText });
    if (reward.itemPool && reward.itemPool.length > 0) {
      const itemKey = randomChoice(reward.itemPool);
      addItem(itemKey);
      entries.push({ type: "item", itemKey, count: 1, storeText: rewardText });
    }
  }
  gameState.lastRewardedLevel = currentLevel;
  saveState();
  return entries;
}

function addCoins(amount) {
  gameState.coins = (gameState.coins || 0) + amount;
  saveState();
}

// Rechnet die seit dem letzten Aufruf vergangene Zeit in Energiepunkte um
// (passive Regeneration, laeuft auch waehrend die App geschlossen war) —
// rundet auf ganze Regenerationsschritte ab und "verbraucht" den
// Zeitstempel nur um exakt diesen Anteil, damit bei krummen Aufrufabstaenden
// kein angefangener Regenerationsschritt verloren geht.
function settleEnergy() {
  if (gameState.energy >= ENERGY_MAX) {
    gameState.lastEnergyTimestamp = Date.now();
    return;
  }
  const elapsedMs = Date.now() - gameState.lastEnergyTimestamp;
  const pointsGained = Math.floor(elapsedMs / ENERGY_REGEN_MS_PER_POINT);
  if (pointsGained > 0) {
    gameState.energy = Math.min(ENERGY_MAX, gameState.energy + pointsGained);
    gameState.lastEnergyTimestamp += pointsGained * ENERGY_REGEN_MS_PER_POINT;
  }
}

function getEnergy() {
  settleEnergy();
  return gameState.energy;
}

function spendEnergy(amount) {
  settleEnergy();
  gameState.energy = Math.max(0, gameState.energy - amount);
  saveState();
  return gameState.energy;
}

function addCaughtCreature(key) {
  gameState.caughtCreatures[key] = (gameState.caughtCreatures[key] || 0) + 1;
  saveState();
}

function totalCaughtCount() {
  return Object.values(gameState.caughtCreatures).reduce((a, b) => a + b, 0);
}

// Tauscht `qty` gefangene Exemplare von `key` gegen Schatten-Essenz
// (SHADOW_ESSENCE_PER_CREATURE pro Stück, siehe data.js). Gibt false zurück
// und aendert nichts, falls qty ungueltig ist oder mehr verlangt wird als
// vorhanden — so bleibt der Aufrufer (Loomas-UI) einfach.
function exchangeCreatureForEssence(key, qty) {
  const owned = gameState.caughtCreatures[key] || 0;
  if (!Number.isInteger(qty) || qty < 1 || qty > owned) return false;
  gameState.caughtCreatures[key] = owned - qty;
  gameState.shadowEssence += qty * SHADOW_ESSENCE_PER_CREATURE;
  saveState();
  return true;
}

function addItem(key, qty = 1) {
  gameState.inventory[key] = (gameState.inventory[key] || 0) + qty;
  saveState();
}

// Entfernt ein Exemplar von `key` aus dem Inventar (die UI fragt vorher
// aktiv nach, siehe profile.js). Gibt false zurueck, falls keins vorhanden
// ist.
function removeItem(key) {
  const owned = gameState.inventory[key] || 0;
  if (owned < 1) return false;
  if (owned <= 1) {
    delete gameState.inventory[key];
  } else {
    gameState.inventory[key] = owned - 1;
  }
  saveState();
  return true;
}

// Entfernt den kompletten Stapel von `key` auf einmal (die UI fragt vorher
// aktiv nach, siehe profile.js). Gibt false zurueck, falls keins vorhanden
// ist.
function removeAllOfItem(key) {
  const owned = gameState.inventory[key] || 0;
  if (owned < 1) return false;
  delete gameState.inventory[key];
  saveState();
  return true;
}

// Zieht ein aktuell angezogenes Item aus Slot `slotType` wieder aus und legt
// es zurueck ins Inventar (addItem) — Hilfsfunktion fuer equipItem()/
// unequipSlot() unten, macht bei leerem Slot nichts.
function returnEquippedItemToInventory(slotType) {
  const key = gameState.avatarEquipped[slotType];
  if (!key) return;
  gameState.avatarEquipped[slotType] = null;
  addItem(key);
}

// Zieht `key` an — schlaegt fehl (false, kein State-Change), wenn das Item
// nicht existiert, nicht "Anlegbar" ist, kein slotType hat oder nicht im
// Inventar liegt. Verbraucht dabei 1 Exemplar aus dem Inventar (wie ein
// Verbrauchsitem) — bei nur einem besessenen Exemplar verschwindet der
// Artikel dadurch aus dem normalen Items-Screen, solange er angezogen ist.
// Ein zuvor in diesem Slot (bzw. bei Outfit: in allen Einzel-Slots, bzw. bei
// Einzelteilen: im Outfit-Slot) angezogenes Item wandert automatisch zurueck
// ins Inventar, bevor das neue Item angezogen wird — das setzt die
// gegenseitige Ausschluss-Logik Outfit <-> Einzel-Slots um (siehe
// AVATAR_SINGLE_SLOTS in data.js).
function equipItem(key) {
  const item = ITEMS[key];
  if (!item || item.type !== "Anlegbar" || !item.slotType) return false;
  if ((gameState.inventory[key] || 0) < 1) return false;

  if (item.slotType === "outfit") {
    AVATAR_SINGLE_SLOTS.forEach((slot) => returnEquippedItemToInventory(slot));
  } else {
    returnEquippedItemToInventory("outfit");
  }
  returnEquippedItemToInventory(item.slotType);

  removeItem(key);
  gameState.avatarEquipped[item.slotType] = key;
  saveState();
  return true;
}

// Zieht das aktuell im angegebenen Slot angezogene Item wieder aus und legt
// das Exemplar zurueck ins Inventar. Gibt false zurueck, falls der Slot
// ohnehin leer war.
function unequipSlot(slotType) {
  if (!gameState.avatarEquipped[slotType]) return false;
  returnEquippedItemToInventory(slotType);
  saveState();
  return true;
}

function setSkipMinigame(value) {
  gameState.settings.skipMinigame = value;
  saveState();
}

function setArCameraEnabled(value) {
  gameState.settings.arCameraEnabled = value;
  saveState();
}

function setAllowItemDeletion(value) {
  gameState.settings.allowItemDeletion = value;
  saveState();
}

function setStorePositions(positions) {
  gameState.storePositions = positions;
  saveState();
}

// Schaltet eine Trophaee einmalig frei (siehe TROPHIES in data.js). Gibt
// true zurueck, wenn sie dadurch NEU freigeschaltet wurde (Aufrufer soll
// dann z.B. XP gutschreiben + Erfolgsmeldung zeigen), false wenn sie schon
// vorher freigeschaltet war (Wiederholungs-Trigger, z.B. weitere Bon-Scans,
// sollen sie nicht erneut verleihen).
function unlockTrophy(key) {
  if (gameState.trophies[key]) return false;
  gameState.trophies[key] = Date.now();
  saveState();
  return true;
}

function incrementReceiptScanCount() {
  gameState.receiptScanCount = (gameState.receiptScanCount || 0) + 1;
  saveState();
}

// Schaltet eine Trophaee frei (falls noch nicht geschehen) und vergibt ihre
// Belohnung: XP immer, plus entweder ein festes Item (trophy.itemKey) oder
// mehrere zufaellige Items aus einem Pool (trophy.randomItemPool +
// randomItemCount, siehe TROPHIES in data.js). Gibt die Erfolgsmeldungs-
// Eintraege zurueck (leer, falls die Trophaee schon freigeschaltet war) —
// der Aufrufer haengt sie an seine eigene Item-Erfolgsmeldungs-Queue an
// (siehe grantReceiptItems() bzw. onCatchSuccess()) und kuemmert sich
// selbst um UI-Refresh/Tracking, damit state.js frei von UI-/Analytics-
// Aufrufen bleibt.
function claimTrophy(trophyKey) {
  const trophy = TROPHIES[trophyKey];
  if (!unlockTrophy(trophyKey)) return [];

  // Level-Belohnungen, die durch die Trophaeen-XP selbst ausgeloest werden,
  // muessen mit zurueckgegeben werden (sonst wuerde addXp() sie zwar still
  // vergeben, aber nie in der Erfolgsmeldung anzeigen) — daher jeden
  // addXp()-Rueckgabewert hier einsammeln statt zu verwerfen.
  let levelRewardEntries = addXp(trophy.xp);
  const entries = [{ type: "trophy", trophyKey }];
  const rewardText = `Belohnung der Trophäe „${trophy.name}“ 🏆`;

  if (trophy.itemKey) {
    addItem(trophy.itemKey);
    levelRewardEntries = levelRewardEntries.concat(addXp(ITEMS[trophy.itemKey].xp));
    entries.push({ type: "item", itemKey: trophy.itemKey, count: 1, storeText: rewardText });
  } else if (trophy.randomItemPool) {
    // Mehrfachtreffer auf dasselbe Item zu einem Stapel zusammenfassen
    // (analog zu grantReceiptItems() in bonscan.js), statt mehrere separate
    // Erfolgsmeldungen fuer dasselbe Item zu zeigen.
    const picks = {};
    for (let i = 0; i < trophy.randomItemCount; i++) {
      const key = randomChoice(trophy.randomItemPool);
      picks[key] = (picks[key] || 0) + 1;
    }
    Object.entries(picks).forEach(([key, count]) => {
      addItem(key, count);
      levelRewardEntries = levelRewardEntries.concat(addXp(ITEMS[key].xp * count));
      entries.push({ type: "item", itemKey: key, count, storeText: rewardText });
    });
  }

  entries.push(...levelRewardEntries);
  return entries;
}

// Nach einem Fang zu pruefen: Anzahl gefangener Wesen je Seltenheitsstufe
// (ueber alle Arten summiert, nicht verschiedene Arten) gegen die
// Schwellenwerte der fang-bezogenen Trophaeen.
function checkCatchTrophies() {
  const caughtByRarity = (rarity) =>
    Object.entries(gameState.caughtCreatures)
      .filter(([key]) => CREATURES[key].rarity === rarity)
      .reduce((sum, [, count]) => sum + count, 0);

  let entries = [];
  if (caughtByRarity("Gewöhnlich") >= 5) entries = entries.concat(claimTrophy("wesen_entdecker"));
  if (caughtByRarity("Selten") >= 10) entries = entries.concat(claimTrophy("seltene_beute"));
  return entries;
}

// Nach einem bestaetigten Bon-Scan zu pruefen: Gesamtzahl bestaetigter
// Kaeufe gegen die Schwelle der kauf-bezogenen Trophaee.
function checkPurchaseTrophies() {
  if (gameState.receiptScanCount >= 5) return claimTrophy("treuer_shopper");
  return [];
}

// Anonyme, geraetelokale Spieler-ID fuers Haendler-Dashboard (Zaehlung
// "wie viele unterschiedliche Spieler pro Tag") — keine echten Nutzerdaten.
function getPlayerId() {
  if (!gameState.playerId) {
    gameState.playerId =
      (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    saveState();
  }
  return gameState.playerId;
}
