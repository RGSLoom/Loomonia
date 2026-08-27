// Datenmodell aus store-walk-spielspezifikation.md

const CATCH_RADIUS_M = 45;
const STORE_OFFSET_RADIUS_M = 190;
const CREATURE_STORE_SPAWN_RADIUS_M = 65;
const CREATURE_FREE_SPAWN_RADIUS_M = 180;
const CREATURE_STORE_SPAWN_WEIGHT = 0.68;
// Regulaerer Nachspawn nach einem Fang/einer Flucht -- bewusst mehrere
// Minuten statt weniger Sekunden (war vorher 3,5-6 Sekunden, siehe
// User-Feedback 2026-08-22: machte den Fangversuch fast beliebig
// wiederholbar und damit Fangchance-Boost-Items wertlos, da man einfach
// sofort erneut antreten konnte).
const CREATURE_RESPAWN_MIN_MS = 2 * 60 * 1000;
const CREATURE_RESPAWN_MAX_MS = 3 * 60 * 1000;
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

// Der normale Spawn-Radius (auch der obige, groessere Boost-Radius) liegt
// deutlich ueber CATCH_RADIUS_M (45m) -- Wesen sollen ja Anlass zum Laufen
// geben. Direkt beim allerersten GPS-Fix fuehlte sich das aber so an, als
// waere im besten Fall nur 1 Wesen tatsaechlich sofort fangbar (siehe
// User-Feedback 2026-08-22). Zusaetzlich zum normalen Boost-Pool werden
// deshalb ein paar Wesen GARANTIERT innerhalb der Fang-Reichweite gespawnt
// (spawnGuaranteedStarterCreatures() in js/map.js), mit Sicherheitsabstand
// zu CATCH_RADIUS_M fuer GPS-Ungenauigkeit.
const SPAWN_BOOST_GUARANTEED_NEARBY_COUNT = 5;
const SPAWN_BOOST_GUARANTEED_NEARBY_MIN_RADIUS_M = 8;
const SPAWN_BOOST_GUARANTEED_NEARBY_MAX_RADIUS_M = 35;

// Der Einstiegs-Spawn-Boost lief bisher bei JEDEM App-Start neu an (siehe
// Kommentar oben) -- kombiniert mit den garantierten Nahspawns liess sich
// das dadurch ausnutzen: alle Wesen fangen, App/Browser neu laden, sofort
// wieder volle Ladung. gameState.lastSpawnBoostTriggeredAt (persistiert,
// siehe js/state.js) sperrt ein Neu-Ausloesen fuer diese Cooldown-Dauer,
// unabhaengig davon wie oft man die Seite neu laedt.
const SPAWN_BOOST_RETRIGGER_COOLDOWN_MS = 5 * 60 * 1000;

// ============ Rundenbasiertes Fangsystem (Timing-Mechanik) ============
// Siehe Rundenbasiertes-Fangsystem-Briefing + User-Korrektur danach: DREI
// unterschiedliche Widgets statt einer geteilten Ring-Mechanik fuer alle drei
// Aktionen (siehe js/catchgame.js) --
//   Angriff: Ring gedrueckt HALTEN, schrumpft waehrenddessen, Loslassen wertet
//     die Naehe zum Zentrum (Halten-Loslassen statt Antippen).
//   Ausweichen: der Ring wird durch einen pulsierenden Gefahren-Glow ums
//     wilde Looma ersetzt, Wegwischen (beliebige Richtung, nur Timing zaehlt)
//     statt Antippen.
//   Fangen: der urspruengliche Pendel-Balken (rot-gruen-rot) kehrt zurueck,
//     einmal antippen in der gruenen Zone.
// Trotz unterschiedlicher Widgets nutzen alle drei dieselbe zugrundeliegende
// Praezisions-Mathematik (battleTimingFactor() unten) mit denselben
// Konstanten -- nur die visuelle Darstellung + der Eingabe-Geste
// unterscheiden sich.

// Zielfenster-Groesse (0..1) je Raritaet des WILDEN Loomas -- gilt einheitlich
// fuer Angriff/Ausweichen/Fangen (siehe Briefing "Timing-Mechanik": staerker/
// seltener = kleineres Zielfenster = schwerer). Fuers Fangen kommt in
// currentBattleHitWindow() (js/catchgame.js) zusaetzlich der Matchup-Bonus
// (Item-/Ausruestungs-Fangchance + Element-Vorteil) obendrauf.
const BATTLE_HIT_WINDOW_BY_RARITY = {
  "Gewöhnlich": 0.34,
  "Ungewöhnlich": 0.28,
  "Selten": 0.22,
  "Episch": 0.17,
  "Legendär": 0.13,
};

// Dauer eines Timing-Durchlaufs in ms je Raritaet (Ring-Pulsschlag beim
// Angriff, Gefahren-Puls beim Ausweichen, ein Balken-Durchlauf beim Fangen)
// -- macht seltenere Loomas zusaetzlich zum kleineren Zielfenster auch noch
// schneller/hektischer.
const BATTLE_TIMING_DURATION_MS_BY_RARITY = {
  "Gewöhnlich": 1400,
  "Ungewöhnlich": 1200,
  "Selten": 1000,
  "Episch": 850,
  "Legendär": 700,
};

// Fokuszeit (siehe ITEMS.fokuszeit): verlangsamt das aktuelle Timing-Widget
// fuer den Rest der Begegnung um diesen Faktor (>1 = langsamer = mehr
// Reaktionszeit), siehe useFokuszeit() in js/catchgame.js.
const FOKUSZEIT_SLOWDOWN_FACTOR = 1.6;

// Praezisions-Faktor (1 = exakter Treffer im Zentrum, faellt linear auf 0 am
// Rand des Zielfensters, 0 = verfehlt) -- die vom Briefing offen gelassene
// "Staffelung/Kurve" (Umsetzungsdetail). `distance` ist der Abstand vom
// Zielpunkt zum Auswertungszeitpunkt (0 = exakt getroffen, 1 = maximaler
// Abstand), unabhaengig vom konkreten Widget (Ring/Puls/Balken).
function battleTimingFactor(distance, hitWindow) {
  if (distance >= hitWindow) return 0;
  return 1 - distance / hitWindow;
}

// Schadensformel: Basis-Angriffskraft x Timing-Faktor x Element-Multiplikator
// (siehe effectiveAttack() oben), zusaetzlich gemindert durch die
// Verteidigung des Ziels (im Briefing selbst nicht erwaehnt, aber ohne das
// waere der laengst vorhandene Verteidigungs-Stat + 4 der 6 Ausruestungs-
// Slots komplett wirkungslos -- User-Entscheidung). BATTLE_DAMAGE_FACTOR
// gleicht dabei aus, dass Angriffskraft/Gesundheit sich in ihrer Groessenordnung
// nicht direkt entsprechen (Angriffskraft ist bei allen Raritaeten/Leveln
// konstant ~14% der Gesundheit, siehe LOOMA_RARITY_BASE_STATS) -- Ziel ist ein
// ausgeglichener Kampf mit ca. 4-6 Runden statt eines One-Hit-Kills oder eines
// endlosen Schlagabtauschs (siehe zusaetzlich BATTLE_MAX_ROUNDS unten).
const BATTLE_DAMAGE_FACTOR = 4;
function battleDamage(attackerAngriff, defenderVerteidigung, timingFactor, elementMultiplier) {
  if (timingFactor <= 0) return 0;
  const mitigation = attackerAngriff / (attackerAngriff + defenderVerteidigung);
  return Math.round(attackerAngriff * timingFactor * elementMultiplier * mitigation * BATTLE_DAMAGE_FACTOR);
}

