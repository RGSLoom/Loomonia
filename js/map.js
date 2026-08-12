// Karte, echte GPS-Anbindung, Store-Platzierung, Wesen-Spawn-Logik

let leafletMap = null;
let playerMarker = null;
let playerAccuracyCircle = null;
let playerPos = null; // { lat, lon }
let firstFixHandled = false;

const storeMarkers = {}; // storeKey -> { marker, lat, lon }
let activeCreatures = []; // { id, key, lat, lon, marker }
const creatureIconCache = {}; // key -> cutout data URL

let nearestEntity = null; // { type: 'creature'|'store', ref, distance }

function initMap() {
  leafletMap = L.map("map", {
    zoomControl: false,
    attributionControl: true,
  }).setView([52.52, 13.405], 16);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap-Mitwirkende",
  }).addTo(leafletMap);

  startGeolocation();
  preloadCreatureIcons();
}

function preloadCreatureIcons() {
  Object.values(CREATURES).forEach((c) => {
    // Icons, die schon einen echten Alphakanal haben, brauchen (und
    // vertragen) den Weissabgleich nicht — der wuerde helle Fellstellen
    // faelschlich fuer Hintergrund halten und Loecher reinschneiden.
    if (c.iconAlreadyTransparent) return;
    getCutoutImage(c.icon).then((dataUrl) => {
      creatureIconCache[c.key] = dataUrl;
      // Bereits platzierte Marker mit dem echten Ausschnitt aktualisieren
      activeCreatures
        .filter((ac) => ac.key === c.key)
        .forEach((ac) => updateCreatureMarkerIcon(ac));
    });
  });
}

function showGpsBanner(text) {
  const el = document.getElementById("gps-banner");
  el.textContent = text;
  el.classList.remove("hidden");
}
function hideGpsBanner() {
  document.getElementById("gps-banner").classList.add("hidden");
}

function startGeolocation() {
  if (!("geolocation" in navigator)) {
    showGpsBanner(
      "Dieses Gerät/dieser Browser unterstützt keine Standortbestimmung. Nutze die Testknöpfe unten rechts zum Ausprobieren."
    );
    document.getElementById("status-line").textContent =
      "Kein GPS verfügbar — nur Testmodus";
    return;
  }

  navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}

function onPositionError(err) {
  console.warn("Geolocation-Fehler:", err);
  showGpsBanner(
    "Standort konnte nicht ermittelt werden (" +
      (err.message || "unbekannter Fehler") +
      "). Bitte Standortzugriff erlauben. Bis dahin funktionieren nur die Testknöpfe unten rechts."
  );
}

function onPositionUpdate(pos) {
  hideGpsBanner();
  playerPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };

  if (!firstFixHandled) {
    firstFixHandled = true;
    onFirstFix();
  }

  updatePlayerMarker(pos.coords.accuracy);
  refreshDistancesAndHud();
}

function onFirstFix() {
  leafletMap.setView([playerPos.lat, playerPos.lon], 17);
  ensureStorePositions();
  renderStoreMarkers();
  fillCreatureSpawns();
}

function updatePlayerMarker(accuracy) {
  const latlng = [playerPos.lat, playerPos.lon];
  if (!playerMarker) {
    const icon = L.divIcon({
      className: "",
      html: '<div class="player-marker"></div>',
      iconSize: [22, 22],
    });
    playerMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(leafletMap);
    playerAccuracyCircle = L.circle(latlng, {
      radius: accuracy || 20,
      color: "#4ade80",
      weight: 1,
      fillOpacity: 0.08,
    }).addTo(leafletMap);
  } else {
    playerMarker.setLatLng(latlng);
    playerAccuracyCircle.setLatLng(latlng);
    if (accuracy) playerAccuracyCircle.setRadius(accuracy);
  }
}

// ---------- Stores ----------

