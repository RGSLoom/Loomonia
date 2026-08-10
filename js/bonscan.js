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
    // deu+eng+nld: Bon kann auch im Ausland fotografiert werden (DE/EN/NL) —
    // Tesseract erkennt damit alle drei gemeinsam statt nur Deutsch. Timeout
    // als Absicherung, falls die OCR haengt (z.B. Sprachpaket-Download beim
    // allerersten Scan bricht ab, oder ein sehr grosses Kamerafoto) — sonst
    // bleibt der Screen fuer immer auf "Bon wird gelesen…" stehen.
    const result = await withTimeout(Tesseract.recognize(imageSource, "deu+eng+nld"), 45000, "OCR");
    matchReceiptText(result.data.text || "");
  } catch (err) {
    console.warn("OCR fehlgeschlagen:", err && err.message ? err.message : err);
    setScanStatus("");
    setScanError("Bon konnte nicht gelesen werden. Bitte erneut versuchen (heller/schärfer fotografieren, stabile Internetverbindung fürs erste Mal nötig).");
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

function extractLineAmountCents(line) {
  const matches = line.match(RECEIPT_AMOUNT_PATTERN);
  if (!matches || matches.length === 0) return null;
  const value = parseFloat(matches[matches.length - 1].replace(",", "."));
  if (isNaN(value) || value <= 0 || value >= 10000) return null;
  return Math.round(value * 100);
}

function matchReceiptText(text) {
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
  const matches = {}; // itemKey -> { count, amounts: [cents|null, ...] }
  for (const line of lines) {
    const hit = pool.find((itemKey) => {
      const patterns = RECEIPT_ITEM_KEYWORDS[itemKey] || [];
      return patterns.some((p) => p.test(line));
    });
    if (!hit) continue;
    if (!matches[hit]) matches[hit] = { count: 0, amounts: [] };
    matches[hit].count++;
    matches[hit].amounts.push(extractLineAmountCents(line));
  }

  if (Object.keys(matches).length === 0) {
    if (category) {
      // Store erkannt, aber keine Zeile hat auf ein Item gepasst ->
      // zufaelliger Fallback aus dessen Pool (wie bisher).
      matches[randomChoice(pool)] = { count: 1, amounts: [null] };
    } else {
      // Weder Store noch irgendein Artikel erkannt -> das ist der einzige
      // echte Fehlerfall, der bleibt (z.B. unlesbares/leeres Foto). Zeigt
      // zusaetzlich einen Ausschnitt des tatsaechlich erkannten OCR-Texts,
      // damit sich beim Testen erkennen laesst, ob die OCR selbst schlecht
      // gelesen hat (dann Foto-/Aufloesungsproblem) oder ob nur die
      // Stichwortliste den Text nicht abdeckt (dann Wortliste erweitern).
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
      setScanStatus("");
      setScanError(
        "Konnte weder Store noch Artikel auf dem Bon erkennen. Bitte ein schärferes/helleres Foto versuchen." +
          (preview ? `\n\nErkannter Text: „${preview}${text.trim().length > 160 ? "…" : ""}“` : "\n\n(Kein Text erkannt — Foto vermutlich zu unscharf/dunkel.)")
      );
      return;
    }
  }

  const storeText = category
    ? `Echter Kauf erkannt bei ${category.name} 🧾`
    : `Echter Kauf erkannt (Retailer nicht gelistet) 🧾`;

  setScanStatus("");
  grantReceiptItems(matches, categoryKey, storeText);
}

function grantReceiptItems(matches, categoryKey, storeText) {
  const entries = Object.entries(matches).map(([itemKey, { count, amounts }]) => {
    const item = ITEMS[itemKey];
    addItem(itemKey, count);
    addXp(item.xp * count);
    for (let i = 0; i < count; i++) {
      trackEvent("item_receipt_scanned", {
        storeId: "receipt_scan",
        category: categoryKey,
        itemKey,
        rarity: item.rarity,
        amountCents: amounts[i] ?? null,
      });
    }
    return { itemKey, count, storeText };
  });

  showItemSuccessQueue(entries);
}
