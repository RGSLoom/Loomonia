// Eigenstaendige Kopie der Store-Anzeigenamen fuers Dashboard (bewusst
// dupliziert statt geteilt, damit das Dashboard ein eigenstaendiges Projekt
// bleibt). Quelle: STORE_CATEGORIES in ../../js/data.js — bei neuen/
// umbenannten Stores dort auch hier nachziehen.
const DASHBOARD_STORES = {
  supermarkt: { name: "Supermarkt" },
  discounter: { name: "Discounter" },
  apotheke: { name: "Apotheke" },
  baumarkt: { name: "Baumarkt" },
  elektronik: { name: "Elektronik" },
  sneaker: { name: "Sneaker & Streetwear" },
  juwelier: { name: "Juwelier" },
  cafe: { name: "Café" },
  fashion: { name: "Mode & Accessoires" },
  bank: { name: "Bank" },
  drogerie: { name: "Drogerie" },
  fastfood: { name: "Fastfood" },
  restaurant: { name: "Restaurant" },
  bar: { name: "Bar" },
  tankstelle: { name: "Tankstelle" },
};

// Quelle: ITEMS in ../../js/data.js — nur Name/Rarity, fuer die
// Top-Items-Tabelle im Dashboard.
// WICHTIG (QA-Review 2026-08-23): Diese Liste war 10 Items hinter ITEMS
// zurueck (wasserflasche, energieriegel, kaffeebecher, schuhe, uhr,
// frischedeo, futterportion, snackpaket, fokuszeit, kosmoanzug fehlten) --
// dashboard-render.js faellt bei einem unbekannten itemKey per
// `DASHBOARD_ITEMS[entry.itemKey] || { name: entry.itemKey, ... }` still auf
// den rohen, kleingeschriebenen Item-Key zurueck (siehe renderTopItems).
// Live im Dashboard beobachtet: "schuhe"/"kaffeebecher"/"wasserflasche"/
// "fokuszeit" standen so in der Top-Items-Tabelle statt "Schuhe"/
// "Kaffeebecher"/... Bei jedem neuen Item in ITEMS (js/data.js) MUSS dieser
// Eintrag hier ebenfalls ergaenzt werden, sonst wiederholt sich der Fehler.
const DASHBOARD_ITEMS = {
  fruchtkorb: { name: "Fruchtkorb der Energie", rarity: "Gewöhnlich" },
  sprachbuch: { name: "Sprachbuch", rarity: "Gewöhnlich" },
  energiesnack: { name: "Energiesnack", rarity: "Ungewöhnlich" },
  gesundheitspaket: { name: "Gesundheits-Paket", rarity: "Ungewöhnlich" },
  sneaker: { name: "Stylische Sneaker", rarity: "Selten" },
  rucksack: { name: "Abenteuerrucksack", rarity: "Selten" },
  hoodie: { name: "Epischer Hoodie", rarity: "Episch" },
  armband: { name: "Energie-Armband", rarity: "Legendär" },
  lockduftflakon: { name: "Lockduft-Flakon", rarity: "Episch" },
  wasserflasche: { name: "Wasserflasche", rarity: "Gewöhnlich" },
  energieriegel: { name: "Energieriegel", rarity: "Gewöhnlich" },
  kaffeebecher: { name: "Kaffeebecher", rarity: "Gewöhnlich" },
  schuhe: { name: "Schuhe", rarity: "Gewöhnlich" },
  uhr: { name: "Uhr", rarity: "Gewöhnlich" },
  frischedeo: { name: "Frischedeo", rarity: "Gewöhnlich" },
  futterportion: { name: "Futterportion", rarity: "Gewöhnlich" },
  snackpaket: { name: "Snackpaket", rarity: "Gewöhnlich" },
  fokuszeit: { name: "Fokuszeit", rarity: "Gewöhnlich" },
  // unlockType "kauf" in ITEMS (js/data.js) -- explizit fuer echte Kaeufe
  // vorgesehen, siehe ARTICLE_ITEM_CHOICES in dashboard-render.js.
  vitaminsaft: { name: "Vitaminsaft", rarity: "Ungewöhnlich" },
  energieriegel_plus: { name: "Energieriegel Plus", rarity: "Ungewöhnlich" },
  hose: { name: "Hose", rarity: "Ungewöhnlich" },
  oberteil: { name: "Oberteil", rarity: "Ungewöhnlich" },
  wasserflasche_plus: { name: "Wasserflasche Plus", rarity: "Ungewöhnlich" },
  suessigkeit: { name: "Süßigkeit", rarity: "Selten" },
  stylische_kappe: { name: "Stylische Kappe", rarity: "Selten" },
  kraeuterelixier: { name: "Kräuterelixier", rarity: "Selten" },
  kosmoanzug: { name: "Kosmoanzug", rarity: "Legendär" },
};

const DASHBOARD_RARITY_COLORS = {
  "Gewöhnlich": "#14b8a6",
  "Ungewöhnlich": "#22c55e",
  "Selten": "#3b82f6",
  "Episch": "#a855f7",
  "Legendär": "#f59e0b",
};
