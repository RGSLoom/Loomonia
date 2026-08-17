// Karte, echte GPS-Anbindung, Store-Platzierung, Wesen-Spawn-Logik

let mapboxMap = null;
let playerMarker = null;
let playerAccuracySourceReady = false; // GeoJSON-Source/Layer fuer den Genauigkeits-Kreis erst nach Style-Load anlegbar
let playerPos = null; // { lat, lon }
let firstFixHandled = false;

let playerHeading = 0; // Grad im Uhrzeigersinn ab Norden, direkt CSS-rotate-kompatibel
let lastHeadingPos = null; // { lat, lon } — letzter Punkt, aus dem eine Bewegungspeilung berechnet wurde
const MIN_HEADING_MOVE_M = 3; // unterhalb dieser Distanz zaehlt Bewegung als GPS-Rauschen (kein Dreh-Jitter im Stehen)

const storeMarkers = {}; // storeKey -> { marker, lat, lon }
let activeCreatures = []; // { id, key, lat, lon, marker }
const creatureIconCache = {}; // key -> cutout data URL
let storeLocationsReady = null; // Promise aus loadStoreLocations() (js/locations.js)

async function initMap() {
  const token = await getMapboxToken();
  mapboxgl.accessToken = token;

  // pitch/bearing als Standard gesetzt (nicht erst per Geste) -- Mapbox GL
  // JS erlaubt Kippen/Drehen anders als Leaflet ohnehin per Default per
  // Touch/Drag, hier zusaetzlich direkt mit einer gekippten Ansicht starten,
  // fuer den Pokemon-Go-artigen Effekt (siehe Referenz-Screenshots).
  mapboxMap = new mapboxgl.Map({
    container: "map",
    style: currentMapStyle(), // js/mapbox-config.js -- automatisch hell/dunkel je nach Uhrzeit
    center: [13.405, 52.52], // Mapbox nutzt [lng, lat], nicht [lat, lng] wie Leaflet
    zoom: 16,
    pitch: 45,
    bearing: 0,
    attributionControl: true,
  });
  mapboxMap.addControl(
    new mapboxgl.NavigationControl({ showZoom: false, showCompass: true, visualizePitch: true }),
    "top-right"
  );

  // Leichter Farbwasch in den App-eigenen Violett-/Cyan-Toenen (siehe
  // .profile-screen), damit die Karte zur restlichen Cosmic-Bildsprache
  // passt statt neutral-bunt zu wirken — Wasser/Gruenflaechen bleiben
  // bewusst erkennbar (siehe .map-tint in style.css).
  const tint = document.createElement("div");
  tint.className = "map-tint";
  mapboxMap.getContainer().appendChild(tint);

  // Laeuft parallel zur (nutzerseitig oft erst nach Erlaubnis-Dialog
  // eintreffenden) Geolocation-Anfrage -> in der Praxis meist laengst
  // fertig, bevor onFirstFix() das Ergebnis braucht. onFirstFix() wartet
  // trotzdem explizit darauf, falls Supabase langsamer ist.
  storeLocationsReady = loadStoreLocations();
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
      "Dieses Gerät/dieser Browser unterstützt keine Standortbestimmung. Nutze die Testknöpfe über der unteren Leiste zum Ausprobieren."
    );
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
      "). Bitte Standortzugriff erlauben. Bis dahin funktionieren nur die Testknöpfe über der unteren Leiste."
  );
}

function onPositionUpdate(pos) {
  hideGpsBanner();
  playerPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };

  if (!firstFixHandled) {
    firstFixHandled = true;
    onFirstFix();
  }

  updatePlayerHeading(pos.coords.heading);
  updatePlayerMarker(pos.coords.accuracy);
  refreshDistancesAndHud();
}

