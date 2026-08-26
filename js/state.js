// Persistenter Spielzustand (localStorage) — ersetzt die reine
// Sitzungsspeicherung aus dem Chat-Prototyp durch echte Persistenz
// pro Browser/Gerät, ohne dass dafür ein Backend nötig ist.

const STORAGE_KEY = "storewalk_state_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Konnte Spielstand nicht laden:", e);
  }
  return null;
}

function defaultState() {
  return {
    xp: 0,
    energy: ENERGY_MAX,
    lastEnergyTimestamp: Date.now(),
    // key -> [{ id, level }] -- ein Eintrag pro einzeln gefangenem Exemplar
    // (siehe Level-System-Briefing: jedes Looma hat sein eigenes Level, nicht
    // nur ein Zaehler pro Art). Bestandsspielstaende mit dem alten Format
    // (key -> Anzahl) werden weiter unten einmalig migriert.
    caughtCreatures: {},
    inventory: {}, // itemKey -> count
    shadowEssence: 0,
    // Aktive, zeitlich befristete Boost-Effekte aus frei nutzbaren
    // Verbrauchsitems (usage_context "jederzeit", siehe applyBoostItem()
    // unten) -- keyed nach effectType ("xp_boost"/"fangchance_boost"/
    // "loomas_anlocken"), jeweils { value, expiresAt, itemKey }. Bewusst
    // pro effectType statt pro Item: zwei Items mit gleichem Effekttyp
    // sollen sich ersetzen/auffrischen statt sich zu stapeln.
    activeEffects: {},
    // Zeitstempel des letzten Einstiegs-Spawn-Boost-Ausloesens (siehe
    // SPAWN_BOOST_RETRIGGER_COOLDOWN_MS in js/data.js, onFirstFix() in
    // js/map.js) -- persistiert (anders als das rein session-gebundene
    // spawnBoostUntil in map.js), damit ein Neuladen der Seite den
    // Cooldown nicht umgeht.
    lastSpawnBoostTriggeredAt: null,
    // Neue Waehrung "Muenzen" (siehe addCoins() unten) — bewusst KEIN
    // Inventar-Item, sondern ein eigener Zaehler mit Anzeige im Profil-Hero
    // (siehe .profile-hero-coins in js/profile.js), da Muenzen spaeter als
    // Zahlungswaehrung dienen sollen statt als sammelbares Item.
    coins: 0,
    settings: {
      skipMinigame: false,
      // AR-Kamera-Hintergrund in der Fangszene — Default aus (Privacy-
      // freundlich, erfordert explizite Kamera-Erlaubnis vom Nutzer).
      arCameraEnabled: false,
      // Loeschoption im Items-Screen — Default aus, um versehentliches
      // Loeschen zu vermeiden; muss explizit in den Einstellungen aktiviert
      // werden. Vor dem eigentlichen Loeschen fragt die UI trotzdem immer
      // aktiv nach (siehe profile.js).
      allowItemDeletion: false,
    },
    // Aktiv angezogene Avatar-Ausruestung: pro Slot entweder eine Item-Key
    // oder null (siehe equipItem()/unequipSlot() unten). "outfit" und die
    // fuenf Einzel-Slots schliessen sich gegenseitig aus — es kann nie
    // gleichzeitig ein Wert in "outfit" UND einem Einzel-Slot stehen.
    avatarEquipped: { kopfteil: null, oberteil: null, hose: null, sneaker: null, accessoire: null, outfit: null },
    // Level je Ausruestungs-Item-KEY (nicht pro Slot und nicht pro
    // physischer Instanz, siehe Ausruestungs-Level-System-Briefing):
    // itemKey -> { level, feedProgress }. gameState.inventory kennt bislang
    // keine Instanz-IDs fuer Ausruestung (nur key->Anzahl), ein Umbau auf
    // Instanz-Tracking wie bei caughtCreatures haette groessere
    // Seiteneffekte auf Drop-/Inventar-Code gehabt. Da alle Exemplare
    // desselben Keys ohnehin identisch sind, verhaelt sich das im Spiel wie
    // "das ausgeruestete Exemplar behaelt sein Level ueber Aus-/Wiederanlegen
    // hinweg" -- eigene Interpretationsentscheidung.
    equipmentLevels: {},
    storePositions: null, // { [storeKey]: { lat, lon } } — einmalig gesetzt
    playerId: null, // anonyme ID fuers Haendler-Dashboard (siehe tracking.js)
    trophies: {}, // trophyKey -> Freischalt-Zeitstempel (siehe TROPHIES in data.js)
    receiptScanCount: 0, // Anzahl bestaetigter Bon-Scans insgesamt (fuer "treuer_shopper")
    // Habitat-System (siehe Habitat-Briefing + Funktionen weiter unten):
    // activeCompanion ist der CREATURES-Key des aktuell aktiven Loomas (oder
    // null), restedXpRemaining der SPIELERWEITE (nicht pro Looma) Rested-XP-
    // Bonus-Pool, sessionEndedAt der Zeitstempel des letzten App-Schliessens
    // (siehe markSessionEnded()/settleRestedXp()).
    activeCompanion: null,
    // Konkrete Instanz-ID (siehe caughtCreatures oben) des aktiven Begleiters
    // innerhalb seiner Art -- activeCompanion allein (nur der Art-Key) reicht
    // seit dem Level-System-Briefing nicht mehr, da mehrere Exemplare derselben
    // Art unterschiedliche Level haben koennen.
    activeCompanionInstanceId: null,
    restedXpRemaining: 0,
    sessionEndedAt: null,
    // Avatar-Onboarding (siehe Hero-Bild-Briefing): beide null bis zum
    // einmaligen Auswahl-Dialog beim ersten Oeffnen des Profils (siehe
    // maybeShowOnboarding() in js/profile.js). "male"/"female" steuert, ob
    // Mann_icon.png oder Frau_icon.png als Profil-Hero-Bild angezeigt wird.
    avatarGender: null,
    playerName: null,
  };
}

const loadedState = loadState();
const gameState = Object.assign(defaultState(), loadedState || {});