// Sicherheitsnetz gegen One-Hit-Kills (User-Vorgabe: "auch nicht so ein one
// hit move"): BATTLE_DAMAGE_FACTOR ist auf ausgeglichene Matchups kalibriert,
// aber ein Begleiter mit stark gelevelter Ausruestung kann die Basiswerte
// eines gleich-levelnden wilden Loomas trotzdem um ein Vielfaches uebertreffen
// (Ausruestungs-Boni fliessen NICHT in die Gegner-Skalierung ein, siehe
// wildLoomaBattleStats() in js/state.js). Ein einzelner Treffer darf deshalb
// nie mehr als diesen Anteil der MAXIMALEN Energie des Ziels abziehen --
// bewusst an der MAXIMAL-Energie festgemacht statt an der jeweils aktuellen
// (ein Cap relativ zur aktuellen Energie wuerde sich bei jedem Treffer erneut
// halbieren und so bei extremer Uebermacht paradoxerweise IMMER MEHR Treffer
// brauchen statt weniger). So sind es bei normaler Balance ohnehin schon
// weniger Treffer noetig, bei extremer Ausruestungs-Uebermacht aber IMMER
// GENAU 2 (nie 1) -- greift bei normal ausgeglichenen Kaempfen gar nicht ein,
// dort liegt ein Treffer ueblicherweise deutlich darunter.
const BATTLE_MAX_DAMAGE_SHARE = 0.5;
function clampBattleDamage(rawDamage, maxEnergy) {
  return Math.min(rawDamage, Math.ceil(maxEnergy * BATTLE_MAX_DAMAGE_SHARE));
}

// Harte Rundenobergrenze (User-Wunsch: auch ein ausgeglichener Kampf darf
// nicht endlos dauern). Wird sie erreicht, ohne dass eine Seite auf 0 Energie
// ist, flieht das wilde Looma erschoepft -- siehe Rundenobergrenze-Check in
// resolveDodge() in js/catchgame.js.
const BATTLE_MAX_ROUNDS = 10;

// Die drei gewoehnlichen Loomas, aus denen ein brandneuer Spieler beim ersten
// App-Start seinen Start-Begleiter waehlt (siehe screen-starter-pick in
// index.html + chooseStarterCreature() in js/state.js) -- ohne aktiven
// Begleiter koennte niemand den allerersten Kampf bestreiten (User-Vorgabe).
const STARTER_CREATURE_KEYS = ["fauli", "fifu", "enari"];

const DRAW_CONFIG = {
  viewBox: 220,
  toleranceRadius: 32,
  successThreshold: 0.42,
  shapes: ["kreis", "welle", "zickzack", "dreieck", "quadrat"],
};

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

// ============ Kampf-Energie (Fangszene) ============
// Eigener Name bewusst NICHT "Energie" wie ENERGY_MAX oben -- das ist eine
// komplett andere Ressource (regeneriert ueber echte Zeit, gated NUR, ob
// ueberhaupt eine Begegnung gestartet werden darf). Kampf-Energie existiert
// NUR fuer die Dauer einer einzelnen Begegnung (siehe catchState in
// js/catchgame.js), fuer BEIDE Seiten -- Spieler kaempft mit den Werten
// seines aktiven Begleiters (playerBattleStats() in js/state.js), das wilde
// Looma mit seinen eigenen (wildLoomaBattleStats()). Kein eigener Max-Wert
// hier: die Gesundheit-Basiswerte aus dem Looma-Level-System (siehe
// LOOMA_RARITY_BASE_STATS oben) sind bereits die Kampf-Energie-Obergrenze
// (Briefing: "Konkrete Zahlenwerte fuer Energie-Mengen werden aus dem
// bestehenden Looma-Level-System uebernommen").

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

// ============ Habitat / Rested-XP ============
// Rested-XP-System (angelehnt an "Rested" aus World of Warcraft, siehe
// Habitat-Briefing): waehrend die App geschlossen ist, ruht das aktive
// Looma (gameState.activeCompanion, siehe js/state.js) in seinem
// Element-Habitat und sammelt einen SPIELERWEITEN (nicht pro Looma) Bonus-
// Pool an, der beim naechsten XP-Gewinn verdoppelt gutgeschrieben wird, bis
// der Pool aufgebraucht ist (siehe addXp()/settleRestedXp() in js/state.js).
// Unter 10 Minuten geschlossener Zeit entsteht bewusst kein Bonus (verhindert
// Trittbrettfahren durch kurzes Neuladen).
const RESTED_MIN_OFFLINE_MS = 10 * 60 * 1000;
// Nach 12h durchgehend geschlossener Zeit ist der Pool voll ("ueber Nacht
// ausgeruht"). Die Obergrenze selbst ist bewusst NICHT fix, sondern
// levelabhaengig (siehe RESTED_XP_CAP_FRACTION + restedXpCap() in
// js/state.js) -- waechst so automatisch mit dem Spielfortschritt statt
// spaeter manuell nachjustiert werden zu muessen.
const RESTED_FULL_MS = 12 * 60 * 60 * 1000;
// Anteil der XP-Spanne bis zum naechsten Level, den der volle Rested-Pool
// ausmacht. War 1.0 (ganze Levelspanne) -- auf 0.5 halbiert (User-Feedback
// 2026-08-27: der angesammelte Bonus nach 6-12h offline war zu hoch). Gilt
// linear fuer jede Offline-Dauer, also z.B. 6h -> 25%, 12h -> 50% der
// Levelspanne statt vorher 50% / 100%.
const RESTED_XP_CAP_FRACTION = 0.5;

// Die sechs Habitate + ihr Element (siehe Habitat-Briefing). Ein Looma ruht
// nur im Habitat seines EIGENEN Elements.
const HABITATS = [
  { element: "Erde", icon: "🌍" },
  { element: "Feuer", icon: "🔥" },
  { element: "Wasser", icon: "💧" },
  { element: "Luft", icon: "💨" },
  { element: "Licht", icon: "✨" },
  { element: "Schatten", icon: "🌑" },
];

// CREATURES verwendet fuer Fauli das Element "Natur" statt eines der sechs
// Habitat-Elemente (historisch gewachsen, siehe CREATURES unten) -- bildet
// hier auf das inhaltlich naechstliegende Habitat ab, statt CREATURES
// rueckwirkend umzubenennen und dadurch evtl. anderswo (Filter/Icons) etwas
// zu brechen, das sich auf den Wert "Natur" verlaesst.
const CREATURE_ELEMENT_TO_HABITAT = { Natur: "Erde" };

function habitatElementForCreature(creature) {
  return CREATURE_ELEMENT_TO_HABITAT[creature.element] || creature.element;
}

