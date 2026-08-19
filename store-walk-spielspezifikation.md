# Store Walk — Spielspezifikation (Übergabe an Claude Code)

Diese Spezifikation fasst alle Spielregeln, Screens und Entscheidungen aus dem
Chat-Prototyp zusammen. Sie ist die Ausgangsbasis für den Neubau als echtes
Projekt (mit echter Karte, echtem Backend, echter Persistenz).

Produktname im Code/intern: "Store Walk" (Arbeitstitel, nicht der finale
Markenname von RGS). Auf keinen öffentlichen Kanälen den echten Produktnamen
oder echte Retailer-Namen verwenden — nur Branchenbezeichnungen (siehe unten).

---

## 1. Grundprinzip

Ein ortsbasiertes Mobile Game: Spieler bewegen sich in der echten Welt,
fangen virtuelle Wesen ("Loomas") in ihrer Nähe und erhalten Marken-Items,
wenn sie feste Store-Standorte in der Nähe besuchen. Käufe/QR-Scans an der
Kasse sind als spätere echte Auslöselogik vorgesehen, aktuell simuliert durch
reine Nähe (GPS-Abstand).

## 2. Screens im Überblick

1. **Map (Store Walk)** — Startbildschirm/Home
2. **Fangszene (Vollbild)** — öffnet sich beim Antippen eines Wesens in Reichweite
3. **Item-Minigame (Nachmalen)** — öffnet sich beim Antippen eines Stores in Reichweite
4. **Item-Erfolgsmeldung** — nach erfolgreichem Nachmalen
5. **Profil-Hub** — erreichbar über Avatar-Icon oben links auf der Map; zurück über Pfeil im Hub

Navigations-Grundregel: **Die Map ist die Startseite**, nicht das Profil.
Das Profil ist ein sekundärer Screen, der von der Map aus geöffnet wird.

## 3. Karte / Map-Screen

- Hintergrund: stilisierte Nacht-Stadt-Ansicht (kosmisches Blau/Lila), keine
  echte interaktive Kartenkachel-Lösung im Chat-Prototyp möglich (Sandbox
  blockiert externe Kartenkacheln). **Im echten Projekt: echte Karte
  (OpenStreetMap/Leaflet oder Mapbox/Google Maps) mit echtem GPS verwenden.**
- Spieler-Position: eigener Marker in der Bildschirmmitte, Icons (Wesen,
  Stores) werden anhand von echter Peilung (Bearing) und Distanz zum
  Spieler auf einem Radius um die Mitte platziert (Radar-Prinzip). Im
  echten Projekt: mit echter Karte kann der Spieler-Marker stattdessen an
  echten Kartenkoordinaten sitzen und die Karte selbst mitwandern.
- HUD oben: Avatar-Icon (links, öffnet Profil-Hub), Titel "Store Walk",
  Rucksack-Icon (rechts, aktuell dekorativ), Zähler "🐾 Anzahl gefangener
  Wesen".
- Reichweiten-Radius fürs Fangen/Aktivieren: 45 Meter (`CATCH_RADIUS_M`).
- Bottom-Leiste: Statuszeile ("In Reichweite: …" / Entfernungsangabe) und
  Haupt-Button ("… entdeckt" bei Wesen in Reichweite, "Item bei …" bei
  Store in Reichweite).

## 4. Wesen ("Loomas")

Vier Wesen, alle aktuell **einheitlich "Gewöhnlich" und 150 XP** pro Fang
(laut echten Screenshots der Ziel-App):

| Name  | Element | Farbe (Hex) |
|-------|---------|-------------|
| Fauli | Natur 🌿 | #4ade80 |
| Fifu  | Feuer 🔥 | #fb923c |
| Enari | Luft 💨  | #93c5fd |
| Nami  | Wasser 💧 | #c084fc |

- Grafiken: für jedes Wesen zwei Bild-Assets nötig — ein freigestelltes
  Icon (transparenter Hintergrund, für kleine Kartenmarker) und ein
  Reveal-Foto (Wesen in einer realen Umgebung, für die Fangszene/
  Erfolgsmeldung, AR-Optik).