// Migration auf das Instanz-Format von caughtCreatures (siehe Level-System-
// Briefing): Bestandsspielstaende speichern hier bislang eine reine Anzahl
// (key -> Zahl) statt eines Arrays einzelner Exemplare. Wandelt das einmalig
// um -- jedes bisher gezaehlte Exemplar wird zu einer eigenen Instanz auf
// Level 1 (kein rueckwirkendes Level, da es vorher keins gab). Der bisherige
// aktive Begleiter (nur als Art-Key gespeichert) bekommt dabei eine seiner
// neuen Instanzen zugewiesen, damit er nicht verloren geht.
Object.keys(gameState.caughtCreatures).forEach((key) => {
  const value = gameState.caughtCreatures[key];
  if (Array.isArray(value)) return;
  const count = value || 0;
  const instances = [];
  for (let i = 0; i < count; i++) {
    instances.push({ id: `${key}_migrated_${i}_${Date.now()}`, level: 1 });
  }
  gameState.caughtCreatures[key] = instances;
});
if (gameState.activeCompanion && !gameState.activeCompanionInstanceId) {
  const instances = gameState.caughtCreatures[gameState.activeCompanion] || [];
  if (instances.length > 0) {
    gameState.activeCompanionInstanceId = instances[0].id;
  } else {
    gameState.activeCompanion = null;
  }
}

// Migration fuers Level-Reward-System (siehe claimLevelRewards() unten):
// Bestandsspielstaende, die vor Einfuehrung dieses Systems schon ein hohes
// Level erreicht hatten, sollen nicht rueckwirkend ALLE laengst passierten
// Level-Belohnungen auf einmal bekommen — nur echte NEUE Levelaufstiege ab
// jetzt zaehlen. Neue Spielstaende starten dadurch automatisch korrekt bei
// Level 1 (xpToLevel(0) === 1).
if (gameState.lastRewardedLevel === undefined) {
  gameState.lastRewardedLevel = xpToLevel(gameState.xp);
}

// Einmalige Entschaedigung fuer den naechsten Live-Deploy (User-Wunsch): 1x
// "Hose" ins Inventar, damit bereits bestehende Spielstaende das Item zum
// Testen besitzen. Nur fuer SCHON VORHANDENE Spielstaende (loadedState !==
// null), nicht fuer brandneue Installationen nach diesem Update -- sonst
// waere es kein Ausgleich mehr, sondern ein dauerhaftes Startgeschenk. Nach
// dem naechsten Deploy laut Briefing nicht mehr noetig, dieser Block darf
// dann wieder entfernt werden.
if (loadedState && gameState.hoseCompensationGranted === undefined) {
  gameState.inventory.hose = (gameState.inventory.hose || 0) + 1;
  gameState.hoseCompensationGranted = true;
  saveState();
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gameState));
  } catch (e) {
    console.warn("Konnte Spielstand nicht speichern:", e);
  }
}

// Summiert den Bonus eines Effekttyps ("xp_boost"/"fangchance_boost") ueber
// ALLE aktuell angezogenen Ausruestungsteile (siehe gameState.avatarEquipped
// + ITEMS[key].equipBonuses in js/data.js) -- anders als Verbrauchsitem-
// Boosts sind das dauerhafte, nicht ablaufende Bonis, solange das Teil
// angezogen bleibt. Da sich Outfit-Slot und Einzel-Slots gegenseitig
// ausschliessen (siehe equipItem()), ist hier nie mehr als 1 Outfit- ODER
// bis zu 5 Einzelteile gleichzeitig aktiv, nie beides gemischt.
function getEquippedBonusTotal(effectType) {
  return Object.values(gameState.avatarEquipped)
    .filter(Boolean)
    // ITEMS[key] kann fehlen, wenn ein Item nach dem Anziehen aus der
    // Item-Definition entfernt/umbenannt wurde (veralteter State) -- ohne
    // diesen Guard wirft das einen TypeError, und da diese Funktion bei
    // JEDEM XP-Gewinn ueber addXp() laeuft (Fang, Item, Trophaee,
    // Levelaufstieg), legt ein einzelner verwaister equipped-Key das
    // gesamte XP-System lahm (siehe QA-Bug-Liste).
    .reduce((sum, key) => sum + ((ITEMS[key] && ITEMS[key].equipBonuses || {})[effectType] || 0), 0);
}

// Wendet einen evtl. aktiven "xp_boost"-Effekt (siehe applyBoostItem() unten)
// UND den dauerhaften Bonus angezogener Ausruestung (siehe
// getEquippedBonusTotal() oben) auf jeden XP-Gewinn an, unabhaengig von der
// Quelle (Fang, Item-Aufnahme, Trophaee, Levelaufstieg) -- der Effekttext
// der Boost-/Ausruestungsitems ("XP-Boost") unterscheidet nicht nach Quelle,
// daher hier global statt nur beim Fang. Gibt { awardedXp, entries } zurueck
// statt nur der Level-Belohnungen -- awardedXp ist der TATSAECHLICH
// gutgeschriebene (schon geboostete) Betrag, damit Erfolgsmeldungen den
// echten Wert zeigen koennen statt des rohen XP-Werts aus
// ITEMS/CREATURES/TROPHIES.
function addXp(amount) {
  const boost = getActiveEffectValue("xp_boost") + getEquippedBonusTotal("xp_boost");
  const boostedXp = boost > 0 ? Math.round(amount * (1 + boost)) : amount;
  // Rested-XP-Bonus (siehe Habitat-Briefing + settleRestedXp() unten):
  // verdoppelt den (schon ausruestungs-/itemgeboosteten) Betrag, solange der
  // Pool reicht, und verbraucht dabei genau den Bonusanteil aus
  // gameState.restedXpRemaining -- greift nicht mehr, wenn das aktive Looma
  // bereits Max-Level ist (Punkt 7 des Briefings, siehe
  // isActiveCompanionMaxLevel()).
  let restedBonus = 0;
  if (gameState.restedXpRemaining > 0 && !isActiveCompanionMaxLevel()) {
    restedBonus = Math.min(boostedXp, gameState.restedXpRemaining);
    gameState.restedXpRemaining -= restedBonus;
  }
  // gameState.restedXpRemaining ist ein Float (settleRestedXp() rechnet
  // Millisekunden anteilig um) -- restedBonus erbt diese Nachkommastellen,
  // gerundet wird deshalb erst HIER, direkt vor der eigentlichen XP-Vergabe
  // (die Pool-Subtraktion oben bleibt bewusst exakt, sonst wuerden sich
  // Rundungsreste im Pool aufsummieren).
  const awardedXp = Math.round(boostedXp + restedBonus);
  gameState.xp += awardedXp;
  saveState();
  return { awardedXp, entries: claimLevelRewards() };
}

