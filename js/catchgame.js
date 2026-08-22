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
    slowFactor: 1,
    usedFokuszeit: false,
    // Spieler-Gesundheit NUR fuer diese eine Begegnung (siehe HEALTH_MAX in
    // js/data.js) -- sinkt bei einem verfehlten Versuch, Heilungsitems
    // stellen sie wieder her (siehe useHealItem() unten).
    health: HEALTH_MAX,
  };
  const creature = CREATURES[creatureKey];

  // Einmal pro Begegnung, unabhaengig davon ob spaeter 1 oder 2 Tipp-Versuche
  // gebraucht werden — siehe ENERGY_PER_CATCH in js/data.js.
  spendEnergy(ENERGY_PER_CATCH);
  updateCaughtCounter();

  document.getElementById("catch-attempt-label").textContent = "Versuch 1 von 2";
  setupCatchBackground(creature);
  updateFokuszeitButtonUI();
  updateHealthBarUI();
  updateHealButtonUI();
  closeHealPicker();

  showScreen("screen-catch");
  startBarLoop();
}

// Fokuszeit ist das einzige Item mit aktiver Auswahl direkt in der
// Fangszene (siehe ITEMS.fokuszeit in js/data.js) — einmal pro Begegnung
// nutzbar, verlangsamt die Leiste sofort fuer den laufenden Versuch.
function updateFokuszeitButtonUI() {
  const btn = document.getElementById("btn-use-fokuszeit");
  const owned = (gameState.inventory.fokuszeit || 0) > 0;
  const usable = !!catchState && !catchState.usedFokuszeit && owned;
  btn.classList.toggle("hidden", !usable);
  document.getElementById("fokuszeit-btn-badge").textContent = gameState.inventory.fokuszeit || 0;
}

function useFokuszeit() {
  if (!catchState || catchState.usedFokuszeit) return;
  if ((gameState.inventory.fokuszeit || 0) < 1) return;
  removeItem("fokuszeit");
  catchState.usedFokuszeit = true;
  catchState.slowFactor = FOKUSZEIT_SLOWDOWN_FACTOR;
  showToast("✅ Fokuszeit eingesetzt");
  updateFokuszeitButtonUI();
  stopBarLoop();
  startBarLoop();
}

// ---------- Spieler-Gesundheit + Heilungsitems (Verbrauchsgegenstaende-Briefing) ----------
// Kontextgebundene Heilungsitems (usage_context "fangsystem_only",
// effectType "gesundheit_restore") -- aktuell nur "gesundheitspaket", aber
// generisch ueber ITEMS gefiltert, damit weitere Heilungsitems ohne
// Code-Aenderung hier automatisch auftauchen.
function getOwnedHealingItemKeys() {
  return Object.values(ITEMS)
    .filter((item) => item.usage_context === "fangsystem_only" && item.effectType === "gesundheit_restore")
    .filter((item) => (gameState.inventory[item.key] || 0) > 0)
    .map((item) => item.key);
}

function updateHealthBarUI() {
  if (!catchState) return;
  const pct = Math.max(0, Math.round((catchState.health / HEALTH_MAX) * 100));
  document.getElementById("catch-health-fill").style.width = `${pct}%`;
  document.getElementById("catch-health-label").textContent = `${Math.max(0, Math.round(catchState.health))}/${HEALTH_MAX}`;
}

function updateHealButtonUI() {
  const btn = document.getElementById("btn-open-heal-picker");
  const owned = getOwnedHealingItemKeys();
  const totalOwned = owned.reduce((sum, key) => sum + (gameState.inventory[key] || 0), 0);
  const usable = !!catchState && catchState.health < HEALTH_MAX && owned.length > 0;
  btn.classList.toggle("hidden", !usable);
  document.getElementById("heal-btn-badge").textContent = totalOwned;
}

