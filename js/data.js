// Datenmodell aus store-walk-spielspezifikation.md

const CATCH_RADIUS_M = 45;
const STORE_OFFSET_RADIUS_M = 190;
const CREATURE_STORE_SPAWN_RADIUS_M = 65;
const CREATURE_FREE_SPAWN_RADIUS_M = 180;
const CREATURE_STORE_SPAWN_WEIGHT = 0.68;
const CREATURE_RESPAWN_MIN_MS = 3500;
const CREATURE_RESPAWN_MAX_MS = 6000;
const MAX_ACTIVE_CREATURES = 4;

const BAR_CONFIG = {
  durationMs: 1050,
  greenHalfWidth: 10,
  yellowHalfWidth: 25,
};

const DRAW_CONFIG = {
  viewBox: 220,
  toleranceRadius: 32,
  successThreshold: 0.42,
  shapes: ["kreis", "welle", "zickzack", "dreieck", "quadrat"],
};

// Eintausch-Kurs: gefangene Wesen -> Schatten-Essenz (Loomas-Screen).
const SHADOW_ESSENCE_PER_CREATURE = 1000;

const RARITY_COLORS = {
  "Gewöhnlich": "#5eead4",
  "Ungewöhnlich": "#4ade80",
  "Selten": "#60a5fa",
  "Episch": "#c084fc",
  "Legendär": "#fbbf24",
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
    scene: "assets/wesen/Fauli_szene.png",
    sceneIsRealPhoto: true,
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
    scene: "assets/generated/bg_fifu.svg",
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
    scene: "assets/generated/bg_enari.svg",
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
    scene: "assets/generated/bg_nami.svg",
    sceneIsRealPhoto: false,
  },
  wollypig: {
    key: "wollypig",
    name: "Wolly Pig",
    element: "Natur",
    elementIcon: "🌿",
    color: "#d4a574",
    rarity: "Gewöhnlich",
    xp: 150,
    icon: "assets/generated/icon_wollypig.png",
    // Im Gegensatz zu den anderen Icons bereits echt freigestellt
    // (Alphakanal vorhanden) — Laufzeit-Weissabgleich (getCutoutImage)
    // wuerde hier nur helle Fellstellen kaputt-loechern, siehe map.js.
    iconAlreadyTransparent: true,
    scene: "assets/generated/bg_wollypig.svg",
    sceneIsRealPhoto: false,
  },
};

const ITEMS = {
  fruchtkorb: {
    key: "fruchtkorb",
    name: "Fruchtkorb der Energie",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/generated/icon_fruchtkorb_real.png",
    card: "assets/items/Obstkorb.png",
    effect: "+25 % XP-Boost für 30 Minuten",
  },
  sprachbuch: {
    key: "sprachbuch",
    name: "Sprachbuch",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/generated/icon_sprachbuch_real.png",
    card: "assets/items/Sprachbuch.png",
    effect: "+5 % Punkte in menschlicher Sprache",
  },
  energiesnack: {
    key: "energiesnack",
    name: "Energiesnack",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/generated/icon_energiesnack_real.png",
    card: "assets/items/Burger.png",
    effect: "+50 % Energie wiederherstellen",
  },
  gesundheitspaket: {
    key: "gesundheitspaket",
    name: "Gesundheits-Paket",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/generated/icon_gesundheitspaket_real.png",
    card: "assets/items/Health.png",
    effect: "+25 % XP beim Anlegen",
  },
  sneaker: {
    key: "sneaker",
    name: "Stylische Sneaker",
    rarity: "Selten",
    xp: 60,
    icon: "assets/generated/icon_sneaker_real.png",
    card: "assets/items/Sneaker.png",
    effect: "+5 % Fangchance beim Anlegen",
  },
  rucksack: {
    key: "rucksack",
    name: "Abenteuerrucksack",
    rarity: "Selten",
    xp: 60,
    icon: "assets/generated/icon_rucksack_real.png",
    card: "assets/items/Abenteuerrucksack.png",
    effect: "+5 Inventarplätze",
  },
  hoodie: {
    key: "hoodie",
    name: "Epischer Hoodie",
    rarity: "Episch",
    xp: 120,
    icon: "assets/generated/icon_hoodie_real.png",
    card: "assets/items/Hoodie.png",
    effect: "+25 % Fangchance beim Anlegen",
  },
  armband: {
    key: "armband",
    name: "Energie-Armband",
    rarity: "Legendär",
    xp: 200,
    icon: "assets/generated/icon_armband_real.png",
    card: "assets/items/Armband.png",
    effect: "+50 % XP beim Anlegen",
  },
  lockduftflakon: {
    key: "lockduftflakon",
    name: "Lockduft-Flakon",
    rarity: "Episch",
    xp: 120,
    icon: "assets/generated/item_lockduftflakon.svg",
    // Kein echtes Referenzfoto vorhanden (im Gegensatz zu den anderen 8
    // Items) — showItemDetail() baut fuer dieses Item deshalb eine
    // Detailkarte aus Name/Seltenheit/Effekt statt ein echtes Karten-Bild
    // zu zeigen.
    card: null,
    effect: "Läuft 7 Tage lang, lockt mehr Loomas an",
  },
};

