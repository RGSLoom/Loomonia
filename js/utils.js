// Geo- und Allzweck-Hilfsfunktionen

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// Distanz zwischen zwei Koordinaten in Metern (Haversine)
function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

// Neuer Punkt in Metern-Distanz + Peilung (Grad) von einem Startpunkt aus
function destinationPoint(lat, lon, distance, bearingDeg) {
  const bearing = toRad(bearingDeg);
  const latRad = toRad(lat);
  const lonRad = toRad(lon);
  const angDist = distance / EARTH_RADIUS_M;

  const newLat = Math.asin(
    Math.sin(latRad) * Math.cos(angDist) +
      Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearing)
  );
  const newLon =
    lonRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angDist) * Math.cos(latRad),
      Math.cos(angDist) - Math.sin(latRad) * Math.sin(newLat)
    );

  return { lat: toDeg(newLat), lon: ((toDeg(newLon) + 540) % 360) - 180 };
}

// Peilung von Punkt 1 zu Punkt 2 in Grad im Uhrzeigersinn ab Norden (0-360)
// — passt 1:1 zu CSS transform:rotate()deg, da beide im Uhrzeigersinn
// zaehlen und 0deg "oben"/Norden ist.
function bearingBetween(lat1, lon1, lat2, lon2) {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const λ1 = toRad(lon1);
  const λ2 = toRad(lon2);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function randomPointAround(lat, lon, maxRadiusM, minRadiusM = 0) {
  const angle = Math.random() * 360;
  const dist = minRadiusM + Math.random() * (maxRadiusM - minRadiusM);
  return destinationPoint(lat, lon, dist, angle);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatNumber(n) {
  return Math.round(n).toLocaleString("de-DE");
}

// Anzeigetexte fuer aktive, zeitlich befristete Boost-Effekte (siehe
// gameState.activeEffects in js/state.js) -- "energie_restore" und
// "gesundheit_restore" tauchen hier bewusst nicht auf, die sind instant und
// hinterlassen keinen aktiven Effekt-Zustand. Von js/map.js (Map-HUD-Pills)
// UND js/profile.js (Items-Screen-Banner) genutzt, daher hier statt in einer
// der beiden Dateien.
const ACTIVE_EFFECT_LABELS = {
  xp_boost: "⭐ XP-Boost",
  fangchance_boost: "🎯 Fangchance-Boost",
  loomas_anlocken: "🐾 Lockt Loomas an",
  guaranteed_nearby_spawn: "🍃 Looma-Nachschub",
};

// Restzeit-Anzeige fuer aktive Boosts: unter 1 Std als lebendiger MM:SS-
// Countdown (die meisten Verbrauchsitem-Boosts laufen 5-30 Min, siehe
// effectDurationMs in js/data.js), darueber grob in Std/Tage (v.a. fuer den
// 7-Tage-Lockduft-Flakon) -- eine Sekunden-Countdown-Anzeige waere dort
// weder lesbar noch sinnvoll.
function formatRemainingTime(ms) {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  if (hours < 24) return `${hours} Std ${Math.floor((totalSeconds % 3600) / 60)} Min`;
  const days = Math.floor(hours / 24);
  return `${days} Tag${days === 1 ? "" : "e"} ${hours % 24} Std`;
}

// Kurze Bestaetigungsmeldung (z.B. beim Verwenden eines Verbrauchsitems,
// siehe applyBoostItem()/useHealItem()) -- body-weites #app-toast-Element
// (siehe index.html), blendet sich per Opacity-Transition ein und nach
// 2,2s wieder aus. Erneuter Aufruf waehrend die vorherige Meldung noch
// steht ersetzt Text + Timer statt sich zu stapeln.
let appToastHideTimer = null;
function showToast(text) {
  const el = document.getElementById("app-toast");
  if (!el) return;
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(appToastHideTimer);
  appToastHideTimer = setTimeout(() => el.classList.remove("visible"), 2200);
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Entfernt (nahezu) weißen Hintergrund eines Bildes und liefert eine
// transparente PNG-Data-URL zurück. Nötig, weil die gelieferten
// "freigestellten" Wesen-Icons technisch keinen Alphakanal besitzen,
// sondern auf reinem Weiß (255,255,255) liegen.
function removeWhiteBackground(imgSrc) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const px = data.data;
      const threshold = 244;
      const softStart = 225;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        const minC = Math.min(r, g, b);
        if (minC >= threshold) {
          px[i + 3] = 0;
        } else if (minC >= softStart) {
          const t = (minC - softStart) / (threshold - softStart);
          px[i + 3] = Math.round(255 * (1 - t));
        }
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = imgSrc;
  });
}

const cutoutCache = new Map();
async function getCutoutImage(imgSrc) {
  if (cutoutCache.has(imgSrc)) return cutoutCache.get(imgSrc);
  const promise = removeWhiteBackground(imgSrc);
  cutoutCache.set(imgSrc, promise);
  try {
    return await promise;
  } catch (err) {
    // Ein einzelner fehlgeschlagener Freistellungs-Versuch (z.B. kurzzeitiger
    // Decode-Fehler) blieb sonst fuer den Rest der Session permanent als
    // abgelehntes Promise im Cache haengen -- jeder weitere Aufruf fuer
    // dasselbe Bild bekam denselben Fehler zurueck, ohne je einen erneuten
    // Versuch zu bekommen (QA-Bug-Liste). Cache-Eintrag entfernen, damit der
    // naechste Aufruf es einfach nochmal versucht.
    cutoutCache.delete(imgSrc);
    throw err;
  }
}
