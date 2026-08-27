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
    trophyIcon.style.setProperty("--trophy-color", RARITY_COLORS[trophy.rarity]);
    document.getElementById("item-success-name").textContent = trophy.name;
    document.getElementById("item-success-rarity").innerHTML =
      `<span class="rarity-pill" style="background:${RARITY_COLORS[trophy.rarity]}">${trophy.rarity}-Trophäe</span>`;
    document.getElementById("item-success-store").textContent = "";
    document.getElementById("item-success-effect").textContent = trophy.description;
    // xpAwarded ist der tatsaechlich gutgeschriebene (evtl. per xp_boost
    // geboostete) Betrag, siehe addXp()/claimTrophy() in js/state.js --
    // Fallback auf trophy.xp nur fuer den theoretischen Fall, dass ein
    // Aufrufer das Feld nicht mitgibt.
    document.getElementById("item-success-xp").textContent = `+${formatNumber(entry.xpAwarded ?? trophy.xp)} XP`;
    return;
  }

  // Reine Bestaetigung ohne Item/Muenzen/Trophaee -- z.B. wenn ein Bon-Scan
  // keinen bei einem Store hinterlegten Artikel trifft (siehe
  // grantReceiptItems() in js/bonscan.js: seit dem Wegfall des Zufalls-
  // Bonuspakets der einzige verbleibende "leere" Erfolgsfall).
  if (entry.type === "info") {
    document.getElementById("item-success-banner").textContent = "🧾 Bon erfasst";
    img.classList.add("hidden");
    trophyIcon.classList.add("hidden");
    coinsIcon.classList.add("hidden");
    document.getElementById("item-success-name").textContent = entry.title || "";
    document.getElementById("item-success-rarity").textContent = "";
    document.getElementById("item-success-store").textContent = entry.storeText || "";
    document.getElementById("item-success-effect").textContent = entry.message || "";
    document.getElementById("item-success-xp").textContent = "";
    return;
  }

  // Muenzen sind bewusst KEIN Inventar-Item (siehe addCoins() in state.js) —
  // eigener Zweig statt einer ITEMS-Karte, Bestand bleibt im Profil-Hero
  // sichtbar (siehe .profile-hero-coins in js/profile.js) statt im
  // Rucksack.
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
  // xpAwarded ist der tatsaechlich gutgeschriebene (evtl. geboostete) Betrag,
  // siehe addXp() in js/state.js -- der ??-Fallback greift nur, falls ein
  // Aufrufer das Feld ausnahmsweise nicht mitgibt.
  document.getElementById("item-success-xp").textContent = `+${entry.xpAwarded ?? item.xp * count} XP`;
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

// Start-Begleiter-Auswahl (siehe Rundenbasiertes-Fangsystem-Briefing,
// User-Entscheidung: Auswahl aus 3 Gewoehnlich-Loomas statt automatischer
// Zuweisung) -- nur relevant, solange wirklich noch NICHTS gefangen wurde
// (totalCaughtCount() aus js/state.js), sonst bleibt screen-map wie gehabt
// die Startansicht.
function initStarterPickIfNeeded() {
  if (totalCaughtCount() > 0) return;
  const list = document.getElementById("starter-pick-list");
  list.innerHTML = STARTER_CREATURE_KEYS.map((key) => {
    const creature = CREATURES[key];
    return `<button class="starter-pick-card" data-starter-key="${key}">
      <img src="${creature.icon}" alt="${creature.name}" />
      <span class="starter-pick-card-name">${creature.name}</span>
      <span class="starter-pick-card-element">${creature.elementIcon} ${creature.element}</span>
    </button>`;
  }).join("");
  list.querySelectorAll("[data-starter-key]").forEach((btn) => {
    btn.addEventListener("click", () => {
      chooseStarterCreature(btn.dataset.starterKey);
      showScreen("screen-map");
    });
  });
  showScreen("screen-starter-pick");
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

const DEV_TOOLS_STORAGE_KEY = "loomonia_dev_tools";

function initDevTools() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("dev") === "1") localStorage.setItem(DEV_TOOLS_STORAGE_KEY, "1");
  if (params.get("dev") === "0") localStorage.removeItem(DEV_TOOLS_STORAGE_KEY);
  const enabled = localStorage.getItem(DEV_TOOLS_STORAGE_KEY) === "1";
  // Testfang/Testitem sind aktuell wieder absichtlich IMMER sichtbar
  // (User-Wunsch 2026-08-26, siehe index.html-Kommentar bei den Buttons) --
  // nur der Bon-Scan-Test bleibt hinter dem Dev-Flag. Sobald Testfang/
  // Testitem wieder "hidden" im Markup bekommen, hier den Selector auf
  // ".dev-btn" zurueckstellen, um wieder alle drei gemeinsam zu steuern.
  document.getElementById("btn-test-bonscan").classList.toggle("hidden", !enabled);
  document.getElementById("btn-test-sprachbuch").classList.toggle("hidden", !enabled);
}