// Prueft, ob ein Boost-Effekt gerade aktiv ist (unabhaengig von seinem
// `value`, z.B. fuer "loomas_anlocken", das keinen Prozentwert hat) --
// raeumt abgelaufene Eintraege dabei gleich aus gameState.activeEffects auf.
function isEffectActive(effectType) {
  const entry = gameState.activeEffects[effectType];
  if (!entry) return false;
  if (Date.now() >= entry.expiresAt) {
    delete gameState.activeEffects[effectType];
    saveState();
    return false;
  }
  return true;
}

// Liefert den aktuellen Wert eines aktiven, zeitlich befristeten Boost-
// Effekts (0, falls keiner aktiv oder bereits abgelaufen ist).
function getActiveEffectValue(effectType) {
  if (!isEffectActive(effectType)) return 0;
  return gameState.activeEffects[effectType].value || 0;
}

// Setzt/aktualisiert einen aktiven Boost-Effekt (loescht keine anderen
// Effekttypen) -- neue Nutzung ersetzt eine evtl. noch laufende gleichen Typs
// komplett (kein Stapeln von Dauer oder Wert), das haelt die Regel simpel und
// fuer den Spieler nachvollziehbar.
function setActiveEffect(effectType, value, durationMs, itemKey) {
  gameState.activeEffects[effectType] = {
    value: value || 0,
    expiresAt: Date.now() + durationMs,
    itemKey,
  };
  saveState();
}

// Verwendet ein frei nutzbares Boost-Item (usage_context "jederzeit") direkt
// aus dem Inventar -- siehe Verbrauchsgegenstaende-Briefing. Gibt bei Erfolg
// ein kurzes Ergebnis-Objekt zurueck (fuer eine Bestaetigungsmeldung in der
// UI), sonst null (Item nicht vorhanden/nicht passend).
function applyBoostItem(key) {
  const item = ITEMS[key];
  if (!item || item.type !== "Verbrauchbar" || item.usage_context !== "jederzeit") return null;
  if ((gameState.inventory[key] || 0) < 1) return null;

  let resultText = "";
  switch (item.effectType) {
    case "energie_restore": {
      settleEnergy();
      const gained = Math.round(ENERGY_MAX * item.effectValue);
      gameState.energy = Math.min(ENERGY_MAX, gameState.energy + gained);
      resultText = `+${gained} Energie`;
      break;
    }
    case "xp_boost":
    case "fangchance_boost": {
      // Nur ein staerkerer (oder gleich starker) Wert ersetzt einen noch
      // aktiven Boost desselben Typs -- ein schwaecheres Item soll ein
      // laufendes NICHT abschwaechen/verkuerzen. Item bleibt in diesem Fall
      // unverbraucht (kein removeItem()), der Aufrufer zeigt stattdessen
      // einen Hinweis (siehe result.blocked in js/profile.js).
      const currentValue = getActiveEffectValue(item.effectType);
      if (currentValue > item.effectValue) {
        return {
          itemKey: key,
          blocked: true,
          text: `Bereits ein stärkerer Boost aktiv (+${Math.round(currentValue * 100)}%) — ${item.name} nicht verwendet`,
        };
      }
      setActiveEffect(item.effectType, item.effectValue, item.effectDurationMs, key);
      resultText = `${item.name} ist jetzt aktiv`;
      break;
    }
    case "loomas_anlocken":
    case "guaranteed_nearby_spawn": {
      // Beide Effekttypen haben keinen Prozentwert zum Vergleichen (anders
      // als xp_boost/fangchance_boost) -- die Rangfolge ist hier die
      // verbleibende Laufzeit: ein kuerzeres Item darf ein noch laenger
      // laufendes NICHT verkuerzen (Bug, siehe User-Feedback 2026-08-22:
      // der 7-Tage-Lockduft-Flakon verschwand nach kurzer Zeit, weil ein
      // spaeter genutztes 5/10-Minuten-Item ihn ueberschrieben hat).
      const currentEntry = gameState.activeEffects[item.effectType];
      const currentlyActive = currentEntry && Date.now() < currentEntry.expiresAt;
      const newExpiresAt = Date.now() + item.effectDurationMs;
      if (currentlyActive && currentEntry.expiresAt > newExpiresAt) {
        return {
          itemKey: key,
          blocked: true,
          text: `Läuft bereits länger (noch ${formatRemainingTime(currentEntry.expiresAt - Date.now())}) — ${item.name} nicht verwendet`,
        };
      }
      setActiveEffect(item.effectType, item.effectValue, item.effectDurationMs, key);
      resultText = `${item.name} ist jetzt aktiv`;
      break;
    }
    default:
      return null;
  }

  removeItem(key);
  saveState();
  return { itemKey: key, text: resultText };
}

// Vergibt die garantierten Level-Belohnungen (siehe LEVEL_REWARDS-Kommentar
// in data.js) fuer jedes seit dem letzten Aufruf neu erreichte Level.
// Idempotent ueber gameState.lastRewardedLevel — sicher aus addXp() bei
// jedem XP-Gewinn aufrufbar, auch mehrfach pro Spielaktion (z.B. Item-XP
// gefolgt von Trophaeen-XP), ohne doppelt zu vergeben. Gibt die
// Erfolgsmeldungs-Eintraege zurueck (leer, wenn kein neues Level erreicht
// wurde) — der Aufrufer haengt sie an seine eigene Erfolgsmeldungs-Queue an,
// analog zu claimTrophy() oben.
function claimLevelRewards() {
  const currentLevel = xpToLevel(gameState.xp);
  const lastRewarded = gameState.lastRewardedLevel;
  if (currentLevel <= lastRewarded) return [];

  const entries = [];
  const itemXpQueue = []; // { entry, rawXp } -- siehe Kommentar unten
  for (let level = lastRewarded + 1; level <= currentLevel; level++) {
    const reward = levelRewardForLevel(level);
    const rewardText = `Level-Aufstieg auf Level ${level}! 🎉`;
    addCoins(reward.coins);
    entries.push({ type: "coins", amount: reward.coins, storeText: rewardText });
    if (reward.itemPool && reward.itemPool.length > 0) {
      const itemKey = randomChoice(reward.itemPool);
      addItem(itemKey);
      const entry = { type: "item", itemKey, count: 1, storeText: rewardText };
      entries.push(entry);
      itemXpQueue.push({ entry, rawXp: ITEMS[itemKey].xp });
    }
  }
  // lastRewardedLevel MUSS vor den addXp()-Aufrufen unten aktualisiert
  // werden: addXp() ruft selbst wieder claimLevelRewards() auf (der
  // Boost-/Ausruestungs-Bonus dort gilt laut eigenem Kommentar oben bewusst
  // auf JEDE XP-Quelle, auch Levelaufstiege) -- ohne das hier VORHER zu
  // setzen, wuerde ein solcher verschachtelter Aufruf dieselben, gerade erst
  // in der Schleife oben verarbeiteten Level nochmal verarbeiten und
  // Muenzen/Items doppelt vergeben.
  gameState.lastRewardedLevel = currentLevel;
  saveState();
  // Item-XP erst NACH dem Setzen von lastRewardedLevel vergeben (s.o.) --
  // vorher stand hier nur der rohe Item-XP-Wert als Anzeige-Attrappe im
  // Erfolgsmeldungs-Popup, ohne dass addXp() je aufgerufen wurde: die
  // angezeigte "+X XP" wurde nie tatsaechlich gutgeschrieben (QA-Bug-Liste).
  // Jedes Level-Belohnungsitem bekommt jetzt dieselbe (evtl. geboostete)
  // XP-Gutschrift wie jede andere Item-Aufnahme im Spiel.
  itemXpQueue.forEach(({ entry, rawXp }) => {
    const { awardedXp } = addXp(rawXp);
    entry.xpAwarded = awardedXp;
  });
  return entries;
}