// Episch/Legendaer sind laut Original-Kartentexten KEINE Zufalls-Drops aus
// Stores, sondern Belohnungen fuer Trophaeen/seltene Quests (siehe
// Abschnitt 7 der Spezifikation) — die Store-Item-Pools unten duerfen
// daher nur Gewoehnlich/Ungewoehnlich/Selten enthalten. Der Trophaeen-
// Belohnungsmechanismus selbst ist noch nicht gebaut (Trophaeen-Screen
// ist weiterhin ein "folgt als Naechstes"-Platzhalter).

// STORE_CATEGORIES = Branchen (Anzeigename, Szene-Hintergrund, Item-Pool).
// Nirgends echte Marken-/Retailer-Namen (siehe Spielspezifikation Abschnitt 9)
// — nur Branchenbezeichnungen, das gilt auch fuer alles, was hier steht.
const STORE_CATEGORIES = {
  feinkost: {
    key: "feinkost",
    name: "Feinkost & Snacks",
    scene: "assets/generated/store_feinkost_real.jpg",
    itemPool: ["fruchtkorb", "energiesnack", "gesundheitspaket", "sprachbuch", "sneaker"],
  },
  sneaker: {
    key: "sneaker",
    name: "Sneaker & Streetwear",
    scene: "assets/generated/store_sneaker_real.jpg",
    itemPool: ["sneaker", "rucksack"],
  },
  juwelier: {
    key: "juwelier",
    name: "Juwelier",
    scene: "assets/generated/store_juwelier_real.jpg",
    // Noch kein juwelierspezifisches Item vorhanden — Uebergangszustand:
    // vorerst derselbe allgemeine Gewoehnlich/Ungewoehnlich/Selten-Pool
    // wie bei Feinkost & Snacks. Sobald es mehr Items gibt, hier
    // exklusivere/hochwertigere Items eintragen.
    itemPool: ["fruchtkorb", "energiesnack", "gesundheitspaket", "sprachbuch", "sneaker"],
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
    itemPool: ["sneaker", "rucksack"],
  },
  bank: {
    key: "bank",
    name: "Bank",
    scene: "assets/generated/store_bank_real.jpg",
    // Branche/Item-Pool noch nicht final geklaert — bis dahin der
    // allgemeine Gewoehnlich/Ungewoehnlich/Selten-Pool.
    itemPool: ["fruchtkorb", "sprachbuch", "energiesnack", "gesundheitspaket", "sneaker", "rucksack"],
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

// STORE_LOCATIONS = einzelne physische Standorte. Mehrere Standorte koennen
// dieselbe Kategorie teilen (z.B. zwei "Feinkost & Snacks"-Filialen).
// coords: { lat, lon } fuer einen echten Standort, oder null fuer eine
// zufaellige Platzierung im Radius STORE_OFFSET_RADIUS_M um den
// Spieler-Startpunkt (einmalig, danach in localStorage gecacht).
//
// Die id-Feldnamen unten sind interne Klarnamen aus assets/koordinaten/
// Koordinaten.txt (Emmendingen) — sie dienen nur der Zuordnung im Code und
// werden dem Nutzer NIE angezeigt, sichtbar ist ausschliesslich der
// Kategorie-Anzeigename aus STORE_CATEGORIES (siehe Abschnitt 9 der Spec).
const STORE_LOCATIONS = [
  { id: "rewe", categoryKey: "feinkost", coords: { lat: 48.11885648062791, lon: 7.849983861819728 } },
  { id: "kaufland", categoryKey: "feinkost", coords: { lat: 48.11736079020843, lon: 7.848150177677171 } },
  { id: "baeckerei", categoryKey: "cafe", coords: { lat: 48.11926205204506, lon: 7.848623981867512 } },
  { id: "modebox", categoryKey: "fashion", coords: { lat: 48.12005556052317, lon: 7.849796063929734 } },
  { id: "volksbank", categoryKey: "bank", coords: { lat: 48.12025582830878, lon: 7.8492661991757045 } },
  { id: "sparkasse", categoryKey: "bank", coords: { lat: 48.119719552613226, lon: 7.8501486459263585 } },
  { id: "mueller", categoryKey: "drogerie", coords: { lat: 48.11931058495179, lon: 7.849707348109254 } },
  { id: "dm", categoryKey: "drogerie", coords: { lat: 48.120860450673504, lon: 7.850241027354685 } },
  { id: "mcdonalds", categoryKey: "schnellrestaurant", coords: { lat: 48.113096001026086, lon: 7.852438811998206 } },
  { id: "cheers", categoryKey: "bar", coords: { lat: 48.10948560102508, lon: 7.854155425715709 } },
  // Keine echte Koordinate hinterlegt -> zufaellig um den Spieler-Start
  { id: "sneaker_default", categoryKey: "sneaker", coords: null },
  { id: "juwelier_default", categoryKey: "juwelier", coords: null },
];
