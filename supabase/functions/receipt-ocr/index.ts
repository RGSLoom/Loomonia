// Liest ein Bon-Foto per Cloud-OCR (OCR.space) aus und liefert den reinen
// Text an den (build-losen, statisch gehosteten) Client zurueck. Ersetzt die
// bisherige reine In-Browser-Erkennung mit Tesseract.js NICHT, sondern wird
// von js/bonscan.js bevorzugt aufgerufen; Tesseract bleibt als Fallback,
// falls diese Function fehlschlaegt (Secret fehlt, offline, Kontingent leer).
//
// Der OCR.space-API-Key steht bewusst NUR als Supabase-Secret
// (OCR_SPACE_API_KEY), nie im Repo/Client -- gleiches Prinzip wie
// mapbox-token. Bewusst OEFFENTLICH/ohne Admin-Passwort-Check: jeder Spieler
// scannt Bons, nicht nur Admins. Missbrauchsschutz kommt aus dem
// Free-Tier-Kontingent des Keys (25.000 Anfragen/Monat), nicht aus
// Geheimhaltung.
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface OcrSpaceResponse {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ErrorDetails?: string;
  OCRExitCode?: number;
  ParsedResults?: { ParsedText?: string }[] | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("OCR_SPACE_API_KEY");
  if (!apiKey) {
    // Kein 4xx: der Client soll das als "Cloud-OCR aktuell nicht verfuegbar"
    // behandeln und sauber auf Tesseract zurueckfallen.
    return jsonResponse({ error: "OCR_SPACE_API_KEY ist noch nicht als Secret gesetzt." }, 500);
  }

  let payload: { base64Image?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body (JSON erwartet)" }, 400);
  }

  let base64Image = (payload.base64Image || "").trim();
  if (!base64Image) return jsonResponse({ error: "Kein Bild übermittelt" }, 400);
  // OCR.space verlangt bei base64Image den Data-URI-Prefix. Fehlt er (Client
  // schickt nur die Rohdaten), als JPEG annehmen -- js/bonscan.js schickt
  // ohnehin immer ein re-enkodiertes JPEG.
  if (!base64Image.startsWith("data:")) {
    base64Image = `data:image/jpeg;base64,${base64Image}`;
  }

  // OCREngine=2: bessere Layout-/Zahlen-Erkennung auf Kassenbons als die
  // (schnellere, aeltere) Engine 1. scale=true hilft bei kleiner
  // Thermodruck-Schrift, isTable=true haelt Artikel/Preis-Spalten
  // zeilenweise zusammen, detectOrientation=true faengt schraeg/quer
  // fotografierte Bons ab.
  const form = new URLSearchParams();
  form.set("base64Image", base64Image);
  form.set("language", "ger");
  form.set("OCREngine", "2");
  form.set("scale", "true");
  form.set("isTable", "true");
  form.set("detectOrientation", "true");

  let ocrRes: Response;
  try {
    ocrRes = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (err) {
    return jsonResponse(
      { error: `OCR-Dienst nicht erreichbar: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }

  let data: OcrSpaceResponse;
  try {
    data = await ocrRes.json();
  } catch {
    return jsonResponse({ error: `OCR-Dienst lieferte kein JSON (HTTP ${ocrRes.status})` }, 502);
  }

  if (data.IsErroredOnProcessing) {
    const msg = Array.isArray(data.ErrorMessage)
      ? data.ErrorMessage.join("; ")
      : data.ErrorMessage || data.ErrorDetails || "unbekannter OCR-Fehler";
    return jsonResponse({ error: `OCR fehlgeschlagen: ${msg}` }, 502);
  }

  const text = (data.ParsedResults || [])
    .map((r) => (r && r.ParsedText) || "")
    .join("\n")
    .replace(/\r\n/g, "\n")
    .trim();

  return jsonResponse({ text }, 200);
});
