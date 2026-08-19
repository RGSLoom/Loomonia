// Datenmodell aus store-walk-spielspezifikation.md

const CATCH_RADIUS_M = 45;
const STORE_OFFSET_RADIUS_M = 190;
const CREATURE_STORE_SPAWN_RADIUS_M = 65;
const CREATURE_FREE_SPAWN_RADIUS_M = 180;
const CREATURE_STORE_SPAWN_WEIGHT = 0.68;
const CREATURE_RESPAWN_MIN_MS = 3500;
const CREATURE_RESPAWN_MAX_MS = 6000;
const MAX_ACTIVE_CREATURES = 4;

// ============ Einstiegs-Spawn-Boost ============
// Direkt nach dem ersten GPS-Fix (siehe onFirstFix() in map.js) gab es zu
// wenige Wesen in unmittelbarer Naehe -- schlechter erster Eindruck, kaum
// sofortige Fangmoeglichkeiten. Fuer die ersten Minuten JEDER Session (nicht
// nur beim allerersten App-Start ueberhaupt) laufen deshalb mehr aktive
// Wesen, in einem groesseren Radius und mit kuerzerem Respawn -- danach
// automatisch zurueck auf die regulaeren Werte oben, betrifft also nur den
// Einstieg, nicht die dauerhafte Spielbalance. Siehe isSpawnBoostActive()
// in map.js.
const SPAWN_BOOST_DURATION_MS = 3 * 60 * 1000;
const SPAWN_BOOST_MAX_ACTIVE_CREATURES = 8;
const SPAWN_BOOST_STORE_SPAWN_RADIUS_M = 90;
const SPAWN_BOOST_FREE_SPAWN_RADIUS_M = 260;
const SPAWN_BOOST_RESPAWN_MIN_MS = 1200;
const SPAWN_BOOST_RESPAWN_MAX_MS = 2500;

const BAR_CONFIG = {
  durationMs: 1050,
  greenHalfWidth: 10,
  yellowHalfWidth: 25,
};

// Seltenere Wesen sind schwerer zu fangen: die Markierung laeuft schneller
// ueber die Leiste (kuerzere durationMs = weniger Reaktionszeit pro
// Durchlauf). Gewoehnlich bleibt beim bisherigen Tempo, Ungewoehnlich ist
// etwas schneller, Selten deutlich schneller.
const BAR_DURATION_MS_BY_RARITY = {
  "Gewöhnlich": BAR_CONFIG.durationMs,
  "Ungewöhnlich": 820,
  "Selten": 620,
};

// Fokuszeit (siehe ITEMS.fokuszeit): verlangsamt die Fangleiste fuer den
// Rest der aktuellen Fangbegegnung um diesen Faktor (>1 = langsamer = mehr
// Reaktionszeit), siehe useFokuszeit() in js/catchgame.js.
const FOKUSZEIT_SLOWDOWN_FACTOR = 1.6;

const DRAW_CONFIG = {
  viewBox: 220,
  toleranceRadius: 32,
  successThreshold: 0.42,
  shapes: ["kreis", "welle", "zickzack", "dreieck", "quadrat"],
};

// Eintausch-Kurs: gefangene Wesen -> Schatten-Essenz (Loomas-Screen).
const SHADOW_ESSENCE_PER_CREATURE = 1000;

// ============ Energie ============
// Kostet einmal pro Fang-Begegnung Energie (beim Oeffnen der Fangszene,
// siehe openCatchSceneForCreature() in js/catchgame.js) — bewusst NICHT pro
// einzelnem Tipp-Versuch, sonst waere der Verbrauch je nach 1 oder 2
// gebrauchten Versuchen uneinheitlich (5 oder 10 statt immer gleich).
// Regeneriert sich passiv mit echter vergangener Zeit — auch waehrend die
// App geschlossen ist (siehe settleEnergy() in js/state.js). 2 Min/Punkt =
// volle Leiste in ca. 3h20min, leicht in ENERGY_REGEN_MS_PER_POINT anpassbar.
const ENERGY_MAX = 100;
const ENERGY_PER_CATCH = 3;
const ENERGY_REGEN_MS_PER_POINT = 2 * 60 * 1000;

// ============ Levelsystem ============
// Level 50 ist der Pilot-Cap (spaeter erweiterbar), erreicht bei 10 Mio.
// Lebenszeit-XP. Kubische Kurve statt linear: fruehe Level gehen schnell,
// die letzten Level sind absichtlich sehr grindy (Endgame-Ziel, kein
// Nebenbei-Fortschritt). gameState.xp ist immer schon eine reine
// Lebenszeit-Summe — bestehende Spielstaende brauchen keine Migration,
// nur die Ableitung Level<->XP aendert sich mit dieser Kurve.
const LEVEL_CAP = 50;
const MAX_LEVEL_XP = 10000000;
const LEVEL_CURVE_EXPONENT = 3;
const LEVEL_CURVE_K = MAX_LEVEL_XP / Math.pow(LEVEL_CAP - 1, LEVEL_CURVE_EXPONENT);

// Kumulierte XP-Schwelle, um `level` zu erreichen (Level 1 = 0 XP).
function xpForLevel(level) {
  if (level <= 1) return 0;
  if (level >= LEVEL_CAP) return MAX_LEVEL_XP;
  return Math.round(LEVEL_CURVE_K * Math.pow(level - 1, LEVEL_CURVE_EXPONENT));
}

// Aktuelles Level aus der Lebenszeit-XP ableiten (Cap bei LEVEL_CAP).
function xpToLevel(xp) {
  let level = 1;
  while (level < LEVEL_CAP && xp >= xpForLevel(level + 1)) {
    level++;
  }
  return level;
}