// ============ Element-Typen-System ============
// Siehe Element-Typen-System-Briefing. Definiert, welches Element beim
// Angriff einen Bonus gegen welches andere Element bekommt -- rein einseitig
// ueber die Angriffskraft des ANGREIFENDEN Loomas, keine Verteidigungs-Seite
// betroffen. Zwei getrennte Gruppen: der Vier-Elemente-Kreislauf
// (Wasser/Feuer/Luft/Erde, einseitig gerichtet) und das duale
// Licht/Schatten-Paar (wechselseitig, deshalb hier auf beiden Seiten
// eingetragen). Eigene Konstante statt von HABITATS abgeleitet, da es hier
// nur um Kampf-Beziehungen geht, nicht um Ruhe-Habitate.
const ELEMENT_ADVANTAGE = {
  Erde: ["Wasser"],
  Feuer: ["Luft"],
  Wasser: ["Feuer"],
  Luft: ["Erde"],
  Licht: ["Schatten"],
  Schatten: ["Licht"],
};

const ELEMENT_ADVANTAGE_MULTIPLIER = 1.25;

// Multiplikator, den `attackerElement` beim Angriff auf `defenderElement`
// bekommt (1.25 bei Vorteil laut ELEMENT_ADVANTAGE oben, sonst neutral 1).
// Erwartet bereits auf die sechs Kampf-Elemente abgebildete Werte als Eingabe
// -- fuer Loomas mit Sonderfaellen wie Faulis "Natur"-Element vorher
// habitatElementForCreature() aufrufen (siehe CREATURE_ELEMENT_TO_HABITAT
// oben), da "Natur" selbst kein Eintrag in ELEMENT_ADVANTAGE ist.
function elementAttackMultiplier(attackerElement, defenderElement) {
  const advantages = ELEMENT_ADVANTAGE[attackerElement];
  return advantages && advantages.includes(defenderElement) ? ELEMENT_ADVANTAGE_MULTIPLIER : 1;
}