function addCoins(amount) {
  gameState.coins = (gameState.coins || 0) + amount;
  saveState();
}

// Rechnet die seit dem letzten Aufruf vergangene Zeit in Energiepunkte um
// (passive Regeneration, laeuft auch waehrend die App geschlossen war) —
// rundet auf ganze Regenerationsschritte ab und "verbraucht" den
// Zeitstempel nur um exakt diesen Anteil, damit bei krummen Aufrufabstaenden
// kein angefangener Regenerationsschritt verloren geht.
function settleEnergy() {
  if (gameState.energy >= ENERGY_MAX) {
    gameState.lastEnergyTimestamp = Date.now();
    return;
  }
  const elapsedMs = Date.now() - gameState.lastEnergyTimestamp;
  const pointsGained = Math.floor(elapsedMs / ENERGY_REGEN_MS_PER_POINT);
  if (pointsGained > 0) {
    gameState.energy = Math.min(ENERGY_MAX, gameState.energy + pointsGained);
    gameState.lastEnergyTimestamp += pointsGained * ENERGY_REGEN_MS_PER_POINT;
  }
}

function getEnergy() {
  settleEnergy();
  return gameState.energy;
}

function spendEnergy(amount) {
  settleEnergy();
  gameState.energy = Math.max(0, gameState.energy - amount);
  saveState();
  return gameState.energy;
}

// Liefert alle Instanzen von `key` (leeres Array, falls noch keine gefangen).
function caughtInstances(key) {
  return gameState.caughtCreatures[key] || [];
}

function addCaughtCreature(key) {
  const instances = gameState.caughtCreatures[key] || (gameState.caughtCreatures[key] = []);
  const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${key}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  instances.push({ id, level: 1 });
  saveState();
}

// Einmaliger Start-Begleiter fuer brandneue Spieler (siehe
// STARTER_CREATURE_KEYS in js/data.js + screen-starter-pick in index.html) --
// ohne aktiven Begleiter koennte niemand den allerersten Kampf im
// rundenbasierten Fangsystem bestreiten (siehe Rundenbasiertes-
// Fangsystem-Briefing, User-Entscheidung: Auswahl statt automatischer
// Zuweisung). Nur gueltig, solange wirklich noch gar kein Looma gefangen
// wurde -- verhindert Missbrauch als "Gratis-Zweitfang" ueber die Konsole.
function chooseStarterCreature(key) {
  if (!STARTER_CREATURE_KEYS.includes(key)) return false;
  if (totalCaughtCount() > 0) return false;
  addCaughtCreature(key);
  setActiveCompanion(key);
  return true;
}

function totalCaughtCount() {
  // Nur Keys zaehlen, die noch in CREATURES existieren -- sonst weicht diese
  // Gesamtzahl von der Summe der tatsaechlich sichtbaren Kacheln in
  // renderLoomasGrid() (profile.js) ab, wenn der State einen veralteten
  // Kreatur-Key enthaelt (siehe QA-Bug-Liste).
  return Object.entries(gameState.caughtCreatures)
    .filter(([key]) => CREATURES[key])
    .reduce((sum, [, instances]) => sum + instances.length, 0);
}

// Anzahl von `key`, die eintauschbar ist -- der Bestand MINUS 1, falls die
// aktuell aktive Begleiter-Instanz zu `key` gehoert (der ruht im Habitat und
// darf nicht mit eingetauscht werden, siehe Habitat-Briefing/User-Feedback:
// "bei 10 Stück duerfen max nur 9 getauscht werden, da ich einen im Habitat
// habe"). Ohne aktiven Begleiter dieser Art entspricht das einfach dem
// vollen Bestand.
function exchangeableCreatureCount(key) {
  const owned = caughtInstances(key).length;
  const reserved = gameState.activeCompanion === key ? 1 : 0;
  return Math.max(0, owned - reserved);
}

// Tauscht `qty` gefangene Exemplare von `key` gegen Schatten-Essenz
// (raritaetsabhaengig gestaffelt, siehe SHADOW_ESSENCE_PER_CREATURE_BY_RARITY
// in data.js). Gibt false zurück und aendert nichts, falls qty ungueltig ist
// oder mehr verlangt wird als eintauschbar (siehe exchangeableCreatureCount()
// oben) — so bleibt der Aufrufer (Loomas-UI) einfach. Tauscht bevorzugt die
// NIEDRIGST-levelnden Exemplare ein (schont die am meisten investierten
// Duplikate) und laesst die aktive Begleiter-Instanz dabei unangetastet.
function exchangeCreatureForEssence(key, qty) {
  if (!Number.isInteger(qty) || qty < 1 || qty > exchangeableCreatureCount(key)) return false;
  const instances = caughtInstances(key);
  const removable = instances
    .filter((inst) => inst.id !== gameState.activeCompanionInstanceId)
    .sort((a, b) => a.level - b.level)
    .slice(0, qty);
  const removeIds = new Set(removable.map((inst) => inst.id));
  gameState.caughtCreatures[key] = instances.filter((inst) => !removeIds.has(inst.id));
  gameState.shadowEssence += qty * (SHADOW_ESSENCE_PER_CREATURE_BY_RARITY[CREATURES[key].rarity] || 0);
  saveState();
  return true;
}

