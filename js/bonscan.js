// Bon-Scan: echter Kauf -> Item-Drop (siehe Spielspezifikation Abschnitt 7,
// "QR-Scan-Screen"). Liest ein Bon-Foto (Kamera oder Datei-Upload) per OCR
// aus, erkennt Store + moeglichst eine Artikelzeile und vergibt daraufhin
// ein Item — spiegelt den Ablauf von grantRandomItemFromStore() in
// js/drawgame.js, nur mit echtem Bon statt Minigame als Ausloeser.

let scanCameraStream = null;
let scanCameraTrack = null; // fuer ImageCapture.takePhoto(), siehe captureFromScanCamera()

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
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia wird von diesem Browser nicht unterstuetzt");
    }
    // { ideal: "environment" } statt einer harten Anforderung — manche
    // Android-Kameras/Browser bieten keine exakte "environment"-Uebereinstimmung
    // an und wuerden getUserMedia sonst komplett ablehnen (gleiches Muster
    // wie die bewaehrte AR-Kamera in der Fangszene, siehe catchgame.js).
    // Hohe ideale Aufloesung angefragt, weil kleine Bon-Schrift auf einem
    // Standard-Videostream (oft nur 640x480) fuer OCR kaum lesbar ist —
    // bei Datei-Uploads (echte Fotos) tritt dieses Problem nicht auf, dort
    // ist die volle Kamera-Aufloesung des Geraets im Bild.
    scanCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      },
      audio: false,
    });
    scanCameraTrack = scanCameraStream.getVideoTracks()[0];
    const video = document.getElementById("scan-camera");
    video.srcObject = scanCameraStream;
    video.style.display = "block";
    // Erst wenn das Video wirklich Frames liefert (videoWidth > 0) den
    // Aufnahme-Button freigeben — sonst wuerde ein Tap direkt nach dem
    // Start ein leeres 0x0-Bild aufnehmen und stillschweigend nichts tun.
    await new Promise((resolve) => {
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    });
    try {
      await video.play();
    } catch (playErr) {
      // Manche Browser brauchen ein aktives play() trotz autoplay-Attribut;
      // schlaegt es fehl, bleibt das Video ggf. schwarz, aber die Frames
      // sind i.d.R. trotzdem lesbar -> nicht hart abbrechen.
    }
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
  scanCameraTrack = null;
  const video = document.getElementById("scan-camera");
  video.srcObject = null;
  video.style.display = "none";
  document.getElementById("btn-scan-capture").style.display = "none";
}

// Zahlen (Preise) brauchen fuer die OCR viel schaerfere Bilder als Woerter
// — ein falsch gelesener Buchstabe in "Energiesnack" stoert das Stichwort-
// Matching kaum, ein falsch gelesenes Zeichen in "4,99" macht die Zahl
// unbrauchbar. Der <video>-Livestream liefert selbst mit hoher angeforderter
// Aufloesung oft weniger Bildpunkte als ein echtes Kamera-Foto. Deshalb
// bevorzugt ueber ImageCapture.takePhoto() ein echtes Foto in Sensor-
// Aufloesung aufnehmen (Chrome/Android); nur wenn das nicht unterstuetzt
// wird oder fehlschlaegt (z.B. Safari/iOS), auf den bisherigen Video-Frame-
// Snapshot zurueckfallen.
async function captureFromScanCamera() {
  if (window.ImageCapture && scanCameraTrack) {
    try {
      const imageCapture = new ImageCapture(scanCameraTrack);
      const blob = await imageCapture.takePhoto();
      processReceiptImage(blob);
      return;
    } catch (err) {
      console.warn("ImageCapture.takePhoto() fehlgeschlagen, nutze Video-Frame:", err && err.message ? err.message : err);
    }
  }
  captureFromScanCameraFrame();
}

function captureFromScanCameraFrame() {
  const video = document.getElementById("scan-camera");
  if (!video.videoWidth || !video.videoHeight) {
    // Kamera hat noch keinen Frame geliefert (z.B. sehr kurz nach dem
    // Oeffnen getappt) — vorher fiel das hier lautlos aus (0x0-Bild ohne
    // jede Rueckmeldung). Jetzt sichtbarer Hinweis statt totem Button.
    setScanError("Kamera ist noch nicht bereit. Bitte kurz warten und erneut auf \"Bon fotografieren\" tippen.");
    return;
  }
  const canvas = document.getElementById("scan-canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (blob) {
      processReceiptImage(blob);
    } else {
      setScanError("Foto konnte nicht aufgenommen werden. Bitte erneut versuchen.");
    }
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
    // deu+eng+nld: Bon kann auch im Ausland fotografiert werden (DE/EN/NL) —
    // Tesseract erkennt damit alle drei gemeinsam statt nur Deutsch.
    const result = await Tesseract.recognize(imageSource, "deu+eng+nld");
    matchReceiptText(result.data.text || "");
  } catch (err) {
    console.warn("OCR fehlgeschlagen:", err && err.message ? err.message : err);
    setScanStatus("");
    setScanError("Bon konnte nicht gelesen werden. Bitte erneut versuchen (heller/schärfer fotografieren).");
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
