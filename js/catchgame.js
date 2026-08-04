// Ring-Fangmechanik (Fangszene)

let catchState = null; // { creatureKey, entry, attempt, rafId, startTime, isTest }

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

  document.getElementById("catch-bg").src = creature.scene;
  document.getElementById("catch-attempt-label").textContent = "Versuch 1 von 2";

  // Bei Fauli ist das Wesen schon im echten Foto zu sehen — bei den
  // generischen Hintergruenden (Enari/Fifu/Nami) legen wir das
  // freigestellte Icon zusaetzlich als Vordergrund-Motiv drauf, damit
  // ueberhaupt ein Wesen zum Anvisieren sichtbar ist.
  const creatureImgEl = document.getElementById("catch-creature-img");
  if (creature.sceneIsRealPhoto) {
    creatureImgEl.style.display = "none";
  } else {
    creatureImgEl.src = creatureIconCache[creatureKey] || creature.icon;
    creatureImgEl.style.display = "block";
  }

  showScreen("screen-catch");
  startRingLoop();
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