- Spawn-Verhalten: Wesen spawnen kontinuierlich neu (nach Fang mit
  3,5–6 Sekunden Verzögerung). Gewichtung: **~68 % der Spawns** erscheinen
  bevorzugt in Store-Nähe (Radius 65 m um einen zufälligen Store), die
  restlichen **~32 %** frei irgendwo im Umkreis von 180 m um den Spieler.
  Grund: Store-Besuche sollen attraktiver werden, ohne dass anderswo tote
  Zonen entstehen.

### Fangablauf (Ring-Minigame)

1. Wesen auf der Map antippen (nur wenn in Reichweite) → Vollbild-Fangszene
   öffnet sich mit dem Reveal-Foto des Wesens als Hintergrund.
2. Ein Zielring erscheint über dem Wesen: **außen Rot, Mitte Gelb, innen
   Grün** (konzentrische Kreiszonen, SVG).
3. Ein weißer Ring schrumpft kontinuierlich von außen (Radius 100) nach
   innen und springt danach zurück auf Start (Sägezahn-Loop).
4. Spieler tippt auf "Fangen!" im richtigen Moment.
5. Auswertung anhand des aktuellen Ring-Radius zum Zeitpunkt des Tap:
   - Radius ≤ grüner Zonen-Radius → **Volltreffer**, sofortiger Fang.
   - Radius ≤ gelber Zonen-Radius (aber > grün) → Fehlschlag, **zweiter
     Versuch** mit identischer Geschwindigkeit wie der erste (nicht
     schneller!).
   - Radius > gelb (rot) → ebenfalls Fehlschlag, zweiter Versuch.
   - Beide Versuche verfehlt → Wesen **flieht** (verschwindet, kein Fang),
     Rückkehr zur Map.
6. Bei Erfolg: Erfolgsmeldung (Karte im Spielstil) — Banner "✅ Gefangen!",
   Foto des Wesens, Name, "{Element-Icon} {Element} • {Rarity}", "+150 XP",
   Hinweistext, Button "Weiter" → zurück zur Map.

Aktuelle Ring-Parameter (Chat-Prototyp, wurde als "gut" bestätigt):
`duration: 1050ms, grüne Zone: Radius 22, gelbe Zone: Radius 55` (aus einem
Radius-Maximum von 100). Diese Werte gerne im echten Projekt konfigurierbar
je Wesen/Seltenheit halten, auch wenn aktuell alle vier gleich eingestellt
sind.

## 5. Stores

Vier **feste** Store-Standorte (keine Bewegung, kein Despawn), einmalig
beim ersten GPS-Fix in zufälligem Versatz (Radius 190 m) um den
Spieler-Startpunkt platziert. **Nur Branchenbezeichnung, kein echter
Markenname:**

| Store-Schlüssel | Anzeigename | Foto-Motiv |
|---|---|---|
| feinkost | Feinkost & Snacks | Snack-/Lebensmittelregal |
| sneaker | Sneaker & Streetwear | Sneaker-/Streetwear-Store mit Mannequins |
| juwelier | Juwelier | Schmuck-Vitrinen, edles Ambiente |
| cafe | Café | Barista/Kaffeezubereitung |

### Item-Ablauf

1. Store in Reichweite antippen → **Nachmal-Minigame** öffnet sich (siehe
   unten), kein direkter Item-Erhalt mehr.
2. Bei Erfolg: zufälliges Item aus dem Pool des Stores wird vergeben,
   Erfolgsmeldung mit echtem Item-Bild, Name, Seltenheits-Banner,
   "Ihr Produkt als In-Game Drop bei {Store}", XP-Betrag.
3. Zurück zur Map.

### Item-Pools pro Store (mit bewusster Überschneidung, wie ein echter
Discounter/Fachgeschäft es hätte)

- **Feinkost & Snacks** (breite Grundversorgung): Fruchtkorb der Energie,
  Energiesnack, Gesundheits-Paket, Sprachbuch, Stylische Sneaker,
  Epischer Hoodie
- **Sneaker & Streetwear** (Mode/Gear exklusiv): Stylische Sneaker,
  Epischer Hoodie, Abenteuerrucksack
- **Juwelier** (exklusiv): Energie-Armband
- **Café** (Essen/Trinken): Fruchtkorb der Energie, Energiesnack

### Item-Bibliothek (8 Items, echte Grafiken aus der Ziel-App vorhanden)