// Bevorzugt den echten heading-Wert der Geolocation API (auf den meisten
// Handys nur bei Bewegung gesetzt, sonst null). Faellt sonst auf die Peilung
// zwischen dem letzten und aktuellen Punkt zurueck — aber erst ab
// MIN_HEADING_MOVE_M Bewegung, sonst dreht sich der Avatar im Stehen
// staendig durchs GPS-Rauschen zufaellig hin und her.
function updatePlayerHeading(gpsHeading) {
  if (typeof gpsHeading === "number" && !Number.isNaN(gpsHeading)) {
    playerHeading = gpsHeading;
    lastHeadingPos = { ...playerPos };
    return;
  }
  if (!lastHeadingPos) {
    lastHeadingPos = { ...playerPos };
    return;
  }
  const moved = distanceMeters(lastHeadingPos.lat, lastHeadingPos.lon, playerPos.lat, playerPos.lon);
  if (moved >= MIN_HEADING_MOVE_M) {
    playerHeading = bearingBetween(lastHeadingPos.lat, lastHeadingPos.lon, playerPos.lat, playerPos.lon);
    lastHeadingPos = { ...playerPos };
  }
}

async function onFirstFix() {
  mapboxMap.jumpTo({ center: [playerPos.lon, playerPos.lat], zoom: 17 });
  await storeLocationsReady;
  ensureStorePositions();
  renderStoreMarkers();
  fillCreatureSpawns();
}

// Blickrichtungs-Kegel + Punkt statt starrem Blau-Punkt (aehnlich dem
// Pokemon-Go-Standortmarker) — der Kegel dreht sich per CSS transform auf
// playerHeading, der Punkt selbst bleibt zentriert (Rotationsmittelpunkt).
const PLAYER_MARKER_ICON_HTML = `
  <div class="player-marker-wrap">
    <svg class="player-cone" viewBox="0 0 60 60" width="60" height="60" aria-hidden="true">
      <defs>
        <radialGradient id="playerConeGrad" cx="50%" cy="100%" r="100%">
          <stop offset="0%" stop-color="rgba(69,212,255,0.55)"/>
          <stop offset="100%" stop-color="rgba(69,212,255,0)"/>
        </radialGradient>
      </defs>
      <path d="M30 30 L16 8 L44 8 Z" fill="url(#playerConeGrad)"/>
    </svg>
    <div class="player-marker"></div>
  </div>`;

function updatePlayerMarker(accuracy) {
  const lngLat = [playerPos.lon, playerPos.lat];
  if (!playerMarker) {
    // Eigener Container als Marker-Wurzel, damit Mapbox dessen transform
    // exklusiv fuer die Positionierung nutzen kann -- die Drehung des
    // Blickrichtungs-Kegels passiert eine Ebene tiefer, auf .player-marker-wrap.
    const container = document.createElement("div");
    container.innerHTML = PLAYER_MARKER_ICON_HTML;
    container.style.zIndex = "1000";
    playerMarker = new mapboxgl.Marker({ element: container }).setLngLat(lngLat).addTo(mapboxMap);
  } else {
    playerMarker.setLngLat(lngLat);
  }

  updatePlayerAccuracyCircle(accuracy || 20, lngLat);

  const wrap = playerMarker.getElement().querySelector(".player-marker-wrap");
  if (wrap) wrap.style.transform = `rotate(${playerHeading}deg)`;
}

