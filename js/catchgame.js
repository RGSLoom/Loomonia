// Rundenbasiertes Fangsystem (Ring-Timing-Kampfmechanik)
// Siehe Rundenbasiertes-Fangsystem-Briefing. Ersetzt das fruehere
// Pendel-Balken-Fangspiel: Spieler-Begleiter und wildes Looma tauschen
// abwechselnd Angriff/Ausweichen aus (Timing-Ring), bis eine Seite auf 0
// Kampf-Energie faellt -- siehe "Kampf-Energie"-Kommentar in js/data.js fuer
// die bewusste Abgrenzung zur regenerierenden Meta-Energie (ENERGY_MAX).

let catchState = null;
let cameraStream = null; // MediaStream der Fangszenen-Kamera (AR-Hintergrund)

function openCatchSceneForCreature(entry) {
  // Energie-Gate: das Fuss-HUD zeigt Energie als begrenzte Ressource an
  // (sinkt pro Fangversuch, regeneriert passiv ueber Zeit, siehe
  // settleEnergy() in js/state.js). Testfaenge (Dev-Button, entry.isTest)
  // bleiben bewusst ausgenommen, die sollen unabhaengig vom Spielzustand
  // jederzeit funktionieren.
  if (!entry.isTest && getEnergy() < ENERGY_PER_CATCH) {
    showToast("Nicht genug Energie zum Fangen — kurz warten oder ein Energie-Item verwenden.");
    return;
  }
  // Ohne aktiven Begleiter kann niemand kaempfen (siehe playerBattleStats()
  // in js/state.js) -- sollte durch die Start-Begleiter-Auswahl (siehe
  // initStarterPickIfNeeded() in js/main.js) normalerweise nie eintreten,
  // bleibt aber als Schutz gegen einen kaputten/manipulierten Spielstand.
  const playerStats = playerBattleStats();
  if (!playerStats) {
    showToast("Du brauchst einen aktiven Begleiter, um zu kämpfen.");
    return;
  }

  const creatureKey = entry.key;
  const creature = CREATURES[creatureKey];
  const wildStats = wildLoomaBattleStats(creature);

  catchState = {
    creatureKey,
    entry,
    isTest: !!entry.isTest,
    companionKey: gameState.activeCompanion,
    playerStats,
    wildStats,
    playerEnergy: playerStats.gesundheit,
    wildEnergy: wildStats.gesundheit,
    round: 1,
    phase: "attack",
    rafId: null,
    startTime: null,
    currentDistance: 1,
    holding: false,
    slowFactor: 1,
    usedFokuszeit: false,
  };

  spendEnergy(ENERGY_PER_CATCH);
  updateCaughtCounter();

  setupCatchBackground(creature);
  updateFokuszeitButtonUI();
  updateBattleEnergyBarsUI();
  updateHealButtonUI();
  closeHealPicker();

  showScreen("screen-catch");
  startBattleRound();
}

// Fokuszeit ist das einzige Item mit aktiver Auswahl direkt in der
// Fangszene (siehe ITEMS.fokuszeit in js/data.js) — einmal pro Begegnung
// nutzbar, verlangsamt den Ring sofort fuer den Rest der Begegnung.
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
  stopTimingLoop();
  // Ausweichen/Fangen laufen automatisch, werden also sofort mit dem neuen
  // Tempo neugestartet -- der Angriffs-Ring bewegt sich nur waehrend er
  // gehalten wird (siehe onCatchPointerDown()), ohne aktives Halten gibt es
  // hier also keinen Loop zum Neustarten, der neue Faktor greift dann erst
  // beim naechsten Druecken.
  if (catchState.phase === "attack") {
    if (catchState.holding) startAttackHoldLoop();
  } else if (catchState.phase === "dodge") {
    startDodgePulseLoop();
  } else if (catchState.phase === "catch") {
    startBarLoop();
  }
}