| Item | Seltenheit | XP (im Prototyp abgeleitet, App zeigt keinen XP-Wert) | Effekt laut Original-Karte |
|---|---|---|---|
| Fruchtkorb der Energie | Gewöhnlich | 15 | +25 % XP-Boost für 30 Minuten |
| Sprachbuch | Gewöhnlich | 15 | +5 % Punkte in menschlicher Sprache |
| Energiesnack | Ungewöhnlich | 30 | +50 % Energie wiederherstellen |
| Gesundheits-Paket | Ungewöhnlich | 30 | +25 % XP beim Anlegen |
| Stylische Sneaker | Selten | 60 | +5 % Fangchance beim Anlegen |
| Abenteuerrucksack | Selten | 60 | +5 Inventarplätze |
| Epischer Hoodie | Episch | 120 | +25 % Fangchance beim Anlegen |
| Energie-Armband | Legendär | 200 | +50 % XP beim Anlegen |

Rarity-Farbcode: Gewöhnlich #d1d5db (Weiß/Grau), Ungewöhnlich #4ade80 (Grün),
Selten #60a5fa (Blau), Episch #c084fc (Lila), Legendär #fbbf24 (Gold).

### Nachmal-Minigame (Item-Freischaltung)

- Beim Store-Besuch erscheint eine Vollbild-Szene mit einer gestrichelten
  Ziel-Form (SVG-Guide-Path), zufällig gewählt aus: **Kreis, Welle
  (Sinuskurve), Zickzack, Dreieck, Quadrat**.
- Spieler zeichnet mit dem Finger (Touch) bzw. der Maus (Desktop-Test)
  eine Linie über die Form nach, live sichtbar in Grün.
- Auswertung beim Loslassen: Abdeckungsgrad = Anteil der Guide-Punkte, die
  nahe genug (Toleranzradius) an einem gezeichneten Punkt liegen.
  - **Aktuell abgestimmte, bewusst großzügige Werte:** Toleranz-Radius 32
    (Viewbox 220×220), Erfolgsschwelle Abdeckung ≥ 42 %.
  - Bei Erfolg: kurze Bestätigung, automatischer Übergang zur
    Item-Erfolgsmeldung.
  - Bei Misserfolg: Hinweis, Zeichnung wird zurückgesetzt, **beliebig oft
    wiederholbar** (kein Fehlschlag-Limit wie beim Wesen-Fang).
- **Opt-out-Funktion:** Checkbox direkt im Minigame "Minigame künftig
  überspringen". Ist sie aktiv, öffnet sich bei Stores künftig sofort die
  Item-Erfolgsmeldung ohne Minigame. Über die Einstellungen-Kachel im
  Profil-Hub wieder umschaltbar. (Im Chat-Prototyp nur pro Sitzung
  gespeichert, kein echtes Backend — im echten Projekt sinnvollerweise
  persistent pro Nutzerkonto speichern.)

## 6. Profil-Hub

- Erreichbar über das Avatar-Icon oben links auf der Map.
- Zeigt **eine einzige, unveränderte Original-Grafik** des Profils (echter
  Screenshot-Export aus der Ziel-App: Avatar, Name "LunaPwns", Level,
  XP-Leiste, Coins/Gems, Charakter-Portrait, sechs Icon-Kacheln: Outfit,
  Items, Trophäen, Loomas, Habitat, Einstellungen, sowie die
  "Aktiviere mich im Store"-QR-Leiste).
- Darüber liegen unsichtbare Klickflächen (Hotspots) exakt über: dem
  Zurück-Pfeil (→ zurück zur Map) sowie den sechs Icon-Kacheln.
- Aktuelle Kachel-Funktionen im Prototyp:
  - Outfit, Items, Trophäen, Habitat → Platzhalter-Hinweis "Screen folgt
    als Nächstes" (noch nicht gebaut, siehe Abschnitt 8).
  - Loomas → zeigt zusätzlich die aktuelle Anzahl gefangener Wesen an.
  - Einstellungen → schaltet das Item-Minigame an/aus (siehe Abschnitt 5).
- **Im echten Projekt:** diese Icon-Kacheln sollten echte Unterseiten
  öffnen (Outfit-Screen, Item-Inventar mit den 8 Items, Trophäen-Screen,
  Loomas-Sammelübersicht mit den 4 Wesen, Habitat, echte Einstellungen).

## 7. Bereits gesehene Screens der Ziel-App (Referenzmaterial, noch nicht
gebaut)

