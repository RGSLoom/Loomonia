// Serverseitiger Schreibzugriff auf die "locations"-Tabelle mit dem
// Service-Role-Key -- ersetzt das bisherige direkte Schreiben/Aendern/
// Loeschen ueber den oeffentlichen anon-Key aus dashboard/js/standorte.js.
// Lesen (GET) bleibt bewusst AUSSEN VOR: das Spiel und das Dashboard duerfen
// die Standorte weiterhin direkt und oeffentlich lesen (siehe
// supabase/rls_lockdown.sql, locations_public_select bleibt bestehen) --
// dafuer braucht es keine Function.
//
// Aufruf: POST (Ort anlegen/aktualisieren, gleiche Upsert-Semantik wie
// vorher per "Prefer: resolution=merge-duplicates"), PATCH, oder
// DELETE (?id=eq.<id>), jeweils mit Header "x-admin-password-hash".
import { proxyToTable } from "../_shared/rest-proxy.ts";

// Muss synchron zu STORE_CATEGORIES (js/data.js) UND DASHBOARD_STORES
// (dashboard/js/stores-config.js) gehalten werden -- eine Deno-Edge-Function
// kann diese Browser-<script>-Dateien nicht importieren, deshalb hier eine
// eigene Kopie der gueltigen Kategorie-Schluessel. Ohne diese Pruefung
// akzeptiert proxyToTable JEDEN category_key kommentarlos: das Bearbeiten-
// Dropdown in standorte.js faellt beim naechsten Laden dann still auf den
// ersten Listeneintrag zurueck (kein passender <option value>), speichert
// der Admin danach erneut, wird der Standort unbemerkt auf die falsche
// Kategorie umgestellt (siehe QA-Bug-Liste).
const VALID_CATEGORY_KEYS = [
  "supermarkt",
  "discounter",
  "apotheke",
  "baumarkt",
  "elektronik",
  "mode",
  "juwelier",
  "cafe",
  "bank",
  "drogerie",
  "fastfood",
  "restaurant",
  "bar",
  "tankstelle",
];
const VALID_TYPES = ["store", "landmark"];
const MAX_TEXT_LENGTH = 200;

function validateLocationRow(row: Record<string, unknown>): string | null {
  if (typeof row.type === "string" && !VALID_TYPES.includes(row.type)) {
    return `Ungueltiger type: "${row.type}" (erlaubt: ${VALID_TYPES.join(", ")})`;
  }
  // category_key nur pruefen, wenn es sich um einen Store handelt (bzw. type
  // fehlt, dann greift der DB-Default) -- ein Landmark braucht/hat keinen.
  if (row.type !== "landmark" && row.category_key != null) {
    if (typeof row.category_key !== "string" || !VALID_CATEGORY_KEYS.includes(row.category_key)) {
      return `Ungueltiger category_key: "${row.category_key}" (erlaubt: ${VALID_CATEGORY_KEYS.join(", ")})`;
    }
  }
  for (const field of ["name", "id", "store_number"]) {
    const value = row[field];
    if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
      return `Feld "${field}" ist zu lang (max. ${MAX_TEXT_LENGTH} Zeichen)`;
    }
  }
  return null;
}

// POST kann laut Upsert-Semantik (Prefer: resolution=merge-duplicates) ein
// einzelnes Objekt ODER ein Array von Objekten sein -- PostgREST akzeptiert
// beides, deshalb hier gegen alle Zeilen einzeln pruefen.
function validateLocationBody(body: unknown, method: string): string | null {
  if (method === "DELETE" || body == null) return null;
  const rows = Array.isArray(body) ? body : [body];
  for (const row of rows) {
    if (row && typeof row === "object") {
      const error = validateLocationRow(row as Record<string, unknown>);
      if (error) return error;
    }
  }
  return null;
}

Deno.serve((req) => proxyToTable(req, "locations", ["POST", "PATCH", "DELETE"], validateLocationBody));
