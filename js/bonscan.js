// Bon-Scan: echter Kauf -> Item-Drop (siehe Spielspezifikation Abschnitt 7,
// "QR-Scan-Screen"). Liest ein Bon-Foto (Kamera oder Datei-Upload) per OCR
// aus, erkennt Store + moeglichst eine Artikelzeile und vergibt daraufhin
// ein Item — spiegelt den Ablauf von grantRandomItemFromStore() in
// js/drawgame.js, nur mit echtem Bon statt Minigame als Ausloeser.

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: Timeout nach ${ms}ms`)), ms)),
  ]);
}

// Grosszuegiger Groessendeckel (nur gegen wirklich riesige Fotos, die den
// Speicher/die OCR-Zeit sprengen wuerden) — echte Handyfotos liegen meist
// darunter, greift also selten.
const RECEIPT_PHOTO_MAX_DIMENSION = 4000;

// Manche Handys liefern Kamerafotos (v.a. iPhones per capture="environment")
// im HEIC/HEIF-Format statt JPEG, das Tesseract nicht zuverlaessig lesen
// kann ("Error attempting to read image"). createImageBitmap() nutzt den
// nativen Bild-Decoder des Browsers (der HEIC i.d.R. beherrscht) und wir
// zeichnen das Ergebnis als normales JPEG auf einen Canvas — damit bekommt
// die OCR garantiert ein Format, das sie lesen kann, egal woher das Bild
// kam. Schlaegt das fehl (z.B. wirklich exotisches Format), wird einfach
// das Original-Bild direkt an Tesseract weitergereicht statt abzubrechen.
async function normalizeImageForOcr(source) {
  try {
    const bitmap = await createImageBitmap(source);
    const scale = Math.min(1, RECEIPT_PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
    return jpeg || source;
  } catch (err) {
    console.warn("Bild-Normalisierung fehlgeschlagen, nutze Original direkt:", err && err.message ? err.message : err);
    return source;
  }
}

function openScanScreen() {
  resetScanUI();
  showScreen("screen-scan");
}

function resetScanUI() {
  setScanStatus("");
  setScanError("");
  lastBonOcrText = "";
  const copyBtn = document.getElementById("btn-scan-copy-text");
  if (copyBtn) {
    copyBtn.classList.add("hidden");
    copyBtn.textContent = "📋 Erkannten Bon-Text kopieren";
  }
}

// Merkt sich den zuletzt per OCR erkannten Rohtext eines Scans, damit er
// ueber den "Erkannten Bon-Text kopieren"-Button direkt aus dem Spiel heraus
// weitergegeben werden kann -- ohne Entwicklerkonsole, die auf dem Handy
// praktisch nicht erreichbar ist. Vorher gab es dafuer nur console.log(),
// was auf Mobilgeraeten fuer Fehlerdiagnosen (z.B. neue, noch nicht
// erkannte Filialen) faktisch nutzlos war.
let lastBonOcrText = "";

function showBonOcrCopyButton(text) {
  lastBonOcrText = text || "";
  const copyBtn = document.getElementById("btn-scan-copy-text");
  if (copyBtn && lastBonOcrText) copyBtn.classList.remove("hidden");
}

function copyBonOcrText() {
  const copyBtn = document.getElementById("btn-scan-copy-text");
  if (!copyBtn || !lastBonOcrText) return;
  const showCopied = () => {
    copyBtn.textContent = "✅ Kopiert!";
    setTimeout(() => {
      copyBtn.textContent = "📋 Erkannten Bon-Text kopieren";
    }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(lastBonOcrText).then(showCopied).catch(() => {
      // Clipboard-API vom Browser verweigert (z.B. fehlende Berechtigung) --
      // Fallback zeigt den Text direkt an, damit er manuell markiert/kopiert
      // werden kann statt komplett zu scheitern.
      window.prompt("Erkannter Bon-Text (manuell kopieren):", lastBonOcrText);
    });
  } else {
    window.prompt("Erkannter Bon-Text (manuell kopieren):", lastBonOcrText);
  }
}

function setScanStatus(text) {
  const el = document.getElementById("scan-status");
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

function setScanError(text) {
  const el = document.getElementById("scan-error");
  el.textContent = text;
  el.classList.toggle("hidden", !text);
}

// "Bon fotografieren" UND "Bon-Foto hochladen" sind beide simple
// <input type="file">-Elemente (siehe index.html) — der einzige
// Unterschied ist das capture="environment"-Attribut, das auf dem Handy
// direkt die native Kamera-App statt der Galerie oeffnet. Dadurch nutzt
// die Aufnahme dieselbe native Foto-Pipeline (Belichtung/Fokus) wie ein
// manuell aufgenommenes und dann hochgeladenes Foto — genau der Weg, der
// beim Testen zuverlaessig funktioniert hat. Keine eigene Kamera-Vorschau
// (getUserMedia/ImageCapture) mehr noetig, beide Wege landen bei
// derselben Funktion.
function handleScanFileInput(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // erlaubt erneutes Aufnehmen/Hochladen derselben Datei
  if (file) processReceiptImage(file);
}

// Laedt die Artikellisten ALLER aktuell konfigurierten Stores -- GodAdmin
// (store_key "godadmin", siehe dashboard/index.html Einstellungen-Panel)
// UND jeden echten Retailer-Standort, der ueber seinen eigenen Store-View-
// Magic-Link eine Liste hinterlegt hat (siehe dashboard/store-view.html
// Artikel-Panel). Das Spiel kennt beim Scannen (noch) keinen "aktuellen
// Standort" (keine Proximity-/Auswahl-Logik, siehe Projekt-Notiz
// "Store-Unterscheidung bei mehreren Filialen") -- deshalb werden bewusst
// ALLE konfigurierten Listen gemeinsam geprueft statt nur einer einzelnen,
// sonst wuerde ein bei einem echten Retailer-Standort hinterlegter Artikel
// nie erkannt. Oeffentlich lesbar (anon-Key) wie bei STORE_LOCATIONS in
// js/locations.js -- darf den Scan nie blockieren, bei jedem Fehler
// (offline, Tabelle/Function noch nicht angelegt) einfach eine leere Liste
// liefern statt abzubrechen.
function loadConfiguredStores() {
  return fetch(`${SUPABASE_URL}/rest/v1/store_articles?select=store_key,articles`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((rows) =>
      Array.isArray(rows)
        ? rows.map((row) => ({
            storeKey: row.store_key,
            articles: Array.isArray(row.articles) ? row.articles : [],
          }))
        : []
    )
    .catch(() => []);
}

async function processReceiptImage(imageSource) {
  resetScanUI();
  setScanStatus("Bon wird gelesen…");
  try {
    // Parallel zur (mehrere Sekunden dauernden) OCR gestartet statt danach
    // -- kostet dadurch effektiv keine zusaetzliche Wartezeit.
    const storesPromise = loadConfiguredStores();
    const normalized = await normalizeImageForOcr(imageSource);
    // deu+eng+nld: Bon kann auch im Ausland fotografiert werden (DE/EN/NL) —
    // Tesseract erkennt damit alle drei gemeinsam statt nur Deutsch. Timeout
    // als Absicherung, falls die OCR haengt (z.B. Sprachpaket-Download beim
    // allerersten Scan bricht ab) — sonst bleibt der Screen fuer immer auf
    // "Bon wird gelesen…" stehen.
    const result = await withTimeout(Tesseract.recognize(normalized, "deu+eng+nld"), 45000, "OCR");
    // Immer in die Konsole loggen (nicht nur bei Fehlern) -- einzige
    // Moeglichkeit, bei einem "Preis erkannt, aber falscher/fehlender
    // Artikel"-Fall nachzuvollziehen, was die OCR tatsaechlich gelesen hat,
    // ohne dass extra ein Fehlerzustand ausgeloest werden muss.
    console.log("Bon-OCR-Text:", result.data.text);
    showBonOcrCopyButton(result.data.text);
    const configuredStores = await storesPromise;
    matchReceiptText(result.data.text || "", configuredStores);
  } catch (err) {
    console.warn("OCR fehlgeschlagen:", err && err.message ? err.message : err);
    setScanStatus("");
    setScanError(
      "Bon konnte nicht gelesen werden. Bitte erneut versuchen (heller/schärfer fotografieren, stabile Internetverbindung fürs erste Mal nötig)." +
        (err && err.message ? `\n\n(Technischer Grund: ${err.message})` : "")
    );
  }
}

// Erkennt den Preis EINER Bon-Zeile per OCR-Text (fuers Haendler-Dashboard,
// siehe grantReceiptItems) — nimmt die RECHTESTE Zahl auf der Zeile, da bei
// allen vier Test-Bons in assets/bons/ der Zeilenpreis konventionell ganz
// rechts steht (auch bei mehrspaltigen Zeilen wie MwSt-Aufschluesselungen).
// Rein heuristisch (OCR-Text, kein strukturiertes Bon-Format) — kann bei
// ungewoehnlichen Bon-Layouts danebenliegen oder ganz fehlen; dann lieber
// kein Preis als ein falscher (Dashboard zeigt den Umsatz klar als
// "geschaetzt").
const RECEIPT_AMOUNT_PATTERN = /\d{1,4}[.,]\d{2}/g;

// Maximale Laenge fuer den rohen OCR-Zeilentext, der als "Produktname" ans
// Dashboard (Artikel-Ansicht) durchgereicht wird — echte Bon-Zeilen sind
// kurz, das kappt nur ausufernden OCR-Muell bei schlecht lesbaren Fotos.
const RECEIPT_PRODUCT_TEXT_MAX_LENGTH = 120;

function extractLineAmountCents(line) {
  const matches = line.match(RECEIPT_AMOUNT_PATTERN);
  if (!matches || matches.length === 0) return null;
  const value = parseFloat(matches[matches.length - 1].replace(",", "."));
  if (isNaN(value) || value <= 0 || value >= 10000) return null;
  return Math.round(value * 100);
}

// Erkennt, ob eine Zeile erkennbar einen EIGENEN Preisversuch traegt --
// auch wenn extractLineAmountCents() ihn nicht sauber parsen konnte (z.B.
// OCR verschluckt das Komma: "1,29" wird zu "1298", weil die folgende
// MwSt-Kennung "B" ohne Trennzeichen drangeklebt wird). Ein Ziffernblock am
// Zeilenende (optional gefolgt von einem einzelnen MwSt-Klassenbuchstaben)
// gilt als "eigener Preisversuch vorhanden" -- steuert in
// findAllProductLines(), ob auf eine Nachbarzeile ausgewichen werden darf
// (siehe Kommentar dort).
function lineHasOwnPriceAttempt(line) {
  return /\d{2,4}\s*[A-Za-zÀ-ÿ]?\s*$/.test(line.trim());
}

// Plausibilitaets-Deckel: kein einzelner Artikelpreis darf hoeher sein als
// der auf dem Bon gedruckte GESAMTBETRAG -- real beobachtet, dass OCR auf
// schlecht lesbaren Fotos gelegentlich eine Artikelnummer/einen Barcode-
// Ausschnitt faelschlich als Preis liest (z.B. Zeile "266" oder eine lange
// Ziffernfolge, in der zufaellig ein Komma/Punkt an der richtigen Stelle
// auftaucht). Ohne Deckel landet so ein Fantasiewert direkt im Umsatz --
// bei identischem Bon, nur auf einem anderen Handy fotografiert, kann das
// den erfassten Umsatz um ein Vielfaches verfaelschen. maxCents ist null,
// wenn der Gesamtbetrag selbst nicht lesbar war -- dann keine Kappung
// (besser ein moeglicherweise falscher Preis als gar keiner).
function capToReceiptTotal(cents, maxCents) {
  if (cents === null || maxCents === null) return cents;
  return cents > maxCents ? null : cents;
}

// Schneidet den Preis (und alles danach, z.B. eine folgende MwSt-Kennung
// wie "A"/"B") vom Zeilenende ab, bevor eine Zeile als "Produktname" fuers
// Dashboard gespeichert wird — der Preis steht dort schon separat als
// Umsatzanteil, im Artikelnamen selbst waere er nur Rauschen (z.B. "Red
// Bull 250ml 1,99 A" -> "Red Bull 250ml"). Steht der Preis ganz am
// Zeilenanfang (nichts zum Abschneiden uebrig), bleibt die Zeile
// unveraendert statt eines leeren Strings.
function cleanProductNameText(line) {
  const priceMatches = line.match(RECEIPT_AMOUNT_PATTERN);
  if (!priceMatches || priceMatches.length === 0) return line;
  const lastPrice = priceMatches[priceMatches.length - 1];
  const idx = line.lastIndexOf(lastPrice);
  if (idx === -1) return line;
  const before = line.slice(0, idx).trim();
  return before || line;
}

// Fuers Pitch/Demo zaehlt vor allem: JEDER lesbare Bon soll erfolgreich
// scannen und moeglichst einen Preis mitbringen — unabhaengig davon, ob
// Store oder Artikel-Stichwort erkannt wurden. Bevorzugt die Zeile mit
// einem Summen-Schluesselwort (DE/EN/NL), sonst den groessten gueltigen
// Betrag im ganzen Text (meist ohnehin die Bon-Gesamtsumme).
// su[mn]{2}e statt "summe": deckt neben "Summe"/"Zwischensumme" auch den
// OCR-Lesefehler "Zwischensunne" ab (dieselbe m/n-Verwechslung wie bei
// "Gesantbetrag" -- real auf demselben Rossmann-Bon beobachtet).
const RECEIPT_TOTAL_KEYWORDS = /su[mn]{2}e|gesa[mn]tbetrag|zu zahlen|total|totaal|amount due/i;

function findReceiptTotalCents(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (RECEIPT_TOTAL_KEYWORDS.test(line)) {
      const amt = extractLineAmountCents(line);
      if (amt) return amt;
    }
  }
  let max = null;
  for (const line of lines) {
    const amt = extractLineAmountCents(line);
    if (amt && (max === null || amt > max)) max = amt;
  }
  return max;
}

// Zeilen, die zwar einen Preis enthalten koennen, aber keine echte
// Artikelzeile sind (Summe, Steuer, Zahlungsart, Beleg-Metadaten, DE/EN/NL)
// — die duerfen nicht als "erkannter Produktname" in der Artikel-Ansicht
// landen.
// Adresszeilen (Strasse/PLZ+Ort) stehen auf echten Bons fast immer direkt
// unter dem Store-Namen, VOR dem ersten echten Artikel — ohne eigenen Preis
// wuerden sie sonst per Nachbarzeilen-Preis-Heuristik (siehe unten) faelschlich
// den Preis des naechsten echten Artikels "erben" und als Produktname
// durchgehen (gleiche Fehlerklasse wie die Store-Kopfzeile selbst).
const RECEIPT_ADDRESS_LINE = /stra(ss|ß)e|\bstr\.|\b\d{5}\s+[a-zA-ZÀ-ÿ]/i;
// \bpreis\b: Spaltenkopf wie "Preis EUR" (steht meist ganz ohne eigenen
// Preis ueber der ersten Artikelzeile) — ohne diese Ausnahme wuerde die
// Nachbarzeilen-Preis-Heuristik unten den Preis der naechsten echten
// Artikelzeile "erben" und als eigenen (falschen, doppelt gezaehlten)
// Artikel ausgeben. Wortgrenze, damit z.B. "Preiselbeeren" nicht
// faelschlich mitgetroffen wird.
// pfand: Pfandbetrag ist kein eigener Artikel, sondern Teil eines anderen
// Postens (Flasche/Kiste) — soll nicht als eigene Artikelzeile erscheinen.
// Bewusst OHNE Wortgrenze davor: im Deutschen steht das fast immer als
// zusammengesetztes Wort ohne Trenner (z.B. "EINWEGPFAND", "Flaschenpfand"),
// eine Wortgrenze vor "pfand" wuerde diese Faelle verpassen (real beobachtet
// auf einem Rossmann-Bon).
// uid/signatur: TSE-Pflichtangaben (Kassenbon-Signatur/UID-Nummer nach
// Kassensicherungsverordnung) sind kryptische Zufallsstrings, kein Artikel.
// gesa[mn]tbetrag: deckt sowohl "Gesamtbetrag" als auch den haeufigen
// OCR-Lesefehler "Gesantbetrag" (m/n-Verwechslung) ab.
// coupon/ersparnis/gespart/rabatt: Rabatt-/Coupon-Hinweiszeilen sind kein
// gekaufter Artikel, tragen aber oft einen Betrag (den Ersparnisbetrag), der
// sonst faelschlich als Artikelpreis durchgehen wuerde.
// \bsepa\b: Zahlungsart-Zeile (SEPA-Lastschrift/-Kartenzahlung) traegt oft
// den Bon-Gesamtbetrag direkt daneben — ohne Ausschluss wuerde dieser Betrag
// als (falscher, doppelt gezaehlter) eigener Artikelpreis erscheinen.
// Summen-/Gesamtbetrag-Varianten stehen bewusst NICHT mehr hier -- die
// erkennt RECEIPT_TOTAL_KEYWORDS bereits vorher in findAllProductLines()
// und schaltet ab dort per footerStarted konsequent den kompletten Rest der
// Fusszeile stumm (robuster als jede einzelne Fusszeilen-Variante hier
// nachzupflegen, siehe Kommentar bei findAllProductLines).
const RECEIPT_NON_PRODUCT_LINE = /mwst|must\b|ust\b|steuer|tax\b|\bbar\b|rückgeld|geg\.|zahlung|kassenbon|bon-?nr|beleg|datum|uhrzeit|\bkasse\b|kartenzahlung|girocard|ec-?karte|\bsepa\b|trace|terminal|posten|artikel:?\s*\d|\bpreis\b|pfand|\buid\b|signatur|coupon|ersparnis|gespart|rabatt/i;

// Muss echte Wortbestandteile enthalten (nicht nur Ziffern/Symbole) --
// verhindert, dass reine Artikelnummer-/Codezeilen (z.B. "1 1034320 1 |39
// |03|0| 49,99") als "Produktname" durchgehen, sobald auch Nachbarzeilen
// nach einem Preis durchsucht werden.
const RECEIPT_LINE_HAS_WORD = /[a-zA-ZÀ-ÿ]{3,}/;

// Sucht ALLE plausiblen echten Artikelzeilen (nicht nur die erste) samt
// jeweils eigenem Preis — liefert die Kandidatenzeilen, gegen die
// matchLineToConfiguredStores() anschliessend die Artikellisten aller
// konfigurierten Stores per Fuzzy-Match prueft (siehe matchReceiptText()).
// Vollstaendigkeit ist hier wichtiger als lesbare Namen: auch kryptischer
// Text (z.B. Kassensystem-Kuerzel wie "CC EW 0,33L FL") wird als Kandidat
// zurueckgegeben, die eigentliche Auswahl trifft der Fuzzy-Abgleich danach.
// excludeLines: bereits anderweitig verwendete Roh-Zeilen, damit dieselbe
// Zeile nicht doppelt landet. Der Preis steht auf echten Bons oft NICHT auf
// derselben Zeile wie der Produktname (z.B. Deichmann: Artikelnummer+Preis
// auf einer Zeile, Markenname "Bench" separat direkt darunter) — deshalb
// auch hier Nachbarzeile vor/nach pruefen, nicht nur die Treffer-Zeile
// selbst.
//
// footerStarted: Ein einzelnes Bon-Foto (v.a. bei Apotheken-/Drogerie-
// Kleinschrift) kann so schlecht erkannt werden, dass OCR selbst Woerter
// wie "SEPA" oder "MwSt" bis zur Unkenntlichkeit verstuemmelt (real
// beobachtet: "SEPA ELV/OLV" -> "ESE EU RIE", eine MwSt-Aufschluesselungs-
// zeile -> "in 69.20 0.8 foxy") -- dann greift KEIN Wortfilter mehr, egal
// wie viele Varianten man ergaenzt, und der Rest der Fusszeile (Zahlungsart,
// Steuerreferenz, Signatur) wuerde als falsche "Artikel" durchgehen, im
// schlimmsten Fall sogar mit dem Bon-GESAMTBETRAG als Preis (per
// Nachbarzeilen-Heuristik von der Summenzeile "geerbt"). Robuster als jedes
// Einzelwort zu patchen: sobald einmal zweifelsfrei die Summenzeile erkannt
// wurde (RECEIPT_TOTAL_KEYWORDS, i.d.R. gut lesbar, da fett/gross gedruckt),
// gilt alles DANACH als Fusszeile und wird nicht mehr geprueft -- unabhaengig
// davon, wie kaputt der einzelne Zeilentext danach ist.
function findAllProductLines(text, excludeLines, maxAmountCents) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const found = [];
  const seenText = new Set();
  let footerStarted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (footerStarted) continue;
    if (line.length < 3) continue;
    if (excludeLines && excludeLines.has(line)) continue;
    if (RECEIPT_TOTAL_KEYWORDS.test(line)) {
      footerStarted = true;
      continue;
    }
    if (RECEIPT_NON_PRODUCT_LINE.test(line)) continue;
    if (RECEIPT_ADDRESS_LINE.test(line)) continue;
    if (!RECEIPT_LINE_HAS_WORD.test(line)) continue;
    // Store-Kopfzeile (z.B. "EDEKA MARKT") ist kein Artikel — nutzt dieselben
    // Retailer-Muster wie die Store-Erkennung oben, damit der Ladenname nie
    // als "erkannter Produktname" durchgeht (betrifft v.a. die erste
    // Bon-Zeile, die haeufig der Store-Header ist).
    if (RECEIPT_STORE_PATTERNS.some((entry) => entry.pattern.test(line))) continue;
    // amountCents kann null bleiben -- z.B. wenn OCR auf einem schlecht
    // lesbaren Foto das Dezimaltrennzeichen verschluckt hat ("2,66" wird zu
    // "266", passt dann nicht mehr auf RECEIPT_AMOUNT_PATTERN). Die Zeile
    // bleibt TROTZDEM ein gueltiger Kandidat fuer den Fuzzy-Artikelabgleich
    // (siehe matchReceiptText) -- sonst wuerde ein hinterlegter Artikel nie
    // erkannt, nur weil sein Preis auf diesem einen Foto nicht lesbar war.
    // Kein erfundener Preis: bleibt amountCents null, zaehlt der Treffer
    // spaeter fuers Dashboard als erkannter Artikel OHNE Umsatzbeitrag.
    //
    // Nachbarzeilen-Ausweichen (fuers Deichmann-Layout: Artikelnummer+Preis
    // auf einer Zeile, Markenname separat direkt darunter) nur, wenn die
    // Zeile selbst erkennbar GAR KEINEN eigenen Preisversuch traegt --
    // sonst "erbt" eine Zeile mit verstuemmeltem eigenem Preis faelschlich
    // den Preis einer voellig anderen Nachbarzeile. Real beobachtet: "Nimm2
    // Funfart 1298" (OCR verschluckt das Komma aus "1,29") bekam sonst den
    // Preis der naechsten, komplett unabhaengigen Zeile ("Rü.Wiener veg.
    // 1,98") zugewiesen, statt korrekt null zu bleiben.
    const ownAmount = extractLineAmountCents(line);
    const amountCents = capToReceiptTotal(
      ownAmount ?? (lineHasOwnPriceAttempt(line)
        ? null
        : extractLineAmountCents(lines[i - 1] || "") ?? extractLineAmountCents(lines[i + 1] || "")),
      maxAmountCents
    );
    const cleaned = cleanProductNameText(line).slice(0, RECEIPT_PRODUCT_TEXT_MAX_LENGTH);
    const dedupeKey = cleaned.toLowerCase();
    if (seenText.has(dedupeKey)) continue; // z.B. dieselbe Zeile doppelt ueber Preis-Lookaround erreicht
    seenText.add(dedupeKey);
    found.push({ text: cleaned, amountCents });
  }
  return found;
}

// ============ Fuzzy-Abgleich gegen die hinterlegte Artikelliste ============
// Ersetzt das frueher hier verwendete freie Stichwort-Matching
// (RECEIPT_ITEM_KEYWORDS): OCR-Ergebnisse weichen in Schreibweise, Abkuerzung
// oder durch Erkennungsfehler vom Original ab, ein exakter Textvergleich
// reicht daher nicht. Handgeschriebene Levenshtein-Implementierung statt
// einer externen Bibliothek — dieses Projekt hat keine Build-Pipeline
// (Plain-Script-Tags), ein npm-Paket waere hier nicht ohne Weiteres nutzbar.

// Lowercase, Akzente entfernt, alles ausser a-z/0-9 zu einzelnen Leerzeichen
// zusammengefasst -- macht "Coca-Cola 0,5L" und "COCA COLA O,5 L" vor dem
// Vergleich gleich, unabhaengig von Gross-/Kleinschreibung, Bindestrichen
// oder OCR-typischen Leerzeichen-Verschiebungen.
function normalizeArticleText(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Standard-Editierdistanz (dynamische Programmierung, iterativ mit zwei
// Zeilen statt vollständiger Matrix -- reicht für die hier vorkommenden
// kurzen Artikel-/Zeilentexte locker aus).
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // Loeschen
        currRow[j - 1] + 1, // Einfuegen
        prevRow[j - 1] + cost // Ersetzen
      );
    }
    prevRow = currRow;
  }
  return prevRow[b.length];
}

// Aehnlichkeit zweier Texte als Wert zwischen 0 (komplett verschieden) und 1
// (identisch nach Normalisierung). Ein Store traegt oft nur einen Teil des
// tatsaechlichen Bon-Zeilentexts ein (z.B. "Coca Cola" statt "Coca-Cola 0,5L
// EW") -- eine reine Editierdistanz wuerde das bei stark unterschiedlicher
// Laenge zu Unrecht als unaehnlich werten, deshalb zusaetzlich ein fixer,
// hoher Score, sobald der kuerzere Text komplett im laengeren enthalten ist.
function articleSimilarity(lineText, configuredArticle) {
  const a = normalizeArticleText(lineText);
  const b = normalizeArticleText(configuredArticle);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

// Viele Kassenbons stellen jeder Artikelzeile eine lange Artikel-/EAN-Nummer
// voran (z.B. "4305613737946 RLM SKINCONCEALER 2,66") -- die dominiert bei
// kurzen hinterlegten Artikelnamen die Editierdistanz und verschlechtert den
// Score unnoetig, obwohl der eigentliche Artikeltext gut passen wuerde.
// Wird deshalb vor dem Abgleich entfernt (nur fuers Matching, der
// unveraenderte Zeilentext bleibt fuer amountCents/Preis-Erkennung erhalten).
function stripLeadingBarcode(text) {
  return (text || "").replace(/^\d{5,14}\s+/, "");
}

// Ab diesem Aehnlichkeitswert gilt eine Bon-Zeile als Treffer auf einen
// hinterlegten Artikel. Einstellbar -- niedriger = mehr Treffer, aber mehr
// Risiko von Fehltreffern (offener Punkt aus dem Briefing).
const ARTICLE_MATCH_THRESHOLD = 0.6;

// Bester Treffer (>= Threshold) einer Bon-Zeile gegen die Artikellisten
// ALLER aktuell konfigurierten Stores (nicht nur eines einzelnen -- das
// Spiel kennt beim Scannen noch keinen "aktuellen Standort", siehe
// loadConfiguredStores). Passt eine Zeile zu mehreren Artikeln/Stores
// aehnlich gut, gewinnt der hoechste Score, bei exaktem Gleichstand
// (score > best.score statt >=) der zuerst konfigurierte Store/Artikel.
function matchLineToConfiguredStores(lineText, configuredStores) {
  let best = null;
  configuredStores.forEach(({ storeKey, articles }) => {
    (articles || []).forEach((article) => {
      // Abwaertskompatibel: Artikel-Eintraege vor der Item-Auswahl-
      // Erweiterung (Haendler waehlt ein Ungewoehnlich/Selten-Item pro
      // Artikel, siehe dashboard-render.js ARTICLE_ITEM_CHOICES) waren reine
      // Strings -- itemKey bleibt dann null, pickReceiptMatchRewards()
      // faellt in dem Fall auf ein Zufalls-Item zurueck.
      const articleText = (typeof article === "string" ? article : (article && article.text) || "").trim();
      if (!articleText) return;
      const itemKey = typeof article === "string" ? null : (article && article.itemKey) || null;
      const score = articleSimilarity(lineText, articleText);
      if (score >= ARTICLE_MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { articleText, score, storeKey, itemKey };
      }
    });
  });
  return best;
}

// Loest den Store, dessen Artikelliste tatsaechlich getroffen hat, auf die
// fuers Dashboard-Tracking noetige "category" auf (siehe RECEIPT_STORE_PATTERNS
// -Kommentar in js/data.js: category steuert, welches Store-View-Dashboard/
// welcher Kategorie-Filter die Zahl sieht). GodAdmin filtert seine "Alle
// Stores"-Ansicht nicht nach Kategorie -> der kosmetisch per OCR-Retailer-
// Erkennung ermittelte Fallback-Wert reicht dort aus. Fuer einen echten
// Retailer-Standort dagegen MUSS die tatsaechliche, in der Standortverwaltung
// hinterlegte Kategorie verwendet werden, sonst filtert dessen Store-View-
// Dashboard (siehe supabase/functions/store-view/index.ts) den Treffer
// faelschlich weg. STORE_LOCATIONS ist bereits global geladen (js/locations.js).
function resolveCategoryKeyForStore(storeKey, fallbackCategoryKey) {
  if (storeKey === "godadmin") return fallbackCategoryKey;
  const loc = STORE_LOCATIONS.find((l) => l.id === storeKey);
  return (loc && loc.categoryKey) || fallbackCategoryKey;
}

function matchReceiptText(text, configuredStores) {
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    // Wirklich nichts Lesbares erkannt (leeres/kaputtes Foto) — das ist
    // der einzige verbleibende echte Fehlerfall.
    setScanStatus("");
    setScanError("Konnte nichts auf dem Bon lesen. Bitte ein schärferes/helleres Foto versuchen.");
    return;
  }

  // Nur noch kosmetisch (Anzeigetext + "category"-Wert im Tracking) --
  // entscheidet NICHT mehr, welche Items/Umsaetze erkannt werden, siehe
  // Kommentar bei RECEIPT_STORE_PATTERNS in js/data.js.
  const storeMatch = RECEIPT_STORE_PATTERNS.find((entry) => entry.pattern.test(text));
  const categoryKey = storeMatch ? storeMatch.categoryKey : null;
  const category = categoryKey ? STORE_CATEGORIES[categoryKey] : null;

  // Gedruckter Gesamtbetrag des Bons -- dient als Plausibilitaets-Deckel
  // fuer JEDEN einzelnen Zeilenpreis (siehe capToReceiptTotal): ein
  // Einzelartikel kann nie mehr kosten als der ganze Bon.
  const receiptTotalCents = findReceiptTotalCents(text);

  // Alle plausiblen Artikelzeilen samt Preis (Summen-/Steuer-/Adress-/
  // Fusszeilen bereits herausgefiltert, siehe findAllProductLines) -- jede
  // davon wird gegen die Artikellisten ALLER konfigurierten Stores geprueft
  // (siehe matchLineToConfiguredStores). Mehrere Zeilen koennen auf denselben
  // hinterlegten Artikel treffen (mehrere Stueck auf einem Bon) -- das
  // erzeugt bewusst mehrere Eintraege statt eines gezaehlten Stapels, das
  // Dashboard gruppiert Duplikate beim Anzeigen ohnehin case-insensitiv nach
  // Artikeltext (siehe countByProductText in dashboard-render.js).
  //
  // Zeilen OHNE Treffer landen NICHT mehr verworfen, sondern in
  // unmatchedArticles mit dem ROHEN OCR-Zeilentext als Artikelname --
  // Vollstaendigkeit vor Lesbarkeit, ein Store-Partner kennt seine eigenen
  // Kassensystem-Kuerzel auch ohne hinterlegte Artikelliste. Zaehlt fuers
  // Dashboard als Umsatz, aber OHNE Item-Vergabe und OHNE Provision (siehe
  // grantReceiptItems) -- die Unterscheidung "Treffer vs. nicht zugeordnet"
  // ergibt sich spaeter rein aus item_key vorhanden/null, kein eigenes Feld
  // noetig.
  const candidateLines = findAllProductLines(text, new Set(), receiptTotalCents);
  const matchedArticles = [];
  const unmatchedArticles = [];
  candidateLines.forEach((line) => {
    const best = (configuredStores && configuredStores.length > 0)
      ? matchLineToConfiguredStores(stripLeadingBarcode(line.text), configuredStores)
      : null;
    if (best) {
      matchedArticles.push({
        articleText: best.articleText,
        amountCents: line.amountCents,
        // Pro Treffer einzeln aufgeloest, nicht ein gemeinsamer Wert fuers
        // ganze Scan -- verschiedene Zeilen koennten (theoretisch) auf
        // unterschiedliche Stores treffen.
        categoryKey: resolveCategoryKeyForStore(best.storeKey, categoryKey),
        // Vom Store selbst gewaehltes Item (Ungewoehnlich/Selten, siehe
        // ARTICLE_ITEM_CHOICES in dashboard-render.js) -- null bei
        // aelteren Artikel-Eintraegen ohne Auswahl, dann greift der
        // Zufalls-Fallback in pickReceiptMatchRewards().
        itemKey: best.itemKey,
      });
    } else {
      unmatchedArticles.push({
        articleText: line.text,
        amountCents: line.amountCents,
        // Kein Store-Treffer -> keine echte Kategorie aufloesbar, bleibt
        // beim kosmetischen Fallback (siehe RECEIPT_STORE_PATTERNS-Kommentar
        // in js/data.js).
        categoryKey,
      });
    }
  });

  const storeText = category
    ? `Echter Kauf erkannt bei ${category.name} 🧾`
    : `Echter Kauf erkannt 🧾`;

  setScanStatus("");
  grantReceiptItems(matchedArticles, unmatchedArticles, categoryKey, storeText);
}

// Bestimmt PRO Fuzzy-Treffer das zu vergebende Item: vorrangig das vom
// Store selbst bei der Artikel-Hinterlegung gewaehlte Item (Ungewoehnlich/
// Selten, siehe ARTICLE_ITEM_CHOICES in dashboard-render.js) -- nur wenn
// keins hinterlegt ist (aeltere Artikel-Eintraege vor dieser Erweiterung),
// faellt es auf ein zufaelliges, rarity-gewichtetes Item zurueck (siehe
// RECEIPT_MATCH_ITEM_POOL/LOCATION_DROP_RARITY_WEIGHTS in js/data.js).
// Reine Pool-Auswahl (kann nicht fehlschlagen) -- deshalb schon HIER
// berechnet, noch bevor trackReceiptScanForDashboard() bzw. der
// fehleranfaelligere Trophaeen-/Level-Up-Code unten laufen.
function pickReceiptMatchRewards(matchedArticles) {
  return matchedArticles.map(({ articleText, amountCents, categoryKey, itemKey }) => ({
    articleText,
    amountCents,
    categoryKey,
    itemKey: itemKey || pickWeightedItemFromPool(RECEIPT_MATCH_ITEM_POOL, LOCATION_DROP_RARITY_WEIGHTS),
  }));
}

// Dashboard-Tracking (Artikel-Ansicht/Umsatz) fuer ALLE gefundenen Positionen
// -- Treffer UND nicht zugeordnete -- LAEUFT BEWUSST GETRENNT von der
// eigentlichen Item-/XP-/Trophaeen-Vergabe unten (siehe grantReceiptItems).
// Vorher lagen beide Dinge in einer einzigen Funktion verschachtelt: eine
// Exception in der Belohnungs-/Trophaeen-Logik (z.B. der von aussen
// ergaenzten Level-Up-Funktion) brach die GESAMTE Funktion vorzeitig ab,
// NACHDEM das Item schon lokal vergeben war (addItem laeuft vor addXp/
// Trophaeen), aber BEVOR irgendein trackEvent() lief -- der Scan landete
// dann nie im Dashboard, obwohl der Spieler sein Item bekam. Jetzt laeuft
// das Tracking zuerst und kann durch nichts danach mehr verhindert werden.
//
// Ein Eintrag PRO erkannter Bon-Zeile (nicht nach Artikel gruppiert/gezaehlt)
// -- das Dashboard gruppiert beim Anzeigen ohnehin case-insensitiv nach
// Artikeltext, siehe countByProductText() in dashboard-render.js. Treffer
// bekommen item_key gesetzt (provisionsrelevant), nicht zugeordnete Zeilen
// item_key: null (zaehlt im Dashboard als Umsatz, aber NICHT in die
// Provision, siehe aggregateEvents()/aggregateAllTimeTotals() in
// dashboard-render.js) -- diese Unterscheidung braucht kein eigenes Feld.
function trackReceiptScanForDashboard(rewardedMatches, unmatchedArticles, fallbackCategoryKey) {
  if (rewardedMatches.length === 0 && unmatchedArticles.length === 0) {
    // Kein einziger Kandidat gefunden (z.B. komplett unlesbares Foto) --
    // der Kaufversuch zaehlt trotzdem (Kaeuferzahl, "treuer_shopper"-Ziel
    // unten), aber ohne erfundenen Umsatz/Artikeltext.
    trackEvent("item_receipt_scanned", {
      storeId: "receipt_scan",
      category: fallbackCategoryKey,
      itemKey: null,
      rarity: null,
      amountCents: null,
      productText: null,
    });
    return;
  }
  rewardedMatches.forEach(({ articleText, amountCents, itemKey, categoryKey }) => {
    const item = ITEMS[itemKey];
    trackEvent("item_receipt_scanned", {
      storeId: "receipt_scan",
      category: categoryKey,
      itemKey,
      rarity: item.rarity,
      amountCents,
      productText: articleText,
    });
  });
  unmatchedArticles.forEach(({ articleText, amountCents, categoryKey }) => {
    trackEvent("item_receipt_scanned", {
      storeId: "receipt_scan",
      category: categoryKey,
      itemKey: null,
      rarity: null,
      amountCents,
      productText: articleText,
    });
  });
}

function grantReceiptItems(matchedArticles, unmatchedArticles, fallbackCategoryKey, storeText) {
  const rewardedMatches = pickReceiptMatchRewards(matchedArticles);
  trackReceiptScanForDashboard(rewardedMatches, unmatchedArticles, fallbackCategoryKey);

  // Ab hier: die eigentliche Spiel-Belohnung (Item/XP/Trophaeen) und die
  // Erfolgs-Anzeige -- bewusst in try/catch, damit ein Fehler hier (z.B. in
  // der Level-Up-/Trophaeen-Logik) das oben bereits sicher verschickte
  // Dashboard-Tracking nicht mehr rueckwirkend "mitreissen" kann. Im
  // Fehlerfall bleibt das schon vergebene Item einfach ohne Erfolgs-
  // Animation/Trophaeen-Check dieses eine Mal -- besser als ein Scan, der
  // weder im Dashboard noch fuer den Spieler sichtbar ankommt.
  try {
  let levelRewardEntries = [];
  const entries = [];

  // Je Artikel-Treffer wurde bereits oben ein Zufalls-/Store-gewaehltes Item
  // gezogen -- fuer die Erfolgs-Queue nach Item-Typ gruppiert/gestapelt,
  // damit ein Bon mit z.B. 3 Treffern nicht 3 fast identische Karten
  // erzeugt, falls mehrfach dasselbe Item gezogen wurde. Nicht zugeordnete
  // Zeilen bekommen bewusst KEIN Item/keine Ersatzbelohnung mehr (siehe
  // Briefing "Item-Vergabe von Umsatzerfassung entkoppeln") -- ihr Umsatz
  // ist trotzdem bereits oben getrackt.
  if (rewardedMatches.length > 0) {
    const itemCounts = {};
    rewardedMatches.forEach(({ itemKey }) => {
      itemCounts[itemKey] = (itemCounts[itemKey] || 0) + 1;
    });
    Object.entries(itemCounts).forEach(([itemKey, count]) => {
      const item = ITEMS[itemKey];
      addItem(itemKey, count);
      levelRewardEntries = levelRewardEntries.concat(addXp(item.xp * count));
      entries.push({ type: "item", itemKey, count, storeText });
    });
  }

  updateCaughtCounter();

  // Bestaetigter Kauf zaehlt fuers "treuer_shopper"-Ziel (5 Bon-Scans),
  // unabhaengig davon, wie viele/welche Items dieser Scan bringt.
  incrementReceiptScanCount();

  // Erste Tutorial-Quest ("Gehe in einen Laden und kaufe einen Gegenstand")
  // schaltet sich automatisch ueber den allerersten erfolgreichen Bon-Scan
  // frei — claimTrophy() ist idempotent, greift also nur einmal pro Spieler.
  // Reihenfolge der Erfolgsmeldungen ist bewusst so: zuerst das/die
  // normale(n) Item(s) aus dem Bon (bereits oben in entries), danach jede
  // neu freigeschaltete Trophaee mitsamt ihrer Item-Belohnung.
  const trophyEntries = [...claimTrophy("erster_schritt"), ...checkPurchaseTrophies()];
  if (trophyEntries.length > 0) {
    entries.push(...trophyEntries);
    trophyEntries
      .filter((e) => e.type === "trophy")
      .forEach((e) => {
        trackEvent("trophy_unlocked", {
          storeId: "receipt_scan",
          category: fallbackCategoryKey,
          itemKey: e.trophyKey,
          rarity: TROPHIES[e.trophyKey].tier,
        });
      });
    updateCaughtCounter();
    updateQuestButtonVisibility();
  }

  entries.push(...levelRewardEntries);

  // Seit dem Wegfall des Bonuspakets kann "entries" jetzt tatsaechlich leer
  // sein (kein Treffer, Trophaeen laengst freigeschaltet) --
  // showItemSuccessQueue([]) wuerde auf entries[0] crashen. Einfache
  // Bestaetigung statt gar keiner Rueckmeldung: der Umsatz wurde trotzdem
  // erfasst (siehe trackReceiptScanForDashboard oben), nur eben ohne Item.
  if (entries.length === 0) {
    entries.push({
      type: "info",
      storeText,
      title: "Danke für deinen Einkauf!",
      message: "Für diesen Bon war aktuell kein bei diesem Store hinterlegter Artikel dabei — der Umsatz wurde trotzdem erfasst.",
    });
  }

  showItemSuccessQueue(entries);
  } catch (err) {
    console.error(
      "Item-/Trophaeen-Vergabe nach einem Bon-Scan fehlgeschlagen (Dashboard-Tracking ist bereits erfolgt):",
      err
    );
  }
}
