// Eigenstaendige Kopie der Store-Anzeigenamen fuers Dashboard (bewusst
// dupliziert statt geteilt, damit das Dashboard ein eigenstaendiges Projekt
// bleibt). Quelle: STORE_CATEGORIES in ../../js/data.js — bei neuen/
// umbenannten Stores dort auch hier nachziehen.
const DASHBOARD_STORES = {
  feinkost: { name: "Feinkost & Snacks" },
  sneaker: { name: "Sneaker & Streetwear" },
  juwelier: { name: "Juwelier" },
  cafe: { name: "Café" },
  fashion: { name: "Mode & Accessoires" },
  bank: { name: "Bank" },
  drogerie: { name: "Drogerie" },
  schnellrestaurant: { name: "Schnellrestaurant" },
  bar: { name: "Bar" },
};

// Quelle: ITEMS in ../../js/data.js — nur Name/Rarity, fuer die
// Top-Items-Tabelle im Dashboard.
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
};

const DASHBOARD_RARITY_COLORS = {
  "Gewöhnlich": "#14b8a6",
  "Ungewöhnlich": "#22c55e",
  "Selten": "#3b82f6",
  "Episch": "#a855f7",
  "Legendär": "#f59e0b",
};
