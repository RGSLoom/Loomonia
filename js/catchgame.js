// Ring-Fangmechanik (Fangszene)

let catchState = null; // { creatureKey, entry, attempt, rafId, startTime, isTest }
let cameraStream = null; // MediaStream der Fangszenen-Kamera (AR-Hintergrund)

function openCatchSceneForCreature(entry) {
  const creatureKey = entry.key;
  catchState = {
    creatureKey,
    entry,
    attempt: 1,
    rafId: null,
    startTime: null,
    isTest: !!entry.isTest,
  };
  const creature = CREATURES[creatureKey];

  document.getElementById("catch-attempt-label").textContent = "Versuch 1 von 2";
  setupCatchBackground(creature);

  showScreen("screen-catch");
  startRingLoop();
}

// ---------- AR-Kamera-Hintergrund ----------
// Zeigt wahlweise das echte Live-Kamerabild (nur lokal im <video>-Element,
// nirgendwo hochgeladen/gespeichert) oder faellt bei fehlender Erlaubnis/
// Kamera automatisch und ohne Fehlermeldung auf das feste Foto zurueck.

function showPhotoLayer(creature) {
  document.getElementById("catch-camera").style.display = "none";
  const img = document.getElementById("catch-bg");
  img.style.display = "block";
  img.src = creature.scene;

  // Bei Fauli ist das Wesen schon im echten Foto zu sehen — bei den
  // generischen Hintergruenden (Enari/Fifu/Nami) legen wir das
  // freigestellte Icon zusaetzlich als Vordergrund-Motiv drauf, damit
  // ueberhaupt ein Wesen zum Anvisieren sichtbar ist.
  const creatureImgEl = document.getElementById("catch-creature-img");
  if (creature.sceneIsRealPhoto) {
    creatureImgEl.style.display = "none";
  } else {
    creatureImgEl.src = creatureIconCache[creature.key] || creature.icon;
    creatureImgEl.style.display = "block";
  }
}

function showCameraLayer(creature) {
  document.getElementById("catch-bg").style.display = "none";
  document.getElementById("catch-camera").style.display = "block";
  // Im Kamera-Modus enthaelt das Live-Bild nie ein Wesen (anders als
  // Faulis festes Foto) — das Icon muss also immer als Vordergrund drauf.
  const creatureImgEl = document.getElementById("catch-creature-img");
  creatureImgEl.src = creatureIconCache[creature.key] || creature.icon;
  creatureImgEl.style.display = "block";
}

async function tryStartCamera() {
  if (cameraStream) return true;
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia wird von diesem Browser nicht unterstuetzt");
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    document.getElementById("catch-camera").srcObject = cameraStream;
    return true;
  } catch (err) {
    // Kein Fehler-Dialog, kein Absturz — einfach still auf das Foto
    // zurueckfallen (z.B. Erlaubnis verweigert, keine Kamera vorhanden).
    console.warn("Kamera nicht verfügbar, nutze Foto-Hintergrund:", err && err.message ? err.message : err);
    cameraStream = null;
    return false;
  }
}

function stopCameraBackground() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  document.getElementById("catch-camera").srcObject = null;
}

// Setzt sofort den Foto-Hintergrund (garantierter, synchroner Fallback)
// und versucht danach asynchron die Kamera, falls sie in den
// Einstellungen aktiviert ist.
function setupCatchBackground(creature) {
  showPhotoLayer(creature);
  updateArToggleUI();

  if (gameState.settings.arCameraEnabled) {
    tryStartCamera().then((success) => {
      if (success && catchState) showCameraLayer(creature);
    });
  } else {
    stopCameraBackground();
  }
}

// Umschalter direkt in der Fangszene — steuert denselben gespeicherten
// Zustand wie der Schalter im Profil-Hub/Einstellungen (siehe profile.js).
function toggleArCamera() {
  const newValue = !gameState.settings.arCameraEnabled;
  setArCameraEnabled(newValue);
  updateArToggleUI();
  syncSettingsArToggle();

  if (!catchState) return;
  const creature = CREATURES[catchState.creatureKey];
  if (newValue) {
    tryStartCamera().then((success) => {
      if (success && catchState) showCameraLayer(creature);
    });
  } else {
    stopCameraBackground();
    showPhotoLayer(creature);
  }
}

function updateArToggleUI() {
  const btn = document.getElementById("btn-ar-toggle");
  const on = gameState.settings.arCameraEnabled;
  btn.classList.toggle("on", on);
  btn.textContent = on ? "📷 Kamera: An" : "📷 Kamera: Aus";
}

function syncSettingsArToggle() {
  const toggle = document.getElementById("settings-ar-toggle");
  if (toggle) toggle.classList.toggle("on", gameState.settings.arCameraEnabled);
}

function startRingLoop() {
  catchState.startTime = performance.now();
  const shrinkRing = document.getElementById("shrink-ring");

  function frame(now) {
    const elapsed = (now - catchState.startTime) % RING_CONFIG.durationMs;
    const progress = elapsed / RING_CONFIG.durationMs;
    const radius = RING_CONFIG.maxRadius * (1 - progress);
    shrinkRing.setAttribute("r", radius.toFixed(2));
    catchState.currentRadius = radius;
    catchState.rafId = requestAnimationFrame(frame);
  }
  catchState.rafId = requestAnimationFrame(frame);
}

function stopRingLoop() {
  if (catchState && catchState.rafId) {
    cancelAnimationFrame(catchState.rafId);
    catchState.rafId = null;
  }
}

function handleFangenClick() {
  if (!catchState) return;
  const radius = catchState.currentRadius;

  if (radius <= RING_CONFIG.greenRadius) {
    stopRingLoop();
    onCatchSuccess();
  } else if (catchState.attempt === 1) {
    stopRingLoop();
    catchState.attempt = 2;
    document.getElementById("catch-attempt-label").textContent = "Versuch 2 von 2";
    startRingLoop();
  } else {
    stopRingLoop();
    onCatchFail();
  }
}

function onCatchSuccess() {
  const creature = CREATURES[catchState.creatureKey];
  addCaughtCreature(creature.key);
  addXp(creature.xp);
  updateCaughtCounter();

  if (!catchState.isTest) {
    removeCreature(catchState.entry);
  }

  document.getElementById("success-creature-img").src = creature.scene;
  document.getElementById("success-creature-name").textContent = creature.name;
  document.getElementById("success-creature-meta").textContent =
    `${creature.elementIcon} ${creature.element} • ${creature.rarity}`;
  document.getElementById("success-xp").textContent = `+${creature.xp} XP`;

  showScreen("screen-catch-success");
  catchState = null;
}

function onCatchFail() {
  if (!catchState.isTest) {
    removeCreature(catchState.entry);
  }
  catchState = null;
  showScreen("screen-map");
}

function closeCatchScene() {
  stopRingLoop();
  catchState = null;
  showScreen("screen-map");
}
