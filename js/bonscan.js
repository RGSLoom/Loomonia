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

// ================= OCR: Cloud (OCR.space) zuerst, Tesseract als Fallback ====
// Die reine In-Browser-Erkennung mit Tesseract.js liest Kassenbons (blasser
// Thermodruck, Handyfoto) nur maessig -- real beobachtet: "Straße" wird zu
// "5traBe", einzelne Artikelzeilen sind unbrauchbar, der Fuzzy-Abgleich
// gegen die hinterlegte Artikelliste trifft dann nie. Deshalb laeuft der
// Scan jetzt zuerst ueber die Edge Function "receipt-ocr" (OCR.space,
// Deutsch, Beleg-taugliche Engine). Schlaegt das fehl (Secret nicht gesetzt,
// offline, Kontingent leer, leeres Ergebnis), wird transparent auf das
// bisherige Tesseract-"deu" zurueckgefallen -- der Scan darf daran nie
// scheitern.
const RECEIPT_OCR_URL = `${SUPABASE_URL}/functions/v1/receipt-ocr`;

// OCR.space Free-Tier akzeptiert nur Bilddateien bis 1 MB. Wir komprimieren
// das (bereits per normalizeImageForOcr vereinheitlichte) Foto vorher gezielt
// darunter -- mit Sicherheitsabstand, sonst weist die API es ab.
const CLOUD_OCR_MAX_BYTES = 900 * 1024;

async function compressForCloudOcr(imageBlob) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(imageBlob);
  } catch {
    return imageBlob; // exotisches Format -- dann ungekuerzt weiterreichen, die API/der Fallback faengt es ab
  }
  // Von moderater Kantenlaenge aus schrittweise verkleinern/staerker
  // komprimieren, bis das JPEG unter dem Free-Tier-Limit liegt. Die groebste
  // Stufe ist noch gut lesbar (1200px lange Kante) -- Bons sind schmal.
  const attempts = [
    { maxDim: 2200, quality: 0.75 },
    { maxDim: 1800, quality: 0.7 },
    { maxDim: 1500, quality: 0.62 },
    { maxDim: 1200, quality: 0.55 },
  ];
  let last = imageBlob;
  for (const { maxDim, quality } of attempts) {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
    if (!jpeg) break;
    last = jpeg;
    if (jpeg.size <= CLOUD_OCR_MAX_BYTES) return jpeg;
  }
  return last;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result)); // "data:image/jpeg;base64,…"
    reader.onerror = () => reject(reader.error || new Error("FileReader-Fehler"));
    reader.readAsDataURL(blob);
  });
}

async function cloudOcrReceipt(imageBlob) {
  const compressed = await compressForCloudOcr(imageBlob);
  if (compressed && compressed.size > CLOUD_OCR_MAX_BYTES) {
    // Selbst nach der staerksten Stufe noch zu gross -- gar nicht erst
    // senden (spart einen sicheren Fehlversuch), Tesseract uebernimmt.
    throw new Error("Foto auch nach Kompression über 1 MB");
  }
  const dataUrl = await blobToDataUrl(compressed);
  const res = await fetch(RECEIPT_OCR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ base64Image: dataUrl }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body && body.error ? body.error : `receipt-ocr HTTP ${res.status}`);
  return (body && body.text) || "";
}

