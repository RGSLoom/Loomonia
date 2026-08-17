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

async function processReceiptImage(imageSource) {
  resetScanUI();
  setScanStatus("Bon wird gelesen…");
  try {
    const normalized = await normalizeImageForOcr(imageSource);
    // deu+eng+nld: Bon kann auch im Ausland fotografiert werden (DE/EN/NL) —
    // Tesseract erkennt damit alle drei gemeinsam statt nur Deutsch. Timeout
    // als Absicherung, falls die OCR haengt (z.B. Sprachpaket-Download beim
    // allerersten Scan bricht ab) — sonst bleibt der Screen fuer immer auf
    // "Bon wird gelesen…" stehen.
    const result = await withTimeout(Tesseract.recognize(normalized, "deu+eng+nld"), 45000, "OCR");
    matchReceiptText(result.data.text || "");
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
const RECEIPT_TOTAL_KEYWORDS = /summe|gesamtbetrag|zu zahlen|total|totaal|amount due/i;

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
const RECEIPT_NON_PRODUCT_LINE = /summe|gesamtbetrag|zu zahlen|total|totaal|amount due|mwst|ust\b|steuer|tax\b|\bbar\b|rückgeld|geg\.|zahlung|kassenbon|bon-?nr|beleg|datum|uhrzeit|\bkasse\b|kartenzahlung|girocard|ec-?karte|trace|terminal|posten|artikel:?\s*\d/i;

// Muss echte Wortbestandteile enthalten (nicht nur Ziffern/Symbole) --
// verhindert, dass reine Artikelnummer-/Codezeilen (z.B. "1 1034320 1 |39
// |03|0| 49,99") als "Produktname" durchgehen, sobald auch Nachbarzeilen
// nach einem Preis durchsucht werden.
const RECEIPT_LINE_HAS_WORD = /[a-zA-ZÀ-ÿ]{3,}/;

// Sucht die erste plausible ECHTE Artikelzeile samt ihrem Preis — unabhaengig
// davon, ob sie auf ein Fantasie-Item-Stichwort passt. Fuer die Artikel-
// Ansicht im Dashboard reicht "sieht wie ein Produkt aus", waehrend
// RECEIPT_ITEM_KEYWORDS gezielt auf die deutlich engere Fantasie-Item-
// Zuordnung zielt — echte Kassenbons (Markennamen, Lebensmittel) matchen
// davon oft gar nichts, obwohl OCR die Zeile technisch einwandfrei gelesen
// hat. Genau wie beim Stichwort-Abgleich oben steht der Preis auf echten
// Bons oft NICHT auf derselben Zeile wie der Produktname (z.B. Deichmann:
// Artikelnummer+Preis auf einer Zeile, Markenname "Bench" separat direkt
// darunter) — deshalb auch hier Nachbarzeile vor/nach pruefen, nicht nur
// die Treffer-Zeile selbst.
function findBestProductLine(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 3) continue;
    if (RECEIPT_NON_PRODUCT_LINE.test(line)) continue;
    if (!RECEIPT_LINE_HAS_WORD.test(line)) continue;
    const amountCents =
      extractLineAmountCents(line) ??
      extractLineAmountCents(lines[i - 1] || "") ??
      extractLineAmountCents(lines[i + 1] || "");
    if (amountCents === null) continue;
    return { text: cleanProductNameText(line).slice(0, RECEIPT_PRODUCT_TEXT_MAX_LENGTH), amountCents };
  }
  return null;
}