// ---------- Kampf-Energie + Heilungsitems (Verbrauchsgegenstaende-Briefing) ----------
// Kontextgebundene Heilungsitems (usage_context "fangsystem_only",
// effectType "gesundheit_restore") -- aktuell nur "gesundheitspaket", aber
// generisch ueber ITEMS gefiltert, damit weitere Heilungsitems ohne
// Code-Aenderung hier automatisch auftauchen. Jederzeit nutzbar, ohne eine
// eigene Runde zu kosten (siehe Briefing).
function getOwnedHealingItemKeys() {
  return Object.values(ITEMS)
    .filter((item) => item.usage_context === "fangsystem_only" && item.effectType === "gesundheit_restore")
    .filter((item) => (gameState.inventory[item.key] || 0) > 0)
    .map((item) => item.key);
}

function updateBattleEnergyBarsUI() {
  if (!catchState) return;
  const wildMax = catchState.wildStats.gesundheit;
  const playerMax = catchState.playerStats.gesundheit;
  const wildPct = Math.max(0, Math.round((catchState.wildEnergy / wildMax) * 100));
  const playerPct = Math.max(0, Math.round((catchState.playerEnergy / playerMax) * 100));
  document.getElementById("catch-wild-energy-fill").style.width = `${wildPct}%`;
  document.getElementById("catch-wild-energy-label").textContent =
    `${Math.max(0, Math.round(catchState.wildEnergy))}/${wildMax}`;
  document.getElementById("catch-player-energy-fill").style.width = `${playerPct}%`;
  document.getElementById("catch-player-energy-label").textContent =
    `${Math.max(0, Math.round(catchState.playerEnergy))}/${playerMax}`;
}