function addItem(key, qty = 1) {
  gameState.inventory[key] = (gameState.inventory[key] || 0) + qty;
  saveState();
}

// Entfernt ein Exemplar von `key` aus dem Inventar (die UI fragt vorher
// aktiv nach, siehe profile.js). Gibt false zurueck, falls keins vorhanden
// ist.
function removeItem(key) {
  const owned = gameState.inventory[key] || 0;
  if (owned < 1) return false;
  if (owned <= 1) {
    delete gameState.inventory[key];
  } else {
    gameState.inventory[key] = owned - 1;
  }
  saveState();
  return true;
}

// Entfernt den kompletten Stapel von `key` auf einmal (die UI fragt vorher
// aktiv nach, siehe profile.js). Gibt false zurueck, falls keins vorhanden
// ist.
function removeAllOfItem(key) {
  const owned = gameState.inventory[key] || 0;
  if (owned < 1) return false;
  delete gameState.inventory[key];
  saveState();
  return true;
}

// Zieht ein aktuell angezogenes Item aus Slot `slotType` wieder aus und legt
// es zurueck ins Inventar (addItem) — Hilfsfunktion fuer equipItem()/
// unequipSlot() unten, macht bei leerem Slot nichts.
function returnEquippedItemToInventory(slotType) {
  const key = gameState.avatarEquipped[slotType];
  if (!key) return;
  gameState.avatarEquipped[slotType] = null;
  addItem(key);
}

// Zieht `key` an — schlaegt fehl (false, kein State-Change), wenn das Item
// nicht existiert, nicht "Anlegbar" ist, kein slotType hat oder nicht im
// Inventar liegt. Verbraucht dabei 1 Exemplar aus dem Inventar (wie ein
// Verbrauchsitem) — bei nur einem besessenen Exemplar verschwindet der
// Artikel dadurch aus dem normalen Items-Screen, solange er angezogen ist.
// Ein zuvor in diesem Slot (bzw. bei Outfit: in allen Einzel-Slots, bzw. bei
// Einzelteilen: im Outfit-Slot) angezogenes Item wandert automatisch zurueck
// ins Inventar, bevor das neue Item angezogen wird — das setzt die
// gegenseitige Ausschluss-Logik Outfit <-> Einzel-Slots um (siehe
// AVATAR_SINGLE_SLOTS in data.js).
function equipItem(key) {
  const item = ITEMS[key];
  if (!item || item.type !== "Anlegbar" || !item.slotType) return false;
  if ((gameState.inventory[key] || 0) < 1) return false;

  if (item.slotType === "outfit") {
    AVATAR_SINGLE_SLOTS.forEach((slot) => returnEquippedItemToInventory(slot));
  } else {
    returnEquippedItemToInventory("outfit");
  }
  returnEquippedItemToInventory(item.slotType);

  removeItem(key);
  gameState.avatarEquipped[item.slotType] = key;
  saveState();
  return true;
}

// Zieht das aktuell im angegebenen Slot angezogene Item wieder aus und legt
// das Exemplar zurueck ins Inventar. Gibt false zurueck, falls der Slot
// ohnehin leer war.
function unequipSlot(slotType) {
  if (!gameState.avatarEquipped[slotType]) return false;
  returnEquippedItemToInventory(slotType);
  saveState();
  return true;
}

// ============ Ausruestungs-Level-System ============
// Siehe Ausruestungs-Level-System-Briefing + gameState.equipmentLevels-
// Kommentar oben. Ein Level-Aufstieg braucht IMMER beide Ressourcen
// gleichzeitig: genug angesammelte Feed-Punkte (durch Verfuettern
// gleicher-Slot-Items, siehe feedEquipmentItem()) UND genug Muenzen.

function getEquipmentLevelState(itemKey) {
  return gameState.equipmentLevels[itemKey] || { level: 1, feedProgress: 0 };
}

function isEquipmentMaxLevel(itemKey) {
  return getEquipmentLevelState(itemKey).level >= EQUIPMENT_MAX_LEVEL;
}

// Wie viele Feed-Punkte/Muenzen fuer den naechsten Levelaufstieg noch
// fehlen, oder null auf Max-Level. `canLevelUp` ist true, sobald BEIDE
// Bedingungen gleichzeitig erfuellt sind (siehe Briefing).
function equipmentLevelUpRequirements(itemKey) {
  const item = ITEMS[itemKey];
  if (!item) return null;
  const state = getEquipmentLevelState(itemKey);
  if (state.level >= EQUIPMENT_MAX_LEVEL) return null;
  const feedCost = equipmentFeedCostForLevel(state.level);
  const coinCost = equipmentCoinCostForLevel(state.level, item.rarity);
  const coins = gameState.coins || 0;
  return {
    level: state.level,
    feedProgress: state.feedProgress,
    feedCost,
    feedRemaining: Math.max(0, feedCost - state.feedProgress),
    coinCost,
    coins,
    coinsRemaining: Math.max(0, coinCost - coins),
    canLevelUp: state.feedProgress >= feedCost && coins >= coinCost,
  };
}

// Alle Items DESSELBEN Slots im Inventar (Bestand > 0, beliebige Raritaet),
// die sich zum Hochleveln von `targetItemKey` verfuettern lassen -- z.B.
// leveln nur andere Schuhe einen Schuh hoch, kein Hoody/keine Hose (User-
// Korrektur: die kurzzeitige Ausweitung auf beliebige Mode-Items war
// ausdruecklich nicht gewuenscht).
function feedableItemsForEquipment(targetItemKey) {
  const targetItem = ITEMS[targetItemKey];
  if (!targetItem || !targetItem.slotType) return [];
  return Object.values(ITEMS).filter(
    (item) => item.slotType === targetItem.slotType && (gameState.inventory[item.key] || 0) > 0
  );
}

