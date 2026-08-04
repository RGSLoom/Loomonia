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
    settings: {
      skipMinigame: false,
    },
    storePositions: null, // { [storeKey]: { lat, lon } } — einmalig gesetzt
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

function addItem(key) {
  gameState.inventory[key] = (gameState.inventory[key] || 0) + 1;
  saveState();
}

function setSkipMinigame(value) {
  gameState.settings.skipMinigame = value;
  saveState();
}

function setStorePositions(positions) {
  gameState.storePositions = positions;
  saveState();
}