function matchReceiptText(text) {
  const trimmed = text.trim();
  if (trimmed.length < 3) {
    // Wirklich nichts Lesbares erkannt (leeres/kaputtes Foto) — das ist
    // der einzige verbleibende echte Fehlerfall.
    setScanStatus("");
    setScanError("Konnte nichts auf dem Bon lesen. Bitte ein schärferes/helleres Foto versuchen.");
    return;
  }

  const storeMatch = RECEIPT_STORE_PATTERNS.find((entry) => entry.pattern.test(text));
  const categoryKey = storeMatch ? storeMatch.categoryKey : null;
  const category = categoryKey ? STORE_CATEGORIES[categoryKey] : null;
  // Store nicht hinterlegt (z.B. Retailer im Ausland/nicht gelistete Kette)
  // oder erkannte Kategorie hat noch keinen eigenen receiptItemPool -> ueber
  // ALLE Bon-tauglichen Items pruefen statt den Scan hart abzulehnen. So
  // laesst sich jeder lesbare Bon testen, unabhaengig vom Retailer.
  const pool = category && category.receiptItemPool && category.receiptItemPool.length > 0
    ? category.receiptItemPool
    : ANY_STORE_ITEM_POOL;

  // Jede Zeile kann maximal ein Item treffen (erstes passendes Item aus
  // dem Pool gewinnt); mehrere Zeilen koennen aber unterschiedliche Items
  // treffen (z.B. Bon mit Schuhen UND Rucksack). Trifft eine Zeile
  // denselben Item-Typ wie eine vorherige (z.B. drei verschiedene
  // Getraenke -> alle "Energiesnack"), zaehlt das als mehrere Stueck
  // desselben Items statt zu verschwinden — sonst wirkt ein Bon mit
  // mehreren Artikeln so, als waere nur einer gescannt worden. Der Preis
  // wird PRO ZEILE erkannt (nicht die Bon-Gesamtsumme), damit jedes Item
  // seinen eigenen Wert traegt statt eines gemeinsamen Bon-Betrags.
  const lines = text.split(/\r?\n/);
  const matches = {}; // itemKey -> { count, amounts: [cents|null, ...], lineTexts: [string|null, ...] }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = pool.find((itemKey) => {
      const patterns = RECEIPT_ITEM_KEYWORDS[itemKey] || [];
      return patterns.some((p) => p.test(line));
    });
    if (!hit) continue;
    if (!matches[hit]) matches[hit] = { count: 0, amounts: [], lineTexts: [] };
    matches[hit].count++;
    // Der Preis steht nicht immer auf exakt derselben Zeile wie das
    // Stichwort — z.B. steht bei Deichmann-Bons Artikelnummer+Preis auf
    // einer Zeile und der Markenname ("Bench") separat direkt darunter.
    // Deshalb zusaetzlich eine Zeile vor/nach der Treffer-Zeile pruefen,
    // bevor der Preis als "nicht gefunden" gilt.
    const amount =
      extractLineAmountCents(line) ??
      extractLineAmountCents(lines[i - 1] || "") ??
      extractLineAmountCents(lines[i + 1] || "");
    matches[hit].amounts.push(amount);
    // Tatsaechlich erkannter Zeilentext fuers Dashboard (Artikel-Ansicht,
    // siehe grantReceiptItems) — nur die Treffer-Zeile selbst (nicht die
    // Nachbarzeile wie beim Preis), da das der tatsaechliche Produktname/
    // -hinweis ist. Preis (falls auf derselben Zeile) wird abgeschnitten —
    // der steht im Dashboard schon separat als Umsatzanteil, siehe
    // cleanProductNameText(). Gekappt als Schutz gegen ausufernden
    // OCR-Muell auf schlecht lesbaren Bons.
    const cleanedLine = cleanProductNameText(line.trim()).slice(0, RECEIPT_PRODUCT_TEXT_MAX_LENGTH);
    matches[hit].lineTexts.push(cleanedLine || null);
  }

  if (Object.keys(matches).length === 0) {
    // Kein Store und/oder kein Fantasie-Item-Stichwort getroffen — fuer den
    // Pitch soll das trotzdem ein erfolgreicher Scan sein (Filialen/
    // Retailer-Zuordnung ist fuer die Demo zweitrangig, siehe Absprache
    // mit Dirk). Zufaelliges Item aus dem passenden Pool. Fuers Dashboard
    // trotzdem noch die erste plausible echte Artikelzeile MIT ihrem
    // eigenen Preis suchen (die Fantasie-Stichwortliste ist eng auf
    // Spiel-Items zugeschnitten, echte Kassenbons — Markennamen,
    // Lebensmittel — matchen davon oft nichts, obwohl OCR die Zeile
    // technisch einwandfrei gelesen hat).
    const bestLine = findBestProductLine(text);
    matches[randomChoice(pool)] = {
      count: 1,
      amounts: [bestLine ? bestLine.amountCents : null],
      lineTexts: [bestLine ? bestLine.text : null],
    };
  }

  // Kein einziger Preis auf irgendeiner Treffer-Zeile gefunden -> die Bon-
  // Summe (falls lesbar) EINMALIG dem ersten Item zuschreiben, statt den
  // Scan ganz ohne Umsatz zu lassen. Nicht auf jedes Item verteilen, sonst
  // wuerde der Umsatz bei mehreren Treffern vervielfacht.
  const anyAmountFound = Object.values(matches).some((m) => m.amounts.some((a) => a !== null));
  if (!anyAmountFound) {
    const total = findReceiptTotalCents(text);
    if (total !== null) {
      const firstKey = Object.keys(matches)[0];
      matches[firstKey].amounts[0] = total;
    }
  }

  const storeText = category
    ? `Echter Kauf erkannt bei ${category.name} 🧾`
    : `Echter Kauf erkannt (Retailer nicht gelistet) 🧾`;

  setScanStatus("");
  grantReceiptItems(matches, categoryKey, storeText);
}

function grantReceiptItems(matches, categoryKey, storeText) {
  const entries = Object.entries(matches).map(([itemKey, { count, amounts, lineTexts }]) => {
    const item = ITEMS[itemKey];
    addItem(itemKey, count);
    addXp(item.xp * count);
    updateCaughtCounter();
    for (let i = 0; i < count; i++) {
      trackEvent("item_receipt_scanned", {
        storeId: "receipt_scan",
        category: categoryKey,
        itemKey,
        rarity: item.rarity,
        amountCents: amounts[i] ?? null,
        productText: (lineTexts && lineTexts[i]) || null,
      });
    }
    return { type: "item", itemKey, count, storeText };
  });

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
          category: categoryKey,
          itemKey: e.trophyKey,
          rarity: TROPHIES[e.trophyKey].tier,
        });
      });
    updateCaughtCounter();
    updateQuestButtonVisibility();
  }

  showItemSuccessQueue(entries);
}