// Ergaenzt fehlende Standort-Positionen, ohne bereits platzierte Standorte
// zu verschieben — so koennen jederzeit neue Standorte in data.js
// hinzugefuegt werden, ohne bestehende Spielstaende (localStorage) zu
// zerstoeren. Standorte mit echten coords bekommen genau diese Position,
// alle anderen werden einmalig zufaellig um den Spieler-Start platziert.
function ensureStorePositions() {
  const positions = gameState.storePositions ? { ...gameState.storePositions } : {};
  let changed = false;

  STORE_LOCATIONS.forEach((location) => {
    if (positions[location.id]) return;
    if (location.coords) {
      positions[location.id] = { lat: location.coords.lat, lon: location.coords.lon };
    } else {
      const p = randomPointAround(playerPos.lat, playerPos.lon, STORE_OFFSET_RADIUS_M, 30);
      positions[location.id] = { lat: p.lat, lon: p.lon };
    }
    changed = true;
  });

  if (changed) setStorePositions(positions);
}

const STORE_EMOJI = {
  feinkost: "🥪",
  sneaker: "👟",
  juwelier: "💎",
  cafe: "☕",
  fashion: "👜",
  bank: "🏦",
  drogerie: "💊",
  schnellrestaurant: "🍔",
  bar: "🍹",
};

function renderStoreMarkers() {
  STORE_LOCATIONS.forEach((location) => {
    const pos = gameState.storePositions[location.id];
    if (!pos) return;
    const category = STORE_CATEGORIES[location.categoryKey];
    const icon = L.divIcon({
      className: "",
      html: `<div class="store-marker" data-store="${location.id}" style="background-image:url('${category.scene}')">
          <span class="store-marker-badge">${STORE_EMOJI[location.categoryKey] || "🏬"}</span>
        </div>`,
      iconSize: [56, 56],
    });
    const marker = L.marker([pos.lat, pos.lon], { icon }).addTo(leafletMap);
    marker.on("click", () => onStoreMarkerClick(location.id));
    marker.bindTooltip(category.name, { direction: "top", offset: [0, -20] });
    storeMarkers[location.id] = { marker, lat: pos.lat, lon: pos.lon, categoryKey: location.categoryKey };
  });
}

function onStoreMarkerClick(locationId) {
  const dist = playerPos
    ? distanceMeters(playerPos.lat, playerPos.lon, storeMarkers[locationId].lat, storeMarkers[locationId].lon)
    : Infinity;
  if (dist <= CATCH_RADIUS_M) {
    openDrawSceneForStore(locationId);
  }
}

// ---------- Wesen-Spawns ----------

function fillCreatureSpawns() {
  while (activeCreatures.length < MAX_ACTIVE_CREATURES) {
    spawnCreature();
  }
}

function spawnCreature() {
  if (!playerPos) return;
  const key = randomChoice(SPAWNABLE_CREATURE_KEYS);
  let lat, lon;

  const nearStore = Math.random() < CREATURE_STORE_SPAWN_WEIGHT && Object.keys(storeMarkers).length > 0;
  if (nearStore) {
    const storeKeys = Object.keys(storeMarkers);
    const chosenStore = storeMarkers[randomChoice(storeKeys)];
    const p = randomPointAround(chosenStore.lat, chosenStore.lon, CREATURE_STORE_SPAWN_RADIUS_M);
    lat = p.lat;
    lon = p.lon;
  } else {
    const p = randomPointAround(playerPos.lat, playerPos.lon, CREATURE_FREE_SPAWN_RADIUS_M);
    lat = p.lat;
    lon = p.lon;
  }

  const creature = CREATURES[key];
  const id = uid();
  const iconHtml = `<div class="creature-marker" data-id="${id}" style="color:${creature.color}">
      <img src="${creatureIconCache[key] || creature.icon}" alt="${creature.name}" />
    </div>`;
  const icon = L.divIcon({ className: "", html: iconHtml, iconSize: [56, 56] });
  const marker = L.marker([lat, lon], { icon }).addTo(leafletMap);

  const entry = { id, key, lat, lon, marker };
  marker.on("click", () => onCreatureMarkerClick(entry));
  activeCreatures.push(entry);
}

function updateCreatureMarkerIcon(entry) {
  const creature = CREATURES[entry.key];
  const iconHtml = `<div class="creature-marker" data-id="${entry.id}" style="color:${creature.color}">
      <img src="${creatureIconCache[entry.key] || creature.icon}" alt="${creature.name}" />
    </div>`;
  entry.marker.setIcon(L.divIcon({ className: "", html: iconHtml, iconSize: [56, 56] }));
}

