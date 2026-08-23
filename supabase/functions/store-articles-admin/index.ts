// Serverseitiger Schreibzugriff auf die "store_articles"-Tabelle mit dem
// Service-Role-Key -- exakt dasselbe Muster wie locations-admin/index.ts,
// nur fuer eine andere Tabelle. Lesen (GET) bleibt bewusst AUSSEN VOR: das
// Spiel (Fuzzy-Matching beim Bon-Scan, siehe js/bonscan.js) und das
// Dashboard (Formular vorbefuellen) duerfen die Artikelliste weiterhin
// direkt und oeffentlich lesen (siehe supabase/store_articles_setup.sql,
// store_articles_public_select) -- dafuer braucht es keine Function.
//
// Aufruf: POST (Artikelliste eines Stores anlegen/aktualisieren, Upsert per
// "Prefer: resolution=merge-duplicates"), PATCH, oder DELETE
// (?store_key=eq.<key>), jeweils mit Header "x-admin-password-hash".
import { proxyToTable } from "../_shared/rest-proxy.ts";

// Fehlte bisher komplett (anders als locations-admin/index.ts, das exakt
// dieselbe Luecke schon einmal hatte und korrigiert wurde, siehe dortigen
// Kommentar) -- proxyToTable akzeptierte jeden Body kommentarlos. Ohne
// Whitelist fuer itemKey und Laengenlimits fuer Text/Anzahl kann ein
// Aufruf mit gueltigem Admin-Passwort-Hash (z.B. direkt per API statt
// ueber das Dashboard-Formular) einen itemKey ausserhalb von
// ARTICLE_ITEM_CHOICES (dashboard/js/dashboard-render.js) speichern -- der
// landet dann als item_key eines Events und faellt dort auf den rohen Key
// zurueck (siehe DASHBOARD_ITEMS-Fallback in stores-config.js), zusaetzlich
// zur reinen Dateninkonsistenz. Muss synchron zu ARTICLE_ITEM_CHOICES
// gehalten werden -- eine Deno-Edge-Function kann diese Browser-<script>-
// Datei nicht importieren.
const VALID_ARTICLE_ITEM_KEYS = [
  "energiesnack",
  "gesundheitspaket",
  "vitaminsaft",
  "energieriegel_plus",
  "hose",
  "oberteil",
  "wasserflasche_plus",
  "sneaker",
  "rucksack",
  "suessigkeit",
  "stylische_kappe",
  "kraeuterelixier",
];
const MAX_ARTICLES = 15;
const MAX_ARTICLE_TEXT_LENGTH = 120;
const MAX_STORE_KEY_LENGTH = 200;

function validateArticlesRow(row: Record<string, unknown>): string | null {
  if (typeof row.store_key === "string" && row.store_key.length > MAX_STORE_KEY_LENGTH) {
    return `store_key ist zu lang (max. ${MAX_STORE_KEY_LENGTH} Zeichen)`;
  }
  if (row.articles == null) return null;
  if (!Array.isArray(row.articles)) return "articles muss ein Array sein";
  if (row.articles.length > MAX_ARTICLES) {
    return `Maximal ${MAX_ARTICLES} Artikel erlaubt`;
  }
  for (const article of row.articles) {
    // Abwaertskompatibel: reine Strings (vor der Item-Auswahl-Erweiterung,
    // siehe matchLineToConfiguredStores in js/bonscan.js) UND
    // {text, itemKey}-Objekte sind gueltig.
    const text = typeof article === "string" ? article : article && typeof article === "object" ? (article as Record<string, unknown>).text : null;
    if (typeof text !== "string" || text.length > MAX_ARTICLE_TEXT_LENGTH) {
      return `Artikeltext ungueltig oder zu lang (max. ${MAX_ARTICLE_TEXT_LENGTH} Zeichen)`;
    }
    if (article && typeof article === "object" && !Array.isArray(article)) {
      const itemKey = (article as Record<string, unknown>).itemKey;
      if (itemKey != null && !VALID_ARTICLE_ITEM_KEYS.includes(itemKey as string)) {
        return `Ungueltiger itemKey: "${itemKey}" (erlaubt: ${VALID_ARTICLE_ITEM_KEYS.join(", ")})`;
      }
    }
  }
  return null;
}

function validateArticlesBody(body: unknown, method: string): string | null {
  if (method === "DELETE" || body == null) return null;
  const rows = Array.isArray(body) ? body : [body];
  for (const row of rows) {
    if (row && typeof row === "object") {
      const error = validateArticlesRow(row as Record<string, unknown>);
      if (error) return error;
    }
  }
  return null;
}

Deno.serve((req) => proxyToTable(req, "store_articles", ["POST", "PATCH", "DELETE"], validateArticlesBody));