function openHealPicker() {
  if (!catchState) return;
  const owned = getOwnedHealingItemKeys();
  const list = document.getElementById("heal-picker-list");
  list.innerHTML = owned
    .map((key) => {
      const item = ITEMS[key];
      const count = gameState.inventory[key] || 0;
      return `<button class="heal-picker-row" data-heal-item="${key}">
        <img src="${item.icon}" alt="${item.name}" class="heal-picker-icon" />
        <span class="heal-picker-info">
          <span class="heal-picker-name">${item.name}</span>
          <span class="heal-picker-effect">${item.effect}</span>
        </span>
        <span class="heal-picker-count">×${count}</span>
      </button>`;
    })
    .join("");
  list.querySelectorAll("[data-heal-item]").forEach((row) => {
    row.addEventListener("click", () => useHealItem(row.dataset.healItem));
  });
  document.getElementById("heal-picker").classList.remove("hidden");
}

function closeHealPicker() {
  document.getElementById("heal-picker").classList.add("hidden");
}

function useHealItem(key) {
  if (!catchState) return;
  const item = ITEMS[key];
  if (!item || item.usage_context !== "fangsystem_only" || item.effectType !== "gesundheit_restore") return;
  if ((gameState.inventory[key] || 0) < 1) return;

  removeItem(key);
  const healthBefore = catchState.health;
  catchState.health = Math.min(HEALTH_MAX, catchState.health + HEALTH_MAX * item.effectValue);
  showToast(`✅ ${item.name} eingesetzt (+${Math.round(catchState.health - healthBefore)} Gesundheit)`);
  updateHealthBarUI();
  updateHealButtonUI();
  updateCaughtCounter();
  closeHealPicker();
}