// Verfuettert EIN Exemplar von `feedItemKey` an das ausgeruestete
// `targetItemKey`, um dessen Feed-Fortschritt zu erhoehen -- das verfuetterte
// Item wird dabei aus dem Inventar entfernt (siehe Briefing). Erhoeht nur
// den Fortschritt, der eigentliche Levelaufstieg passiert separat ueber
// levelUpEquipmentItem() (braucht zusaetzlich genug Muenzen). Gibt false
// zurueck (kein State-Change), wenn Ziel/Feed-Item ungueltig sind, nicht
// zum selben Slot gehoeren, das Feed-Item nicht im Inventar liegt oder das
// Ziel bereits Max-Level ist.
function feedEquipmentItem(targetItemKey, feedItemKey) {
  const targetItem = ITEMS[targetItemKey];
  const feedItem = ITEMS[feedItemKey];
  if (!targetItem || !feedItem || !targetItem.slotType) return false;
  if (feedItem.slotType !== targetItem.slotType) return false;
  if ((gameState.inventory[feedItemKey] || 0) < 1) return false;
  if (isEquipmentMaxLevel(targetItemKey)) return false;

  const points = EQUIPMENT_FEED_POINTS_BY_RARITY[feedItem.rarity] || 1;
  removeItem(feedItemKey);
  const state = getEquipmentLevelState(targetItemKey);
  state.feedProgress += points;
  gameState.equipmentLevels[targetItemKey] = state;
  saveState();
  return true;
}

// Laesst `itemKey` um 1 Level aufsteigen, sofern beide Voraussetzungen
// gleichzeitig erfuellt sind (siehe equipmentLevelUpRequirements() oben).
// Zieht dabei die verbrauchten Feed-Punkte UND Muenzen ab -- ueberschuessige
// Feed-Punkte ueber die Kosten hinaus bleiben fuer den naechsten Aufstieg
// erhalten (kein Reset auf 0). Gibt bei Erfolg das neue Level zurueck, sonst
// false.
function levelUpEquipmentItem(itemKey) {
  const req = equipmentLevelUpRequirements(itemKey);
  if (!req || !req.canLevelUp) return false;
  const state = getEquipmentLevelState(itemKey);
  state.feedProgress -= req.feedCost;
  state.level += 1;
  gameState.equipmentLevels[itemKey] = state;
  addCoins(-req.coinCost);
  saveState();
  return state.level;
}

function setSkipMinigame(value) {
  gameState.settings.skipMinigame = value;
  saveState();
}

function setArCameraEnabled(value) {
  gameState.settings.arCameraEnabled = value;
  saveState();
}

function setAllowItemDeletion(value) {
  gameState.settings.allowItemDeletion = value;
  saveState();
}

function setAvatarGender(value) {
  gameState.avatarGender = value;
  saveState();
}

function setPlayerName(value) {
  gameState.playerName = value;
  saveState();
}

function setStorePositions(positions) {
  gameState.storePositions = positions;
  saveState();
}

// Schaltet eine Trophaee einmalig frei (siehe TROPHIES in data.js). Gibt
// true zurueck, wenn sie dadurch NEU freigeschaltet wurde (Aufrufer soll
// dann z.B. XP gutschreiben + Erfolgsmeldung zeigen), false wenn sie schon
// vorher freigeschaltet war (Wiederholungs-Trigger, z.B. weitere Bon-Scans,
// sollen sie nicht erneut verleihen).
function unlockTrophy(key) {
  if (gameState.trophies[key]) return false;
  gameState.trophies[key] = Date.now();
  saveState();
  return true;
}

function incrementReceiptScanCount() {
  gameState.receiptScanCount = (gameState.receiptScanCount || 0) + 1;
  saveState();
}

// Schaltet eine Trophaee frei (falls noch nicht geschehen) und vergibt ihre
// Belohnung: XP immer, plus entweder ein festes Item (trophy.itemKey) oder
// mehrere zufaellige Items aus einem Pool (trophy.randomItemPool +
// randomItemCount, siehe TROPHIES in data.js). Gibt die Erfolgsmeldungs-
// Eintraege zurueck (leer, falls die Trophaee schon freigeschaltet war) —
// der Aufrufer haengt sie an seine eigene Item-Erfolgsmeldungs-Queue an
// (siehe grantReceiptItems() bzw. onCatchSuccess()) und kuemmert sich
// selbst um UI-Refresh/Tracking, damit state.js frei von UI-/Analytics-
// Aufrufen bleibt.
function claimTrophy(trophyKey) {
  const trophy = TROPHIES[trophyKey];
  if (!unlockTrophy(trophyKey)) return [];

  // Level-Belohnungen, die durch die Trophaeen-XP selbst ausgeloest werden,
  // muessen mit zurueckgegeben werden (sonst wuerde addXp() sie zwar still
  // vergeben, aber nie in der Erfolgsmeldung anzeigen) — daher jeden
  // addXp()-Rueckgabewert hier einsammeln statt zu verwerfen. xpAwarded auf
  // den Entries ist der tatsaechlich (evtl. geboostete) gutgeschriebene
  // Betrag, siehe addXp() oben -- main.js zeigt den statt des rohen
  // trophy.xp/item.xp-Werts an.
  const trophyXpResult = addXp(trophy.xp);
  let levelRewardEntries = trophyXpResult.entries;
  const entries = [{ type: "trophy", trophyKey, xpAwarded: trophyXpResult.awardedXp }];
  const rewardText = `Belohnung der Trophäe „${trophy.name}“ 🏆`;

  if (trophy.itemKey) {
    addItem(trophy.itemKey);
    const itemXpResult = addXp(ITEMS[trophy.itemKey].xp);
    levelRewardEntries = levelRewardEntries.concat(itemXpResult.entries);
    entries.push({ type: "item", itemKey: trophy.itemKey, count: 1, storeText: rewardText, xpAwarded: itemXpResult.awardedXp });
  } else if (trophy.randomItemPool) {
    // Mehrfachtreffer auf dasselbe Item zu einem Stapel zusammenfassen
    // (analog zu grantReceiptItems() in bonscan.js), statt mehrere separate
    // Erfolgsmeldungen fuer dasselbe Item zu zeigen.
    const picks = {};
    for (let i = 0; i < trophy.randomItemCount; i++) {
      const key = randomChoice(trophy.randomItemPool);
      picks[key] = (picks[key] || 0) + 1;
    }
    Object.entries(picks).forEach(([key, count]) => {
      addItem(key, count);
      const itemXpResult = addXp(ITEMS[key].xp * count);
      levelRewardEntries = levelRewardEntries.concat(itemXpResult.entries);
      entries.push({ type: "item", itemKey: key, count, storeText: rewardText, xpAwarded: itemXpResult.awardedXp });
    });
  }

  entries.push(...levelRewardEntries);
  return entries;
}