// Liefert { text, source } -- source benennt die tatsaechlich genutzte OCR
// ("Cloud / OCR.space" oder "Tesseract / deu[ (Fallback: ...)]") fuer die
// Handy-Diagnose ueber den Kopier-Button. Immer in die Konsole geloggt
// (nicht nur bei Fehlern) -- am Desktop die schnellste Moeglichkeit
// nachzuvollziehen, was die OCR tatsaechlich gelesen hat.
async function recognizeReceiptText(imageBlob) {
  let fallbackReason = "";
  try {
    const cloudText = await withTimeout(cloudOcrReceipt(imageBlob), 20000, "Cloud-OCR");
    if (cloudText && cloudText.trim().length >= 3) {
      console.log("Bon-OCR (Cloud / OCR.space):", cloudText);
      return { text: cloudText, source: "Cloud / OCR.space" };
    }
    fallbackReason = "Cloud-OCR ohne brauchbares Ergebnis";
    console.warn(fallbackReason + " -- Fallback auf Tesseract.");
  } catch (err) {
    fallbackReason = err && err.message ? err.message : String(err);
    console.warn("Cloud-OCR nicht verfügbar, Fallback auf Tesseract:", fallbackReason);
  }
  // Fallback: nur "deu" (DACH-Raum). Tesseract mit mehreren Sprachmodellen
  // gleichzeitig verschlechtert die Erkennung auf einem rein deutschen Bon
  // spuerbar. Timeout als Absicherung, falls die OCR haengt (z.B.
  // Sprachpaket-Download beim allerersten Scan bricht ab).
  const result = await withTimeout(Tesseract.recognize(imageBlob, "deu"), 45000, "OCR");
  console.log("Bon-OCR (Tesseract / deu):", result.data.text);
  return {
    text: result.data.text || "",
    source: fallbackReason ? `Tesseract / deu (Fallback: ${fallbackReason})` : "Tesseract / deu",
  };
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

function showBonOcrCopyButton(text, source) {
  // source (z.B. "Cloud / OCR.space" oder "Tesseract / deu") wird dem
  // kopierbaren Text vorangestellt -- auf dem Handy die einzige Moeglichkeit
  // zu sehen, WELCHE OCR gelaufen ist (Konsole ist dort praktisch nicht
  // erreichbar). Nur fuer die Diagnose-Anzeige, der Abgleich selbst nutzt
  // weiterhin den Rohtext.
  const body = text || "";
  lastBonOcrText = source ? `[OCR: ${source}]\n\n${body}` : body;
  const copyBtn = document.getElementById("btn-scan-copy-text");
  if (copyBtn && body) copyBtn.classList.remove("hidden");
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

// Verhindert, dass ein zweiter Scan (z.B. Doppel-Tap auf "Bon fotografieren"
// waehrend die OCR des ersten noch laeuft) resetScanUI() mitten in einem
// laufenden Durchlauf aufruft und Status/Fehlertext/lastBonOcrText
// ueberschreibt -- ohne diese Sperre koennen zwei parallele Laeufe je nach
// Fertig-Reihenfolge unerwartet den Erfolgs-Screen des jeweils ANDEREN
// Laufs anzeigen oder dessen Fehlermeldung ueberschreiben.
let scanInProgress = false;
// Wird true, wenn der Nutzer den Scan-Screen ueber den Schliessen-Button
// verlaesst, waehrend eine OCR noch laeuft (bis zu 45s, siehe Timeout unten)
// -- ohne dieses Signal riss ein zwischenzeitlich fertig gewordener Scan den
// Nutzer spaeter unvermittelt aus einer ganz anderen Aktivitaet (Profil,
// Fangszene, ...) auf den Bon-Erfolgsscreen (QA-Bug-Liste). scanInProgress
// allein reicht dafuer nicht, das verhindert nur einen ZWEITEN gleichzeitigen
// Scanversuch. Siehe closeScanScreen() unten.
let scanCancelled = false;

function closeScanScreen() {
  scanCancelled = true;
  showScreen("screen-map");
}

// Grosszuegiges Limit GEGEN das Bild-Decoding selbst (createImageBitmap in
// normalizeImageForOcr decodiert die komplette Originaldatei, bevor die
// Groessenbegrenzung dort ueberhaupt greifen kann) -- ein ungewoehnlich
// grosses Foto (z.B. unkomprimiertes RAW-aehnliches Format) wuerde sonst
// den Tab spuerbar belasten, bevor irgendeine Verkleinerung greift.
const RECEIPT_PHOTO_MAX_BYTES = 25 * 1024 * 1024;

async function processReceiptImage(imageSource) {
  if (scanInProgress) return;
  scanInProgress = true;
  scanCancelled = false;
  resetScanUI();
  if (imageSource && typeof imageSource.size === "number" && imageSource.size > RECEIPT_PHOTO_MAX_BYTES) {
    setScanError("Foto ist zu groß. Bitte ein kleineres Bild (unter 25 MB) verwenden.");
    scanInProgress = false;
    return;
  }
  setScanStatus("Bon wird gelesen…");
  try {
    // Parallel zur (mehrere Sekunden dauernden) OCR gestartet statt danach
    // -- kostet dadurch effektiv keine zusaetzliche Wartezeit.
    const storesPromise = loadConfiguredStores();
    const normalized = await normalizeImageForOcr(imageSource);
    // Cloud-OCR (OCR.space) zuerst, Tesseract "deu" nur als Fallback -- siehe
    // recognizeReceiptText(). Der erkannte Rohtext wird darin bereits in die
    // Konsole geloggt.
    const { text, source } = await recognizeReceiptText(normalized);
    showBonOcrCopyButton(text, source);
    const configuredStores = await storesPromise;
    // storeLocationsReady (js/map.js) wird erst aufgeloest, wenn STORE_LOCATIONS
    // die echten Adressen aus Supabase enthaelt statt des adresslosen
    // STORE_LOCATIONS_FALLBACK -- ohne dieses Warten wuerde
    // matchReceiptHeaderToStore() bei einem sehr fruehen Scan (kurz nach
    // App-Start, bevor Standorte geladen sind) fuer JEDEN Store an
    // "if (!address) return;" scheitern und nie einen Store identifizieren.
    // Das Promise loest laut js/locations.js in JEDEM Fall auf (auch bei
    // Netzwerkfehler, dann bleibt einfach der Fallback aktiv) -- kann hier
    // also nie haengen bleiben.
    if (typeof storeLocationsReady !== "undefined" && storeLocationsReady) {
      await storeLocationsReady;
    }
    // Der Nutzer kann den Scan-Screen jederzeit ueber den Schliessen-Button
    // verlassen, waehrend die OCR oben noch laeuft (bis zu 45s) -- ohne diese
    // Pruefung wuerde matchReceiptText() unten den Nutzer aus einer laengst
    // anderen Aktivitaet (Fangszene, Profil, ...) unvermittelt auf den
    // Bon-Erfolgsscreen reissen, sobald der Scan doch noch durchlaeuft
    // (QA-Bug-Liste). Bewusst der ganze Rest inkl. Dashboard-Tracking
    // uebersprungen statt nur die Screen-Umschaltung zu unterdruecken --
    // eine bewusst abgebrochene Aktion sauber "nichts passiert" zu lassen
    // ist einfacher/robuster als Tracking und Anzeige im Nachhinein zu
    // entkoppeln; der Nutzer kann den Bon jederzeit erneut scannen.
    if (scanCancelled) return;
    matchReceiptText(text || "", configuredStores);
  } catch (err) {
    console.warn("OCR fehlgeschlagen:", err && err.message ? err.message : err);
    setScanStatus("");
    setScanError(
      "Bon konnte nicht gelesen werden. Bitte erneut versuchen (heller/schärfer fotografieren, stabile Internetverbindung fürs erste Mal nötig)." +
        (err && err.message ? `\n\n(Technischer Grund: ${err.message})` : "")
    );
  } finally {
    scanInProgress = false;
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
// (?:[.,]\d{3})* faengt Tausendertrennzeichen ab (z.B. "1.234,56") -- ohne
// diesen Teil zerlegt das Pattern einen solchen Betrag faelschlich in ZWEI
// Treffer ("1.23" und "4,56"), extractLineAmountCents() nimmt dann den
// LETZTEN Treffer und liest 4,56 statt 1.234,56 -- bei Bons ueber 999,99 €
// wird dadurch ueber capToReceiptTotal() praktisch jeder Artikelpreis
// faelschlich verworfen, weil er ploetzlich "hoeher als der Gesamtbetrag"
// erscheint. Bei normalen zweistelligen Centbetraegen ohne Gruppierung
// (z.B. "1,79") matcht die Gruppe einfach null Mal, Verhalten unveraendert.
const RECEIPT_AMOUNT_PATTERN = /\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g;

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
// "str." bewusst OHNE Wortgrenze davor: deutsche Strassennamen schreiben das
// haeufig direkt an den Namen angehaengt ("Hauptstr.", "Karl-Bautz-Strasse"),
// eine Wortgrenze vor "str." wuerde genau diesen haeufigsten Fall verpassen
// (real beobachtet: "Hauptstr. 1" wurde nicht erkannt und erbte stattdessen
// den Preis der naechsten echten Artikelzeile).
// \b\d{5}\s+[a-zA-ZÀ-ÿ][^\d]*$: verlangt zusaetzlich, dass NACH der PLZ+Ort-
// artigen Stelle bis zum Zeilenende KEINE weitere Ziffer mehr vorkommt --
// eine echte "PLZ Ort"-Zeile wie "79312 Emmendingen" oder auch
// "79312 Emmendingen, Deutschland"/"79312 Emmendingen (Hauptfiliale)" hat
// danach nur noch Buchstaben/Satzzeichen, waehrend eine ganz normale
// Artikelzeile mit vorangestelltem 5-stelligen Artikelcode wie "12345 Butter
// 250g 2,49" DANACH noch weitere Ziffern (Menge, Preis) traegt und deshalb
// bewusst NICHT mehr matcht -- ohne diesen Anker wuerde eine solche
// Artikelzeile faelschlich als Adresszeile verworfen (real im Dashboard
// beobachtet: Kopfzeilen-Reste landeten in der Artikel-Liste, weil echte
// Artikelzeilen stattdessen als Adresse aussortiert wurden). Bewusst
// [^\d]* statt einer festen Zeichenklasse (z.B. nur Buchstaben/Leerzeichen)
// -- eine erste Fassung verwarf dadurch faelschlich echte Adresszeilen mit
// Komma oder Klammer-Zusatz ("79312 Emmendingen, Deutschland"), [^\d]
// erlaubt jedes Nicht-Ziffer-Zeichen und bleibt trotzdem strikt genug, um
// echte Preis-/Mengenangaben in einer Artikelzeile zu erkennen.
// [s5]tra(ss|ß|b|s)e statt nur stra(ss|ß)e: die OCR liest "Straße" auf
// Kassenbons regelmaessig falsch -- real beobachtet "StraBe" (ß -> B) und
// "5traBe" (fuehrendes S -> 5). Ohne diese Toleranz rutschte die Adresszeile
// ("Karl-Friedrich-StraBe 95") als vermeintlicher Artikel ins Dashboard.
// Das "...e" direkt hinter ss/ß/b/s haelt den Filter eng genug, dass echte
// Produktnamen wie "Straßburger Wurst" (nach ß kommt "b", nicht "e") NICHT
// mitgetroffen werden.
const RECEIPT_ADDRESS_LINE = /[s5]tra(ss|ß|b|s)e|str\.|\b\d{5}\s+[a-zA-ZÀ-ÿ][^\d]*$/i;

// Nackte Waehrungs-/Summen-Fragmente ("EUR", "EUR 12,34", "€ 3,50",
// "* EUR") -- entstehen, wenn die OCR (v.a. im Tabellen-Modus von
// OCR.space) eine Summen-/Preiszeile in Einzelteile zerlegt. Kein Artikel;
// ohne diesen Filter erscheint ein blosses "EUR" mit dem geerbten
// Gesamtbetrag als grosse Fantasie-Position im Dashboard.
const RECEIPT_CURRENCY_FRAGMENT = /^[^a-z0-9€]*(eur|euro|€)\s*\d{0,4}(?:[.,]\d{2})?\s*$/i;

// Generischer Rechtsform-/Firmierungs-Hinweis (GmbH, OHG, e.K., ...) in den
// ersten Zeilen des Bons -- ergaenzt RECEIPT_STORE_PATTERNS fuer Retailer,
// die dort NICHT hinterlegt sind, oder deren Name durch einen OCR-Fehler
// entstellt wurde (real beobachtet: "REWE" wurde von der OCR zu "RE WE" mit
// Leerzeichen erkannt, das Store-Pattern /rewe/i griff deshalb nicht mehr --
// "RE WE Regiemarkt GmbH" landete dadurch als "Artikel" im Dashboard).
// "regiemarkt" ergaenzt, weil es auf REWE-Bons haeufig direkt neben dem
// GmbH-Zusatz steht und denselben Fehlerfall abdeckt.
// Bewusst OHNE "kg"/"ag": beide kollidieren mit sehr haeufigen, echten
// Artikelangaben -- "kg" als Gewichtseinheit auf Wiegeartikeln ("1 KG
// Kartoffeln 2,99"), "ag" potenziell als Abkuerzung/Tippfehler. Da die i<3-
// Pruefzone bei einem nur zweizeiligen Bon-Kopf (Store-Name + Adresse)
// bereits die erste echte Artikelzeile einschliesst, wuerde ein Wiegeartikel
// dort faelschlich als Firmierungszeile verworfen und ginge komplett
// verloren -- ein Mainstream-Fall, kein Rand-Fall. "gmbh"/"ohg"/"e.k." sind
// dagegen keine gebraeuchlichen Artikel-/Einheiten-Abkuerzungen und bleiben
// deshalb risikolos in der Liste.
const RECEIPT_COMPANY_SUFFIX = /\bgmbh\b|\bohg\b|\be\.?\s?k\.?\b|\bregiemarkt\b/i;
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
// RECEIPT_NEGATIVE_AMOUNT: Zeile mit einem MINUS-Betrag (Rabatt/Storno/
// Pfand-Rueckgabe) OHNE eines der oben gelisteten Schluesselwoerter -- die
// bisherige Wortliste (coupon/ersparnis/gespart/rabatt) deckt nicht jede
// denkbare Formulierung ab (z.B. "Sparpreis -0,50", "Gutschein -2,00").
// Das eigentliche Preis-Pattern (RECEIPT_AMOUNT_PATTERN) erfasst nie ein
// vorangestelltes Minus, ohne diesen Ausschluss wuerde ein negativer Betrag
// also als GANZ NORMALER, positiver Artikelpreis gezaehlt.
const RECEIPT_NEGATIVE_AMOUNT = /-\s*\d{1,4}[.,]\d{2}/;
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
// ta-?nr / \bbnr\b: Transaktions-/Bon-Referenznummern-Zeile (z.B. Kaufland
// "TA-Nr 375161 BNr 3706 pe") -- ohne diesen Ausschluss wird die Zeile als
// Kandidat behandelt, hat aber selbst keinen erkennbaren Preis und "erbt"
// per Nachbarzeilen-Lookaround (siehe findAllProductLines) faelschlich den
// Preis der naechsten echten Artikelzeile, wodurch die echte Artikelzeile
// danach faelschlich als bereits "verbraucht" bzw. als Summenzeile gilt.
// tel/te1/fax/telefon: Telefon-/Faxzeile im Bon-Kopf -- "te1" deckt den
// haeufigen OCR-Lesefehler l->1 ab (real beobachtet: "Tel:07641/9325458"
// wurde zu "Te1:07641/9325458" erkannt und landete dadurch unerkannt als
// "Artikel" im Dashboard, da weder ein Store- noch ein Adress-Pattern
// griff). "telefon" bewusst MIT Wortgrenzen (anders als z.B. "str." weiter
// oben) -- ohne \b wuerde es echte Artikelnamen wie "Telefonkarte" (an
// Kiosk-/Supermarktkassen real verkauft) faelschlich mittreffen.
// ust-idnr/steuernr/de\d{9}: USt-IdNr.-Zeile (deutsches Format "DE" + 9
// Ziffern) -- "steuer" oben deckt nur das Wort "Steuer" (MwSt-Aufschluesse-
// lung), nicht die eigentliche USt-IdNr.-Zeile selbst (real beobachtet:
// "DE213413774" landete unerkannt als eigener "Artikel" im Dashboard).
const RECEIPT_NON_PRODUCT_LINE = /mwst|must\b|ust\b|steuer|tax\b|\bbar\b|rückgeld|geg\.|zahlung|kassenbon|bon-?nr|ta-?nr|\bbnr\b|beleg|datum|uhrzeit|\bkasse\b|kartenzahlung|girocard|ec-?karte|\bsepa\b|trace|terminal|posten|artikel:?\s*\d|\bpreis\b|pfand|\buid\b|signatur|coupon|ersparnis|gespart|rabatt|\btel\b|\bte1\b|\bfax\b|\btelefon\b|ust-?idnr|steuernr|\bde\d{9}\b/i;

// Muss echte Wortbestandteile enthalten (nicht nur Ziffern/Symbole) --
// verhindert, dass reine Artikelnummer-/Codezeilen (z.B. "1 1034320 1 |39
// |03|0| 49,99") als "Produktname" durchgehen, sobald auch Nachbarzeilen
// nach einem Preis durchsucht werden. Bewusst schon ab 2 Buchstaben (nicht
// 3): reale Kassensystem-Kuerzel sind oft nur 2 Zeichen lang (z.B. "CC EW
// 0,33L FL" -- das Beispiel in der Doku unten waere mit "{3,}" selbst
// nicht durchgekommen). Reine Zifferncode-Zeilen wie im Beispiel oben
// haben ueberhaupt keine Buchstabenfolge, bleiben also weiterhin
// ausgeschlossen.
const RECEIPT_LINE_HAS_WORD = /[a-zA-ZÀ-ÿ]{2,}/;

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

  // ── Kopfzeilen-Zone komplett ueberspringen ────────────────────────────
  // Alles VOR der ersten echten Artikelzeile (Store-Name, Eigenwerbung/
  // Slogans wie dm "HIER BIN ICH MENSCH" / "HIER KAUF ICH EIN", Adresse,
  // Telefon, Datum/Kassierer) ist fuer die Artikelerkennung irrelevant --
  // die Kopfzeile dient AUSSCHLIESSLICH der Store-Zuordnung, und die laeuft
  // voellig getrennt ueber extractReceiptHeaderText() (Kopf + Fuss).
  // Bisher wurde jede Kopfzeile einzeln per Wortliste abgewehrt
  // (RECEIPT_STORE_PATTERNS/_ADDRESS_LINE/_COMPANY_SUFFIX ...), wodurch
  // beliebige Werbe-/Slogantexte durchrutschten. Stattdessen strukturell:
  // die Artikelzone beginnt bei der ersten Zeile mit einem artikeltypischen
  // Preis (X,XX), die nicht selbst Summe/Steuer/Adresse ist -- Telefon-,
  // Datums- und Slogannummern (z.B. "07641/9686900") passen nicht auf das
  // Betragsmuster. Findet sich GAR kein Preis (sehr schlecht lesbares Foto),
  // wird nichts uebersprungen -- lieber etwas Kopfzeilen-Rauschen als alle
  // Artikel verlieren.
  let articleZoneStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length < 3) continue;
    if (RECEIPT_TOTAL_KEYWORDS.test(l) || RECEIPT_NON_PRODUCT_LINE.test(l) || RECEIPT_ADDRESS_LINE.test(l)) continue;
    if (extractLineAmountCents(l) !== null) {
      articleZoneStart = i;
      break;
    }
  }

  // Zeilen-Indizes, deren Preis bereits einem Kandidaten zugeordnet wurde --
  // eigener Preis genauso wie per Nachbarzeilen-Lookaround "geerbter" Preis.
  // Verhindert, dass eine nachfolgende, ebenfalls preislose Muellzeile (z.B.
  // OCR-Artefakt "la : | | ung | ==") sich per Rueckwaerts-Lookaround
  // denselben Preis noch einmal "ausleiht" und den Umsatz dadurch doppelt
  // zaehlt -- real beobachtet direkt nach "Nimm2 Funfari 0,99" auf einem
  // Kaufland-Bon.
  const usedPriceSourceLines = new Set();
  let footerStarted = false;
  // Laufende Summe aller bisher gefundenen Artikelpreise -- Grundlage fuer
  // die Summenzeilen-Erkennung per Betrag weiter unten (RECEIPT_TOTAL_KEYWORDS
  // deckt nur den Fall ab, dass "Summe"/"Zwischensumme" lesbar OCR't wurde;
  // dieser Betrags-Check erkennt die Summenzeile auch, wenn OCR das Wort
  // selbst verstuemmelt hat, z.B. real beobachtet "Summe" -> "imag").
  let runningSum = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (footerStarted) continue;
    // Kopfzeilen-Zone (Store-Name, Slogans, Adresse, Telefon, Datum) --
    // siehe articleZoneStart-Berechnung oben.
    if (i < articleZoneStart) continue;
    if (line.length < 3) continue;
    if (excludeLines && excludeLines.has(line)) continue;
    if (RECEIPT_TOTAL_KEYWORDS.test(line)) {
      footerStarted = true;
      continue;
    }
    if (RECEIPT_NON_PRODUCT_LINE.test(line)) continue;
    if (RECEIPT_NEGATIVE_AMOUNT.test(line)) continue;
    if (RECEIPT_ADDRESS_LINE.test(line)) continue;
    if (RECEIPT_CURRENCY_FRAGMENT.test(line)) continue;
    if (!RECEIPT_LINE_HAS_WORD.test(line)) continue;
    // Store-Kopfzeile (z.B. "EDEKA MARKT") ist kein Artikel — nutzt dieselben
    // Retailer-Muster wie die Store-Erkennung oben, damit der Ladenname nie
    // als "erkannter Produktname" durchgeht. Bewusst NUR auf die ersten
    // Zeilen angewendet (wo der Store-Header tatsaechlich steht): einige
    // dieser Muster sind Marken-/Getraenkenamen (z.B. "Red Bull",
    // "Fritz-Kola"), die auch als ganz normale PRODUKTZEILE mitten auf
    // einem fremden Bon auftauchen koennen (z.B. "RED BULL 250ML 1,79 A")
    // -- ohne diese Begrenzung wuerde so eine echte Artikelzeile faelschlich
    // als Store-Kopfzeile verworfen.
    if (
      i < 3 &&
      (RECEIPT_STORE_PATTERNS.some((entry) => entry.pattern.test(line)) || RECEIPT_COMPANY_SUFFIX.test(line))
    )
      continue;
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

    // Summenzeilen-Erkennung per Betrag: entspricht der EIGENE Preis dieser
    // Zeile ungefaehr dem Bon-Gesamtbetrag, ist das mit hoher Sicherheit die
    // Summenzeile selbst -- unabhaengig davon, ob "Summe" als Wort erkennbar
    // war. found.length > 0 verhindert, dass ein Bon mit nur EINEM Artikel
    // (dessen Preis zwangslaeufig dem Gesamtbetrag entspricht) faelschlich
    // als eigene Summenzeile gilt und verworfen wird.
    //
    // Bewusst gegen maxAmountCents (den bereits UNABHAENGIG per Keyword/
    // Fallback ermittelten Bon-Gesamtbetrag, siehe findReceiptTotalCents)
    // geprueft, NICHT gegen die Laufsumme der bisher gefundenen Artikel:
    // bei kurzen Bons (2-3 Artikel) kann ein einzelner, spaeterer Artikel-
    // preis zufaellig nahe an der Laufsumme der VORHERIGEN Positionen liegen
    // und wuerde dann faelschlich als Summenzeile durchgehen -- real
    // beobachtet auf einem REWE-Bon: Laufsumme 2,04€ nach 2 Artikeln, der
    // naechste ECHTE Artikel kostete zufaellig 1,99€, lag also within
    // Toleranz. Der unabhaengig ermittelte Gesamtbetrag kollidiert praktisch
    // nie zufaellig mit einem einzelnen Artikelpreis. Ohne lesbaren
    // Gesamtbetrag (maxAmountCents null) bleibt die Laufsumme als
    // Ersatz-Ziel, besser als der Check komplett auszufallen.
    // Toleranz bewusst grosszuegig (max. 50 Cent oder 5 % des Zielwerts)
    // statt exaktem Abgleich: einzelne Artikel mit unlesbarem eigenem Preis
    // (siehe ownAmount === null oben) fehlen in der Laufsumme, wodurch sie
    // selbst bei korrekt gelesener Summenzeile leicht von ihr abweicht --
    // real beobachtet 72 Cent Differenz bei einem einzigen unlesbaren
    // Artikel.
    const totalCheckTarget = maxAmountCents !== null ? maxAmountCents : runningSum;
    const totalMatchTolerance = Math.max(50, Math.round(totalCheckTarget * 0.05));
    // runningSum > 0 (nicht found.length > 0): found kann bereits eine
    // Kandidatenzeile OHNE eigenen Preis enthalten (z.B. eine Store-
    // Kopfzeile, die keinem RECEIPT_STORE_PATTERNS-Muster entsprach) --
    // damit wuerde faelschlich schon der allererste ECHTE (und einzige)
    // Artikel eines Bons als Summenzeile verworfen, obwohl noch gar kein
    // Betrag gezaehlt wurde. runningSum > 0 fragt direkt "wurde bereits
    // ECHTES Geld gezaehlt", real beobachtet bei einem Kaufland-Bon mit nur
    // einer Position ("Nimm2 Funfari 0,99") und einer zuvor unerkannten
    // Kopfzeile ("Kauf land DE 4080").
    if (runningSum > 0 && ownAmount !== null && Math.abs(ownAmount - totalCheckTarget) <= totalMatchTolerance) {
      footerStarted = true;
      continue;
    }

    let rawAmountCents = null;
    let priceSourceLine = -1;
    if (ownAmount !== null) {
      rawAmountCents = ownAmount;
      priceSourceLine = i;
    } else if (!lineHasOwnPriceAttempt(line)) {
      // Lookaround darf sich nie aus einer Summen-/Steuer-/Adresszeile
      // bedienen -- besonders die VORWAERTS-Richtung schaut auf eine Zeile,
      // die selbst noch gar nicht durch die obigen Ausschluss-Checks lief
      // (die laufen erst, wenn die Schleife dort ankommt). Ohne diesen
      // Guard "erbt" eine nameless Muellzeile kurz vor der Summenzeile
      // deren Gesamtbetrag, bevor RECEIPT_TOTAL_KEYWORDS ueberhaupt greifen
      // konnte -- real beobachtet direkt vor "SUMME EUR 0,99" auf einem
      // Kaufland-Bon (OCR-Artefakt "la : | | ung | ==").
      const isLookaroundSource = (candidate) =>
        candidate &&
        !RECEIPT_TOTAL_KEYWORDS.test(candidate) &&
        !RECEIPT_NON_PRODUCT_LINE.test(candidate) &&
        !RECEIPT_ADDRESS_LINE.test(candidate);
      if (!usedPriceSourceLines.has(i - 1) && isLookaroundSource(lines[i - 1])) {
        const prevAmount = extractLineAmountCents(lines[i - 1] || "");
        if (prevAmount !== null) {
          rawAmountCents = prevAmount;
          priceSourceLine = i - 1;
        }
      }
      if (rawAmountCents === null && !usedPriceSourceLines.has(i + 1) && isLookaroundSource(lines[i + 1])) {
        const nextAmount = extractLineAmountCents(lines[i + 1] || "");
        if (nextAmount !== null) {
          rawAmountCents = nextAmount;
          priceSourceLine = i + 1;
        }
      }
    }
    const amountCents = capToReceiptTotal(rawAmountCents, maxAmountCents);
    const cleaned = cleanProductNameText(line).slice(0, RECEIPT_PRODUCT_TEXT_MAX_LENGTH);
    // Bewusst KEIN Dedupe nach Zeilentext mehr: usedPriceSourceLines oben
    // verhindert bereits zuverlaessig, dass sich zwei Zeilen denselben Preis
    // per Nachbarzeilen-Lookaround "ausleihen" -- ein Dedupe nach reinem
    // Textinhalt traf daneben aber auch echte Mehrfachkaeufe (z.B. zwei
    // separate Bon-Zeilen "Red Bull 250ml 1,79") und verwarf die zweite
    // davon faelschlich komplett, statt sie als eigenen Kauf zu zaehlen.
    if (priceSourceLine !== -1) usedPriceSourceLines.add(priceSourceLine);
    found.push({ text: cleaned, amountCents });
    if (amountCents !== null) runningSum += amountCents;
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
    // "\u00df" wird von NFD NICHT in "s"+Diakritikum zerlegt (anders als
    // \u00e4/\u00f6/\u00fc) -- ohne diese explizite Ersetzung wuerde es von der
    // a-z0-9-Filterung weiter unten einfach als Leerzeichen verschluckt
    // ("Stra\u00dfe" -> "stra e" statt "strasse"), was z.B. den Adressabgleich
    // in matchReceiptHeaderToStore() komplett lahmgelegt haette.
    .replace(/\u00df/g, "ss")
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
// Prueft, ob ALLE Woerter von "shorterWords" als zusammenhaengende Folge in
// "longerWords" vorkommen -- Wort-/Token-Ebene statt roher Zeichenkette:
// "milch 1l" ist zwar als reine ZEICHENKETTE Teilstring von "buttermilch
// 1l" (das deutsche Kompositum haengt "milch" ohne Trennzeichen direkt an
// "butter"), auf WORT-Ebene ist "milch" aber ein komplett anderes Token als
// "buttermilch" -- ohne diese Unterscheidung wuerden zusammengesetzte
// deutsche Woerter (Milch/Buttermilch, Saft/Kirschsaft, Keks/Butterkeks)
// staendig faelschlich als Treffer durchgehen.
function containsAsWordSequence(shorterWords, longerWords) {
  if (shorterWords.length === 0) return false;
  for (let i = 0; i <= longerWords.length - shorterWords.length; i++) {
    if (shorterWords.every((word, j) => longerWords[i + j] === word)) return true;
  }
  return false;
}

function articleSimilarity(lineText, configuredArticle) {
  const a = normalizeArticleText(lineText);
  const b = normalizeArticleText(configuredArticle);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aWords = a.split(" ");
  const bWords = b.split(" ");
  const [shorterWords, longerWords] = aWords.length <= bWords.length ? [aWords, bWords] : [bWords, aWords];
  if (containsAsWordSequence(shorterWords, longerWords)) return 0.85;
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

// Ab diesem Aehnlichkeitswert gilt die Bon-Kopfzeile als Treffer auf die
// hinterlegte Adresse eines Stores. Eigene Konstante (nicht
// ARTICLE_MATCH_THRESHOLD wiederverwendet), auch wenn der Wert aktuell
// gleich ist -- Adressabgleich und Artikelabgleich sind inhaltlich
// unabhaengige Entscheidungen und sollen unabhaengig voneinander
// nachjustierbar bleiben.
const STORE_ADDRESS_MATCH_THRESHOLD = 0.6;

// Kopf- UND Fusszeilen des Bons als ein zusammenhaengender Textblock fuer
// den Adressabgleich (addressTokenMatchScore ist tokenbasiert und
// reihenfolge-unabhaengig -- ihm ist egal, wo im Block die Adresse steht,
// Hauptsache sie ist drin).
//
// Warum auch der Fuss: NICHT jede Kette druckt die Filialadresse oben.
// Rossmann z.B. hat im Kopf nur "ROSSMANN / Mein Drogeriemarkt / KdNr:" --
// die eigentliche Adresse ("79194 Gundelfingen / Alte Bundesstr. 39") steht
// ganz UNTEN im Bon-Fuss, zusammen mit USt-IdNr., Oeffnungszeiten und der
// filialfinder-URL. Mit nur den ersten Zeilen wurde ein solcher Bon nie
// einem Store zugeordnet -> die hinterlegte Artikelliste wurde nie geprueft,
// alles landete als "nicht zugeordnet". Bewusst begrenzt auf Kopf + Fuss
// (nicht der ganze Bon), damit die Artikelzeilen in der Mitte nicht
// zufaellig Adress-Tokens eines FALSCHEN Stores liefern.
function extractReceiptHeaderText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines.slice(0, 8);
  const tail = lines.length > 8 ? lines.slice(-15) : [];
  return [...head, ...tail].join(" ");
}

// Token-basierter Adressabgleich, bewusst NICHT articleSimilarity (Levenshtein
// ueber den GESAMTEN Textblock): die Kopfzeile enthaelt neben der Adresse
// auch Store-Namen, Telefonnummer, UID usw., und selbst innerhalb der reinen
// Adresse steht auf Kassenbons oft eine PLZ ZWISCHEN Strasse und Ort
// ("Karl-Friedrich-Str. 97 79312 Emmendingen"), die die hinterlegte Adresse
// ("Karl-Friedrich-Str. 97, Emmendingen") nicht enthaelt -- das bricht jeden
// Substring- ODER Gesamt-Levenshtein-Vergleich, real beobachtet (Score 0,27
// statt der erwarteten hohen Aehnlichkeit). Pro Adress-Wort wird stattdessen
// geprueft, ob es (exakt bei kurzen/numerischen Woertern, sonst mit Toleranz
// fuer OCR-Tippfehler) IRGENDWO im Kopfzeilen-Text vorkommt -- Reihenfolge
// und dazwischenstehender Text (PLZ, Store-Name) spielen keine Rolle mehr.
function addressTokenMatchScore(headerText, address) {
  const headerTokens = normalizeArticleText(headerText).split(" ").filter(Boolean);
  const addressTokens = normalizeArticleText(address).split(" ").filter(Boolean);
  if (addressTokens.length === 0 || headerTokens.length === 0) return 0;
  const matchedCount = addressTokens.filter((addrToken) => {
    const requireExact = addrToken.length <= 3 || /^\d+$/.test(addrToken);
    return headerTokens.some((headerToken) => {
      if (requireExact || headerToken.length <= 3) return headerToken === addrToken;
      const dist = levenshteinDistance(addrToken, headerToken);
      return dist / Math.max(addrToken.length, headerToken.length) <= 0.25;
    });
  }).length;
  return matchedCount / addressTokens.length;
}

// Vergleicht die Bon-Kopfzeile gegen die in der Standortverwaltung
// hinterlegte Adresse jedes konfigurierten Stores (STORE_LOCATIONS, siehe
// js/locations.js) -- verhindert, dass eine Bon-Zeile gegen die
// Artikelliste eines VOELLIG ANDEREN, nicht besuchten Stores matcht, nur
// weil dessen Artikeltexte zufaellig aehnlich klingen (z.B. ein bei "Rewe"
// hinterlegter Artikel, der zufaellig auf einem Kaufland-Bon auftaucht).
// GodAdmin hat keine physische Adresse und wird hier bewusst uebersprungen
// -- siehe resolveStoresForReceipt() unten, das GodAdmin separat immer
// mitfuehrt.
function matchReceiptHeaderToStore(headerText, configuredStores) {
  let best = null;
  configuredStores.forEach(({ storeKey }) => {
    if (storeKey === "godadmin") return;
    const loc = STORE_LOCATIONS.find((l) => l.id === storeKey);
    const address = loc && loc.address;
    if (!address) return;
    const score = addressTokenMatchScore(headerText, address);
    if (score >= STORE_ADDRESS_MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { storeKey, score };
    }
  });
  return best;
}

// Loest anhand der Bon-Kopfzeile auf, welche Stores fuers Artikel-Matching
// herangezogen werden: der per Adresse identifizierte Store (falls einer
// gefunden wurde) UND GodAdmin -- als eigene Store-Objekte, NICHT als
// zusammengemischter Pool, damit matchReceiptText() den identifizierten
// Store zuerst probieren und nur bei einem Fehltreffer auf GodAdmin
// zurueckfallen kann (siehe dort). GodAdmin ist der interne Teststore und
// prueft bewusst JEDEN Bon (siehe Briefing) -- ein echter Retailer-Standort
// dagegen nur noch Bons, deren Kopfzeile zu SEINER EIGENEN hinterlegten
// Adresse passt. Kein Adress-Treffer -> nur GodAdmin bleibt uebrig, kein
// anderer Store wird faelschlich getroffen.
function resolveStoresForReceipt(text, configuredStores) {
  const headerText = extractReceiptHeaderText(text);
  const identified = matchReceiptHeaderToStore(headerText, configuredStores);
  return {
    identifiedStore: identified ? configuredStores.find((s) => s.storeKey === identified.storeKey) : null,
    godAdminStore: configuredStores.find((s) => s.storeKey === "godadmin") || null,
  };
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

  // Per Bon-Kopfzeile/Adresse identifizierter Store PLUS GodAdmin, getrennt
  // gehalten (nicht zusammengemischt) -- verhindert sowohl, dass eine Zeile
  // gegen die Artikelliste eines VOELLIG ANDEREN, nicht besuchten Stores
  // matcht, als auch, dass bei inhaltlich aehnlichen Eintraegen (z.B.
  // GodAdmins Testliste UND der identifizierte Store haben beide "Amicelli
  // Tafel" hinterlegt) faelschlich GodAdmin statt des tatsaechlich
  // identifizierten Stores den Treffer bekommt (siehe Prioritaet unten).
  const { identifiedStore, godAdminStore } = resolveStoresForReceipt(text, configuredStores || []);

  // Store-ID fuers Dashboard-Tracking (events.store_id) -- IMMER der per
  // Adresse identifizierte Store, unabhaengig davon, gegen welche Liste eine
  // einzelne Zeile am Ende gematcht hat (siehe unten): ein Treffer gegen
  // GodAdmins Testliste soll trotzdem im Store-View-Dashboard des tatsaechlich
  // besuchten Ladens auftauchen, nicht nur bei GodAdmin. Kein identifizierter
  // Store (Adresse passt zu niemandem) -> bleibt null, dann sieht NUR GodAdmins
  // ungefilterte "Alle Stores"-Ansicht diesen Bon, kein einzelner Retailer.
  // Ersetzt den bisherigen, IMMER gleichen Literal "receipt_scan" -- der
  // machte events.store_id fuers Store-View-Dashboard nutzlos, siehe
  // Kommentar bei resolveCategoryKeyForStore/store-view Edge Function.
  const receiptStoreId = identifiedStore ? identifiedStore.storeKey : null;

  // Alle plausiblen Artikelzeilen samt Preis (Summen-/Steuer-/Adress-/
  // Fusszeilen bereits herausgefiltert, siehe findAllProductLines) -- jede
  // davon wird zuerst gegen die Artikelliste des identifizierten Stores
  // geprueft, NUR bei einem Fehltreffer dort zusaetzlich gegen GodAdmins
  // Liste (siehe matchLineToConfiguredStores) -- der eigene, tatsaechlich
  // besuchte Store hat also immer Vorrang vor GodAdmins Testliste, selbst
  // bei inhaltlich sehr aehnlichen Eintraegen. Mehrere Zeilen koennen auf
  // denselben hinterlegten Artikel treffen (mehrere Stueck auf einem Bon)
  // -- das erzeugt bewusst mehrere Eintraege statt eines gezaehlten
  // Stapels, das Dashboard gruppiert Duplikate beim Anzeigen ohnehin
  // case-insensitiv nach Artikeltext (siehe countByProductText in
  // dashboard-render.js).
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
    const strippedLine = stripLeadingBarcode(line.text);
    const best =
      (identifiedStore && matchLineToConfiguredStores(strippedLine, [identifiedStore])) ||
      (godAdminStore && matchLineToConfiguredStores(strippedLine, [godAdminStore])) ||
      null;
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
        // Fuehrende Artikel-/EAN-Nummer abschneiden (wie beim Matching oben)
        // -- die liest die OCR pro Zeile/Scan leicht unterschiedlich, wodurch
        // dieselbe Position im Dashboard sonst als mehrere verschiedene
        // Eintraege auftaucht ("329347 H-Milch 1L" vs "329347 H-Milch IL").
        // Bleibt nach dem Abschneiden nichts uebrig, der Rohtext.
        articleText: strippedLine.trim() || line.text,
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
  grantReceiptItems(matchedArticles, unmatchedArticles, categoryKey, storeText, receiptStoreId);
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
function trackReceiptScanForDashboard(rewardedMatches, unmatchedArticles, fallbackCategoryKey, receiptStoreId) {
  if (rewardedMatches.length === 0 && unmatchedArticles.length === 0) {
    // Kein einziger Kandidat gefunden (z.B. komplett unlesbares Foto) --
    // der Kaufversuch zaehlt trotzdem (Kaeuferzahl, "treuer_shopper"-Ziel
    // unten), aber ohne erfundenen Umsatz/Artikeltext.
    trackEvent("item_receipt_scanned", {
      storeId: receiptStoreId,
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
    // Der Store-eigene ARTICLE_ITEM_CHOICES-Katalog im Dashboard (siehe
    // dashboard/js/dashboard-render.js) wird von Hand parallel zu ITEMS
    // gepflegt -- verweist ein bereits gespeicherter Artikel auf einen
    // inzwischen umbenannten/entfernten itemKey, war "item" hier undefined
    // und "item.rarity" liess den ganzen Aufruf VOR dem try/catch in
    // grantReceiptItems() abstuerzen. Das machte aus einem eigentlich
    // erfolgreichen Kauf-Treffer eine irrefuehrende "Bon konnte nicht
    // gelesen werden"-Fehlermeldung fuer den Kunden, UND das Dashboard-
    // Tracking fuer diesen (und alle nachfolgenden) Treffer fiel mit aus
    // (QA-Bug-Liste). Fehlt das Item, wird der Umsatz trotzdem getrackt
    // (nur ohne Raritaet), statt den kompletten Scan zu opfern.
    if (!item) {
      console.warn(`Bon-Scan: unbekannter itemKey "${itemKey}" in der Store-Artikelkonfiguration -- Umsatz wird ohne Raritaet getrackt.`);
    }
    trackEvent("item_receipt_scanned", {
      storeId: receiptStoreId,
      category: categoryKey,
      itemKey,
      rarity: item ? item.rarity : null,
      amountCents,
      productText: articleText,
    });
  });
  unmatchedArticles.forEach(({ articleText, amountCents, categoryKey }) => {
    trackEvent("item_receipt_scanned", {
      storeId: receiptStoreId,
      category: categoryKey,
      itemKey: null,
      rarity: null,
      amountCents,
      productText: articleText,
    });
  });
}

function grantReceiptItems(matchedArticles, unmatchedArticles, fallbackCategoryKey, storeText, receiptStoreId) {
  const rewardedMatches = pickReceiptMatchRewards(matchedArticles);
  trackReceiptScanForDashboard(rewardedMatches, unmatchedArticles, fallbackCategoryKey, receiptStoreId);

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
      // Siehe Kommentar bei trackReceiptScanForDashboard() oben -- derselbe
      // verwaiste-itemKey-Fall wuerde hier sonst die gesamte forEach-Schleife
      // abbrechen und JEDEN weiteren (auch gueltigen) Artikel-Treffer
      // desselben Bons mitreissen, statt nur diesen einen zu ueberspringen.
      if (!item) return;
      addItem(itemKey, count);
      const itemXpResult = addXp(item.xp * count);
      levelRewardEntries = levelRewardEntries.concat(itemXpResult.entries);
      entries.push({ type: "item", itemKey, count, storeText, xpAwarded: itemXpResult.awardedXp });
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
          storeId: receiptStoreId,
          category: fallbackCategoryKey,
          itemKey: e.trophyKey,
          rarity: TROPHIES[e.trophyKey].rarity,
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