const RARITY_COLORS = {
  // War vorher ein Tuerkis-Ton (#5eead4), der neben Ungewoehnlich-Gruen kaum
  // zu unterscheiden war -- jetzt echtes Weiss/Grau wie in der Spielspezifikation.
  "Gewöhnlich": "#d1d5db",
  "Ungewöhnlich": "#4ade80",
  "Selten": "#60a5fa",
  "Episch": "#c084fc",
  "Legendär": "#fbbf24",
};

// ============ Trophaeen ============
// Referenzliste siehe store-walk-spielspezifikation.md Abschnitt 7. Fuer den
// Prototyp ist bislang nur "Erster Schritt" spielbar umgesetzt — sie wird
// automatisch ueber den allerersten erfolgreichen Bon-Scan freigeschaltet
// (siehe grantReceiptItems() in js/bonscan.js) und ist zugleich die
// Belohnung der ersten Tutorial-Quest ("Gehe in einen Laden und kaufe einen
// Gegenstand"). Die 2.500-XP-Belohnung hier ersetzt bewusst den in der
// Spezifikation urspruenglich notierten "+2% Bonus auf Drops"-Text.
const TROPHY_TIER_COLORS = {
  bronze: "#cd7f32",
  silber: "#c9d3e0",
  gold: "#fbbf24",
};

// Gemeinsames Trophaeen-Icon (Pokal) fuer Profil-Kachel, Trophaeen-Screen
// und Quest-Hinweis — ein Pfad statt an mehreren Stellen dupliziert.
const TROPHY_ICON_PATH =
  '<path d="M8 21h8M12 17v4M6 4h12v3a6 6 0 0 1-12 0V4Z"/><path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3"/>';

const TROPHIES = {
  erster_schritt: {
    key: "erster_schritt",
    name: "Erster Schritt",
    tier: "bronze",
    description: "Für deinen ersten Einkauf bei einem teilnehmenden Retail-Partner.",
    xp: 2500,
    // Exklusive Item-Belohnung: das einzige Legendaer-Item ("armband"), das
    // bislang keinem Store-/Bon-Item-Pool zugeordnet ist — dadurch nur ueber
    // diese Trophaee erreichbar statt zufaellig ueber normale Drops.
    itemKey: "armband",
  },
  wesen_entdecker: {
    key: "wesen_entdecker",
    name: "Wesen-Entdecker",
    tier: "bronze",
    description: "Fange 5 gewöhnliche Loomas.",
    xp: 800,
    // 3 zufaellige Ungewoehnlich-Items statt eines festen (nur 2 Items
    // dieser Seltenheit existieren, siehe ITEMS) — Dopplungen sind ok und
    // werden beim Verleihen zu einem Stapel zusammengefasst, siehe
    // claimTrophy() in js/state.js.
    randomItemPool: ["energiesnack", "gesundheitspaket"],
    randomItemCount: 3,
  },
  treuer_shopper: {
    key: "treuer_shopper",
    name: "Treuer Shopper",
    tier: "silber",
    description: "Schließe 5 bestätigte Käufe ab.",
    xp: 1500,
    // Episch/Legendaer sind laut Spielspezifikation keine Zufalls-Drops aus
    // Stores (siehe Kommentar bei ITEMS unten) — hoodie ist deshalb bislang
    // keinem Store-/Bon-Pool zugeordnet und nur ueber diese Trophaee
    // erreichbar.
    itemKey: "hoodie",
  },
  seltene_beute: {
    key: "seltene_beute",
    name: "Seltene Beute",
    tier: "gold",
    description: "Fange 10 seltene Loomas.",
    xp: 3000,
    // Ebenfalls bislang keinem Store-/Bon-Pool zugeordnet, siehe oben.
    itemKey: "lockduftflakon",
  },
};

