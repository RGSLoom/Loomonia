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
    caughtCreatures: {}, // key -> count
    inventory: {}, // itemKey -> count
    shadowEssence: 0,
    settings: {
      skipMinigame: false,
      // AR-Kamera-Hintergrund in der Fangszene — Default aus (Privacy-
      // freundlich, erfordert explizite Kamera-Erlaubnis vom Nutzer).
      arCameraEnabled: false,
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

function setSkipMinigame(value) {
  gameState.settings.skipMinigame = value;
  saveState();
}

function setArCameraEnabled(value) {
  gameState.settings.arCameraEnabled = value;
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
