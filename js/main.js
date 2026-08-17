// Verdrahtung aller Screens und Events

// Zeigt eine oder mehrere Item-Erfolgsmeldungen nacheinander auf demselben
// Screen (z.B. wenn ein Bon-Scan mehrere unterschiedliche Artikel erkennt).
// entries: [{ itemKey, storeText }]
let itemSuccessQueue = [];

// Trophaeen-Erfolgsmeldungen, die nach dem AKTUELLEN Erfolgsscreen noch
// angehaengt werden sollen — z.B. nach einem Fang (siehe onCatchSuccess()
// in catchgame.js), dessen eigener Erfolgsscreen (#screen-catch-success)
// keine eigene Queue hat. btn-catch-continue haengt sie stattdessen an die
// Item-Erfolgsmeldungs-Queue (#screen-item-success) an.
let pendingTrophyEntries = [];

function renderItemSuccess(entry, position, total) {
  const progressEl = document.getElementById("item-success-progress");
  progressEl.textContent = total > 1 ? `${position} von ${total}` : "";
  progressEl.classList.toggle("hidden", total <= 1);

  const img = document.getElementById("item-success-img");
  const trophyIcon = document.getElementById("item-success-trophy-icon");
  const coinsIcon = document.getElementById("item-success-coins-icon");

  if (entry.type === "trophy") {
    const trophy = TROPHIES[entry.trophyKey];
    document.getElementById("item-success-banner").textContent = "🏆 Trophäe freigeschaltet!";
    img.classList.add("hidden");
    coinsIcon.classList.add("hidden");
    trophyIcon.classList.remove("hidden");
    trophyIcon.style.setProperty("--trophy-color", TROPHY_TIER_COLORS[trophy.tier]);
    document.getElementById("item-success-name").textContent = trophy.name;
    const tierLabel = trophy.tier.charAt(0).toUpperCase() + trophy.tier.slice(1);
    document.getElementById("item-success-rarity").innerHTML =
      `<span class="rarity-pill" style="background:${TROPHY_TIER_COLORS[trophy.tier]}">${tierLabel}-Trophäe</span>`;
    document.getElementById("item-success-store").textContent = "";
    document.getElementById("item-success-effect").textContent = trophy.description;
    document.getElementById("item-success-xp").textContent = `+${formatNumber(trophy.xp)} XP`;
    return;
  }

  // Muenzen sind bewusst KEIN Inventar-Item (siehe addCoins() in state.js) —
  // eigener Zweig statt einer ITEMS-Karte, Anzeige oben am Avatar-HUD statt
  // im Rucksack (siehe hud-coins-badge in index.html).
  if (entry.type === "coins") {
    document.getElementById("item-success-banner").textContent = "🪙 Münzen erhalten!";
    img.classList.add("hidden");
    trophyIcon.classList.add("hidden");
    coinsIcon.classList.remove("hidden");
    document.getElementById("item-success-name").textContent = `+${entry.amount} Münzen`;
    document.getElementById("item-success-rarity").textContent = "";
    document.getElementById("item-success-store").textContent = entry.storeText || "";
    document.getElementById("item-success-effect").textContent = `Gesamt: ${formatNumber(gameState.coins || 0)} Münzen`;
    document.getElementById("item-success-xp").textContent = "";
    return;
  }

  document.getElementById("item-success-banner").textContent = "✅ Item erhalten!";
  trophyIcon.classList.add("hidden");
  coinsIcon.classList.add("hidden");
  img.classList.remove("hidden");
  const item = ITEMS[entry.itemKey];
  const count = entry.count || 1;
  img.src = item.icon;
  document.getElementById("item-success-name").textContent = count > 1 ? `${item.name} ×${count}` : item.name;
  document.getElementById("item-success-rarity").innerHTML =
    `<span class="rarity-pill" style="background:${RARITY_COLORS[item.rarity]}">${item.rarity}</span>`;
  document.getElementById("item-success-store").textContent = entry.storeText;
  document.getElementById("item-success-effect").textContent = item.effect;
  document.getElementById("item-success-xp").textContent = `+${item.xp * count} XP`;
}