document.addEventListener("DOMContentLoaded", () => {
  initStarterPickIfNeeded();
  initMapWithRetry(); // async (holt erst den Mapbox-Token) -- bewusst nicht awaited, blockiert den Rest der Initialisierung hier nicht; wiederholt bei Fehlschlag automatisch, siehe js/map.js
  // Rechnet einen evtl. seit dem letzten Schliessen angesammelten Rested-XP-
  // Bonus ab (siehe Habitat-Briefing + settleRestedXp() in js/state.js) --
  // muss vor jeder XP-Vergabe in dieser Session gelaufen sein.
  settleRestedXp();
  // "Sitzungsende" heisst hier: die Seite wird verlassen/versteckt (Tab
  // gewechselt, App in den Hintergrund, Browser/Tab geschlossen) -- pagehide
  // ist der zuverlaessigste Zeitpunkt dafuer (anders als beforeunload nicht
  // vom Back-Forward-Cache betroffen), visibilitychange faengt zusaetzlich
  // das Zurueckwechseln in den Hintergrund auf mobilen Browsern ab, wo
  // pagehide nicht immer zuverlaessig feuert.
  window.addEventListener("pagehide", markSessionEnded);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      markSessionEnded();
    } else {
      // Rechnet einen waehrend des Hintergrunds angesammelten Rested-XP-
      // Bonus sofort ab, sobald die Seite wieder sichtbar wird -- ohne das
      // lief settleRestedXp() nur einmal beim allerersten DOMContentLoaded,
      // ein Tab-Wechsel/App-Hintergrund OHNE vollstaendigen Reload (auf
      // Mobilgeraeten der Normalfall) liess den naechsten "hidden"-Zeitpunkt
      // den noch unverbrauchten sessionEndedAt-Zeitstempel einfach ueber-
      // schreiben, wodurch der ganze Hintergrund-Zeitraum verloren ging
      // (QA-Bug-Liste). settleRestedXp() ist ueber gameState.sessionEndedAt
      // idempotent, ein zusaetzlicher Aufruf hier ist also gefahrlos.
      settleRestedXp();
    }
  });
  updateCaughtCounter();
  // Energie regeneriert passiv mit echter Zeit — Anzeige alle 30s
  // auffrischen, damit man das Auffuellen auch bei offener App mitbekommt.
  setInterval(updateCaughtCounter, 30000);
  // Aktive Boost-Effekte (siehe gameState.activeEffects in js/state.js)
  // brauchen einen deutlich engeren Takt als die Energie-Anzeige, sonst
  // wirkt der Live-Countdown im Map-HUD eingefroren (siehe
  // updateActiveBoostsHud() in js/map.js). tickFrischedeoSpawn() (siehe
  // js/map.js) nutzt denselben Takt fuer ihren 45s-Nahspawn-Rhythmus.
  setInterval(updateActiveBoostsHud, 1000);
  setInterval(tickFrischedeoSpawn, 1000);
  setInterval(tickSpawnPopulation, 1000);

  // Map-HUD
  document.getElementById("btn-avatar").addEventListener("click", openProfile);
  document.getElementById("btn-backpack").addEventListener("click", openItemsFromHud);
  updateHudAvatarImage();
  // Bon-Scan-Einstieg, umgezogen aus dem Profil-Hub auf die Karte (siehe
  // Hero-Bild-Briefing) -- statische Markup in index.html statt bei jedem
  // Profil-Oeffnen neu gerendert, daher hier einmalig gebunden.
  document.getElementById("hotspot-scan").addEventListener("click", openScanScreen);

  // Avatar-Onboarding-Dialog (Gamer-Name + Geschlecht, siehe js/profile.js) --
  // statisches Markup, daher ebenfalls nur einmal gebunden.
  initOnboardingModal();

  // Sortier-Umschalter im Items-Screen-Topbar (siehe toggleItemsSort() in
  // js/profile.js) -- statisches Markup, daher nur einmal gebunden statt bei
  // jedem renderItemsGrid()-Aufruf neu.
  document.getElementById("btn-items-sort").addEventListener("click", toggleItemsSort);

  // Aufgaben-Hinweis (erste Tutorial-Quest) — Button + Detail-Modal auf der
  // Karte, siehe grantReceiptItems() in js/bonscan.js fuer den Ausloeser.
  const questTrophy = TROPHIES.erster_schritt;
  document.getElementById("quest-modal-tier-pill").textContent = `${questTrophy.rarity}-Trophäe · ${questTrophy.name}`;
  document.getElementById("quest-modal-tier-pill").style.background = RARITY_COLORS[questTrophy.rarity];
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
  document.getElementById("btn-language-levelup-close").addEventListener("click", () => {
    document.getElementById("language-levelup-modal").classList.add("hidden");
  });

  // Fangszene — Druecken/Loslassen ist ueberall in der Szene erlaubt (nicht
  // nur auf einem Button), das fuehlt sich beim Halten/Wischen natuerlicher
  // an. Pointerdown/-up statt click, weil der Angriff ein echtes "gedrueckt
  // halten" braucht (siehe onCatchPointerDown() in js/catchgame.js) -- ein
  // simples click-Event feuert erst NACH dem Loslassen und koennte das nicht
  // abbilden. Schliessen-Button/AR-Toggle/Item-Buttons sind ausgenommen.
  const catchInteractionBlocked = (e) =>
    e.target.closest(".btn-close") ||
    e.target.closest("#btn-ar-toggle") ||
    e.target.closest("#btn-use-fokuszeit") ||
    e.target.closest("#btn-open-heal-picker") ||
    e.target.closest("#heal-picker");
  document.getElementById("screen-catch").addEventListener("pointerdown", (e) => {
    if (catchInteractionBlocked(e)) return;
    onCatchPointerDown(e);
  });
  document.getElementById("screen-catch").addEventListener("pointerup", (e) => {
    if (catchInteractionBlocked(e)) return;
    onCatchPointerUp(e);
  });
  // Sicherheitsnetz: wird der Angriffs-Ring gedrueckt gehalten und der
  // Pointer dann auf einen der oben ausgenommenen Buttons (Heilung/
  // Fokuszeit/AR/Schliessen) oder ganz aus der Fangszene heraus gezogen,
  // greift der obige Handler nicht (catchInteractionBlocked/anderes
  // Ziel-Element) -- der Ring bliebe sonst bis zum naechsten unbeteiligten
  // Tap gedrueckt (QA-Bug-Liste). Fenster-weiter Fallback, der NUR eingreift,
  // wenn tatsaechlich noch gehalten wird (kein Doppel-Ausloesen, siehe
  // onCatchPointerUp()'s eigener holding-Check).
  window.addEventListener("pointerup", () => {
    if (catchState && catchState.holding) onCatchPointerUp();
  });
  // Laenger Gedrueckthalten beim Angriff (siehe onCatchPointerDown()) loeste
  // auf Android Chrome sonst das native "Bild speichern"-Kontextmenue aus,
  // obwohl die CSS-Touch-Callout-Regeln (siehe .catch-stage in
  // css/style.css) das auf iOS Safari bereits verhindern -- Android
  // braucht zusaetzlich dieses preventDefault() auf dem contextmenu-Event.
  document.getElementById("screen-catch").addEventListener("contextmenu", (e) => e.preventDefault());
  document.querySelector('#screen-catch [data-close]').addEventListener("click", closeCatchScene);
  document.getElementById("btn-ar-toggle").addEventListener("click", toggleArCamera);
  document.getElementById("btn-use-fokuszeit").addEventListener("click", useFokuszeit);
  document.getElementById("btn-open-heal-picker").addEventListener("click", openHealPicker);
  document.getElementById("btn-heal-picker-close").addEventListener("click", closeHealPicker);
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

  // Profil-Hub: attachProfileHubHandlers() haengt Back/Tile-Handler bei
  // jedem Oeffnen selbst ein (siehe openProfile() in profile.js), da der
  // Inhalt jetzt dynamisch aus echten Komponenten gerendert wird.

  // Bon-Scan — beide Buttons oeffnen nur ein <input type="file">, siehe
  // js/bonscan.js. "Fotografieren" hat zusaetzlich capture="environment"
  // und oeffnet damit auf dem Handy direkt die native Kamera-App.
  document.querySelector('#screen-scan [data-close]').addEventListener("click", closeScanScreen);
  document.getElementById("btn-scan-capture").addEventListener("click", () => {
    document.getElementById("scan-camera-input").click();
  });
  document.getElementById("btn-scan-upload").addEventListener("click", () => {
    document.getElementById("scan-file-input").click();
  });
  document.getElementById("scan-camera-input").addEventListener("change", handleScanFileInput);
  document.getElementById("scan-file-input").addEventListener("change", handleScanFileInput);
  document.getElementById("btn-scan-copy-text").addEventListener("click", copyBonOcrText);
  // Profil-Unterseiten (Outfit/Items/Trophäen/Loomas/Habitat/Einstellungen)
  // — eigene Vollbild-Screens. Zurueck zum Profil-HUB rendert es bewusst
  // ueber openProfile() neu statt nur showScreen() aufzurufen -- sonst
  // blieben die Kachel-Subtexte (z.B. Habitat-Kachel "😴 Ausgeruht"/Name des
  // aktiven Begleiters) auf dem Stand von vor dem Betreten der Unterseite
  // stehen, wenn sich dort etwas geaendert hat (z.B. Begleiter im
  // Loomas-Screen gewechselt, siehe User-Feedback: "steht noch das Looma
  // meines ersten Begleiters in der Übersicht"). Der Rueckweg von der Karte
  // aus (openItemsFromHud(), subScreenReturnTo = "screen-map") braucht das
  // nicht, dort bleibt es beim einfachen showScreen().
  document.querySelectorAll(".sub-back-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (subScreenReturnTo === "screen-profile") {
        openProfile();
      } else if (subScreenReturnTo === "screen-habitat") {
        // Dieselbe Frisch-Rendern-Notwendigkeit wie bei "screen-profile"
        // oben: kommt man ueber das Habitat-Fenster in die Looma-Detailkarte
        // (siehe attachHabitatHandlers() in js/profile.js) und levelt dort
        // z.B. auf, muss das Habitat-Fenster beim Zurueckgehen die neuen
        // Werte zeigen statt des Stands von vor dem Level-Aufstieg.
        document.getElementById("habitat-content").innerHTML = renderHabitatContent();
        attachHabitatHandlers();
        showScreen("screen-habitat");
        // subScreenReturnTo zeigte bis eben auf "screen-habitat" (die gerade
        // erreichte Ebene selbst) -- ohne diese Wiederherstellung wuerde der
        // NAECHSTE Rueckweg-Klick erneut hierher statt weiter nach oben
        // fuehren (siehe habitatBackTarget-Kommentar in js/profile.js).
        subScreenReturnTo = habitatBackTarget;
      } else if (subScreenReturnTo === "screen-loomas") {
        showScreen("screen-loomas");
        subScreenReturnTo = loomasBackTarget;
      } else {
        showScreen(subScreenReturnTo);
      }
    });
  });

  // Dev-Testknöpfe (siehe Spezifikation Abschnitt 8 — vor Kunden-Demo
  // entfernen/verstecken): bisher fuer JEDEN Besucher der Live-Seite
  // sichtbar/klickbar (siehe QA-Bug-Liste). "?dev=1" in der URL schaltet sie
  // frei und merkt das dauerhaft per localStorage auf diesem Geraet (kein
  // erneutes Anhaengen des Parameters bei jedem Aufruf noetig) -- "?dev=0"
  // schaltet sie explizit wieder aus (z.B. auf einem geteilten Geraet nach
  // einer Demo).
  initDevTools();
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
  // Dev: je 1 Sprachbuch pro Farbe ins Inventar (Debug-Weg laut
  // Spracherwerb-Briefing) -- danach im Items-Screen ueber "Verwenden"
  // testbar.
  document.getElementById("btn-test-sprachbuch").addEventListener("click", () => {
    ["sprachbuch", "sprachbuch_gruen", "sprachbuch_blau"].forEach((key) => addItem(key));
    showToast("✅ Dev: je 1 Sprachbuch (Rookie/Skilled/Pro) erhalten");
    updateCaughtCounter();
  });
});