Aus den bisher geteilten Screenshots bekannt, aber im Chat-Prototyp noch
nicht umgesetzt:

- **Items-Screen:** 3×3-Raster, Antippen öffnet Detailkarte mit Name,
  Seltenheit, Bild, Effekt-Text, Hinweis "Dieses Item kann durch reale
  Käufe im Handel aktiviert werden."
- **Trophäen-Screen:** Raster mit Gold-/Silber-/Bronze-Trophäen, z. B.
  "Bronzene Trophäe: Erster Schritt" (erster Einkauf bei einem
  Retail-Partner, +2 % Bonus auf Basic-/Standard-Drops), "Silberne
  Trophäe: Treue Shopper" (an mind. 2 Tagen/Woche eingekauft, +5 % Bonus),
  "Silberne Trophäe: Sammlergeist" (10 verschiedene Items gesammelt, +5 %
  Chance auf Bonus-Item beim Retail-Besuch), "Goldene Trophäe: Marken
  Collector" (25 Marken-Produkte gekauft, Belohnung: Epischer Hoodie).
- **Habitat-Screen:** Terrarium-artige Slots zum Ausstellen gefangener
  Wesen, viele Slots anfangs gesperrt (Schloss-Icon), freischaltbar.
- **Onboarding-Flow:** "Schritt 1" bis "Schritt 5" plus Abschluss-Screen
  (Inhalte noch nicht im Detail besprochen, laut Dirk aktuell nicht
  prioritär).
- **QR-Scan-Screen:** "Scan starten – Scanne deinen Einkauf und sichere
  dir deine Belohnung", mit echtem QR-Code-Muster und Anzeige möglicher
  Drops. Nach erfolgreichem Scan: "Erfolgreich eingelöst! Item erhalten.
  Dein Einkauf wurde deinem Inventar hinzugefügt. +150 XP 💎. Chance auf
  Bonus-Drop aktiviert." Das ist vermutlich der **echte** Auslöser für
  Item-Drops (später Kassenbeleg/QR statt reiner GPS-Nähe).

## 8. Bekannte technische Grenzen dieser Chat-Umgebung (im echten Projekt lösbar)

- Keine echten Kartenkacheln (OpenStreetMap/Google Maps) ladbar — Sandbox
  blockiert externe Tile-Requests. Lösung im echten Projekt: normales
  Hosting, dann funktioniert Leaflet/Mapbox/Google Maps regulär.
- Kein echtes KI-Bild-Inpainting verfügbar — Objektentfernung aus Fotos
  nur über einfache Klonstempel-/Weichzeichner-Behelfslösung, nicht
  pixelperfekt.
- Keine Persistenz zwischen Sitzungen (kein Backend/keine Datenbank) —
  aktuell wird alles nur im Browser-Speicher der laufenden Sitzung
  gehalten.
- Datei wächst mit jedem eingebetteten Bild (Base64 direkt im HTML) stark
  an — im echten Projekt Bilder als separate Dateien/über eine echte
  Asset-Pipeline ausliefern.
- Kein Testen mit echtem Gehen möglich, wenn Store/Wesen zu weit entfernt
  sind — deshalb zwei Testknöpfe ("🧪 Testfang", "🧪 Testitem") eingebaut,
  die unabhängig von GPS-Nähe direkt die jeweilige Szene öffnen. Für
  Debug-Zwecke im echten Projekt evtl. ähnliches Dev-Tool sinnvoll, sollte
  aber vor einer Kunden-Demo entfernt/versteckt werden.

## 9. Formale Vorgaben (aus dem RGS-Projekt-Briefing)

- Nirgends öffentlich den echten Produktnamen von RGS verwenden — nur
  "unsere Plattform", "die Plattform von RGS" oder "die Lösung".
- Keine echten Retailer-/Markennamen (kein REWE, Aldi, dm etc.) — nur
  Branchenbezeichnungen wie "Feinkost & Snacks", "Sneaker & Streetwear",
  "Juwelier", "Café".
- Pilotphasen-Ehrlichkeit: keine Funktionen vortäuschen, die noch nicht
  existieren — deshalb zeigen unfertige Profil-Kacheln explizit einen
  "folgt als Nächstes"-Hinweis statt stumm nichts zu tun oder eine
  Fake-Funktion zu simulieren.
