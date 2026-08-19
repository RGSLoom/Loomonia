// Rendert Wesen mit einem 3D-Modell (creature.model3d) als echtes three.js-
// Objekt in einem Mapbox-GL-CustomLayer -- NUR auf dem Kartenmarker. Alle
// anderen Stellen (Fangszene, Erfolg, Tausch-Detail, Sammlungsraster) zeigen
// bewusst weiterhin das flache creature.icon (js/profile.js, js/catchgame.js):
// ein <model-viewer> pro Vorschau braucht dort einen eigenen WebGL-Kontext +
// eigene GPU-Kopie der Geometrie, was bei mehreren gleichzeitig sichtbaren
// Kreaturen (Sammlungsraster!) nicht lohnt, wenn ohnehin nichts rotiert.
// Hier auf der Karte sitzt das Modell dagegen wirklich in der Kamera-
// Perspektive: Kippen/Drehen der Karte zeigt die Kreatur tatsaechlich von
// der Seite/von hinten -- das rechtfertigt den Aufwand.
//
// Tiefentest bewusst AUS (siehe depthTest/depthWrite unten): Mapbox GL JS v3
// und three.js teilen sich zwar denselben GL-Kontext, aber Mercator-Hoehen
// sind so winzig (Weltkugel auf 0..1 normiert), dass ein Kreaturmodell auf
// Bodenhoehe im Floating-Point-Rauschen des Tiefenpuffers verschwindet --
// per Test mit deaktiviertem Tiefentest verifiziert. Kreaturen werden daher
// immer obenauf gezeichnet (wie bei den bisherigen 2D-Markern auch), auf
// Kosten von echter Verdeckung hinter Gebaeuden.
//
// Warum ein eigenes ES-Modul statt eines normalen <script>: three.js/
// GLTFLoader/DRACOLoader gibt es nur noch als ES-Module von CDNs wie unpkg.
// Klassische <script>-Dateien (map.js etc.) teilen sich eine gemeinsame
// let/const-Scope-Kette, ein Modul aber nicht -- deshalb haengen wir die
// Funktionen hier explizit auf window, und mapboxMap wird von aussen als
// Parameter uebergeben statt hier per nacktem Bezeichner gelesen.
// Bezeichner "three"/"three/addons/" werden per Import-Map in index.html
// aufgeloest (die Loader hier importieren three.js selbst wiederum ueber
// denselben blossen Bezeichner, nicht per relativem Pfad).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

// Deckt auch zukuenftige Draco-komprimierte Exports ab (die aktuellen
// *_3d.glb-Dateien brauchen ihn nicht mehr, siehe Chat-Verlauf) -- der von
// Google gehostete Standard-Decoder-Pfad.
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

// path -> Promise<THREE.Group> (Rohmodell, einmal geladen). Jede gespawnte
// Kreatur bekommt per clone(true) eine EIGENE Objekt-Hierarchie, teilt sich
// aber Geometrie/Texturen (per Referenz) mit allen anderen Instanzen des
// gleichen Modells -- nur die (leichten) Materialien werden separat
// geklont, damit sich z.B. der Out-of-range-Tint einer Instanz nicht auf
// alle anderen gleichzeitig sichtbaren Instanzen ueberträgt.
const modelCache = new Map();

// id -> { object }, id = dieselbe activeCreatures-Id wie der DOM-Hit-Marker
// in js/map.js.
const markers = new Map();

// Ziel-Hoehe der Kreatur auf der Karte in Metern. Die Roh-Bounding-Box des
// Modells wird beim Laden einmalig darauf normiert, damit Modelle mit
// abweichendem Export-Massstab trotzdem einheitlich gross wirken.
const CREATURE_HEIGHT_M = 1.4;

let mapLayer = null;

function loadModel(path) {
  if (!modelCache.has(path)) {
    modelCache.set(
      path,
      new Promise((resolve, reject) => {
        gltfLoader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
      })
    );
  }
  return modelCache.get(path);
}

function heightScaleFactor(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return CREATURE_HEIGHT_M / (size.y || 1);
}

function cloneWithOwnMaterials(template) {
  const object = template.clone(true);
  object.traverse((node) => {
    if (node.isMesh && node.material) {
      node.material = node.material.clone();
      // depthTest/depthWrite aus, siehe Datei-Kommentar oben -- sonst
      // verschwindet das Modell durch Tiefenpuffer-Praezisionsrauschen auf
      // Bodenhoehe. Nebeneffekt: mehrere ueberlappende Kreaturen sortieren
      // sich nur nach Einfuegereihenfolge, nicht nach echter Kameradistanz
      // -- bei max. 8 gleichzeitigen, raeumlich verstreuten Spawns
      // (SPAWN_BOOST_MAX_ACTIVE_CREATURES) vernachlaessigbar.
      node.material.depthTest = false;
      node.material.depthWrite = false;
    }
  });
  return object;
}

