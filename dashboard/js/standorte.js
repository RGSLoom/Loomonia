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
}

function clearGeocodeResult() {
  resolvedCoords = null;
  document.getElementById("geocode-result").classList.add("hidden");
  document.getElementById("btn-save").disabled = true;
}

function initGeocodeMap() {
  geocodeMap = L.map("geocode-map", { zoomControl: false, attributionControl: false }).setView([48.1198, 7.8496], 15);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    subdomains: "abcd",
  }).addTo(geocodeMap);
}

function showGeocodeResult(lat, lon, displayName) {
  document.getElementById("geocode-result").classList.remove("hidden");
  document.getElementById("geocode-address").textContent = displayName;
  document.getElementById("geocode-coords").textContent = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;

  if (!geocodeMap) initGeocodeMap();
  geocodeMap.setView([lat, lon], 17);
  // Map-Container ist bis zum ersten Ergebnis via .hidden ausgeblendet
  // gewesen -> Leaflet kennt seine Groesse erst jetzt korrekt.
  setTimeout(() => geocodeMap.invalidateSize(), 50);
  if (geocodeMarker) geocodeMap.removeLayer(geocodeMarker);
  geocodeMarker = L.marker([lat, lon]).addTo(geocodeMap);
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
    showGeocodeResult(result.lat, result.lon, result.displayName);
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
    lat: resolvedCoords.lat,
    lon: resolvedCoords.lon,
  };

  const btn = document.getElementById("btn-save");
  btn.disabled = true;
  btn.textContent = "Speichere…";
  try {
    const res = await fetch(LOCATIONS_TABLE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
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
    const res = await fetch(`${LOCATIONS_TABLE_URL}?id=eq.${encodeURIComponent(row.id)}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Prefer: "return=minimal",
      },
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

async function loadLocations() {
  const body = document.getElementById("locations-body");
  try {
    const res = await fetch(`${LOCATIONS_TABLE_URL}?select=*&order=updated_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const rows = await res.json();

    document.getElementById("locations-count").textContent =
      `${rows.length} Standort${rows.length === 1 ? "" : "e"} in der Tabelle.`;

    body.innerHTML = "";
    if (rows.length === 0) {
      body.innerHTML = `<tr><td colspan="6" class="empty-note">Noch keine Standorte in Supabase. Solange bleibt das Spiel bei der eingebauten Fallback-Liste (siehe js/data.js).</td></tr>`;
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
        <td>${coordsLabel}</td>
        <td>${formatUpdatedAt(row.updated_at)}</td>
        <td></td>
      `;
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
    body.innerHTML = `<tr><td colspan="6" class="empty-note">Standorte konnten nicht geladen werden: ${err.message || err}. Prüfen, ob supabase/locations_setup.sql bereits ausgeführt wurde.</td></tr>`;
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