const CREATURES = {
  fauli: {
    key: "fauli",
    name: "Fauli",
    element: "Natur",
    elementIcon: "🌿",
    color: "#4ade80",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/wesen/Fauli_icon.png",
    // Vereinheitlicht mit den anderen Wesen: generischer (jetzt echter
    // Foto-)Hintergrund statt Sonderfall mit eingebranntem Wesen — das
    // freigestellte Icon liegt jetzt bei allen fuenf als Vordergrund
    // drauf (sceneIsRealPhoto ueberall false).
    scene: "assets/generated/bg_fauli_real.jpg",
    sceneIsRealPhoto: false,
  },
  fifu: {
    key: "fifu",
    name: "Fifu",
    element: "Feuer",
    elementIcon: "🔥",
    color: "#fb923c",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/wesen/Fifu_icon.png",
    scene: "assets/generated/bg_fifu_real.jpg",
    sceneIsRealPhoto: false,
  },
  enari: {
    key: "enari",
    name: "Enari",
    element: "Luft",
    elementIcon: "💨",
    color: "#93c5fd",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/wesen/Enari_icon.png",
    scene: "assets/generated/bg_enari_real.webp",
    sceneIsRealPhoto: false,
  },
  nami: {
    key: "nami",
    name: "Nami",
    element: "Wasser",
    elementIcon: "💧",
    color: "#c084fc",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/wesen/Nami_icon.png",
    scene: "assets/generated/bg_nami_real.jpg",
    sceneIsRealPhoto: false,
  },
  wollypig: {
    key: "wollypig",
    name: "Wolly Pig",
    element: "Erde",
    elementIcon: "🌍",
    color: "#d4a574",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/generated/icon_wollypig.png",
    // Im Gegensatz zu den anderen Icons bereits echt freigestellt
    // (Alphakanal vorhanden) — Laufzeit-Weissabgleich (getCutoutImage)
    // wuerde hier nur helle Fellstellen kaputt-loechern, siehe map.js.
    iconAlreadyTransparent: true,
    scene: "assets/generated/bg_wollypig_real.jpg",
    sceneIsRealPhoto: false,
  },
  perlina: {
    key: "perlina",
    name: "Perlina",
    element: "Wasser",
    elementIcon: "💧",
    color: "#38bdf8",
    rarity: "Ungewöhnlich",
    xp: 300,
    icon: "assets/wesen/Perlina_icon.png",
    scene: "assets/generated/bg_nami_real.jpg",
    sceneIsRealPhoto: false,
  },
  duskan: {
    key: "duskan",
    name: "Duskan",
    element: "Schatten",
    elementIcon: "🌑",
    color: "#7c3aed",
    rarity: "Selten",
    xp: 450,
    icon: "assets/wesen/Duskan_icon.png",
    scene: "assets/hintergrund/Schattenreich.png",
    sceneIsRealPhoto: false,
  },
  duskan_shiny: {
    key: "duskan_shiny",
    name: "Duskan ✨ Shiny",
    element: "Schatten",
    elementIcon: "🌑",
    color: "#38bdf8",
    rarity: "Episch",
    xp: 1000,
    icon: "assets/wesen/Duskan_shiny.png",
    scene: "assets/hintergrund/Schattenreich.png",
    sceneIsRealPhoto: false,
    // Erscheint nie als eigener Spawn auf der Karte/im Dev-Testmenü (siehe
    // SPAWNABLE_CREATURE_KEYS) und wird in der Fangszene selbst nicht
    // angezeigt — die Fangszene laeuft komplett als normaler Duskan ab.
    // Der Shiny-Wechsel entscheidet sich per Zufall erst bei Fangerfolg
    // (siehe SHINY_VARIANTS + onCatchSuccess in catchgame.js) und wird
    // erst auf dem Erfolgsscreen enthuellt.
    isSecret: true,
  },
  ashira: {
    key: "ashira",
    name: "Ashira",
    element: "Licht",
    elementIcon: "✨",
    color: "#fbbf24",
    rarity: "Selten",
    xp: 450,
    icon: "assets/wesen/Ashira.png",
    scene: "assets/hintergrund/Lichtreich.png",
    sceneIsRealPhoto: false,
  },
  moosilda: {
    key: "moosilda",
    name: "Moosilda",
    element: "Erde",
    elementIcon: "🌍",
    color: "#a3833c",
    rarity: "Ungewöhnlich",
    xp: 300,
    icon: "assets/wesen/moosilda_icon.png",
    // Neues Bild hat schon einen echten Alphakanal (anders als die
    // urspruenglichen Icons) — Laufzeit-Weissabgleich wuerde helle
    // Fellstellen kaputt-loechern, siehe wollypig-Kommentar oben.
    iconAlreadyTransparent: true,
    scene: "assets/hintergrund/Wiesenlandschaft.png",
    sceneIsRealPhoto: false,
  },
  lavaris: {
    key: "lavaris",
    name: "Lavaris",
    element: "Feuer",
    elementIcon: "🔥",
    color: "#ef4444",
    rarity: "Selten",
    xp: 450,
    icon: "assets/wesen/lavaris_icon.png",
    // Ebenfalls schon echt freigestellt, siehe moosilda-Kommentar oben.
    iconAlreadyTransparent: true,
    scene: "assets/hintergrund/Vulkan.png",
    sceneIsRealPhoto: false,
  },
  winnalie: {
    key: "winnalie",
    name: "Winnalie",
    element: "Luft",
    elementIcon: "💨",
    color: "#bae6fd",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/wesen/winnalie_icon.png",
    scene: "assets/hintergrund/Himmel.webp",
    sceneIsRealPhoto: false,
  },
};

// Spawn-/Testpool: alle Wesen ausser geheimen Shiny-Varianten (die duerfen
// nie als eigener Marker auf der Karte oder im Dev-Testmenue auftauchen,
// siehe map.js/main.js).
const SPAWNABLE_CREATURE_KEYS = Object.keys(CREATURES).filter((k) => !CREATURES[k].isSecret);

// Basis-Wesen-Schluessel -> Shiny-Variante + Drop-Chance (0..1), geprueft
// bei Fangerfolg in onCatchSuccess (catchgame.js). Bewusst sehr selten.
const SHINY_VARIANTS = {
  duskan: { key: "duskan_shiny", chance: 0.02 },
};

