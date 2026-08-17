// Standortverwaltung: Formular (Adresse -> Nominatim-Geocoding -> Supabase
// "locations"-Tabelle) + Liste bestehender Standorte mit Bearbeiten/Löschen.
// Laeuft erst nach dem "standorte-unlocked"-Event aus js/standorte-auth.js.

const LOCATIONS_TABLE_URL = `${SUPABASE_URL}/rest/v1/locations`;

// Nominatim-Nutzungsbedingungen (https://operations.osmfoundation.org/policies/nominatim/):
// max. 1 Anfrage/Sekunde, keine automatisierten Massenabfragen, Anfrage
// muss per User-Agent oder Referer identifizierbar sein. Der Browser sendet
// den Referer (diese Seite) automatisch mit, ein eigener User-Agent-Header
// laesst sich per fetch() ohnehin nicht setzen (verbotener Header). Diese
// Seite loest genau eine Anfrage pro Klick auf "Adresse suchen" aus (kein
// Live-Autocomplete waehrend des Tippens) — bei "wenigen Einträgen pro
// Monat" (siehe Auftrag) bleibt das weit unter jedem Limit.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const LANDMARK_ICON_OPTIONS = [
  { value: "☕", label: "☕ Café" },
  { value: "🏛️", label: "🏛️ Wahrzeichen / Sehenswürdigkeit" },
  { value: "🌳", label: "🌳 Park / Grünfläche" },
  { value: "📍", label: "📍 Sonstiger Ort" },
];

let editingId = null; // null = neuer Ort, sonst id des gerade bearbeiteten Standorts
let resolvedCoords = null; // { lat, lon } — erst nach erfolgreichem Geocoding gesetzt
let idManuallyEdited = false;
let geocodeMap = null;
let geocodeMarker = null;

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    // Alle uebrigen Akzente (é, à, ñ, ...) generisch entfernen statt
    // stillschweigend den ganzen Buchstaben zu verschlucken.
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function populateCategoryDropdown() {
  const select = document.getElementById("loc-category");
  select.innerHTML = "";
  Object.keys(DASHBOARD_STORES).forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = DASHBOARD_STORES[key].name;
    select.appendChild(opt);
  });
}

function populateLandmarkDropdown() {
  const select = document.getElementById("loc-landmark-icon");
  select.innerHTML = "";
  LANDMARK_ICON_OPTIONS.forEach((opt) => {
    const el = document.createElement("option");
    el.value = opt.value;
    el.textContent = opt.label;
    select.appendChild(el);
  });
}

function currentType() {
  return document.querySelector('input[name="loc-type"]:checked').value;
}

function updateTypeToggleVisuals() {
  document.getElementById("type-label-store").classList.toggle("selected", currentType() === "store");
  document.getElementById("type-label-landmark").classList.toggle("selected", currentType() === "landmark");
  document.getElementById("field-category").classList.toggle("hidden", currentType() !== "store");
  document.getElementById("field-landmark-icon").classList.toggle("hidden", currentType() !== "landmark");
  document.getElementById("field-store-number").classList.toggle("hidden", currentType() !== "store");
}

function clearGeocodeResult() {
  resolvedCoords = null;
  document.getElementById("geocode-result").classList.add("hidden");
  document.getElementById("btn-save").disabled = true;
}

let geocodeMapPromise = null;

// Mapbox verlangt anders als Leaflet/OSM eine sichtbare Attribution (siehe
// Mapbox-ToS) -- attributionControl bleibt deshalb hier aktiv, obwohl die
// Leaflet-Fassung sie fuer dieses kleine Vorschaukaertchen ausgeblendet hatte.
function initGeocodeMap() {
  if (!geocodeMapPromise) {
    geocodeMapPromise = getMapboxToken().then((token) => {
      mapboxgl.accessToken = token;
      geocodeMap = new mapboxgl.Map({
        container: "geocode-map",
        style: currentMapStyle(),
        center: [7.8496, 48.1198], // Mapbox nutzt [lng, lat], nicht [lat, lng] wie Leaflet
        zoom: 15,
      });
      return geocodeMap;
    });
  }
  return geocodeMapPromise;
}

async function showGeocodeResult(lat, lon, displayName) {
  document.getElementById("geocode-result").classList.remove("hidden");
  document.getElementById("geocode-address").textContent = displayName;
  document.getElementById("geocode-coords").textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  await initGeocodeMap();
  geocodeMap.jumpTo({ center: [lon, lat], zoom: 17 });
  // Map-Container ist bis zum ersten Ergebnis via .hidden ausgeblendet
  // gewesen -> Mapbox kennt seine Groesse erst jetzt korrekt.
  setTimeout(() => geocodeMap.resize(), 50);
  if (geocodeMarker) geocodeMarker.remove();
  geocodeMarker = new mapboxgl.Marker().setLngLat([lon, lat]).addTo(geocodeMap);
}