// Anzahl gefangener Wesen je Seltenheitsstufe (ueber alle Arten summiert,
// nicht verschiedene Arten) -- Grundlage sowohl fuer checkCatchTrophies()
// als auch fuer die Fortschrittsanzeige in getTrophyProgress() unten.
// CREATURES[key] kann fehlen, wenn ein Wesen aus alten Testdaten nicht
// (mehr) in der aktuellen CREATURES-Definition existiert -- ohne diesen
// Guard wirft der Zugriff auf .rarity einen TypeError und reisst den
// kompletten Nach-Fang-Ablauf (inkl. XP-Vergabe) mit sich (siehe
// QA-Bug-Liste). caughtCreatures[key] ist seit der Migration auf das
// Instanz-Format (siehe Kommentar oben bei "Migration auf das
// Instanz-Format") ein Array von Instanzen, keine Zaehlzahl mehr -- daher
// .length statt des Rohwerts, analog zu totalCaughtCount() oben.
function caughtByRarity(rarity) {
  return Object.entries(gameState.caughtCreatures)
    .filter(([key]) => CREATURES[key] && CREATURES[key].rarity === rarity)
    .reduce((sum, [, instances]) => sum + instances.length, 0);
}

// Nach einem Fang zu pruefen: Anzahl gefangener Wesen je Seltenheitsstufe
// gegen die Schwellenwerte der fang-bezogenen Trophaeen.
function checkCatchTrophies() {
  let entries = [];
  if (caughtByRarity("Gewöhnlich") >= 5) entries = entries.concat(claimTrophy("wesen_entdecker"));
  if (caughtByRarity("Selten") >= 10) entries = entries.concat(claimTrophy("seltene_beute"));
  return entries;
}

// Nach einem bestaetigten Bon-Scan zu pruefen: Gesamtzahl bestaetigter
// Kaeufe gegen die Schwelle der kauf-bezogenen Trophaee.
function checkPurchaseTrophies() {
  if (gameState.receiptScanCount >= 5) return claimTrophy("treuer_shopper");
  return [];
}

// Liefert den aktuellen Zaehlerstand einer zaehlbaren Trophaee (siehe
// progressType/progressGoal in TROPHIES, js/data.js) fuer die
// Fortschrittsanzeige in renderTrophiesList() (js/profile.js). Trophaeen
// ohne progressType (einmalige Ereignisse wie "Erster Schritt") liefern
// null -- der Aufrufer zeigt dann nur den Status erledigt/offen an.
function getTrophyProgress(trophyKey) {
  const trophy = TROPHIES[trophyKey];
  if (!trophy.progressType) return null;
  let current;
  switch (trophy.progressType) {
    case "caught_gewoehnlich":
      current = caughtByRarity("Gewöhnlich");
      break;
    case "caught_selten":
      current = caughtByRarity("Selten");
      break;
    case "receipt_scans":
      current = gameState.receiptScanCount || 0;
      break;
    default:
      return null;
  }
  return { current: Math.min(current, trophy.progressGoal), goal: trophy.progressGoal };
}

