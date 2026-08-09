// Bon-Scan: echter Kauf -> Item-Drop (siehe Spielspezifikation Abschnitt 7,
// "QR-Scan-Screen"). Liest ein Bon-Foto (Kamera oder Datei-Upload) per OCR
// aus, erkennt Store + moeglichst eine Artikelzeile und vergibt daraufhin
// ein Item — spiegelt den Ablauf von grantRandomItemFromStore() in
// js/drawgame.js, nur mit echtem Bon statt Minigame als Ausloeser.

let scanCameraStream = null;

function openScanScreen() {
  resetScanUI();
  showScreen("screen-scan");
  tryStartScanCamera();
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

async function tryStartScanCamera() {
  if (scanCameraStream) return true;
  try {
    scanCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    const video = document.getElementById("scan-camera");
    video.srcObject = scanCameraStream;
    video.style.display = "block";
    document.getElementById("btn-scan-capture").style.display = "block";
    return true;
  } catch (err) {
    // Keine Kamera vorhanden/erlaubt -> einfach nur den Upload-Weg
    // anbieten, kein Fehler fuer den Spieler sichtbar.
    console.warn("Bon-Scan-Kamera nicht verfügbar, nutze nur Upload:", err && err.message ? err.message : err);
    scanCameraStream = null;
    return false;
  }
}

function stopScanCamera() {
  if (scanCameraStream) {
    scanCameraStream.getTracks().forEach((t) => t.stop());
    scanCameraStream = null;
  }
  const video = document.getElementById("scan-camera");
  video.srcObject = null;
  video.style.display = "none";
  document.getElementById("btn-scan-capture").style.display = "none";
}

function captureFromScanCamera() {
  const video = document.getElementById("scan-camera");
  const canvas = document.getElementById("scan-canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (blob) processReceiptImage(blob);
  }, "image/jpeg", 0.92);
}

function handleScanFileInput(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = ""; // erlaubt erneutes Hochladen derselben Datei
  if (file) processReceiptImage(file);
}

async function processReceiptImage(imageSource) {
  resetScanUI();
  setScanStatus("Bon wird gelesen…");
  try {
    const result = await Tesseract.recognize(imageSource, "deu");
    matchReceiptText(result.data.text || "");
  } catch (err) {
    console.warn("OCR fehlgeschlagen:", err && err.message ? err.message : err);
    setScanStatus("");
    setScanError("Bon konnte nicht gelesen werden. Bitte erneut versuchen (heller/schärfer fotografieren).");
  }
}

function matchReceiptText(text) {
  const storeMatch = RECEIPT_STORE_PATTERNS.find((entry) => entry.pattern.test(text));
  if (!storeMatch) {
    setScanStatus("");
    setScanError("Store nicht erkannt. Bitte einen anderen Bon versuchen oder erneut scannen.");
    return;
  }

  const category = STORE_CATEGORIES[storeMatch.categoryKey];
  const pool = category.receiptItemPool || [];
  if (pool.length === 0) {
    setScanStatus("");
    setScanError("Store erkannt, aber aktuell kein Item dafür verfügbar.");
    return;
  }

  // Jede Zeile kann maximal ein Item treffen (erstes passendes Item aus
  // dem Pool gewinnt); mehrere Zeilen koennen aber unterschiedliche Items
  // treffen (z.B. Bon mit Schuhen UND Rucksack). Trifft eine Zeile
  // denselben Item-Typ wie eine vorherige (z.B. drei verschiedene
  // Getraenke -> alle "Energiesnack"), zaehlt das als mehrere Stueck
  // desselben Items statt zu verschwinden — sonst wirkt ein Bon mit
  // mehreren Artikeln so, als waere nur einer gescannt worden.
  const lines = text.split(/\r?\n/);
  const counts = {}; // itemKey -> Anzahl passender Zeilen
  for (const line of lines) {
    const hit = pool.find((itemKey) => {
      const patterns = RECEIPT_ITEM_KEYWORDS[itemKey] || [];
      return patterns.some((p) => p.test(line));
    });
    if (hit) counts[hit] = (counts[hit] || 0) + 1;
  }
  if (Object.keys(counts).length === 0) counts[randomChoice(pool)] = 1;

  setScanStatus("");
  grantReceiptItems(counts, storeMatch.categoryKey);
}

function grantReceiptItems(counts, categoryKey) {
  const category = STORE_CATEGORIES[categoryKey];

  const entries = Object.entries(counts).map(([itemKey, count]) => {
    const item = ITEMS[itemKey];
    addItem(itemKey, count);
    addXp(item.xp * count);
    for (let i = 0; i < count; i++) {
      trackEvent("item_receipt_scanned", {
        storeId: "receipt_scan",
        category: categoryKey,
        itemKey,
        rarity: item.rarity,
      });
    }
    return { itemKey, count, storeText: `Echter Kauf erkannt bei ${category.name} 🧾` };
  });

  showItemSuccessQueue(entries);
}
