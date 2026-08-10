// Verdrahtung aller Screens und Events

// Zeigt eine oder mehrere Item-Erfolgsmeldungen nacheinander auf demselben
// Screen (z.B. wenn ein Bon-Scan mehrere unterschiedliche Artikel erkennt).
// entries: [{ itemKey, storeText }]
let itemSuccessQueue = [];

function renderItemSuccess(entry, position, total) {
  const item = ITEMS[entry.itemKey];
  const count = entry.count || 1;
  document.getElementById("item-success-img").src = item.icon;
  document.getElementById("item-success-name").textContent = count > 1 ? `${item.name} ×${count}` : item.name;
  document.getElementById("item-success-rarity").innerHTML =
    `<span class="rarity-pill" style="background:${RARITY_COLORS[item.rarity]}">${item.rarity}</span>`;
  document.getElementById("item-success-store").textContent = entry.storeText;
  document.getElementById("item-success-effect").textContent = item.effect;
  document.getElementById("item-success-xp").textContent = `+${item.xp * count} XP`;
  const progressEl = document.getElementById("item-success-progress");
  progressEl.textContent = total > 1 ? `Artikel ${position} von ${total}` : "";
  progressEl.classList.toggle("hidden", total <= 1);
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
  initMap();
  updateCaughtCounter();

  // Map-HUD
  document.getElementById("btn-avatar").addEventListener("click", openProfile);

  // Fangszene — Tippen ist ueberall in der Szene erlaubt (nicht nur auf dem
  // Button), das fuehlt sich beim echten Fangen natuerlicher an. Der
  // Schliessen-Button (X) ist davon ausgenommen.
  document.getElementById("screen-catch").addEventListener("click", (e) => {
    if (e.target.closest(".btn-close") || e.target.closest("#btn-ar-toggle")) return;
    handleFangenClick();
  });
  document.querySelector('#screen-catch [data-close]').addEventListener("click", closeCatchScene);
  document.getElementById("btn-ar-toggle").addEventListener("click", toggleArCamera);
  document.getElementById("btn-catch-continue").addEventListener("click", () => showScreen("screen-map"));

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

  // Profil-Hub (eine Grafik + unsichtbare Hotspots, siehe profile.js)
  document.getElementById("hotspot-profile-back").addEventListener("click", () => showScreen("screen-map"));
  document.querySelectorAll(".profile-hotspot[data-tile]").forEach((tile) => {
    tile.addEventListener("click", () => openSubScreen(tile.dataset.tile));
  });
  document.getElementById("hotspot-scan").addEventListener("click", openScanScreen);

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
    btn.addEventListener("click", () => showScreen("screen-profile"));
  });

  // Dev-Testknöpfe (siehe Spezifikation Abschnitt 8 — vor Kunden-Demo entfernen/verstecken)
  document.getElementById("btn-test-catch").addEventListener("click", () => {
    const key = randomChoice(Object.keys(CREATURES));
    openCatchSceneForCreature({ key, isTest: true });
  });
  document.getElementById("btn-test-item").addEventListener("click", () => {
    const location = randomChoice(STORE_LOCATIONS);
    openDrawSceneForStore(location.id);
  });
});