// Legt Source + Fill-/Outline-Layer fuer den GPS-Genauigkeits-Kreis einmalig
// an, sobald der Kartenstil geladen ist (addSource/addLayer schlagen vorher
// fehl). Bis dahin wird jeder Aufruf einfach uebersprungen -- der naechste
// GPS-Tick (typischerweise Sekundenbruchteile spaeter) versucht es erneut.
function ensurePlayerAccuracySource() {
  if (playerAccuracySourceReady || !mapboxMap.isStyleLoaded()) return;
  mapboxMap.addSource("player-accuracy", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  mapboxMap.addLayer({
    id: "player-accuracy-fill",
    type: "fill",
    source: "player-accuracy",
    paint: { "fill-color": "#4ade80", "fill-opacity": 0.08 },
  });
  mapboxMap.addLayer({
    id: "player-accuracy-outline",
    type: "line",
    source: "player-accuracy",
    paint: { "line-color": "#4ade80", "line-width": 1 },
  });
  playerAccuracySourceReady = true;
}

// Baut ein Vieleck mit "steps" Ecken im angegebenen Meter-Radius um (lat,lon)
// -- Mapbox GL JS hat anders als Leaflet (L.circle) keinen eingebauten
// Kreis mit echtem Meter-Radius, deshalb hier per destinationPoint()
// (js/utils.js, gleiche Formel wie fuer die Wesen-Spawn-Streuung) selbst
// nachgebaut statt eine zusaetzliche Turf.js-Abhaengigkeit einzubinden.
function metersCircleGeoJSON(lat, lon, radiusMeters, steps = 48) {
  const coords = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (360 / steps) * i;
    const p = destinationPoint(lat, lon, radiusMeters, angle);
    coords.push([p.lon, p.lat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

function updatePlayerAccuracyCircle(radiusMeters, lngLat) {
  ensurePlayerAccuracySource();
  if (!playerAccuracySourceReady) return;
  const feature = metersCircleGeoJSON(lngLat[1], lngLat[0], radiusMeters);
  mapboxMap.getSource("player-accuracy").setData({ type: "FeatureCollection", features: [feature] });
}

// ---------- Stores ----------

// Ergaenzt fehlende Standort-Positionen, ohne bereits platzierte Standorte
// unnoetig zu verschieben — so koennen jederzeit neue Standorte in der
// Supabase-Tabelle "locations" hinzugefuegt werden, ohne bestehende
// Spielstaende (localStorage) zu zerstoeren. Standorte mit echten coords
// bekommen genau diese Position, alle anderen werden einmalig zufaellig um
// den Spieler-Start platziert.
//
// Cache-Invalidierung: jede Position wird zusammen mit dem updatedAt-
// Zeitstempel der Quelle gecacht. Weicht der aktuell geladene updatedAt vom
// gecachten ab (z.B. weil der Standort im Dashboard nachtraeglich
// verschoben wurde), wird die gecachte Position ueberschrieben statt
// beibehalten — nur so kommt eine Korrektur auch bei Spielern an, die den
// Standort schon vorher geladen hatten.
function ensureStorePositions() {
  const positions = gameState.storePositions ? { ...gameState.storePositions } : {};
  let changed = false;

  STORE_LOCATIONS.forEach((location) => {
    const cached = positions[location.id];
    const isStale = cached && location.updatedAt && cached.updatedAt !== location.updatedAt;
    if (cached && !isStale) return;

    if (location.coords) {
      positions[location.id] = { lat: location.coords.lat, lon: location.coords.lon, updatedAt: location.updatedAt || null };
      changed = true;
    } else if (!cached) {
      // Nur beim allerersten Mal zufaellig platzieren -> eine spaetere
      // Aenderung ohne echte Koordinate soll die zufaellige Platzierung
      // nicht bei jedem Ladevorgang neu wuerfeln.
      const p = randomPointAround(playerPos.lat, playerPos.lon, STORE_OFFSET_RADIUS_M, 30);
      positions[location.id] = { lat: p.lat, lon: p.lon, updatedAt: location.updatedAt || null };
      changed = true;
    }
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

// Landmarks (type "landmark") sind reine Orientierungspunkte auf der Karte
// ohne Minigame/Item-Vergabe — kein Klick-Handler, kein Store-Szenenbild,
// nur ein kleines Icon-Badge mit dem im Dashboard gewaehlten Symbol.
function renderStoreMarkers() {
  STORE_LOCATIONS.forEach((location) => {
    const pos = gameState.storePositions[location.id];
    if (!pos) return;

    const isLandmark = location.type === "landmark";
    let html;
    if (isLandmark) {
      html = `<div class="store-marker store-marker-landmark" data-store="${location.id}">
          <span class="store-marker-badge">${location.landmarkIcon || "📍"}</span>
          <span class="marker-tooltip">${location.name || "Ort"}</span>
        </div>`;
    } else {
      const category = STORE_CATEGORIES[location.categoryKey];
      html = `<div class="store-marker" data-store="${location.id}" style="background-image:url('${category.scene}')">
          <span class="store-marker-badge">${STORE_EMOJI[location.categoryKey] || "🏬"}</span>
          <span class="marker-tooltip">${category.name}</span>
        </div>`;
    }

    const container = document.createElement("div");
    container.innerHTML = html;
    const el = container.firstElementChild;
    if (!isLandmark) {
      el.addEventListener("click", () => onStoreMarkerClick(location.id));
    }
    const marker = new mapboxgl.Marker({ element: el }).setLngLat([pos.lon, pos.lat]).addTo(mapboxMap);
    storeMarkers[location.id] = { marker, lat: pos.lat, lon: pos.lon, categoryKey: location.categoryKey, type: location.type };
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
  const container = document.createElement("div");
  container.innerHTML = iconHtml;
  const el = container.firstElementChild;
  const marker = new mapboxgl.Marker({ element: el }).setLngLat([lon, lat]).addTo(mapboxMap);

  const entry = { id, key, lat, lon, marker };
  el.addEventListener("click", () => onCreatureMarkerClick(entry));
  activeCreatures.push(entry);
}

// Tauscht nur das Bild im bestehenden Marker-Element statt es komplett neu
// aufzubauen (anders als Leaflets marker.setIcon()) -- ein Mapbox-Marker ist
// direkt das uebergebene DOM-Element, ein Austausch der Wurzel wuerde den
// bereits daran haengenden Klick-Listener verlieren.
function updateCreatureMarkerIcon(entry) {
  const creature = CREATURES[entry.key];
  const img = entry.marker.getElement().querySelector("img");
  if (img) img.src = creatureIconCache[entry.key] || creature.icon;
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
  entry.marker.remove();
  activeCreatures = activeCreatures.filter((c) => c.id !== entry.id);
  const delay = randomBetween(CREATURE_RESPAWN_MIN_MS, CREATURE_RESPAWN_MAX_MS);
  setTimeout(() => {
    if (document.getElementById("screen-map").classList.contains("active") || true) {
      spawnCreature();
    }
  }, delay);
}

// ---------- HUD / Distanz ----------

// Markiert Wesen/Store-Marker als in/out-of-range (visuelles Feedback,
// siehe .in-range/.out-of-range in style.css). Das eigentliche Fangen/
// Item-Abholen laeuft ausschliesslich ueber Antippen des Markers selbst
// (onCreatureMarkerClick/onStoreMarkerClick) — keine separate HUD-Leiste
// mehr dafuer noetig.
function refreshDistancesAndHud() {
  if (!playerPos) return;

  activeCreatures.forEach((c) => {
    const d = distanceMeters(playerPos.lat, playerPos.lon, c.lat, c.lon);
    const el = c.marker.getElement();
    if (el) {
      el.classList.toggle("out-of-range", d > CATCH_RADIUS_M);
      el.classList.toggle("in-range", d <= CATCH_RADIUS_M);
    }
  });

  Object.entries(storeMarkers).forEach(([key, s]) => {
    const d = distanceMeters(playerPos.lat, playerPos.lon, s.lat, s.lon);
    const el = s.marker.getElement();
    if (el) el.classList.toggle("out-of-range", d > CATCH_RADIUS_M);
  });
}

function updateCaughtCounter() {
  const level = xpToLevel(gameState.xp);
  const isMaxLevel = level >= LEVEL_CAP;
  const levelFloor = xpForLevel(level);
  const levelCeil = isMaxLevel ? MAX_LEVEL_XP : xpForLevel(level + 1);
  const xpPctRaw = isMaxLevel ? 100 : ((gameState.xp - levelFloor) / (levelCeil - levelFloor)) * 100;
  // Immer ein sichtbarer Rest-Fuellstand, auch ganz am Levelanfang — sonst
  // wirkt der Balken bei 0-3% wie eine leere Rille statt einer Anzeige.
  const xpPct = Math.max(Math.round(xpPctRaw), 4);
  document.getElementById("hud-level-label").textContent = `LVL ${level}`;
  document.getElementById("hud-xp-text").textContent = isMaxLevel
    ? "Levelcap erreicht"
    : `${formatNumber(gameState.xp - levelFloor)} / ${formatNumber(levelCeil - levelFloor)} XP`;
  document.getElementById("hud-xp-fill").style.width = `${xpPct}%`;

  const itemsOwnedTypes = Object.keys(gameState.inventory).length;
  const badge = document.getElementById("hud-backpack-badge");
  badge.textContent = itemsOwnedTypes;
  badge.classList.toggle("hidden", itemsOwnedTypes === 0);

  const energy = getEnergy();
  document.getElementById("hud-energy-label").textContent = energy;
  document.getElementById("hud-energy-fill").style.width = `${(energy / ENERGY_MAX) * 100}%`;
}