async function geocodeAddress(address) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "de" } });
  if (!res.ok) throw new Error(`Nominatim-Anfrage fehlgeschlagen (${res.status}).`);
  const results = await res.json();
  if (!results.length) throw new Error("Keine Adresse gefunden. Bitte präzisieren (Straße, PLZ, Ort).");
  return { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon), displayName: results[0].display_name };
}

function setFormStatus(msg, kind) {
  const el = document.getElementById("form-status");
  el.textContent = msg || "";
  el.className = "form-status" + (kind ? " " + kind : "");
}

async function onGeocodeClick() {
  const address = document.getElementById("loc-address").value.trim();
  if (!address) {
    setFormStatus("Bitte zuerst eine Adresse eingeben.", "error");
    return;
  }
  const btn = document.getElementById("btn-geocode");
  btn.disabled = true;
  btn.textContent = "Suche…";
  setFormStatus("", "");
  try {
    const result = await geocodeAddress(address);
    resolvedCoords = { lat: result.lat, lon: result.lon };
    await showGeocodeResult(result.lat, result.lon, result.displayName);
    document.getElementById("btn-save").disabled = !canSave();
  } catch (err) {
    clearGeocodeResult();
    setFormStatus(err.message || String(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Adresse suchen";
  }
}

function canSave() {
  const name = document.getElementById("loc-name").value.trim();
  const id = document.getElementById("loc-id").value.trim();
  return !!name && !!id && !!resolvedCoords;
}

function resetForm() {
  editingId = null;
  idManuallyEdited = false;
  document.getElementById("form-title").textContent = "Neuen Ort anlegen";
  document.getElementById("loc-name").value = "";
  document.getElementById("loc-id").value = "";
  document.getElementById("loc-id").readOnly = false;
  document.getElementById("loc-address").value = "";
  document.getElementById("loc-store-number").value = "";
  document.querySelector('input[name="loc-type"][value="store"]').checked = true;
  updateTypeToggleVisuals();
  document.getElementById("loc-category").selectedIndex = 0;
  document.getElementById("loc-landmark-icon").selectedIndex = 0;
  clearGeocodeResult();
  setFormStatus("", "");
  document.getElementById("btn-cancel-edit").classList.add("hidden");
}

async function onSaveClick() {
  if (!canSave()) return;
  const type = currentType();
  const row = {
    id: document.getElementById("loc-id").value.trim(),
    type,
    category_key: type === "store" ? document.getElementById("loc-category").value : null,
    landmark_icon: type === "landmark" ? document.getElementById("loc-landmark-icon").value : null,
    name: document.getElementById("loc-name").value.trim(),
    address: document.getElementById("loc-address").value.trim() || null,
    store_number: type === "store" ? (document.getElementById("loc-store-number").value.trim() || null) : null,
    lat: resolvedCoords.lat,
    lon: resolvedCoords.lon,
  };

  const btn = document.getElementById("btn-save");
  btn.disabled = true;
  btn.textContent = "Speichere…";
  try {
    // Schreibt ueber die Edge Function locations-admin (Service-Role-Key) statt
    // direkt mit dem anon-Key -- die "locations"-Tabelle nimmt Schreibzugriffe
    // vom anon-Key seit dem RLS-Lockdown nicht mehr an (siehe
    // supabase/rls_lockdown.sql).
    const res = await fetchWithAdminAuth(LOCATIONS_ADMIN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText}${body ? " – " + body : ""}`);
    }
    setFormStatus(`„${row.name}“ gespeichert.`, "success");
    resetForm();
    loadLocations();
  } catch (err) {
    setFormStatus("Speichern fehlgeschlagen: " + (err.message || err), "error");
  } finally {
    btn.disabled = !canSave();
    btn.textContent = "Ort speichern";
  }
}

function startEdit(row) {
  editingId = row.id;
  idManuallyEdited = true; // ID bleibt fest, kein Auto-Slug mehr waehrend der Bearbeitung
  document.getElementById("form-title").textContent = `„${row.name}“ bearbeiten`;
  document.getElementById("loc-name").value = row.name || "";
  document.getElementById("loc-id").value = row.id;
  document.getElementById("loc-id").readOnly = true;
  document.getElementById("loc-address").value = row.address || "";
  document.getElementById("loc-store-number").value = row.store_number || "";
  document.querySelector(`input[name="loc-type"][value="${row.type}"]`).checked = true;
  updateTypeToggleVisuals();
  if (row.type === "store" && row.category_key) document.getElementById("loc-category").value = row.category_key;
  if (row.type === "landmark" && row.landmark_icon) document.getElementById("loc-landmark-icon").value = row.landmark_icon;

  if (row.lat != null && row.lon != null) {
    resolvedCoords = { lat: row.lat, lon: row.lon };
    showGeocodeResult(row.lat, row.lon, row.address || "Bestehende Koordinaten (keine Adresse hinterlegt)");
  } else {
    clearGeocodeResult();
  }
  document.getElementById("btn-save").disabled = !canSave();
  document.getElementById("btn-cancel-edit").classList.remove("hidden");
  setFormStatus("Adresse ändern und erneut suchen, um die Position zu aktualisieren — sonst bleiben die bisherigen Koordinaten erhalten.", "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function onDeleteClick(row) {
  const confirmed = confirm(`„${row.name}“ (${row.id}) wirklich unwiderruflich löschen?`);
  if (!confirmed) return;
  try {
    const res = await fetchWithAdminAuth(`${LOCATIONS_ADMIN_URL}?id=eq.${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    if (editingId === row.id) resetForm();
    loadLocations();
  } catch (err) {
    alert("Löschen fehlgeschlagen: " + (err.message || err));
  }
}

function formatUpdatedAt(ts) {
  if (!ts) return "–";
  return new Date(ts).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

// Magic-Link-Zugangscodes fuer die rein lesende Store-Partner-Ansicht
// (dashboard/store-view.html) -- komplett getrennte Tabelle/Functions, siehe
// supabase/store_links_setup.sql und supabase/functions/store-links-admin/.
// Einmal pro Laden der Standortliste komplett abgerufen (ein Request statt
// einem pro Zeile) und ueber location_id nachgeschlagen.
function buildStoreViewUrl(token) {
  return new URL("store-view.html", window.location.href).href + `?token=${encodeURIComponent(token)}`;
}

// Darf die Standortliste nie blockieren, auch wenn store-links-admin gerade
// nicht erreichbar ist (z.B. noch nicht deployed, kurz offline) -- dann
// zeigt jede Store-Zeile einfach "Link erzeugen" statt eines bestehenden
// Links, der Rest der Tabelle laedt trotzdem normal.
async function fetchStoreLinks() {
  try {
    const res = await fetchWithAdminAuth(`${STORE_LINKS_ADMIN_URL}`, { method: "GET" });
    if (!res.ok) return {};
    const rows = await res.json();
    const map = {};
    rows.forEach((row) => { map[row.location_id] = row; });
    return map;
  } catch (err) {
    return {};
  }
}

async function generateStoreLink(locationId, btn) {
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Erzeuge…";
  try {
    const res = await fetchWithAdminAuth(STORE_LINKS_ADMIN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locationId }),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    loadLocations();
  } catch (err) {
    alert("Link konnte nicht erzeugt werden: " + (err.message || err));
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function revokeStoreLink(locationId, name) {
  const confirmed = confirm(`Link für „${name}“ wirklich deaktivieren? Der bisherige Link funktioniert danach nicht mehr.`);
  if (!confirmed) return;
  try {
    const res = await fetchWithAdminAuth(`${STORE_LINKS_ADMIN_URL}?location_id=${encodeURIComponent(locationId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    loadLocations();
  } catch (err) {
    alert("Link konnte nicht deaktiviert werden: " + (err.message || err));
  }
}

// Baut die "Link"-Zelle einer Store-Zeile: ohne Link ein einzelner
// "Link erzeugen"-Button, mit Link die URL (zum manuellen Markieren/
// Kopieren) plus "Kopieren"/"Neu erzeugen"/"Deaktivieren". Landmarks haben
// keine Kategorie und damit keine sinnvolle Store-View -> immer "–".
function buildLinkCell(row, linkInfo) {
  const cell = document.createElement("div");
  cell.style.display = "flex";
  cell.style.flexDirection = "column";
  cell.style.gap = "6px";
  cell.style.alignItems = "flex-start";
  cell.style.maxWidth = "220px";

  if (row.type !== "store") {
    cell.textContent = "–";
    return cell;
  }

  if (!linkInfo) {
    const genBtn = document.createElement("button");
    genBtn.className = "btn-link-text";
    genBtn.textContent = "Link erzeugen";
    genBtn.onclick = () => generateStoreLink(row.id, genBtn);
    cell.appendChild(genBtn);
    return cell;
  }

  const url = buildStoreViewUrl(linkInfo.access_token);
  const urlField = document.createElement("input");
  urlField.type = "text";
  urlField.readOnly = true;
  urlField.value = url;
  urlField.style.width = "100%";
  urlField.style.fontSize = "0.75rem";
  urlField.onclick = () => urlField.select();
  cell.appendChild(urlField);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const copyBtn = document.createElement("button");
  copyBtn.className = "btn-link-text";
  copyBtn.textContent = "Kopieren";
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = "Kopiert";
      setTimeout(() => { copyBtn.textContent = "Kopieren"; }, 1500);
    } catch (e) {
      urlField.select();
    }
  };

  const renewBtn = document.createElement("button");
  renewBtn.className = "btn-link-text";
  renewBtn.textContent = "Neu erzeugen";
  renewBtn.onclick = () => generateStoreLink(row.id, renewBtn);

  const revokeBtn = document.createElement("button");
  revokeBtn.className = "btn-danger-text";
  revokeBtn.textContent = "Deaktivieren";
  revokeBtn.onclick = () => revokeStoreLink(row.id, row.name);

  actions.appendChild(copyBtn);
  actions.appendChild(renewBtn);
  actions.appendChild(revokeBtn);
  cell.appendChild(actions);
  return cell;
}

async function loadLocations() {
  const body = document.getElementById("locations-body");
  try {
    const [res, storeLinks] = await Promise.all([
      fetch(`${LOCATIONS_TABLE_URL}?select=*&order=updated_at.desc`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      }),
      fetchStoreLinks(),
    ]);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const rows = await res.json();

    document.getElementById("locations-count").textContent =
      `${rows.length} Standort${rows.length === 1 ? "" : "e"} in der Tabelle.`;

    body.innerHTML = "";
    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="8" class="empty-note">Noch keine Standorte in Supabase. Solange bleibt das Spiel bei der eingebauten Fallback-Liste (siehe js/data.js).</td></tr>`;
      return;
    }

    rows.forEach((row) => {
      const categoryLabel = row.type === "landmark"
        ? `${row.landmark_icon || "📍"} Orientierungspunkt`
        : (DASHBOARD_STORES[row.category_key]?.name || row.category_key || "–");
      const coordsLabel = row.lat != null && row.lon != null
        ? `${row.lat.toFixed(5)}, ${row.lon.toFixed(5)}`
        : "zufällig (kein Ort hinterlegt)";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row.name}</td>
        <td><span class="status-pill ${row.type === "store" ? "status-pill-active" : "status-pill-planned"}">${row.type === "store" ? "Store" : "Landmark"}</span></td>
        <td>${categoryLabel}</td>
        <td>${row.store_number || "–"}</td>
        <td>${coordsLabel}</td>
        <td>${formatUpdatedAt(row.updated_at)}</td>
        <td></td>
        <td></td>
      `;
      const linkCell = tr.children[6];
      linkCell.appendChild(buildLinkCell(row, storeLinks[row.id]));

      const actionsCell = tr.lastElementChild;
      const editBtn = document.createElement("button");
      editBtn.className = "btn-link-text";
      editBtn.textContent = "Bearbeiten";
      editBtn.onclick = () => startEdit(row);
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-danger-text";
      deleteBtn.textContent = "Löschen";
      deleteBtn.onclick = () => onDeleteClick(row);
      actionsCell.appendChild(editBtn);
      actionsCell.appendChild(deleteBtn);
      body.appendChild(tr);
    });
  } catch (err) {
    body.innerHTML = `<tr><td colspan="8" class="empty-note">Standorte konnten nicht geladen werden: ${err.message || err}. Prüfen, ob supabase/locations_setup.sql bereits ausgeführt wurde.</td></tr>`;
  }
}

function initAdmin() {
  populateCategoryDropdown();
  populateLandmarkDropdown();
  updateTypeToggleVisuals();

  document.querySelectorAll('input[name="loc-type"]').forEach((input) => {
    input.addEventListener("change", updateTypeToggleVisuals);
  });

  document.getElementById("loc-name").addEventListener("input", (e) => {
    if (!idManuallyEdited) {
      document.getElementById("loc-id").value = slugify(e.target.value);
    }
    document.getElementById("btn-save").disabled = !canSave();
  });
  document.getElementById("loc-id").addEventListener("input", () => {
    idManuallyEdited = true;
    document.getElementById("btn-save").disabled = !canSave();
  });
  // Adresse geaendert -> vorheriges Geocoding-Ergebnis passt nicht mehr
  // sicher dazu, also erst nach erneutem Suchen wieder speicherbar machen.
  document.getElementById("loc-address").addEventListener("input", clearGeocodeResult);

  document.getElementById("btn-geocode").addEventListener("click", onGeocodeClick);
  document.getElementById("btn-save").addEventListener("click", onSaveClick);
  document.getElementById("btn-cancel-edit").addEventListener("click", resetForm);

  loadLocations();
}

document.addEventListener("standorte-unlocked", initAdmin);
