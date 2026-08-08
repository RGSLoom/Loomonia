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
};

const DASHBOARD_RARITY_COLORS = {
  "Gewöhnlich": "#14b8a6",
  "Ungewöhnlich": "#22c55e",
  "Selten": "#3b82f6",
  "Episch": "#a855f7",
  "Legendär": "#f59e0b",
};
