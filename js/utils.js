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
  return promise;
}

// Baut Markup fuer die Vorschau eines Wesens: hat die Kreatur ein 3D-Modell
// (creature.model3d, aktuell nur Moosilda), wird ein <model-viewer> mit dem
// .glb gerendert, sonst wie bisher ein flaches <img>-Icon. Bewusst statisch
// (kein auto-rotate, keine camera-controls) -- an diesen Stellen (Fangszene,
// Erfolgsmeldung, Tausch-Detail, Sammlungsraster) soll das 3D-Modell wie ein
// normales Icon wirken, nicht dauerhaft rotieren oder Klicks/Scrollen
// abfangen (echtes 3D mit Kamerabezug gibt es nur auf dem Kartenmarker).
function creatureVisualHTML(creature, iconSrc, { className = "", id = "" } = {}) {
  const idAttr = id ? ` id="${id}"` : "";
  const clsAttr = className ? ` class="${className}"` : "";
  const name = creature ? creature.name : "";
  if (creature && creature.model3d) {
    // loading="eager" statt Standard-Lazyload per IntersectionObserver: die
    // Stellen, an denen wir das nutzen, sind Screens/Karten, die genau dann
    // erscheinen, wenn ihr Inhalt ohnehin gebraucht wird -- ein verzoegertes
    // Nachladen wuerde sich dort nur als Ruckler bemerkbar machen.
    return `<model-viewer${idAttr} src="${creature.model3d}"${clsAttr} alt="${name}" loading="eager" disable-zoom shadow-intensity="0"></model-viewer>`;
  }
  return `<img${idAttr} src="${iconSrc}"${clsAttr} alt="${name}" />`;
}

// DOM-Variante von creatureVisualHTML() fuer Stellen, die ein festes
// <img>-Element per ID wiederverwenden statt es per innerHTML neu zu bauen
// (Fangszene/Erfolgsmeldung) -- <img>.src haette bei einem 3D-Modell keine
// Wirkung, daher wird das Element bei Bedarf gegen <model-viewer>
// ausgetauscht (bzw. zurueck, sobald wieder ein Wesen ohne Modell dran ist).
// Gibt das (ggf. neue) Element zurueck.
function renderCreatureVisual(el, creature, iconSrc, opts = {}) {
  const id = el.id;
  const className = el.className;
  el.outerHTML = creatureVisualHTML(creature, iconSrc, { ...opts, id, className });
  return document.getElementById(id);
}