function updateHealButtonUI() {
  const btn = document.getElementById("btn-open-heal-picker");
  const owned = getOwnedHealingItemKeys();
  const totalOwned = owned.reduce((sum, key) => sum + (gameState.inventory[key] || 0), 0);
  const usable = !!catchState && catchState.playerEnergy < catchState.playerStats.gesundheit && owned.length > 0;
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
  const max = catchState.playerStats.gesundheit;
  const before = catchState.playerEnergy;
  catchState.playerEnergy = Math.min(max, catchState.playerEnergy + max * item.effectValue);
  showToast(`✅ ${item.name} eingesetzt (+${Math.round(catchState.playerEnergy - before)} Energie)`);
  updateBattleEnergyBarsUI();
  updateHealButtonUI();
  updateCaughtCounter();
  closeHealPicker();
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

// ---------- Rundenablauf (Angriff -> Ausweichen -> ... -> Fangen) ----------

const BATTLE_PHASE_LABELS = {
  attack: "⚔️ Ring halten, im Zentrum loslassen!",
  dodge: "🛡️ Jetzt wegwischen!",
  catch: "🎯 In der grünen Zone antippen!",
};
const BATTLE_PHASES = Object.keys(BATTLE_PHASE_LABELS);

// Jede Phase hat ihr eigenes Widget + eigene Eingabegeste (User-Korrektur
// nach dem ersten Entwurf: "ich will nicht, dass alles nur ein Ring ist") --
// die Sichtbarkeit der drei Widget-Container wird zentral hier gesteuert,
// das eigentliche Ein-/Ausblenden der Elemente passiert ueber die "hidden"-
// Klasse. minScale gilt fuer sowohl den Angriffs-Ring als auch die
// Fluchtdistanz-Rechnung des Ausweich-Pulses gleichermassen.
function updateWidgetVisibility() {
  document.getElementById("battle-ring-wrap").classList.toggle("hidden", catchState.phase !== "attack");
  document.getElementById("catch-bar-track").classList.toggle("hidden", catchState.phase !== "catch");
  document.getElementById("dodge-hint").classList.toggle("hidden", catchState.phase !== "dodge");
}

function startBattleRound() {
  updatePhaseLabelUI();
  updateWidgetVisibility();
  resetCreatureImgPulse();

  if (catchState.phase === "attack") {
    catchState.holding = false;
    resetRingStatic();
  } else if (catchState.phase === "dodge") {
    startDodgePulseLoop();
  } else if (catchState.phase === "catch") {
    startBarLoop();
  }
}

// Angriff/Ausweichen/Fangen sahen im ersten Entwurf optisch identisch aus
// (nur der Textlabel unterschied sie) -- jetzt zusaetzlich eigene
// Widget-Sichtbarkeit (updateWidgetVisibility()) je Phase.
function updatePhaseLabelUI() {
  if (!catchState) return;
  document.getElementById("battle-phase-label").textContent = BATTLE_PHASE_LABELS[catchState.phase] || "";
  document.getElementById("catch-round-label").textContent =
    catchState.phase === "catch" ? "Fangversuch" : `Runde ${catchState.round}/${BATTLE_MAX_ROUNDS}`;
}

// Zielfenster-Groesse fuer die AKTUELL laufende Phase -- Angriff/Ausweichen
// nutzen die reine Raritaets-Groesse (BATTLE_HIT_WINDOW_BY_RARITY, siehe
// js/data.js), Fangen bekommt zusaetzlich den bestehenden Item-/Ausruestungs-
// Fangchance-Bonus PLUS den Element-Vorteil-Bonus obendrauf (User-
// Entscheidung, siehe Element-Typen-System-Briefing).
function currentBattleHitWindow() {
  const creature = CREATURES[catchState.creatureKey];
  const baseWindow = BATTLE_HIT_WINDOW_BY_RARITY[creature.rarity];
  if (catchState.phase !== "catch") return baseWindow;

  const itemBoost = getActiveEffectValue("fangchance_boost") + getEquippedBonusTotal("fangchance_boost");
  const companion = CREATURES[catchState.companionKey];
  const companionElement = habitatElementForCreature(companion);
  const wildElement = habitatElementForCreature(creature);
  const elementMult = elementAttackMultiplier(companionElement, wildElement);
  return baseWindow * (1 + itemBoost) * elementMult;
}

function currentTimingDurationMs() {
  const creature = CREATURES[catchState.creatureKey];
  return BATTLE_TIMING_DURATION_MS_BY_RARITY[creature.rarity] * (catchState.slowFactor || 1);
}

function stopTimingLoop() {
  if (catchState && catchState.rafId) {
    cancelAnimationFrame(catchState.rafId);
    catchState.rafId = null;
  }
}

// ---------- Angriff: Ring gedrueckt halten, im Zentrum loslassen ----------
// `currentDistance` pulsiert einmal pro Zyklus von 1 (Ring auf voller
// Groesse) auf 0 (Ring exakt am Zielpunkt) und zurueck -- der Ring bewegt
// sich aber erst, sobald der Spieler zu druecken beginnt (onCatchPointerDown
// in js/main.js), nicht automatisch beim Rundenstart (User-Vorgabe: "das
// macht er, bis ich loslasse").
function resetRingStatic() {
  catchState.currentDistance = 1;
  const ring = document.getElementById("battle-ring");
  ring.style.transform = "translate(-50%, -50%) scale(1)";
  ring.classList.remove("in-window");
}

function startAttackHoldLoop() {
  catchState.startTime = performance.now();
  const ring = document.getElementById("battle-ring");
  const durationMs = currentTimingDurationMs();
  const cycleMs = durationMs * 2;
  const hitWindow = currentBattleHitWindow();
  const minScale = 0.12;

  function frame(now) {
    const elapsed = (now - catchState.startTime) % cycleMs;
    const distance = elapsed < durationMs ? 1 - elapsed / durationMs : (elapsed - durationMs) / durationMs;
    catchState.currentDistance = distance;
    const scale = minScale + distance * (1 - minScale);
    ring.style.transform = `translate(-50%, -50%) scale(${scale})`;
    ring.classList.toggle("in-window", distance < hitWindow);
    catchState.rafId = requestAnimationFrame(frame);
  }
  catchState.rafId = requestAnimationFrame(frame);
}

// ---------- Ausweichen: Wisch-Geste bei pulsierender Gefahren-Anzeige ----------
// Kein Ring/Balken -- stattdessen pulsiert das wilde Looma selbst (roter
// Gefahren-Glow, staerker/naeher am Hoehepunkt = jetzt wegwischen), siehe
// User-Vorgabe "das war fuer mich eigentlich die Attacke des Gegners". Nur
// Timing zaehlt (User-Entscheidung), keine Wisch-RICHTUNG -- jeder Pointer-
// Up waehrend dieser Phase zaehlt als Ausweichversuch (siehe
// onCatchPointerUp() in js/main.js), unabhaengig von zurueckgelegter Strecke.
function resetCreatureImgPulse() {
  const img = document.getElementById("catch-creature-img");
  img.classList.remove("dodge-danger", "in-window");
  img.style.transform = "";
}

function startDodgePulseLoop() {
  catchState.startTime = performance.now();
  const img = document.getElementById("catch-creature-img");
  img.classList.add("dodge-danger");
  const durationMs = currentTimingDurationMs();
  const cycleMs = durationMs * 2;
  const hitWindow = currentBattleHitWindow();

  function frame(now) {
    const elapsed = (now - catchState.startTime) % cycleMs;
    const distance = elapsed < durationMs ? 1 - elapsed / durationMs : (elapsed - durationMs) / durationMs;
    catchState.currentDistance = distance;
    const scale = 1 + (1 - distance) * 0.16;
    img.style.transform = `translate(-50%, -50%) scale(${scale})`;
    img.classList.toggle("in-window", distance < hitWindow);
    catchState.rafId = requestAnimationFrame(frame);
  }
  catchState.rafId = requestAnimationFrame(frame);
}

// ---------- Fangen: der urspruengliche Pendel-Balken ----------
// User-Vorgabe: "das Fangen, das ist wie es bisher war, mit diesem Balken".
// Der Marker sweept kontinuierlich 0% -> 100% -> 0% -- anders als der
// Angriffs-Ring/Ausweich-Puls (die einmal pro Zyklus das Zentrum erreichen)
// durchquert er die gruene Zone dabei ZWEIMAL pro Zyklus, exakt wie der
// urspruengliche Balken vor dem Rundenbasierten-Fangsystem-Briefing.
function startBarLoop() {
  catchState.startTime = performance.now();
  const marker = document.getElementById("catch-bar-marker");
  const track = document.querySelector(".catch-bar-track");
  const durationMs = currentTimingDurationMs();
  const cycleMs = durationMs * 2;
  const hitWindow = currentBattleHitWindow();
  track.style.setProperty("--catch-green-start", `${50 - hitWindow * 50}%`);
  track.style.setProperty("--catch-green-end", `${50 + hitWindow * 50}%`);

  function frame(now) {
    const elapsed = (now - catchState.startTime) % cycleMs;
    const position = elapsed < durationMs ? (elapsed / durationMs) * 100 : 100 - ((elapsed - durationMs) / durationMs) * 100;
    catchState.currentDistance = Math.abs(position - 50) / 50;
    marker.style.left = `${position.toFixed(2)}%`;
    catchState.rafId = requestAnimationFrame(frame);
  }
  catchState.rafId = requestAnimationFrame(frame);
}

// ---------- Eingabe-Dispatch je Phase (siehe onCatchPointerDown/-Up in js/main.js) ----------
// Nur der Angriff braucht ein Pointerdown-Signal (startet den Ring) --
// Ausweichen/Fangen laufen automatisch seit Rundenbeginn, jeder PointerUp
// waehrend dieser Phasen wertet direkt aus.
function onCatchPointerDown() {
  if (!catchState || catchState.phase !== "attack" || catchState.holding) return;
  catchState.holding = true;
  startAttackHoldLoop();
}

function onCatchPointerUp() {
  if (!catchState) return;
  if (catchState.phase === "attack") {
    if (!catchState.holding) return;
    catchState.holding = false;
  }
  const hitWindow = currentBattleHitWindow();
  const factor = battleTimingFactor(catchState.currentDistance, hitWindow);
  stopTimingLoop();

  if (catchState.phase === "attack") resolveAttack(factor);
  else if (catchState.phase === "dodge") resolveDodge(factor);
  else if (catchState.phase === "catch") resolveCatchAttempt(factor);
}

// Spieler-Begleiter greift das wilde Looma an (siehe battleDamage() in
// js/data.js). Wird das wilde Looma dabei auf 0 Energie gebracht, startet
// sofort die Fangsequenz -- sonst kontert es umgehend mit einem eigenen
// Angriff (Ausweichen-Phase, siehe Briefing Schritt 2/3).
function resolveAttack(factor) {
  const companion = CREATURES[catchState.companionKey];
  const wild = CREATURES[catchState.creatureKey];
  const mult = elementAttackMultiplier(habitatElementForCreature(companion), habitatElementForCreature(wild));
  const rawDmg = battleDamage(catchState.playerStats.angriff, catchState.wildStats.verteidigung, factor, mult);
  const dmg = clampBattleDamage(rawDmg, catchState.wildStats.gesundheit);
  catchState.wildEnergy = Math.max(0, catchState.wildEnergy - dmg);
  updateBattleEnergyBarsUI();
  showToast(dmg > 0 ? `⚔️ ${dmg} Schaden!` : "❌ Verfehlt!");

  if (catchState.wildEnergy <= 0) {
    startCatchSequence();
    return;
  }
  catchState.phase = "dodge";
  startBattleRound();
}

// Wildes Looma kontert, Spieler muss ausweichen -- Praezision des Ausweich-
// Tipps mindert den erlittenen Schaden (invertierter Timing-Faktor: exakt
// getroffen = volle Ausweich-Wirkung = 0 Schaden, siehe Briefing "Timing-
// Mechanik").
function resolveDodge(factor) {
  const companion = CREATURES[catchState.companionKey];
  const wild = CREATURES[catchState.creatureKey];
  const mult = elementAttackMultiplier(habitatElementForCreature(wild), habitatElementForCreature(companion));
  const rawDmg = battleDamage(catchState.wildStats.angriff, catchState.playerStats.verteidigung, 1 - factor, mult);
  const dmg = clampBattleDamage(rawDmg, catchState.playerStats.gesundheit);
  catchState.playerEnergy = Math.max(0, catchState.playerEnergy - dmg);
  updateBattleEnergyBarsUI();
  updateHealButtonUI();
  showToast(dmg > 0 ? `💥 -${dmg} Energie` : "🛡️ Ausweichen gelungen!");

  if (catchState.playerEnergy <= 0) {
    showToast("😵 Dein Begleiter ist erschöpft — das wilde Looma entkommt!");
    onCatchFail();
    return;
  }

  catchState.round += 1;
  if (catchState.round > BATTLE_MAX_ROUNDS) {
    showToast("⏱️ Der Kampf zieht sich zu lange hin — das wilde Looma nutzt die Gelegenheit und flieht!");
    onCatchFail();
    return;
  }
  catchState.phase = "attack";
  startBattleRound();
}

// Fangsequenz (siehe Briefing): der Pendel-Balken (siehe startBarLoop()
// oben), einmal antippen in der (matchup-erweiterten) gruenen Zone faengt
// das Looma, sonst entkommt es trotz Schwaechung.
function startCatchSequence() {
  catchState.phase = "catch";
  startBattleRound();
}

function resolveCatchAttempt(factor) {
  if (factor > 0) {
    onCatchSuccess();
  } else {
    showToast("😮‍💨 Verfehlt — das geschwächte Looma entkommt trotzdem!");
    onCatchFail();
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
          rarity: TROPHIES[e.trophyKey].rarity,
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
  stopTimingLoop();
  catchState = null;
  updateFokuszeitButtonUI();
  updateHealButtonUI();
  closeHealPicker();
  showScreen("screen-map");
}