const ITEMS = {
  // `type`/`unlockText` ergaenzt, seit die dedizierten `card`-Kartenfotos
  // dieser 9 Bestandsitems entfernt wurden (siehe Commit-Historie) — ohne
  // `card` rendert profile.js jetzt die synthetische Detailkarte, die vorher
  // (mit `card` gesetzt) nie erreichbar war und sonst den hartkodierten
  // Kauf-Hinweistext auch fuer Trophaeen-/Standort-Items gezeigt haette.
  fruchtkorb: {
    key: "fruchtkorb",
    name: "Fruchtkorb der Energie",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/fruchtkorb_icon.png",
    type: "Verbrauchbar",
    effect: "+25 % XP-Boost für 30 Minuten",
    unlockText: "Kostenloser Drop an Standorten",
  },
  sprachbuch: {
    key: "sprachbuch",
    name: "Sprachbuch",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/sprachbuch_icon.png",
    type: "Verbrauchbar",
    effect: "+5 % Punkte in menschlicher Sprache",
    unlockText: "Kostenloser Drop an Standorten",
  },
  energiesnack: {
    key: "energiesnack",
    name: "Energiesnack",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/energiesnack_icon.png",
    type: "Verbrauchbar",
    effect: "+50 % Energie wiederherstellen",
    unlockText: "Kostenloser Drop an Standorten",
  },
  gesundheitspaket: {
    key: "gesundheitspaket",
    name: "Gesundheits-Paket",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/gesundheitspaket_icon.png",
    type: "Anlegbar",
    effect: "+25 % XP beim Anlegen",
    unlockText: "Kostenloser Drop an Standorten",
  },
  sneaker: {
    key: "sneaker",
    name: "Stylische Sneaker",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/stylische-sneaker_icon.png",
    type: "Anlegbar",
    effect: "+5 % Fangchance beim Anlegen",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  rucksack: {
    key: "rucksack",
    name: "Abenteuerrucksack",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/abenteuerrucksack_icon.png",
    type: "Anlegbar",
    effect: "+5 Inventarplätze",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  hoodie: {
    key: "hoodie",
    name: "Epischer Hoodie",
    rarity: "Episch",
    xp: 120,
    icon: "assets/items/epischer-hoodie_icon.png",
    type: "Anlegbar",
    effect: "+25 % Fangchance beim Anlegen",
    unlockText: "Exklusive Belohnung einer bestimmten Trophäe",
  },
  armband: {
    key: "armband",
    name: "Energie-Armband",
    rarity: "Legendär",
    xp: 200,
    icon: "assets/items/energiearmband_icon.png",
    type: "Anlegbar",
    effect: "+50 % XP beim Anlegen",
    unlockText: "Exklusive Belohnung einer bestimmten Trophäe",
  },
  lockduftflakon: {
    key: "lockduftflakon",
    name: "Lockduft-Flakon",
    rarity: "Episch",
    xp: 120,
    icon: "assets/items/lockduft-flakon_icon.png",
    type: "Verbrauchbar",
    effect: "Läuft 7 Tage lang, lockt mehr Loomas an",
    unlockText: "Exklusive Belohnung einer bestimmten Trophäe",
  },

  // ============ Item-Briefing (18 neue Items) ============
  // Ab hier die 18 im Item-Briefing definierten neuen Items. Feldbedeutung
  // (gilt inzwischen auch fuer die 9 Bestandsitems oben, siehe Kommentar dort):
  //   type        "Verbrauchbar" | "Anlegbar"
  //   unlockType  "standort" (kostenloser Drop, Zeichen-Minispiel) |
  //               "kauf" (nur per Bon-Scan/echtem Kauf)
  //   unlockText  Anzeigetext fuer die Item-Detailkarte (siehe profile.js)
  // Die urspruenglich hier geplante "Gluecksmuenze" ist KEIN Item mehr,
  // sondern die neue Waehrung "Muenzen" (siehe addCoins() in js/state.js,
  // BANK_DROP_COINS_MIN/MAX + BONSCAN_COINS_MIN/MAX unten) — HUD-Anzeige am
  // Avatar statt Inventar-Karte.
  // Icons sind bewusst ein gemeinsames generisches Platzhalter-SVG — jedes
  // Item hat sein eigenes `icon`-Feld, finale Grafiken lassen sich also pro
  // Item einzeln eintragen, ohne die Datenstruktur anzufassen. `card` bleibt
  // absichtlich weg, damit die synthetische Detailkarte (profile.js
  // showItemDetail) genutzt wird statt eines Kartenfotos.
  wasserflasche: {
    key: "wasserflasche",
    name: "Wasserflasche",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/wasserflasche_icon.png",
    type: "Verbrauchbar",
    effect: "+10 % Energie sofort wiederherstellen",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  energieriegel: {
    key: "energieriegel",
    name: "Energieriegel",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/energierigel_icon.png",
    type: "Verbrauchbar",
    effect: "+5 % XP-Boost für 10 Minuten",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  kaffeebecher: {
    key: "kaffeebecher",
    name: "Kaffeebecher",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/kaffeebecher_icon.png",
    type: "Verbrauchbar",
    effect: "Zeigt Loomas in der Nähe für 10 Minuten an",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  schuhe: {
    key: "schuhe",
    name: "Schuhe",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/schuhe_icon.png",
    type: "Anlegbar",
    effect: "+5 % Fangchance beim Anlegen",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  uhr: {
    key: "uhr",
    name: "Uhr",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/Uhr_icon.png",
    type: "Anlegbar",
    effect: "+5 % XP beim Anlegen",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  frischedeo: {
    key: "frischedeo",
    name: "Frischedeo",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/deo_icon.png",
    type: "Verbrauchbar",
    effect: "Lockt 5 Minuten lang leicht mehr Loomas an",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  futterportion: {
    key: "futterportion",
    name: "Futterportion",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/futterportion_icon.png",
    type: "Verbrauchbar",
    effect: "+10 % Fangchance für 5 Minuten",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  snackpaket: {
    key: "snackpaket",
    name: "Snackpaket",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/snackpaket_icon.png",
    type: "Verbrauchbar",
    effect: "+5 % XP-Boost für 10 Minuten",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
  },
  fokuszeit: {
    key: "fokuszeit",
    // Hiess urspruenglich "Ruhepulver" -- Name passte nicht recht zum Effekt
    // (mehr Reaktionszeit statt Beruhigung), daher umbenannt.
    name: "Fokuszeit",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/focuszeit_icon.png",
    type: "Verbrauchbar",
    effect: "Verlangsamt den Loomas für einen Fangversuch",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
    // Einziges Item mit aktiver UI-Auswahl direkt in der Fangszene (siehe
    // btn-use-fokuszeit in index.html + useFokuszeit() in catchgame.js)
    // statt passiver Inventar-Aktivierung wie alle anderen Verbrauchsitems.
    catchModeItem: true,
  },

  vitaminsaft: {
    key: "vitaminsaft",
    name: "Vitaminsaft",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/Vitaminsaft_icon.png",
    type: "Verbrauchbar",
    effect: "+50 % Energie sofort wiederherstellen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  energieriegel_plus: {
    key: "energieriegel_plus",
    name: "Energieriegel Plus",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/energieriegel-plus_icon.png",
    type: "Verbrauchbar",
    effect: "+15 % XP-Boost für 30 Minuten",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  hose: {
    key: "hose",
    name: "Hose",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/hose_icon.png",
    type: "Anlegbar",
    effect: "+10 % Fangchance beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  oberteil: {
    key: "oberteil",
    name: "Oberteil",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/oberteil_icon.png",
    type: "Anlegbar",
    effect: "+10 % XP beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  wasserflasche_plus: {
    key: "wasserflasche_plus",
    name: "Wasserflasche Plus",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/wasserflasche-plus_icon.png",
    type: "Verbrauchbar",
    effect: "+30 % Energie sofort wiederherstellen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },

  suessigkeit: {
    key: "suessigkeit",
    name: "Süßigkeit",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/suessigkeit_icon.png",
    type: "Verbrauchbar",
    effect: "+20 % XP-Boost für 30 Minuten",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  stylische_kappe: {
    key: "stylische_kappe",
    name: "Stylische Kappe",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/stylische-kappe_icon.png",
    type: "Anlegbar",
    effect: "+10 % Fangchance dauerhaft beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
  kraeuterelixier: {
    key: "kraeuterelixier",
    name: "Kräuterelixier",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/kraeuterelixier_icon.png",
    type: "Verbrauchbar",
    effect: "+15 % Fangchance für 30 Minuten",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
  },
};

// ============ Item-Drop-Konfiguration (Standort) ============
// Gewicht PRO EINZELNEM ITEM (nicht pro Seltenheitsstufe insgesamt!) fuer
// den kostenlosen Standort-Drop (Zeichen-Minispiel, siehe
// grantRandomItemFromStore in drawgame.js + pickWeightedItemFromPool unten).
// Bewusst pro Item statt als feste Gruppen-Summe (55/40/4,9/0,1%), weil die
// Pools unterschiedlich gross sind (aktuell 11 Gewoehnlich- vs. nur 2
// Ungewoehnlich-Items) — eine feste Gruppen-Summe wuerde die 2 Ungewoehnlich-
// Items dadurch einzeln unverhaeltnismaessig oft droppen lassen (~22% pro
// Item statt ~5% bei den Gewoehnlichen). Mit Pro-Item-Gewichten bleibt jedes
// einzelne Gewoehnlich-Item spuerbar wahrscheinlicher als jedes einzelne
// Ungewoehnlich-Item, unabhaengig von der Pool-Groesse.
const LOCATION_DROP_RARITY_WEIGHTS = {
  "Gewöhnlich": 55,
  "Ungewöhnlich": 40,
  "Selten": 4.9,
  "Episch": 0.1,
};

// Bank-Standorte (STORE_CATEGORIES/locations mit categoryKey "bank") geben
// statt eines normalen Items direkt Muenzen (siehe addCoins() in state.js) —
// thematisch passender als ein Item und deckt sich mit "Muenzen als
// zukuenftige Zahlungswaehrung".
const BANK_DROP_COINS_MIN = 3;
const BANK_DROP_COINS_MAX = 8;

// Episch/Legendaer-Items, die laut Spielspezifikation NICHT ueber
// Zufalls-Drops erreichbar sind, sondern exklusiv ueber Trophaeen (siehe
// TROPHIES oben) — bleiben deshalb aus dem Drop-Pool aussen vor.
const TROPHY_EXCLUSIVE_ITEM_KEYS = ["armband", "hoodie", "lockduftflakon"];

// ============ Level-Up-Belohnungen ============
// Eigene Level-Reward-Tabelle (bewusst getrennt von den Store-/Bon-Drop-
// Pools oben) — Level-Belohnungen sind IMMER garantiert (kein Zufall OB es
// etwas gibt), nur WELCHES Item bei den Item-Stufen wird zufaellig aus dem
// jeweiligen Rarity-Pool gezogen. Level 1 bekommt nichts (Startlevel).
const LEVEL_REWARD_COINS_BASE = 10;
const LEVEL_REWARD_COINS_PER_LEVEL = 2;

function levelRewardCoins(level) {
  return LEVEL_REWARD_COINS_BASE + level * LEVEL_REWARD_COINS_PER_LEVEL;
}

// Eigene Item-Pools nur fuer Level-Belohnungen (alle Items der jeweiligen
// Seltenheit, nicht nur die per Standort-Minigame droppfaehigen) — dadurch
// sind hierueber z.B. auch sonst kauf-exklusive Items erreichbar, als
// Fortschritts-Belohnung statt nur per echtem Einkauf. Episch/Legendaer
// bleiben aussen vor, die sind laut Spezifikation Trophaeen vorbehalten
// (siehe TROPHY_EXCLUSIVE_ITEM_KEYS oben).
function buildLevelRewardPool(rarity) {
  return Object.values(ITEMS)
    .filter((item) => item.rarity === rarity && !TROPHY_EXCLUSIVE_ITEM_KEYS.includes(item.key))
    .map((item) => item.key);
}
const LEVEL_REWARD_ITEM_POOL_GRUEN = buildLevelRewardPool("Ungewöhnlich");
const LEVEL_REWARD_ITEM_POOL_BLAU = buildLevelRewardPool("Selten");

// Bestimmt die Belohnung fuer genau EIN Level (nicht kumulativ). Alle 10
// Level zaehlt nur die groessere Blau-Stufe (kein zusaetzliches Gruen-Item
// obendrauf), alle 5 Level (die nicht durch 10 teilbar sind) ein
// Gruen-Item, sonst nur die garantierten Coins.
function levelRewardForLevel(level) {
  if (level % 10 === 0) {
    return { coins: levelRewardCoins(level), itemPool: LEVEL_REWARD_ITEM_POOL_BLAU };
  }
  if (level % 5 === 0) {
    return { coins: levelRewardCoins(level), itemPool: LEVEL_REWARD_ITEM_POOL_GRUEN };
  }
  return { coins: levelRewardCoins(level), itemPool: null };
}

// Die 9 Bestandsitems haben (bewusst unveraendert) noch kein `unlockType`-
// Feld — hier per Key-Liste nachgetragen, damit Weiss/Gruen weiterhin wie
// bisher ueber das Zeichen-Minispiel (Standort) droppen.
const LEGACY_LOCATION_ITEM_KEYS = ["fruchtkorb", "sprachbuch", "energiesnack", "gesundheitspaket"];

function buildDropPoolByRarity(unlockType, legacyKeys) {
  const pool = {};
  Object.values(ITEMS).forEach((item) => {
    if (TROPHY_EXCLUSIVE_ITEM_KEYS.includes(item.key)) return;
    if (item.unlockType !== unlockType) return;
    (pool[item.rarity] = pool[item.rarity] || []).push(item.key);
  });
  legacyKeys.forEach((key) => {
    const item = ITEMS[key];
    const list = (pool[item.rarity] = pool[item.rarity] || []);
    if (!list.includes(key)) list.push(key);
  });
  return pool;
}

const LOCATION_DROP_ITEM_POOL = buildDropPoolByRarity("standort", LEGACY_LOCATION_ITEM_KEYS);

// Waehlt ein Item aus `pool` (Seltenheit -> [Keys]), gewichtet nach dem
// Pro-Item-Gewicht der jeweiligen Seltenheit aus `rarityWeights` (siehe
// LOCATION_DROP_RARITY_WEIGHTS oben) — jedes Item wird einzeln gewichtet,
// nicht die Seltenheitsstufe als Ganzes. Leere Stufen (z.B. Episch/Selten
// aktuell ohne droppfaehige Items, siehe TROPHY_EXCLUSIVE_ITEM_KEYS) tragen
// dadurch automatisch 0 Gewicht bei, ganz ohne gesonderte Fallback-Logik.
function pickWeightedItemFromPool(pool, rarityWeights) {
  const entries = [];
  Object.entries(pool).forEach(([rarity, keys]) => {
    const weight = rarityWeights[rarity] || 0;
    if (weight <= 0) return;
    keys.forEach((key) => entries.push({ key, weight }));
  });
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return null;
  let roll = Math.random() * total;
  for (const e of entries) {
    if (roll < e.weight) return e.key;
    roll -= e.weight;
  }
  return entries[entries.length - 1].key;
}

// ============ Bon-Scan-Bonus (nicht eindeutig erkannter Bon) ============
// Wird kein Store/Artikel-Stichwort auf dem Bon eindeutig erkannt, gibt es
// statt eines einzelnen Zufalls-Items ein kleines, hart begrenztes
// Bonuspaket (siehe grantReceiptItems in js/bonscan.js):
// BONSCAN_UNCLEAR_BONUS_SLOT_COUNT Slots insgesamt, davon IMMER genau einer
// Muenzen (Zufallsbetrag), der Rest zufaellige weisse Items — bewusst
// klein/vorhersehbar statt an den Kaufbetrag gekoppelt zu skalieren.
const BONSCAN_WHITE_BONUS_ITEM_POOL = LOCATION_DROP_ITEM_POOL["Gewöhnlich"];
const BONSCAN_UNCLEAR_BONUS_SLOT_COUNT = 4;
const BONSCAN_COINS_MIN = 1;
const BONSCAN_COINS_MAX = 5;

// Episch/Legendaer sind laut Original-Kartentexten KEINE Zufalls-Drops aus
// Stores, sondern Belohnungen fuer Trophaeen/seltene Quests (siehe
// Abschnitt 7 der Spezifikation) — die Store-Item-Pools unten duerfen
// daher nur Gewoehnlich/Ungewoehnlich/Selten enthalten. Der Trophaeen-
// Belohnungsmechanismus selbst ist noch nicht gebaut (Trophaeen-Screen
// ist weiterhin ein "folgt als Naechstes"-Platzhalter).

// Seltene Items (Sneaker, Abenteuerrucksack) sind bewusst NICHT mehr Teil
// der Minigame-itemPools unten — sie sind seit dem Bon-Scan-Feature
// (siehe js/bonscan.js) nur noch durch einen echten, erkannten Kassenbon
// erhaeltlich (RECEIPT_MATCH_ITEM_POOL unten). Ohne echten Kauf gibt es
// dafuer nur noch den generischen Gewoehnlich/Ungewoehnlich-Pool als
// Minigame-Drop.
const COMMON_ITEM_POOL = ["fruchtkorb", "energiesnack", "gesundheitspaket", "sprachbuch"];

// Item-Pool, aus dem beim Bon-Scan (siehe js/bonscan.js) das Zufalls-Item pro
// gegen die Store-Artikelliste erkanntem Treffer gezogen wird — enthaelt
// bewusst auch "sneaker"/"rucksack" (Selten), die seit dem Bon-Scan-Feature
// NUR noch ueber einen echten, erkannten Kassenbon erreichbar sind, nicht
// mehr ueber das Standort-Minigame (siehe LOCATION_DROP_ITEM_POOL).
const ANY_STORE_ITEM_POOL = [...COMMON_ITEM_POOL, "sneaker", "rucksack"];

// Gruppiert ANY_STORE_ITEM_POOL nach der TATSAECHLICHEN Rarity jedes Items
// (nicht nach einer Branchen-Zuordnung) -- Grundlage fuer die per
// pickWeightedItemFromPool() gezogene Item-Belohnung bei einem
// Artikel-Treffer (siehe grantReceiptItems() in js/bonscan.js). Das
// Zufalls-Item ist damit bewusst UNABHAENGIG vom konkreten, vom Store selbst
// hinterlegten Artikeltext -- nur WELCHES Item gezogen wird, ist zufaellig,
// DASS ueberhaupt eines gezogen wird, haengt vom Fuzzy-Match ab.
function buildPoolByActualRarity(keys) {
  const pool = {};
  keys.forEach((key) => {
    const rarity = ITEMS[key].rarity;
    (pool[rarity] = pool[rarity] || []).push(key);
  });
  return pool;
}
const RECEIPT_MATCH_ITEM_POOL = buildPoolByActualRarity(ANY_STORE_ITEM_POOL);

// STORE_CATEGORIES = Branchen (Anzeigename, Szene-Hintergrund, Item-Pool).
// Nirgends echte Marken-/Retailer-Namen (siehe Spielspezifikation Abschnitt 9)
// — nur Branchenbezeichnungen, das gilt auch fuer alles, was hier steht.
const STORE_CATEGORIES = {
  feinkost: {
    key: "feinkost",
    name: "Feinkost & Snacks",
    scene: "assets/generated/store_feinkost_real.jpg",
    itemPool: COMMON_ITEM_POOL,
  },
  sneaker: {
    key: "sneaker",
    name: "Sneaker & Streetwear",
    scene: "assets/generated/store_sneaker_real.jpg",
    // Sneaker/Rucksack gibt es hier nur noch per echtem Bon-Scan, nicht
    // mehr im Minigame — daher derselbe generische Fallback-Pool.
    itemPool: COMMON_ITEM_POOL,
  },
  juwelier: {
    key: "juwelier",
    name: "Juwelier",
    scene: "assets/generated/store_juwelier_real.jpg",
    // Noch kein juwelierspezifisches Item vorhanden — Uebergangszustand:
    // vorerst derselbe allgemeine Gewoehnlich/Ungewoehnlich-Pool wie bei
    // Feinkost & Snacks. Sobald es mehr Items gibt, hier
    // exklusivere/hochwertigere Items eintragen.
    itemPool: COMMON_ITEM_POOL,
  },
  cafe: {
    key: "cafe",
    name: "Café",
    scene: "assets/generated/store_cafe_real.jpg",
    itemPool: ["fruchtkorb", "energiesnack"],
  },
  fashion: {
    key: "fashion",
    name: "Mode & Accessoires",
    scene: "assets/generated/store_fashion_real.jpg",
    itemPool: COMMON_ITEM_POOL,
  },
  bank: {
    key: "bank",
    name: "Bank",
    scene: "assets/generated/store_bank_real.jpg",
    // Branche/Item-Pool noch nicht final geklaert — bis dahin der
    // allgemeine Gewoehnlich/Ungewoehnlich-Pool.
    itemPool: COMMON_ITEM_POOL,
  },
  drogerie: {
    key: "drogerie",
    name: "Drogerie",
    scene: "assets/generated/bg_store_drogerie.svg",
    itemPool: ["gesundheitspaket", "fruchtkorb", "sprachbuch"],
  },
  schnellrestaurant: {
    key: "schnellrestaurant",
    name: "Schnellrestaurant",
    scene: "assets/generated/bg_store_schnellrestaurant.svg",
    itemPool: ["energiesnack", "fruchtkorb"],
  },
  bar: {
    key: "bar",
    name: "Bar",
    scene: "assets/generated/bg_store_bar.svg",
    itemPool: ["fruchtkorb", "energiesnack"],
  },
};

// ============ Bon-Scan (echter Kauf -> Item-Drop, siehe js/bonscan.js) ============
// Ordnet den im OCR-Text des gescannten Kassenbons gefundenen Store-Namen
// einer Store-Kategorie zu. Es werden bewusst KEINE echten Retailer-Namen
// im UI angezeigt (siehe Spielspezifikation Abschnitt 9) — die Patterns
// hier dienen nur der internen Zuordnung, sichtbar ist dem Spieler nur der
// Kategorie-Anzeigename.
// Seit der Artikelstammdaten-Umstellung (Store hinterlegt eigene
// Artikelliste, siehe js/bonscan.js matchLineToConfiguredStores) ist diese
// Zuordnung NUR NOCH ein Fallback fuer Anzeigetext/"category"-Wert, falls
// KEIN Store-Match zustande kam -- bei einem echten Treffer wird die
// Kategorie stattdessen aus dem tatsaechlich getroffenen Store aufgeloest
// (siehe resolveCategoryKeyForStore in js/bonscan.js).
const RECEIPT_STORE_PATTERNS = [
  { pattern: /deichmann/i, categoryKey: "sneaker" },
  { pattern: /edeka/i, categoryKey: "feinkost" },
  { pattern: /lidl/i, categoryKey: "feinkost" }, // deckt auch "Lidl International" ab
  { pattern: /rewe/i, categoryKey: "feinkost" }, // deckt auch "ZooRoyal / REWE Group" ab, falls "REWE" im Text steht
  { pattern: /zooroyal/i, categoryKey: "feinkost" },
  { pattern: /kaufland/i, categoryKey: "feinkost" },
  { pattern: /aldi/i, categoryKey: "feinkost" }, // deckt "ALDI SÜD" und "ALDI DX" ab
  { pattern: /ferrero/i, categoryKey: "feinkost" },
  { pattern: /bahlsen/i, categoryKey: "feinkost" },
  { pattern: /fressnapf/i, categoryKey: "feinkost" }, // kein Tierbedarf-Item vorhanden, generischer Pool als Uebergang
  { pattern: /douglas/i, categoryKey: "drogerie" },
  { pattern: /rossmann/i, categoryKey: "drogerie" },
  { pattern: /\bdm\b/i, categoryKey: "drogerie" },
  { pattern: /budni/i, categoryKey: "drogerie" },
  { pattern: /l.?or[ée]al/i, categoryKey: "drogerie" },
  { pattern: /sante/i, categoryKey: "drogerie" },
  { pattern: /beiersdorf/i, categoryKey: "drogerie" },
  { pattern: /henkel/i, categoryKey: "drogerie" },
  { pattern: /puma/i, categoryKey: "sneaker" },
  { pattern: /nike/i, categoryKey: "sneaker" },
  { pattern: /adidas/i, categoryKey: "sneaker" },
  { pattern: /snipes/i, categoryKey: "sneaker" },
  { pattern: /intersport/i, categoryKey: "sneaker" },
  { pattern: /hugo boss/i, categoryKey: "fashion" },
  { pattern: /\bc&a\b/i, categoryKey: "fashion" },
  { pattern: /takko/i, categoryKey: "fashion" },
  { pattern: /mammut/i, categoryKey: "fashion" },
  { pattern: /mcdonald/i, categoryKey: "schnellrestaurant" },
  { pattern: /burger king/i, categoryKey: "schnellrestaurant" },
  { pattern: /wienerwald/i, categoryKey: "schnellrestaurant" },
  { pattern: /hans im gl.ck/i, categoryKey: "schnellrestaurant" },
  { pattern: /tchibo/i, categoryKey: "cafe" },
  { pattern: /fritz.?kola/i, categoryKey: "cafe" },
  { pattern: /true ?fruits/i, categoryKey: "cafe" },
  { pattern: /red ?bull/i, categoryKey: "cafe" },
  // Niederlaendische Ketten (Test-Faelle im Ausland, siehe js/bonscan.js —
  // Store-Erkennung ist bewusst sprachunabhaengig vom OCR-Text).
  { pattern: /albert heijn/i, categoryKey: "feinkost" },
  { pattern: /\bjumbo\b/i, categoryKey: "feinkost" },
  { pattern: /\bhema\b/i, categoryKey: "feinkost" },
  { pattern: /\baction\b/i, categoryKey: "feinkost" },
  { pattern: /kruidvat/i, categoryKey: "drogerie" },
  { pattern: /\betos\b/i, categoryKey: "drogerie" },
  { pattern: /\bzeeman\b/i, categoryKey: "fashion" },
];

// STORE_LOCATIONS = einzelne physische Standorte (Stores + reine
// Kartenpunkte/Landmarks). Mehrere Standorte koennen dieselbe Kategorie
// teilen (z.B. zwei "Feinkost & Snacks"-Filialen). coords: { lat, lon } fuer
// einen echten Standort, oder null fuer eine zufaellige Platzierung im
// Radius STORE_OFFSET_RADIUS_M um den Spieler-Startpunkt (einmalig, danach
// in localStorage gecacht, siehe ensureStorePositions() in js/map.js).
//
// Wird zur Laufzeit aus der Supabase-Tabelle "locations" geladen (siehe
// js/locations.js + dashboard "Standorte"-Ansicht zum Eintragen neuer Orte)
// -> STORE_LOCATIONS ist deshalb `let`, nicht `const`, und startet als
// STORE_LOCATIONS_FALLBACK, bis der Ladevorgang abgeschlossen ist. Bleibt
// Supabase kurzzeitig nicht erreichbar oder die Tabelle ist (noch) leer,
// verwendet das Spiel weiterhin diese Fallback-Liste, damit ein Netzwerk-
// oder Konfigurationsfehler nie zu einer leeren Karte fuehrt.
//
// Die id-Feldnamen unten sind interne Klarnamen aus assets/koordinaten/
// Koordinaten.txt (Emmendingen) — sie dienen nur der Zuordnung im Code und
// werden dem Nutzer NIE angezeigt, sichtbar ist ausschliesslich der
// Kategorie-Anzeigename aus STORE_CATEGORIES (siehe Abschnitt 9 der Spec).
const STORE_LOCATIONS_FALLBACK = [
  { id: "rewe", type: "store", categoryKey: "feinkost", coords: { lat: 48.11885648062791, lon: 7.849983861819728 } },
  { id: "kaufland", type: "store", categoryKey: "feinkost", coords: { lat: 48.11736079020843, lon: 7.848150177677171 } },
  { id: "baeckerei", type: "store", categoryKey: "cafe", coords: { lat: 48.11926205204506, lon: 7.848623981867512 } },
  { id: "modebox", type: "store", categoryKey: "fashion", coords: { lat: 48.12005556052317, lon: 7.849796063929734 } },
  { id: "volksbank", type: "store", categoryKey: "bank", coords: { lat: 48.12025582830878, lon: 7.8492661991757045 } },
  { id: "sparkasse", type: "store", categoryKey: "bank", coords: { lat: 48.119719552613226, lon: 7.8501486459263585 } },
  { id: "mueller", type: "store", categoryKey: "drogerie", coords: { lat: 48.11931058495179, lon: 7.849707348109254 } },
  { id: "dm", type: "store", categoryKey: "drogerie", coords: { lat: 48.120860450673504, lon: 7.850241027354685 } },
  { id: "mcdonalds", type: "store", categoryKey: "schnellrestaurant", coords: { lat: 48.113096001026086, lon: 7.852438811998206 } },
  { id: "cheers", type: "store", categoryKey: "bar", coords: { lat: 48.10948560102508, lon: 7.854155425715709 } },
  { id: "feinkost_custom", type: "store", categoryKey: "feinkost", coords: { lat: 52.2581271, lon: 5.4698785 } },
  // Keine echte Koordinate hinterlegt -> zufaellig um den Spieler-Start
  { id: "sneaker_default", type: "store", categoryKey: "sneaker", coords: null },
  { id: "juwelier_default", type: "store", categoryKey: "juwelier", coords: null },
];

let STORE_LOCATIONS = STORE_LOCATIONS_FALLBACK;