// Legt den CustomLayer einmalig an -- muss NACH dem Style-Load passieren
// (addLayer schlaegt vorher fehl, wie ueberall sonst in map.js).
function initCreature3DLayer(map) {
  if (mapLayer) return;
  mapLayer = {
    id: "creature-3d-layer",
    type: "custom",
    onAdd(_map, gl) {
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.3));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(0.3, -1, 1);
      this.scene.add(sun);
      this.renderer = new THREE.WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl,
        antialias: true,
      });
      this.renderer.autoClear = false;
    },
    render(_gl, matrix) {
      // Ohne resetState() hinterlaesst three.js einen GL-Zustand, der
      // Mapboxens eigene Layer danach falsch (oder gar nicht) zeichnet --
      // offizielle Empfehlung fuer three.js in einem Mapbox-CustomLayer.
      this.renderer.resetState();
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
      this.renderer.render(this.scene, this.camera);
      // Bewusst KEIN map.triggerRepaint() hier -- das wuerde einen
      // Dauer-Renderloop erzwingen. Mapbox ruft render() ohnehin bei jeder
      // Kamerabewegung (Pan/Tilt/Zoom) auf; ein einmaliges triggerRepaint()
      // beim Spawnen/Entfernen (siehe unten) reicht, um neue Modelle sofort
      // sichtbar zu machen, auch wenn die Kamera gerade still steht.
    },
  };
  map.addLayer(mapLayer);
}

// lat/lon -> Mercator-Weltkoordinaten + Meter-pro-Einheit-Faktor, denselben
// Mapbox liefert (js/map.js nutzt fuer Distanzen die Haversine-Formel aus
// js/utils.js, hier brauchen wir stattdessen Mapboxens eigenes
// Koordinatensystem, weil der CustomLayer direkt in dessen Projektions-
// matrix zeichnet).
async function add3DCreatureMarker(map, id, creature, lat, lon) {
  if (!mapLayer || !mapLayer.scene) return;
  const template = await loadModel(creature.model3d);
  // Layer koennte inzwischen entfernt oder die Kreatur schon wieder
  // gefangen/despawnt worden sein, waehrend das Modell noch lud.
  if (!mapLayer.scene || markers.has(id)) return;

  const object = cloneWithOwnMaterials(template);
  const scale = heightScaleFactor(template);
  const merc = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], 0);
  const metersToMercator = merc.meterInMercatorCoordinateUnits();

  object.position.set(merc.x, merc.y, merc.z);
  object.scale.setScalar(scale * metersToMercator);
  // glTF ist Y-up, Mapboxens Mercator-Raum ist Z-up -- plus zufaellige
  // Blickrichtung, damit nicht alle Kreaturen exakt gleich ausgerichtet
  // herumstehen.
  object.rotation.x = Math.PI / 2;
  object.rotation.z = Math.random() * Math.PI * 2;

  mapLayer.scene.add(object);
  markers.set(id, { object });
  map.triggerRepaint();
}

function remove3DCreatureMarker(map, id) {
  const entry = markers.get(id);
  if (!entry) return;
  markers.delete(id);
  if (mapLayer && mapLayer.scene) mapLayer.scene.remove(entry.object);
  entry.object.traverse((node) => {
    if (node.isMesh && node.material) node.material.dispose();
  });
  if (map) map.triggerRepaint();
}

// Grauer Tint statt vollem Ausblenden -- gleiches Signal wie der
// Grayscale-/Opacity-Filter der 2D-Marker (.creature-marker.out-of-range in
// style.css), nur eben als Material-Farbmultiplikator auf dem 3D-Modell.
function set3DCreatureInRange(id, inRange) {
  const entry = markers.get(id);
  if (!entry) return;
  const tint = inRange ? 0xffffff : 0x999999;
  entry.object.traverse((node) => {
    if (node.isMesh && node.material && node.material.color) {
      node.material.color.setHex(tint);
    }
  });
}

window.initCreature3DLayer = initCreature3DLayer;
window.add3DCreatureMarker = add3DCreatureMarker;
window.remove3DCreatureMarker = remove3DCreatureMarker;
window.set3DCreatureInRange = set3DCreatureInRange;
