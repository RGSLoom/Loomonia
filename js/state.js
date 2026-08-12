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
    storePositions: null, // { [storeKey]: { lat, lon } } — einmalig gesetzt
    playerId: null, // anonyme ID fuers Haendler-Dashboard (siehe tracking.js)
  };
}

const gameState = Object.assign(defaultState(), loadState() || {});

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