// Anonyme, geraetelokale Spieler-ID fuers Haendler-Dashboard (Zaehlung
// "wie viele unterschiedliche Spieler pro Tag") — keine echten Nutzerdaten.
function getPlayerId() {
  if (!gameState.playerId) {
    gameState.playerId =
      (window.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : `p_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    saveState();
  }
  return gameState.playerId;
}

// ============ Habitat / aktiver Begleiter ============
// Setzt das aktive Looma (muss mindestens 1x gefangen und noch im Bestand
// sein) -- siehe Habitat-Briefing. Gibt false zurueck (kein State-Change),
// wenn der Key unbekannt ist oder nichts davon gefangen wurde.
// Waehlt die HOECHST-levelnde Instanz von `key` als aktiven Begleiter (bei
// Gleichstand die zuerst gefangene) -- es gibt aktuell keine eigene UI, um
// zwischen mehreren gleich-artigen Exemplaren zu waehlen, daher automatisch
// die staerkste.
function setActiveCompanion(key) {
  const instances = caughtInstances(key);
  if (!CREATURES[key] || instances.length < 1) return false;
  const best = instances.reduce((a, b) => (b.level > a.level ? b : a));
  gameState.activeCompanion = key;
  gameState.activeCompanionInstanceId = best.id;
  saveState();
  return true;
}

// Liefert das aktuell aktive Looma (CREATURES-Eintrag) oder null. Raeumt
// dabei automatisch auf, falls der Spieler das aktive Looma zwischenzeitlich
// komplett gegen Schatten-Essenz eingetauscht hat (siehe
// exchangeCreatureForEssence() oben) -- ein Begleiter ohne verbleibendes
// Exemplar darf nicht "aktiv" bleiben, sonst haette niemand ein Habitat, in
// dem er ruhen koennte.
function getActiveCompanion() {
  const key = gameState.activeCompanion;
  if (!key || !CREATURES[key] || !getActiveCompanionInstance()) return null;
  return CREATURES[key];
}

// Liefert die konkrete Instanz (siehe caughtCreatures-Format oben) des
// aktiven Begleiters, also inkl. dessen individuellem Level -- oder null,
// wenn kein Begleiter aktiv ist oder dessen Instanz nicht mehr existiert
// (z.B. weil sie zwischenzeitlich eingetauscht wurde). Raeumt einen
// verwaisten Begleiter-State dabei automatisch auf.
function getActiveCompanionInstance() {
  const key = gameState.activeCompanion;
  if (!key) return null;
  const instance = caughtInstances(key).find((inst) => inst.id === gameState.activeCompanionInstanceId);
  if (!instance) {
    gameState.activeCompanion = null;
    gameState.activeCompanionInstanceId = null;
    saveState();
    return null;
  }
  return instance;
}

// Kampfwerte (Angriffskraft/Verteidigung/Gesundheit) des aktiven Begleiters
// auf seinem aktuellen Level, oder null ohne aktiven Begleiter.
function activeCompanionStats() {
  const key = gameState.activeCompanion;
  const instance = getActiveCompanionInstance();
  if (!key || !instance) return null;
  return loomaStatsAtLevel(CREATURES[key].rarity, instance.level);
}

// ============ Rundenbasiertes Fangsystem: Kampfwerte ============
// Siehe Rundenbasiertes-Fangsystem-Briefing. Offene Frage im Briefing
// (User-Entscheidung): das Level des wilden Loomas orientiert sich am Level
// des AKTIVEN BEGLEITERS, nicht am Spieler-Charakterlevel -- nur die
// Begleiter-Werte sind im Kampf relevant, ein hohes Charakterlevel mit
// niedrig-levelndem Begleiter waere sonst unfair benachteiligt.
function wildLoomaBattleLevel() {
  const instance = getActiveCompanionInstance();
  const level = instance ? instance.level : 1;
  return Math.max(1, Math.min(LOOMA_MAX_LEVEL, level));
}

// Kampfwerte des wilden Loomas fuer die aktuelle Begegnung -- nicht
// persistiert (wilde Loomas haben kein eigenes gespeichertes Level, nur
// gefangene Instanzen haben eins, siehe caughtCreatures oben).
//
// Nutzt bewusst die RARITAET DES BEGLEITERS statt der eigenen Raritaet des
// wilden Loomas fuer die Statwerte-Groessenordnung (User-Feedback nach
// echtem Gameplay-Test: ein Episch-Begleiter/Shiny war gegen ein
// gleich-levelndes Selten-Wildlooma massiv ueberlegen, obwohl das Level
// schon korrekt angepasst war -- Raritaet macht bei gleichem Level naemlich
// selbst nochmal fast den doppelten Statwert aus, siehe
// LOOMA_RARITY_BASE_STATS). Sonst waere jede Begegnung nur noch davon
// abhaengig, welche Art von Wildlooma zufaellig in der Naehe spawnt, statt
// vom eigenen Fortschritt. Die EIGENE Raritaet des wilden Loomas bleibt
// trotzdem bedeutsam -- sie bestimmt weiterhin die Zielfenster-Groesse/
// -Geschwindigkeit (siehe BATTLE_HIT_WINDOW_BY_RARITY/
// BATTLE_TIMING_DURATION_MS_BY_RARITY in js/data.js): seltenere Loomas
// bleiben also schwerer zu TREFFEN, ohne zusaetzlich auch noch rohe
// Kampfkraft aufzustapeln.
function wildLoomaBattleStats(creature) {
  const companion = CREATURES[gameState.activeCompanion];
  const rarity = companion ? companion.rarity : creature.rarity;
  return loomaStatsAtLevel(rarity, wildLoomaBattleLevel());
}

// Kampfwerte, mit denen der SPIELER tatsaechlich kaempft: einfach die
// Basiswerte seines aktiven Begleiters (siehe activeCompanionStats() oben)
// -- Angriff/Verteidigung ueber Ausruestung war urspruenglich geplant, laut
// User-Entscheidung aber bewusst NICHT Teil des MVP (Kampfwerte sollen nur
// von den Loomas kommen, nicht vom Avatar). Null ohne aktiven Begleiter.
function playerBattleStats() {
  return activeCompanionStats();
}

// Schatten-Essenz-Kosten, um den aktiven Begleiter um genau 1 Level
// aufsteigen zu lassen -- null ohne aktiven Begleiter oder auf Max-Level.
function activeCompanionLevelUpCost() {
  const instance = getActiveCompanionInstance();
  if (!instance || instance.level >= LOOMA_MAX_LEVEL) return null;
  return loomaLevelUpCost(instance.level + 1);
}

// Laesst den aktiven Begleiter um 1 Level aufsteigen, sofern genug Schatten-
// Essenz vorhanden UND er noch nicht auf Max-Level ist. Gibt bei Erfolg das
// neue Level zurueck, sonst false (kein State-Change) -- die Essenz-Kosten
// haengen NICHT vom Rested-XP-Bonus ab (siehe Level-System-Briefing: das ist
// eine eigene, vom allgemeinen XP-System getrennte Ressource).
function levelUpActiveCompanion() {
  const instance = getActiveCompanionInstance();
  if (!instance || instance.level >= LOOMA_MAX_LEVEL) return false;
  const cost = loomaLevelUpCost(instance.level + 1);
  if (gameState.shadowEssence < cost) return false;
  gameState.shadowEssence -= cost;
  instance.level += 1;
  saveState();
  return instance.level;
}

// Obergrenze des spielerweiten Rested-XP-Pools: 100% der XP-Spanne vom
// aktuellen zum naechsten Level (relativ zur Levelgroesse statt eines fixen
// Werts, siehe RESTED_FULL_MS-Kommentar in data.js) -- waechst so
// automatisch mit dem Spielfortschritt. Am Levelcap (kein "naechstes Level"
// mehr) faellt sie auf die Spanne des letzten Levels zurueck.
function restedXpCap() {
  const level = xpToLevel(gameState.xp);
  if (level >= LEVEL_CAP) return xpForLevel(LEVEL_CAP) - xpForLevel(LEVEL_CAP - 1);
  return xpForLevel(level + 1) - xpForLevel(level);
}

// Siehe Habitat-Briefing Punkt 7: kein Rested-Bonus mehr, wenn das aktive
// Looma bereits sein Max-Level erreicht hat (LOOMA_MAX_LEVEL, siehe
// Level-System-Briefing). Ohne aktiven Begleiter greift der Rested-Bonus
// ohnehin nicht (settleRestedXp() sammelt dann gar nichts an), daher hier
// false statt true bei fehlendem Begleiter.
function isActiveCompanionMaxLevel() {
  const instance = getActiveCompanionInstance();
  return !!instance && instance.level >= LOOMA_MAX_LEVEL;
}

// Rechnet die seit Sitzungsende vergangene REALE Zeit in Rested-XP um (siehe
// RESTED_MIN_OFFLINE_MS/RESTED_FULL_MS in data.js) -- analog zu
// settleEnergy() oben, aber spielerweit statt pro Looma und nur, wenn beim
// Schliessen ein aktiver Begleiter gesetzt war (ohne Begleiter gibt es
// niemanden, der in einem Habitat haette ruhen koennen). Vom App-Start
// aufzurufen (siehe main.js).
function settleRestedXp() {
  const endedAt = gameState.sessionEndedAt;
  gameState.sessionEndedAt = null;
  if (!endedAt || !getActiveCompanion()) {
    saveState();
    return;
  }
  const elapsedMs = Date.now() - endedAt;
  if (elapsedMs >= RESTED_MIN_OFFLINE_MS) {
    const cap = restedXpCap();
    const gained = (elapsedMs / RESTED_FULL_MS) * cap;
    gameState.restedXpRemaining = Math.min(cap, (gameState.restedXpRemaining || 0) + gained);
  }
  saveState();
}

// Vom App-Lifecycle beim Verlassen/Verstecken der Seite aufzurufen (siehe
// main.js) -- haelt den Zeitpunkt fest, ab dem settleRestedXp() beim
// naechsten Start die vergangene Realzeit berechnet.
function markSessionEnded() {
  gameState.sessionEndedAt = Date.now();
  saveState();
}