// Verfehlter Versuch: das Wesen "wehrt sich", Spieler-Gesundheit sinkt um
// einen zufaelligen Betrag (siehe HEALTH_LOSS_MIN/MAX_PER_MISS in js/data.js).
// Gibt true zurueck, wenn die Gesundheit dadurch auf 0 gefallen ist -- der
// Aufrufer laesst das Wesen dann sofort fliehen, auch vor dem 2. Versuch.
function applyMissDamage() {
  const loss = Math.round(randomBetween(HEALTH_LOSS_MIN_PER_MISS, HEALTH_LOSS_MAX_PER_MISS));
  catchState.health = Math.max(0, catchState.health - loss);
  updateHealthBarUI();
  updateHealButtonUI();
  return catchState.health <= 0;
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

// Die Markierung wandert wie ein Pendel von links nach rechts und zurueck
// ueber die Leiste. Die Zonen sind von aussen nach innen rot, gelb, gruen
// (gruen = Mitte = beste Fangchance).
function startBarLoop() {
  catchState.startTime = performance.now();
  const marker = document.getElementById("catch-bar-marker");
  const creature = CREATURES[catchState.creatureKey];
  const baseDurationMs = BAR_DURATION_MS_BY_RARITY[creature.rarity] || BAR_CONFIG.durationMs;
  const durationMs = baseDurationMs * (catchState.slowFactor || 1);
  const cycleMs = durationMs * 2;

  function frame(now) {
    const elapsed = (now - catchState.startTime) % cycleMs;
    const position =
      elapsed < durationMs
        ? (elapsed / durationMs) * 100
        : 100 - ((elapsed - durationMs) / durationMs) * 100;
    marker.style.left = position.toFixed(2) + "%";
    catchState.currentPosition = position;
    catchState.rafId = requestAnimationFrame(frame);
  }
  catchState.rafId = requestAnimationFrame(frame);
}

function stopBarLoop() {
  if (catchState && catchState.rafId) {
    cancelAnimationFrame(catchState.rafId);
    catchState.rafId = null;
  }
}

function handleFangenClick() {
  if (!catchState) return;

  const distanceFromCenter = Math.abs(catchState.currentPosition - 50);
  // Aktiver "fangchance_boost"-Verbrauchsitem-Effekt (siehe applyBoostItem()
  // in js/state.js) PLUS dauerhafter Bonus angezogener Ausruestung (siehe
  // getEquippedBonusTotal() in js/state.js) weiten die gruene Trefferzone
  // gemeinsam relativ um ihren Prozentwert auf.
  const fangchanceBoost = getActiveEffectValue("fangchance_boost") + getEquippedBonusTotal("fangchance_boost");
  const effectiveGreenHalfWidth = BAR_CONFIG.greenHalfWidth * (1 + fangchanceBoost);

  if (distanceFromCenter <= effectiveGreenHalfWidth) {
    stopBarLoop();
    onCatchSuccess();
    return;
  }

  stopBarLoop();
  const healthDepleted = applyMissDamage();
  if (healthDepleted || catchState.attempt !== 1) {
    onCatchFail();
  } else {
    catchState.attempt = 2;
    document.getElementById("catch-attempt-label").textContent = "Versuch 2 von 2";
    startBarLoop();
  }
}

function onCatchSuccess() {
  // Die Fangszene selbst lief komplett als Basis-Wesen ab (nichts deutet
  // auf einen moeglichen Shiny hin) — der Zufalls-Wechsel auf die Shiny-
  // Variante entscheidet sich erst hier, beim Fangerfolg.
  const baseCreature = CREATURES[catchState.creatureKey];
  const shinyInfo = SHINY_VARIANTS[baseCreature.key];
  const isShiny = !!shinyInfo && Math.random() < shinyInfo.chance;
  const creature = isShiny ? CREATURES[shinyInfo.key] : baseCreature;

  addCaughtCreature(creature.key);
  const { awardedXp, entries: levelRewardEntries } = addXp(creature.xp);
  updateCaughtCounter();

  // Fang-bezogene Trophaeen (Anzahl gefangener Wesen je Seltenheitsstufe) —
  // pendingTrophyEntries wird von btn-catch-continue (main.js) nach dem
  // Fang-Erfolgsscreen an die Item-Erfolgsmeldungs-Queue angehaengt, damit
  // eine frisch freigeschaltete Trophaee direkt im Anschluss gezeigt wird.
  // Level-Belohnungen (aus der Fang-XP) haengen aus demselben Grund mit dran.
  pendingTrophyEntries = checkCatchTrophies().concat(levelRewardEntries);
  if (pendingTrophyEntries.length > 0) {
    updateCaughtCounter();
    pendingTrophyEntries
      .filter((e) => e.type === "trophy")
      .forEach((e) => {
        trackEvent("trophy_unlocked", {
          storeId: "catch",
          category: null,
          itemKey: e.trophyKey,
          rarity: TROPHIES[e.trophyKey].tier,
        });
      });
  }

  if (!catchState.isTest) {
    removeCreature(catchState.entry);
  }

  document.getElementById("success-creature-img").src = creature.scene;

  // Wie in der Fangszene selbst: bei generischen Hintergruenden (kein
  // Wesen im Foto) das Icon zusaetzlich vorne drauflegen, sonst ist auf
  // der Erfolgsmeldung nur der leere Hintergrund zu sehen.
  const successIconEl = document.getElementById("success-creature-icon");
  if (creature.sceneIsRealPhoto) {
    successIconEl.style.display = "none";
  } else {
    successIconEl.src = creatureIconCache[creature.key] || creature.icon;
    successIconEl.style.display = "block";
  }

  document.getElementById("success-creature-name").textContent = creature.name;
  document.getElementById("success-creature-meta").textContent =
    `${creature.elementIcon} ${creature.element} • ${creature.rarity}`;
  document.getElementById("success-xp").textContent = `+${awardedXp} XP`;

  const shinyBannerEl = document.getElementById("success-shiny-banner");
  if (isShiny) {
    shinyBannerEl.textContent = `✨ Herzlichen Glückwunsch! Du hast ${baseCreature.name} als Shiny bekommen!`;
    shinyBannerEl.classList.remove("hidden");
  } else {
    shinyBannerEl.classList.add("hidden");
  }

  showScreen("screen-catch-success");
  catchState = null;
  updateFokuszeitButtonUI();
  updateHealButtonUI();
  closeHealPicker();
}

function onCatchFail() {
  if (!catchState.isTest) {
    removeCreature(catchState.entry);
  }
  catchState = null;
  updateFokuszeitButtonUI();
  updateHealButtonUI();
  closeHealPicker();
  showScreen("screen-map");
}

function closeCatchScene() {
  stopBarLoop();
  catchState = null;
  updateFokuszeitButtonUI();
  updateHealButtonUI();
  closeHealPicker();
  showScreen("screen-map");
}