function onCreatureMarkerClick(entry) {
  const dist = playerPos
    ? distanceMeters(playerPos.lat, playerPos.lon, entry.lat, entry.lon)
    : Infinity;
  if (dist <= CATCH_RADIUS_M) {
    openCatchSceneForCreature(entry);
  }
}

function removeCreature(entry) {
  leafletMap.removeLayer(entry.marker);
  activeCreatures = activeCreatures.filter((c) => c.id !== entry.id);
  const delay = randomBetween(CREATURE_RESPAWN_MIN_MS, CREATURE_RESPAWN_MAX_MS);
  setTimeout(() => {
    if (document.getElementById("screen-map").classList.contains("active") || true) {
      spawnCreature();
    }
  }, delay);
}

// ---------- HUD / Distanz ----------

function refreshDistancesAndHud() {
  if (!playerPos) return;

  let best = null;

  activeCreatures.forEach((c) => {
    const d = distanceMeters(playerPos.lat, playerPos.lon, c.lat, c.lon);
    const el = c.marker.getElement();
    if (el) {
      const inner = el.querySelector(".creature-marker");
      if (inner) {
        inner.classList.toggle("out-of-range", d > CATCH_RADIUS_M);
        inner.classList.toggle("in-range", d <= CATCH_RADIUS_M);
      }
    }
    if (!best || d < best.distance) {
      best = { type: "creature", key: c.key, ref: c, distance: d };
    }
  });

  Object.entries(storeMarkers).forEach(([key, s]) => {
    const d = distanceMeters(playerPos.lat, playerPos.lon, s.lat, s.lon);
    const el = s.marker.getElement();
    if (el) {
      const inner = el.querySelector(".store-marker");
      if (inner) inner.classList.toggle("out-of-range", d > CATCH_RADIUS_M);
    }
    if (!best || d < best.distance) {
      best = { type: "store", key, ref: s, distance: d };
    }
  });

  nearestEntity = best;
  updateBottomBar();
}

function updateBottomBar() {
  const statusLine = document.getElementById("status-line");
  const btn = document.getElementById("main-action-btn");

  if (!nearestEntity) {
    statusLine.textContent = "Suche Wesen und Stores in der Nähe…";
    btn.disabled = true;
    btn.textContent = "…";
    return;
  }

  const inRange = nearestEntity.distance <= CATCH_RADIUS_M;

  if (nearestEntity.type === "creature") {
    const creature = CREATURES[nearestEntity.key];
    if (inRange) {
      statusLine.textContent = `In Reichweite: ${creature.name}`;
      btn.disabled = false;
      btn.textContent = `${creature.name} entdeckt`;
      btn.onclick = () => openCatchSceneForCreature(nearestEntity.ref);
    } else {
      statusLine.textContent = `${creature.name} in ${formatDistance(nearestEntity.distance)} Entfernung`;
      btn.disabled = true;
      btn.textContent = "Näher herangehen…";
    }
  } else {
    const category = STORE_CATEGORIES[nearestEntity.ref.categoryKey];
    if (inRange) {
      statusLine.textContent = `In Reichweite: ${category.name}`;
      btn.disabled = false;
      btn.textContent = `Item bei ${category.name}`;
      btn.onclick = () => openDrawSceneForStore(nearestEntity.key);
    } else {
      statusLine.textContent = `${category.name} in ${formatDistance(nearestEntity.distance)} Entfernung`;
      btn.disabled = true;
      btn.textContent = "Näher herangehen…";
    }
  }
}

function updateCaughtCounter() {
  document.getElementById("caught-count").textContent = totalCaughtCount();

  const level = xpToLevel(gameState.xp);
  const xpIntoLevel = gameState.xp % XP_PER_LEVEL;
  const xpPct = Math.round((xpIntoLevel / XP_PER_LEVEL) * 100);
  document.getElementById("hud-avatar-level").textContent = level;
  document.getElementById("hud-level-label").textContent = `LVL ${level}`;
  document.getElementById("hud-xp-fill").style.width = `${xpPct}%`;

  const itemsOwnedTypes = Object.keys(gameState.inventory).length;
  const badge = document.getElementById("hud-backpack-badge");
  badge.textContent = itemsOwnedTypes;
  badge.classList.toggle("hidden", itemsOwnedTypes === 0);
}