// Effektive Angriffskraft eines angreifenden gegen ein verteidigendes Looma:
// wendet den Element-Bonus (falls vorhanden) auf die uebergebene
// Angriffskraft an. Es gibt laut Briefing keinen separaten
// Ausruestungs-Elementbonus -- der Multiplikator wirkt einheitlich auf den
// finalen Angriffswert.
function effectiveAttack(attackerAngriff, attackerElement, defenderElement) {
  return attackerAngriff * elementAttackMultiplier(attackerElement, defenderElement);
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

// Aufsteigende Seltenheits-Reihenfolge (weiss -> gruen -> blau -> lila ->
// gold), fuer die Sortierfunktion im Items-Screen (siehe renderItemsGrid()
// in js/profile.js) -- dieselbe Stufenfolge wie RARITY_COLORS oben, nur als
// Array statt als Lookup, weil hier die Reihenfolge selbst die Nutzlast ist.
const RARITY_ORDER = ["Gewöhnlich", "Ungewöhnlich", "Selten", "Episch", "Legendär"];

// ============ Sprachsystem der Loomas (Spracherwerb-Briefing) ============
// EIN account-weiter Fortschrittsbalken (kein Fortschritt pro Looma), gefuellt
// ueber Sprachbuch-Items (siehe ITEMS.sprachbuch* + applyLanguageBook() in
// js/state.js). 7 Module (angelehnt an CEFR A1..C2), je 8 Kapitel a 100
// Sprachpunkte -> 5600 Punkte bis "Meisterhaft". Diese Liste ist die
// Konfiguration aus dem Briefing (dort als Supabase-Tabelle language_modules
// gedacht) -- da dieser Prototyp keinen Account-/Backend-Sync fuer den
// Spielerzustand hat (alles laeuft ueber localStorage/gameState), liegt sie
// hier als datengetriebene Liste wie CREATURES/ITEMS/TROPHIES: Kapitelanzahl,
// Punktebedarf und Klartext-Namen lassen sich hier aendern, ohne sonstigen
// Code anzufassen. `cefrKey` ist NUR interner Schluessel und darf nie als
// sichtbarer Text im Spiel erscheinen -- angezeigt wird ausschliesslich
// `displayName`.
const LANGUAGE_MODULES = [
  { moduleIndex: 0, cefrKey: "a1",      displayName: "Anfänger",                     chaptersRequired: 8, pointsPerChapter: 100 },
  { moduleIndex: 1, cefrKey: "a2",      displayName: "Fortgeschrittener Anfänger",   chaptersRequired: 8, pointsPerChapter: 100 },
  { moduleIndex: 2, cefrKey: "b1",      displayName: "Mittelstufe",                  chaptersRequired: 8, pointsPerChapter: 100 },
  { moduleIndex: 3, cefrKey: "b2",      displayName: "Fortgeschrittene Mittelstufe", chaptersRequired: 8, pointsPerChapter: 100 },
  { moduleIndex: 4, cefrKey: "b2_plus", displayName: "Obere Mittelstufe",            chaptersRequired: 8, pointsPerChapter: 100 },
  { moduleIndex: 5, cefrKey: "c1",      displayName: "Fortgeschritten",              chaptersRequired: 8, pointsPerChapter: 100 },
  { moduleIndex: 6, cefrKey: "c2",      displayName: "Meisterhaft",                  chaptersRequired: 8, pointsPerChapter: 100 },
];

// Farbskala der Sprachbuecher (eigene, kleinere Skala als die allgemeine
// Item-Seltenheit) -> Sprachpunkte pro Buch. Siehe ITEMS.sprachbuch* unten.
const LANGUAGE_BOOK_POINTS = { "Weiß": 5, "Grün": 10, "Blau": 20 };

// ============ Looma-Level-System ============
// Siehe Level-System-Briefing. Baut auf dem Habitat-Briefing auf (Rested-XP
// wirkt NICHT auf den Levelaufstieg selbst, siehe isActiveCompanionMaxLevel()
// in js/state.js). Jedes einzeln gefangene Looma-Exemplar bekommt ein eigenes
// Level (siehe gameState.caughtCreatures-Instanzformat in js/state.js), nicht
// nur der Spieler als Ganzes -- unabhaengig vom bereits bestehenden
// Spieler-Levelsystem oben (LEVEL_CAP/xpForLevel()).
const LOOMA_MAX_LEVEL = 50;

// Basiswerte (Level 1) der drei Kernattribute je Raritaetsstufe, aus dem
// Briefing uebernommen -- skalieren proportional mit denselben Multiplikatoren
// wie die Gesundheit (Weiss x1, Gruen x2, Blau x5, Lila x10, Gold x20), hier
// aber direkt als Endwerte hinterlegt statt ueber einen Multiplikator
// berechnet, da Angriffskraft/Verteidigung nicht exakt denselben
// Weiss-Basiswert wie Gesundheit haben.
const LOOMA_RARITY_BASE_STATS = {
  "Gewöhnlich": { angriff: 14, verteidigung: 12, gesundheit: 100 },
  "Ungewöhnlich": { angriff: 28, verteidigung: 24, gesundheit: 200 },
  "Selten": { angriff: 70, verteidigung: 60, gesundheit: 500 },
  "Episch": { angriff: 140, verteidigung: 120, gesundheit: 1000 },
  "Legendär": { angriff: 280, verteidigung: 240, gesundheit: 2000 },
};

// Gesamtwachstum ueber die volle Levelspanne (Level 1 bis LOOMA_MAX_LEVEL):
// 200% Zuwachs = Verdreifachung bis Max-Level, wie im Briefing als Endwert-
// Beispiel vorgerechnet (z.B. Weiss-Angriffskraft 14 -> 42). Als Bruchteil
// von (LOOMA_MAX_LEVEL - 1) Levelschritten statt fix "4% pro Level"
// hinterlegt, damit Level 1 exakt dem Basiswert entspricht UND Level
// LOOMA_MAX_LEVEL exakt der dreifache Basiswert ist (eine feste 4%-pro-Level-
// Rate ueber 49 Schritte traefe die vorgerechnete Verdreifachung nur naeherungsweise).
const LOOMA_STAT_GROWTH_TOTAL = 2;

// Kampfwert eines einzelnen Attributs bei gegebener Raritaet und Level.
function loomaStatAtLevel(rarity, level, statKey) {
  const base = LOOMA_RARITY_BASE_STATS[rarity][statKey];
  const growthFraction = (Math.min(level, LOOMA_MAX_LEVEL) - 1) / (LOOMA_MAX_LEVEL - 1);
  return Math.round(base * (1 + LOOMA_STAT_GROWTH_TOTAL * growthFraction));
}

// Alle drei Kernattribute auf einmal fuer eine Raritaet+Level-Kombination.
function loomaStatsAtLevel(rarity, level) {
  return {
    angriff: loomaStatAtLevel(rarity, level, "angriff"),
    verteidigung: loomaStatAtLevel(rarity, level, "verteidigung"),
    gesundheit: loomaStatAtLevel(rarity, level, "gesundheit"),
  };
}

// Einzelne "Kampfkraft"-Kennzahl aus den drei Kernattributen fuer die
// Habitat-Anzeige (siehe renderHabitatContent() in js/profile.js) -- kein
// Wert aus einem Briefing, sondern eine eigene Interpretationsentscheidung:
// Angriff+Verteidigung direkt summiert, Gesundheit durch 10 geteilt, damit
// deren viel groessere Zahlenskala (100-2000+) die Kampfkraft nicht komplett
// dominiert.
function loomaCombatPower(stats) {
  return stats.angriff + stats.verteidigung + Math.round(stats.gesundheit / 10);
}

// Schatten-Essenz-Kosten fuer den Aufstieg AUF `targetLevel` (von
// targetLevel-1), quadratische Kurve aus dem Briefing -- gilt unabhaengig von
// der Raritaet, jedes Looma zahlt fuer denselben Levelschritt denselben
// Essenz-Betrag.
function loomaLevelUpCost(targetLevel) {
  return 1000 * targetLevel * targetLevel;
}

// Eintausch-Ertrag beim Eintauschen EINES Duplikat-Looma gegen Schatten-
// Essenz, raritaetsabhaengig gestaffelt (ersetzt den bisherigen pauschalen
// 1000er-Kurs, siehe Level-System-Briefing "Schatten-Essenz-Ertrag beim
// Tauschen von Duplikaten").
const SHADOW_ESSENCE_PER_CREATURE_BY_RARITY = {
  "Gewöhnlich": 500,
  "Ungewöhnlich": 1000,
  "Selten": 1500,
  "Episch": 2000,
  "Legendär": 2500,
};

// ============ Ausruestungs-Level-System ============
// Siehe Ausruestungs-Level-System-Briefing (baut auf dem Avatar-Outfit-
// Briefing + dem Looma-Level-System oben auf). Jedes Ausruestungsteil
// (kopfteil/oberteil/hose/sneaker/accessoire/outfit) hat ein EIGENES Level,
// unabhaengig vom Looma-Level -- Max-Level einheitlich fuer alle Slots.
const EQUIPMENT_MAX_LEVEL = 20;

// Feed-Punkte, die ein verfuettertes Item abhaengig von SEINER EIGENEN
// Raritaet bringt (nicht die des Ziel-Items) -- siehe Briefing.
const EQUIPMENT_FEED_POINTS_BY_RARITY = {
  "Gewöhnlich": 1,
  "Ungewöhnlich": 2,
  "Selten": 3,
  "Episch": 4,
  "Legendär": 5,
};

// Feed-Punkte-Kosten fuer den Aufstieg VON Level `level` AUF `level + 1`
// (nur fuer level < EQUIPMENT_MAX_LEVEL gueltig), aus dem Briefing.
function equipmentFeedCostForLevel(level) {
  return level * 5;
}

// Muenzkosten-Raritaetsfaktor -- bewusst sanft gestaffelt (nicht wie die
// x1/x2/x5/x10/x20-Basiswert-Multiplikatoren), da Muenzen laut Briefing nur
// spaerlich hereinkommen. Bezieht sich auf die Raritaet des Ziel-Items
// selbst (das Item, das gelevelt wird), nicht auf das verfuetterte Item --
// eigene Interpretation, im Briefing nicht explizit disambiguiert (siehe
// Level-System-Briefing Ausruestung).
const EQUIPMENT_COIN_RARITY_FACTOR = {
  "Gewöhnlich": 1,
  "Ungewöhnlich": 1.3,
  "Selten": 1.6,
  "Episch": 2,
  "Legendär": 3,
};

// Muenzkosten fuer den Aufstieg VON Level `level` AUF `level + 1`.
function equipmentCoinCostForLevel(level, rarity) {
  return Math.round(level * (EQUIPMENT_COIN_RARITY_FACTOR[rarity] || 1));
}

// ============ Trophaeen ============
// Referenzliste siehe store-walk-spielspezifikation.md Abschnitt 7. Fuer den
// Prototyp ist bislang nur "Erster Schritt" spielbar umgesetzt — sie wird
// automatisch ueber den allerersten erfolgreichen Bon-Scan freigeschaltet
// (siehe grantReceiptItems() in js/bonscan.js) und ist zugleich die
// Belohnung der ersten Tutorial-Quest ("Gehe in einen Laden und kaufe einen
// Gegenstand"). Die 2.500-XP-Belohnung hier ersetzt bewusst den in der
// Spezifikation urspruenglich notierten "+2% Bonus auf Drops"-Text.
// Gemeinsames Trophaeen-Icon (Pokal) fuer Profil-Kachel, Trophaeen-Screen
// und Quest-Hinweis — ein Pfad statt an mehreren Stellen dupliziert. Faerbung
// erfolgt ueber die bestehende Rarity-Farbskala (RARITY_COLORS oben), nicht
// ueber ein eigenes Bronze/Silber/Gold-Set — ein Icon reicht dadurch fuer
// beliebig viele zukuenftige Trophaeen, siehe renderTrophiesList() in
// js/profile.js.
const TROPHY_ICON_PATH =
  '<path d="M8 21h8M12 17v4M6 4h12v3a6 6 0 0 1-12 0V4Z"/><path d="M6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 1-3 3"/>';

// progressType/progressGoal treiben den Fortschrittsbalken in
// renderTrophiesList() (js/profile.js) ueber getTrophyProgress() in
// js/state.js -- fehlen sie, ist die Trophaee ein einmaliges Ereignis ohne
// Zaehler (z.B. "Erster Schritt").
const TROPHIES = {
  erster_schritt: {
    key: "erster_schritt",
    name: "Erster Schritt",
    rarity: "Gewöhnlich",
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
    rarity: "Ungewöhnlich",
    description: "Fange 5 gewöhnliche Loomas.",
    xp: 800,
    progressType: "caught_gewoehnlich",
    progressGoal: 5,
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
    rarity: "Selten",
    description: "Schließe 5 bestätigte Käufe ab.",
    xp: 1500,
    progressType: "receipt_scans",
    progressGoal: 5,
    // Episch/Legendaer sind laut Spielspezifikation keine Zufalls-Drops aus
    // Stores (siehe Kommentar bei ITEMS unten) — hoodie ist deshalb bislang
    // keinem Store-/Bon-Pool zugeordnet und nur ueber diese Trophaee
    // erreichbar.
    itemKey: "hoodie",
  },
  seltene_beute: {
    key: "seltene_beute",
    name: "Seltene Beute",
    rarity: "Legendär",
    description: "Fange 10 seltene Loomas.",
    xp: 3000,
    progressType: "caught_selten",
    progressGoal: 10,
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
    icon: "assets/wesen/fifu_icon.png",
    // Neues Bild hat schon einen echten Alphakanal, siehe moosilda-Kommentar
    // weiter unten -- Laufzeit-Weissabgleich wuerde es kaputt-loechern.
    iconAlreadyTransparent: true,
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
    // Ebenfalls schon echt freigestellt, siehe moosilda-Kommentar weiter unten.
    iconAlreadyTransparent: true,
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
    // Ebenfalls schon echt freigestellt, siehe moosilda-Kommentar weiter unten.
    iconAlreadyTransparent: true,
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
    icon: "assets/wesen/Wolly_Pig_icon.png",
    // Im Gegensatz zu Fauli bereits echt freigestellt (Alphakanal vorhanden)
    // -- Laufzeit-Weissabgleich (getCutoutImage) wuerde hier nur helle
    // Fellstellen kaputt-loechern, siehe map.js.
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
  fenny: {
    key: "fenny",
    name: "Fenny",
    element: "Licht",
    elementIcon: "✨",
    color: "#fde047",
    rarity: "Ungewöhnlich",
    xp: 300,
    icon: "assets/wesen/Fenny_icon.png",
    // Bereits echt freigestellt (Alphakanal vorhanden), siehe
    // moosilda-Kommentar oben.
    iconAlreadyTransparent: true,
    // Kein eigener Hintergrund geliefert -- nutzt denselben Lichtreich-
    // Hintergrund wie Ashira (bislang einziges andere Licht-Wesen).
    scene: "assets/hintergrund/Lichtreich.png",
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
    // War urspruenglich 25%/30 Min (siehe store-walk-spielspezifikation.md)
    // -- Wert auf 10% reduziert (User-Feedback 2026-08-22, erst auf 8% dann
    // auf 10% nachjustiert): 25% war fuer ein Gewoehnlich-Item hoeher als der
    // XP-Boost mancher Ungewoehnlich-/Selten-Items (energieriegel_plus 15%,
    // suessigkeit 20%), was die Seltenheits-Rangfolge unterlaufen hat. Dauer
    // ebenfalls auf 10 Min gekuerzt (User-Feedback) -- kein laengerer
    // Vorteil mehr ggue. den anderen 10-Minuten-Items derselben Stufe.
    effect: "+10 % XP-Boost für 10 Minuten",
    unlockText: "Kostenloser Drop an Standorten",
    usage_context: "jederzeit",
    effectType: "xp_boost",
    effectValue: 0.1,
    effectDurationMs: 10 * 60 * 1000,
  },
  // ============ Sprachbuecher (Spracherwerb-Briefing) ============
  // Verbrauchsitems, die beim Einsetzen sofort Sprachpunkte auf den
  // account-weiten Sprachfortschritt gutschreiben (siehe applyLanguageBook()
  // in js/state.js + LANGUAGE_MODULES in data.js). Eigene kleine Farbskala
  // (Weiss 5 / Gruen 10 / Blau 20 Punkte) ueber `bookColor`/`languagePoints`
  // -- unabhaengig von der allgemeinen Item-Seltenheit `rarity` (die nur die
  // Sortierung im Items-Screen steuert). `usage_context: "sprachbuch"` gibt
  // ihnen in profile.js einen echten "Verwenden"-Button.
  // `sprachbuch` ist die bestehende Weiss-Stufe (Key unveraendert, damit
  // Bestandsinventare + Drop-/Trophaeen-Pools weiter passen), die beiden
  // anderen Farben kommen neu dazu. Alle drei teilen sich vorerst dasselbe
  // Platzhalter-Icon -- finale Grafik pro Farbe einfach ins `icon`-Feld.
  sprachbuch: {
    key: "sprachbuch",
    name: "Sprachbuch (Weiß)",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/sprachbuch_icon.png",
    type: "Verbrauchbar",
    effect: "+5 Sprachpunkte für den Spracherwerb deiner Loomas",
    unlockText: "Kostenloser Drop an Standorten",
    usage_context: "sprachbuch",
    bookColor: "Weiß",
    languagePoints: 5,
  },
  sprachbuch_gruen: {
    key: "sprachbuch_gruen",
    name: "Sprachbuch (Grün)",
    rarity: "Ungewöhnlich",
    xp: 20,
    icon: "assets/items/sprachbuch_icon.png",
    type: "Verbrauchbar",
    effect: "+10 Sprachpunkte für den Spracherwerb deiner Loomas",
    unlockText: "Kostenloser Drop an Standorten",
    usage_context: "sprachbuch",
    bookColor: "Grün",
    languagePoints: 10,
  },
  sprachbuch_blau: {
    key: "sprachbuch_blau",
    name: "Sprachbuch (Blau)",
    rarity: "Selten",
    xp: 30,
    icon: "assets/items/sprachbuch_icon.png",
    type: "Verbrauchbar",
    effect: "+20 Sprachpunkte für den Spracherwerb deiner Loomas",
    unlockText: "Kostenloser Drop an Standorten",
    usage_context: "sprachbuch",
    bookColor: "Blau",
    languagePoints: 20,
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
    usage_context: "jederzeit",
    effectType: "energie_restore",
    effectValue: 0.5,
  },
  gesundheitspaket: {
    key: "gesundheitspaket",
    name: "Gesundheits-Paket",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/gesundheitspaket_icon.png",
    type: "Verbrauchbar",
    // Urspruenglicher Effekttext ("+25% XP-Boost beim Verwenden") war ein
    // Kopierfehler aus der Vorlage (siehe store-walk-spielspezifikation.md)
    // und passte nicht zum Namen -- jetzt das einzige echte Heilungsitem im
    // Sinne des Verbrauchsgegenstaende-Briefings (Spieler-Gesundheit in der
    // Fangszene), daher usage_context "fangsystem_only".
    effect: "+50 % Gesundheit sofort wiederherstellen (nur in der Fangszene)",
    unlockText: "Kostenloser Drop an Standorten",
    usage_context: "fangsystem_only",
    effectType: "gesundheit_restore",
    effectValue: 0.5,
  },
  sneaker: {
    key: "sneaker",
    name: "Stylische Sneaker",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/stylische-sneaker_icon.png",
    type: "Anlegbar",
    slotType: "sneaker",
    effect: "+5 % Fangchance beim Anlegen",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
    equipBonuses: { fangchance_boost: 0.05 },
  },
  rucksack: {
    key: "rucksack",
    name: "Abenteuerrucksack",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/abenteuerrucksack_icon.png",
    type: "Anlegbar",
    // Kein slotType -- erweitert spaeter die Inventarplaetze (eigene
    // Mechanik), ist aber kein kosmetisches Avatar-Ausruestungsteil und
    // taucht deshalb nicht im Outfit-Slot-System auf. Bewusst OHNE
    // equipBonuses: es gibt aktuell gar keine Inventarplatz-Obergrenze im
    // Spiel (Items stapeln unbegrenzt), es fehlt also die Mechanik, die
    // dieser Bonus ueberhaupt aufheben wuerde -- siehe Rueckmeldung an den
    // User dazu.
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
    slotType: "oberteil",
    effect: "+25 % Fangchance beim Anlegen",
    unlockText: "Exklusive Belohnung einer bestimmten Trophäe",
    equipBonuses: { fangchance_boost: 0.25 },
  },
  armband: {
    key: "armband",
    name: "Energie-Armband",
    rarity: "Legendär",
    xp: 200,
    icon: "assets/items/energiearmband_icon.png",
    type: "Anlegbar",
    slotType: "accessoire",
    effect: "+50 % XP beim Anlegen",
    unlockText: "Exklusive Belohnung einer bestimmten Trophäe",
    equipBonuses: { xp_boost: 0.5 },
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
    usage_context: "jederzeit",
    effectType: "loomas_anlocken",
    effectDurationMs: 7 * 24 * 60 * 60 * 1000,
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
  // BANK_DROP_COINS_MIN/MAX unten) — HUD-Anzeige am Avatar statt
  // Inventar-Karte.
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
    usage_context: "jederzeit",
    effectType: "energie_restore",
    effectValue: 0.1,
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
    usage_context: "jederzeit",
    effectType: "xp_boost",
    effectValue: 0.05,
    effectDurationMs: 10 * 60 * 1000,
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
    usage_context: "jederzeit",
    effectType: "loomas_anlocken",
    effectDurationMs: 10 * 60 * 1000,
  },
  schuhe: {
    key: "schuhe",
    name: "Schuhe",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/schuhe_icon.png",
    type: "Anlegbar",
    slotType: "sneaker",
    effect: "+5 % Fangchance beim Anlegen",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
    equipBonuses: { fangchance_boost: 0.05 },
  },
  uhr: {
    key: "uhr",
    name: "Uhr",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/Uhr_icon.png",
    type: "Anlegbar",
    slotType: "accessoire",
    effect: "+5 % XP beim Anlegen",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
    equipBonuses: { xp_boost: 0.05 },
  },
  frischedeo: {
    key: "frischedeo",
    name: "Frischedeo",
    rarity: "Gewöhnlich",
    xp: 15,
    icon: "assets/items/deo_icon.png",
    type: "Verbrauchbar",
    // Eigener Mechanismus statt der generischen "loomas_anlocken"-Logik
    // (Kaffeebecher/Lockduft-Flakon) -- konkret vom User spezifiziert
    // (2026-08-22): alle spawnIntervalMs EIN garantiertes Wesen direkt in
    // der Fangreichweite, aber immer nur eins gleichzeitig (kein Nachspawn,
    // solange das aktuelle noch nicht gefangen/geflohen ist). Siehe
    // tickFrischedeoSpawn() in js/map.js.
    effect: "Lässt 5 Minuten lang alle 45 Sekunden einen Loomas in deiner Fangreichweite erscheinen",
    unlockType: "standort",
    unlockText: "Kostenloser Drop an Standorten",
    usage_context: "jederzeit",
    effectType: "guaranteed_nearby_spawn",
    effectDurationMs: 5 * 60 * 1000,
    spawnIntervalMs: 45 * 1000,
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
    usage_context: "jederzeit",
    effectType: "fangchance_boost",
    effectValue: 0.1,
    effectDurationMs: 5 * 60 * 1000,
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
    usage_context: "jederzeit",
    effectType: "xp_boost",
    effectValue: 0.05,
    effectDurationMs: 10 * 60 * 1000,
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
    // Kontextgebunden wie Heilungsitems (siehe Verbrauchsgegenstaende-
    // Briefing), aber mit eigener bespoke-UI direkt in der Fangszene (siehe
    // btn-use-fokuszeit in index.html + useFokuszeit() in catchgame.js)
    // statt des generischen Heilungsitem-Auswahlmenues.
    usage_context: "fangsystem_only",
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
    usage_context: "jederzeit",
    effectType: "energie_restore",
    effectValue: 0.5,
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
    usage_context: "jederzeit",
    effectType: "xp_boost",
    effectValue: 0.15,
    effectDurationMs: 30 * 60 * 1000,
  },
  hose: {
    key: "hose",
    name: "Hose",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/hose_icon.png",
    type: "Anlegbar",
    slotType: "hose",
    effect: "+10 % Fangchance beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
    equipBonuses: { fangchance_boost: 0.1 },
  },
  oberteil: {
    key: "oberteil",
    name: "Oberteil",
    rarity: "Ungewöhnlich",
    xp: 30,
    icon: "assets/items/oberteil_icon.png",
    type: "Anlegbar",
    slotType: "oberteil",
    effect: "+10 % XP beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
    equipBonuses: { xp_boost: 0.1 },
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
    usage_context: "jederzeit",
    effectType: "energie_restore",
    effectValue: 0.3,
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
    usage_context: "jederzeit",
    effectType: "xp_boost",
    effectValue: 0.2,
    effectDurationMs: 30 * 60 * 1000,
  },
  stylische_kappe: {
    key: "stylische_kappe",
    name: "Stylische Kappe",
    rarity: "Selten",
    xp: 60,
    icon: "assets/items/stylische-kappe_icon.png",
    type: "Anlegbar",
    slotType: "kopfteil",
    effect: "+10 % Fangchance dauerhaft beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
    equipBonuses: { fangchance_boost: 0.1 },
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
    usage_context: "jederzeit",
    effectType: "fangchance_boost",
    effectValue: 0.15,
    effectDurationMs: 30 * 60 * 1000,
  },

  // Outfit-Slot deckt ein komplettes Set ab und schliesst sich mit den
  // fuenf Einzel-Slots gegenseitig aus (siehe equipItem() in state.js).
  // Aktuell nur EIN Beispiel-Item als Machbarkeits-Nachweis fuer den Slot —
  // weitere Outfits/Bezugswege (Drop-Gewichtung, eigene Grafiken) sind noch
  // nicht final spezifiziert.
  kosmoanzug: {
    key: "kosmoanzug",
    name: "Kosmoanzug",
    rarity: "Legendär",
    xp: 200,
    icon: "assets/items/placeholder_new_item.svg",
    type: "Anlegbar",
    slotType: "outfit",
    effect: "+15 % Fangchance und +15 % XP beim Anlegen",
    unlockType: "kauf",
    unlockText: "Dieses Item kann durch reale Käufe im Handel aktiviert werden",
    equipBonuses: { fangchance_boost: 0.15, xp_boost: 0.15 },
  },
};

// Die fuenf unabhaengig kombinierbaren Einzel-Slots der Avatar-Ausruestung —
// schliessen sich als Gruppe gegenseitig mit dem "outfit"-Slot aus (siehe
// equipItem() in state.js).
const AVATAR_SINGLE_SLOTS = ["kopfteil", "oberteil", "hose", "sneaker", "accessoire"];

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

// Items mit unlockType "kauf" (siehe ITEMS oben, "18 neue Items"-Briefing)
// sind explizit fuer den Erhalt durch echte Kaeufe vorgesehen -- automatisch
// ermittelt statt einzeln hier nachgetragen, damit ein spaeter neu
// hinzugefuegtes "kauf"-Item nicht vergessen werden kann.
const PURCHASE_UNLOCK_ITEM_KEYS = Object.values(ITEMS)
  .filter((item) => item.unlockType === "kauf")
  .map((item) => item.key);

// Item-Pool, aus dem beim Bon-Scan (siehe js/bonscan.js) das Zufalls-Item pro
// gegen die Store-Artikelliste erkanntem Treffer gezogen wird (Fallback,
// wenn der Store selbst kein Item gewaehlt hat, siehe ARTICLE_ITEM_CHOICES
// in dashboard/js/dashboard-render.js) — enthaelt bewusst auch
// "sneaker"/"rucksack" (Selten), die seit dem Bon-Scan-Feature NUR noch
// ueber einen echten, erkannten Kassenbon erreichbar sind, nicht mehr ueber
// das Standort-Minigame (siehe LOCATION_DROP_ITEM_POOL).
const ANY_STORE_ITEM_POOL = [...COMMON_ITEM_POOL, "sneaker", "rucksack", ...PURCHASE_UNLOCK_ITEM_KEYS];

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
  // War bisher "feinkost" ("Feinkost & Snacks", fasste Vollsortimenter und
  // Discounter gemeinsam) -- auf Nutzerwunsch aufgeteilt in "supermarkt"
  // (EDEKA/REWE/Kaufland-artig) und "discounter" (Aldi/Lidl-artig).
  // Schluessel umbenannt statt "feinkost" weiter zu verwenden, gleiches
  // Prinzip wie beim fastfood/restaurant-Split oben -- ein bestehender
  // Standort mit dem alten Schluessel zeigt bis zur naechsten Bearbeitung
  // einfach den rohen (kosmetischen) Fallback.
  supermarkt: {
    key: "supermarkt",
    name: "Supermarkt",
    scene: "assets/generated/store_feinkost_real.jpg",
    itemPool: COMMON_ITEM_POOL,
  },
  discounter: {
    key: "discounter",
    name: "Discounter",
    scene: "assets/generated/bg_store_discounter.svg",
    itemPool: COMMON_ITEM_POOL,
  },
  apotheke: {
    key: "apotheke",
    name: "Apotheke",
    scene: "assets/generated/bg_store_apotheke.svg",
    itemPool: ["gesundheitspaket", "fruchtkorb", "sprachbuch"],
  },
  baumarkt: {
    key: "baumarkt",
    name: "Baumarkt",
    scene: "assets/generated/bg_store_baumarkt.svg",
    itemPool: COMMON_ITEM_POOL,
  },
  elektronik: {
    key: "elektronik",
    name: "Elektronik",
    scene: "assets/generated/bg_store_elektronik.svg",
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
  // War bisher zwei Kategorien ("sneaker": Sneaker & Streetwear, "fashion":
  // Mode & Accessoires) -- auf Nutzerwunsch zu einer gemeinsamen "Mode"-
  // Kategorie zusammengelegt, da sich beide inhaltlich stark ueberschnitten
  // (Schuh-/Streetwear-Marken sind letztlich auch Modemarken). Schluessel
  // "mode" ist neu -- weder "sneaker" noch "fashion" weiterverwendet, damit
  // kein bestehender Standort unbeabsichtigt nur EINER der beiden alten
  // Kategorien zugeordnet bleibt; beide alten Schluessel werden gleich
  // behandelt (siehe categoryLabel-Fallback in dashboard/js/standorte.js
  // fuer den Uebergang bis zur naechsten Bearbeitung bestehender Standorte).
  mode: {
    key: "mode",
    name: "Mode",
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
  // War bisher "schnellrestaurant" (Fastfood UND Sitzrestaurant gemeinsam) --
  // auf Nutzerwunsch aufgeteilt in "fastfood" (Quick-Service, z.B.
  // McDonald's/Burger King) und "restaurant" (Sitzrestaurant, z.B.
  // Wienerwald/Hans im Glueck), damit die Branchenzuordnung realistischer
  // ist. Schluessel bewusst umbenannt statt "schnellrestaurant" weiter zu
  // verwenden -- ein bestehender Standort mit dem alten Schluessel zeigt bis
  // zur naechsten Bearbeitung einfach den rohen (kosmetischen) Fallback,
  // siehe categoryLabel-Fallback in dashboard/js/standorte.js.
  fastfood: {
    key: "fastfood",
    name: "Fastfood",
    scene: "assets/generated/bg_store_schnellrestaurant.svg",
    itemPool: ["energiesnack", "fruchtkorb"],
  },
  restaurant: {
    key: "restaurant",
    name: "Restaurant",
    scene: "assets/generated/bg_store_restaurant.svg",
    itemPool: ["energiesnack", "fruchtkorb"],
  },
  bar: {
    key: "bar",
    name: "Bar",
    scene: "assets/generated/bg_store_bar.svg",
    itemPool: ["fruchtkorb", "energiesnack"],
  },
  tankstelle: {
    key: "tankstelle",
    name: "Tankstelle",
    scene: "assets/generated/bg_store_tankstelle.svg",
    itemPool: COMMON_ITEM_POOL,
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
  { pattern: /deichmann/i, categoryKey: "mode" },
  // Supermarkt (Vollsortimenter) vs. Discounter getrennt -- vorher beide
  // gemeinsam unter "feinkost", das verwischte den eigentlich deutlichen
  // Unterschied zwischen z.B. EDEKA und Aldi.
  { pattern: /edeka/i, categoryKey: "supermarkt" },
  { pattern: /rewe/i, categoryKey: "supermarkt" }, // deckt auch "ZooRoyal / REWE Group" ab, falls "REWE" im Text steht
  { pattern: /zooroyal/i, categoryKey: "supermarkt" },
  { pattern: /kaufland/i, categoryKey: "supermarkt" },
  { pattern: /ferrero/i, categoryKey: "supermarkt" },
  { pattern: /bahlsen/i, categoryKey: "supermarkt" },
  { pattern: /fressnapf/i, categoryKey: "supermarkt" }, // kein Tierbedarf-Item vorhanden, generischer Pool als Uebergang
  { pattern: /lidl/i, categoryKey: "discounter" }, // deckt auch "Lidl International" ab
  { pattern: /aldi/i, categoryKey: "discounter" }, // deckt "ALDI SÜD" und "ALDI DX" ab
  { pattern: /\bnetto\b/i, categoryKey: "discounter" },
  { pattern: /\bpenny\b/i, categoryKey: "discounter" },
  { pattern: /\bnorma\b/i, categoryKey: "discounter" },
  // Apotheken sind in Deutschland ueberwiegend unabhaengig gefuehrt (keine
  // einzelne dominante Kette wie bei Supermaerkten) -- generisches Muster
  // auf das Wort "Apotheke" selbst statt einzelner Markennamen, das steht
  // auf echten Apotheken-Kassenbons so gut wie immer im Store-Namen (z.B.
  // "Stadt-Apotheke", "Rosen-Apotheke").
  { pattern: /apotheke/i, categoryKey: "apotheke" },
  { pattern: /hornbach/i, categoryKey: "baumarkt" },
  { pattern: /\bobi\b/i, categoryKey: "baumarkt" },
  { pattern: /bauhaus/i, categoryKey: "baumarkt" },
  { pattern: /\btoom\b/i, categoryKey: "baumarkt" },
  { pattern: /hagebau/i, categoryKey: "baumarkt" },
  { pattern: /saturn/i, categoryKey: "elektronik" },
  { pattern: /mediamarkt/i, categoryKey: "elektronik" },
  { pattern: /\bexpert\b/i, categoryKey: "elektronik" },
  { pattern: /euronics/i, categoryKey: "elektronik" },
  { pattern: /douglas/i, categoryKey: "drogerie" },
  { pattern: /rossmann/i, categoryKey: "drogerie" },
  { pattern: /\bdm\b/i, categoryKey: "drogerie" },
  { pattern: /budni/i, categoryKey: "drogerie" },
  { pattern: /l.?or[ée]al/i, categoryKey: "drogerie" },
  { pattern: /sante/i, categoryKey: "drogerie" },
  { pattern: /beiersdorf/i, categoryKey: "drogerie" },
  { pattern: /henkel/i, categoryKey: "drogerie" },
  { pattern: /\bshell\b/i, categoryKey: "tankstelle" },
  { pattern: /\baral\b/i, categoryKey: "tankstelle" },
  { pattern: /\besso\b/i, categoryKey: "tankstelle" },
  { pattern: /\btotal(energies)?\b/i, categoryKey: "tankstelle" },
  { pattern: /\bjet\b/i, categoryKey: "tankstelle" },
  { pattern: /\bstar\b/i, categoryKey: "tankstelle" }, // Tankstellenkette, nicht zu verwechseln mit anderen "star"-Marken
  { pattern: /\bavia\b/i, categoryKey: "tankstelle" },
  { pattern: /puma/i, categoryKey: "mode" },
  { pattern: /nike/i, categoryKey: "mode" },
  { pattern: /adidas/i, categoryKey: "mode" },
  { pattern: /snipes/i, categoryKey: "mode" },
  { pattern: /intersport/i, categoryKey: "mode" },
  { pattern: /hugo boss/i, categoryKey: "mode" },
  { pattern: /\bc&a\b/i, categoryKey: "mode" },
  { pattern: /takko/i, categoryKey: "mode" },
  { pattern: /mammut/i, categoryKey: "mode" },
  // Quick-Service (Fastfood) vs. Sitzrestaurant (Restaurant) getrennt --
  // Wienerwald/Hans im Glueck sind Restaurants mit Bedienung am Tisch, keine
  // Fastfood-Ketten, gehoerten hier vorher faelschlich in denselben Topf wie
  // McDonald's/Burger King.
  { pattern: /mcdonald/i, categoryKey: "fastfood" },
  { pattern: /burger king/i, categoryKey: "fastfood" },
  { pattern: /wienerwald/i, categoryKey: "restaurant" },
  { pattern: /hans im gl.ck/i, categoryKey: "restaurant" },
  { pattern: /tchibo/i, categoryKey: "cafe" },
  { pattern: /fritz.?kola/i, categoryKey: "cafe" },
  { pattern: /true ?fruits/i, categoryKey: "cafe" },
  { pattern: /red ?bull/i, categoryKey: "cafe" },
  // Niederlaendische Ketten (Test-Faelle im Ausland, siehe js/bonscan.js —
  // Store-Erkennung ist bewusst sprachunabhaengig vom OCR-Text).
  { pattern: /albert heijn/i, categoryKey: "supermarkt" },
  { pattern: /\bjumbo\b/i, categoryKey: "supermarkt" },
  { pattern: /\bhema\b/i, categoryKey: "discounter" }, // niederlaend. Budget-Kaufhauskette, naeher an Discounter als Supermarkt
  { pattern: /\baction\b/i, categoryKey: "discounter" }, // niederlaend. Non-Food-Discounter
  { pattern: /kruidvat/i, categoryKey: "drogerie" },
  { pattern: /\betos\b/i, categoryKey: "drogerie" },
  { pattern: /\bzeeman\b/i, categoryKey: "mode" },
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
  { id: "rewe", type: "store", categoryKey: "supermarkt", coords: { lat: 48.11885648062791, lon: 7.849983861819728 } },
  { id: "kaufland", type: "store", categoryKey: "supermarkt", coords: { lat: 48.11736079020843, lon: 7.848150177677171 } },
  { id: "baeckerei", type: "store", categoryKey: "cafe", coords: { lat: 48.11926205204506, lon: 7.848623981867512 } },
  { id: "modebox", type: "store", categoryKey: "mode", coords: { lat: 48.12005556052317, lon: 7.849796063929734 } },
  { id: "volksbank", type: "store", categoryKey: "bank", coords: { lat: 48.12025582830878, lon: 7.8492661991757045 } },
  { id: "sparkasse", type: "store", categoryKey: "bank", coords: { lat: 48.119719552613226, lon: 7.8501486459263585 } },
  { id: "mueller", type: "store", categoryKey: "drogerie", coords: { lat: 48.11931058495179, lon: 7.849707348109254 } },
  { id: "dm", type: "store", categoryKey: "drogerie", coords: { lat: 48.120860450673504, lon: 7.850241027354685 } },
  { id: "mcdonalds", type: "store", categoryKey: "fastfood", coords: { lat: 48.113096001026086, lon: 7.852438811998206 } },
  { id: "cheers", type: "store", categoryKey: "bar", coords: { lat: 48.10948560102508, lon: 7.854155425715709 } },
  { id: "feinkost_custom", type: "store", categoryKey: "supermarkt", coords: { lat: 52.2581271, lon: 5.4698785 } },
  // Keine echte Koordinate hinterlegt -> zufaellig um den Spieler-Start
  { id: "sneaker_default", type: "store", categoryKey: "mode", coords: null },
  { id: "juwelier_default", type: "store", categoryKey: "juwelier", coords: null },
];

let STORE_LOCATIONS = STORE_LOCATIONS_FALLBACK;