// Aufgaben-Hinweis-Button im Map-HUD: sichtbar, solange die erste Tutorial-
// Quest (Trophaee "erster_schritt") noch nicht freigeschaltet ist —
// verschwindet danach dauerhaft (Zustand kommt aus gameState.trophies,
// bleibt also auch nach Neuladen so).
function updateQuestButtonVisibility() {
  const btn = document.getElementById("btn-quest");
  if (btn) btn.classList.toggle("hidden", !!gameState.trophies[TROPHIES.erster_schritt.key]);
}

function showItemSuccessQueue(entries) {
  const total = entries.length;
  itemSuccessQueue = entries.slice(1).map((entry, i) => ({ entry, position: i + 2, total }));
  renderItemSuccess(entries[0], 1, total);
  showScreen("screen-item-success");
}

function showScreen(id) {
  const current = document.querySelector(".screen.active");
  // Kamera beim Verlassen der Fangszene immer stoppen (egal ueber
  // welchen Weg — Fang, Flucht, Schliessen-Button), damit sie nie im
  // Hintergrund weiterlaeuft.
  if (current && current.id === "screen-catch" && id !== "screen-catch") {
    stopCameraBackground();
  }
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

document.addEventListener("DOMContentLoaded", () => {
  initMap(); // async (holt erst den Mapbox-Token) -- bewusst nicht awaited, blockiert den Rest der Initialisierung hier nicht
  updateCaughtCounter();
  // Energie regeneriert passiv mit echter Zeit — Anzeige alle 30s
  // auffrischen, damit man das Auffuellen auch bei offener App mitbekommt.
  setInterval(updateCaughtCounter, 30000);

  // Map-HUD
  document.getElementById("btn-avatar").addEventListener("click", openProfile);
  document.getElementById("btn-backpack").addEventListener("click", openItemsFromHud);

  // Aufgaben-Hinweis (erste Tutorial-Quest) — Button + Detail-Modal auf der
  // Karte, siehe grantReceiptItems() in js/bonscan.js fuer den Ausloeser.
  const questTrophy = TROPHIES.erster_schritt;
  const tierLabel = questTrophy.tier.charAt(0).toUpperCase() + questTrophy.tier.slice(1);
  document.getElementById("quest-modal-tier-pill").textContent = `${tierLabel}-Trophäe · ${questTrophy.name}`;
  document.getElementById("quest-modal-tier-pill").style.background = TROPHY_TIER_COLORS[questTrophy.tier];
  document.getElementById("quest-modal-xp").textContent = `+${formatNumber(questTrophy.xp)} XP`;
  const questRewardItem = ITEMS[questTrophy.itemKey];
  document.getElementById("quest-modal-item-icon").src = questRewardItem.icon;
  document.getElementById("quest-modal-item-name").textContent = questRewardItem.name;
  document.getElementById("quest-modal-item-rarity").innerHTML =
    `<span class="rarity-pill" style="background:${RARITY_COLORS[questRewardItem.rarity]}">${questRewardItem.rarity}</span>`;
  updateQuestButtonVisibility();
  document.getElementById("btn-quest").addEventListener("click", () => {
    document.getElementById("quest-modal").classList.remove("hidden");
  });
  document.getElementById("btn-quest-modal-close").addEventListener("click", () => {
    document.getElementById("quest-modal").classList.add("hidden");
  });

  // Fangszene — Tippen ist ueberall in der Szene erlaubt (nicht nur auf dem
  // Button), das fuehlt sich beim echten Fangen natuerlicher an. Der
  // Schliessen-Button (X) ist davon ausgenommen.
  document.getElementById("screen-catch").addEventListener("click", (e) => {
    if (e.target.closest(".btn-close") || e.target.closest("#btn-ar-toggle") || e.target.closest("#btn-use-ruhepulver")) return;
    handleFangenClick();
  });
  document.querySelector('#screen-catch [data-close]').addEventListener("click", closeCatchScene);
  document.getElementById("btn-ar-toggle").addEventListener("click", toggleArCamera);
  document.getElementById("btn-use-ruhepulver").addEventListener("click", useRuhepulver);
  document.getElementById("btn-catch-continue").addEventListener("click", () => {
    if (pendingTrophyEntries.length > 0) {
      const entries = pendingTrophyEntries;
      pendingTrophyEntries = [];
      showItemSuccessQueue(entries);
    } else {
      showScreen("screen-map");
    }
  });

  // Nachmal-Minigame
  const drawSvg = document.getElementById("draw-svg");
  drawSvg.addEventListener("pointerdown", onDrawStart);
  drawSvg.addEventListener("pointermove", onDrawMove);
  window.addEventListener("pointerup", onDrawEnd);
  document.querySelector('#screen-draw [data-close]').addEventListener("click", () => {
    drawState = null;
    showScreen("screen-map");
  });
  document.getElementById("chk-skip-minigame").addEventListener("change", (e) => {
    onSkipMinigameToggle(e.target.checked);
  });
  document.getElementById("btn-item-continue").addEventListener("click", () => {
    if (itemSuccessQueue.length > 0) {
      const next = itemSuccessQueue.shift();
      renderItemSuccess(next.entry, next.position, next.total);
    } else {
      showScreen("screen-map");
    }
  });

  // Profil-Hub: renderProfileHub() haengt Back/Tile/Scan-Handler bei jedem
  // Oeffnen selbst ein (siehe openProfile() in profile.js), da der Inhalt
  // jetzt dynamisch aus echten Komponenten gerendert wird.

  // Bon-Scan — beide Buttons oeffnen nur ein <input type="file">, siehe
  // js/bonscan.js. "Fotografieren" hat zusaetzlich capture="environment"
  // und oeffnet damit auf dem Handy direkt die native Kamera-App.
  document.querySelector('#screen-scan [data-close]').addEventListener("click", () => showScreen("screen-profile"));
  document.getElementById("btn-scan-capture").addEventListener("click", () => {
    document.getElementById("scan-camera-input").click();
  });
  document.getElementById("btn-scan-upload").addEventListener("click", () => {
    document.getElementById("scan-file-input").click();
  });
  document.getElementById("scan-camera-input").addEventListener("change", handleScanFileInput);
  document.getElementById("scan-file-input").addEventListener("change", handleScanFileInput);
  // Profil-Unterseiten (Outfit/Items/Trophäen/Loomas/Habitat/Einstellungen)
  // — eigene Vollbild-Screens, Zurück fuehrt immer zum Profil-Hub.
  document.querySelectorAll(".sub-back-btn").forEach((btn) => {
    btn.addEventListener("click", () => showScreen(subScreenReturnTo));
  });

  // Dev-Testknöpfe (siehe Spezifikation Abschnitt 8 — vor Kunden-Demo entfernen/verstecken)
  document.getElementById("btn-test-catch").addEventListener("click", () => {
    const key = randomChoice(SPAWNABLE_CREATURE_KEYS);
    openCatchSceneForCreature({ key, isTest: true });
  });
  document.getElementById("btn-test-item").addEventListener("click", () => {
    const location = randomChoice(STORE_LOCATIONS);
    openDrawSceneForStore(location.id);
  });
  // Simuliert einen echten Bon-Scan ueber denselben Code-Pfad wie ein
  // echtes Foto (matchReceiptText -> grantReceiptItems, siehe bonscan.js) —
  // kein Store/Artikel im Text erkennbar, greift also der Zufalls-Fallback
  // genau wie bei einem unbekannten Retailer. Damit laesst sich die erste
  // Tutorial-Quest/Trophaee ohne echten Papierbon testen.
  document.getElementById("btn-test-bonscan").addEventListener("click", () => {
    matchReceiptText("STOREWALK DEV TESTBON");
  });
});
