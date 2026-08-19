// Magic-Link-Ansicht fuer einzelne Store-Partner (dashboard/store-view.html
// ?token=...). Ganz ueberwiegend weiterhin rein lesend, PLUS (seit dem
// Artikelstammdaten-Feature) genau ein eng begrenzter Schreibpfad: der
// Store-Partner darf SEINE EIGENE Artikelliste selbst pflegen (siehe
// dashboard/store-view.html Artikel-Panel + js/store-view.js). Bewusst
// KOMPLETT UNABHAENGIG vom Admin-Passwortschutz und von locations-admin/
// events-admin/store-articles-admin -- stattdessen loest diese Function
// einen langen Zufalls-Token ueber die eigene, oeffentlich unerreichbare
// Tabelle "store_links" zu GENAU EINEM Store auf (siehe
// supabase/store_links_setup.sql) und liest/schreibt ausschliesslich
// dessen Daten.
//
// Sicherheitsprinzip: welche "category"/"location_id" gilt, wird IMMER hier
// serverseitig aus dem Token aufgeloest, NIE aus einem vom Client
// mitgeschickten Parameter uebernommen -- gilt fuer GET (Zahlen/Artikel
// lesen) UND fuer den Schreibpfad (Artikelliste speichern) gleichermassen:
// ein gueltiger Token fuer Store A kann dadurch nie Daten von Store B lesen
// oder ueberschreiben, egal was der Client mitschickt.
//
// Schreiben ist NUR fuer resource=articles erlaubt (POST, siehe
// sanitizeArticles) -- jede andere Kombination bleibt strikt lesend.
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Items, die ein Store als Belohnung fuer einen Artikel-Treffer waehlen
// darf -- identische Liste wie ARTICLE_ITEM_CHOICES in
// dashboard/js/dashboard-render.js (bewusst dupliziert statt geteilt,
// gleiches Prinzip wie DASHBOARD_ITEMS/js/data.js ITEMS).
const ALLOWED_ARTICLE_ITEM_KEYS = ["energiesnack", "gesundheitspaket", "sneaker", "rucksack"];

// Verteidigung in der Tiefe: selbst wenn ein Store-Link-Token in falsche
// Haende geraet oder der Client fehlerhafte Daten schickt, darf daraus nie
// eine beliebig lange/kaputte Artikelliste in der Datenbank landen -- max.
// 15 Eintraege, je ein getrimmter, nicht-leerer Text (hart auf 120 Zeichen
// gekappt, identische Grenzen wie im Dashboard-Formular) plus ein
// optionales itemKey, das NUR einer der erlaubten Werte sein darf (sonst
// null -- dann greift der Zufalls-Fallback in js/bonscan.js
// pickReceiptMatchRewards). Akzeptiert zusaetzlich reine Strings
// (Artikel-Eintraege vor der Item-Auswahl-Erweiterung).
function sanitizeArticles(input: unknown): { text: string; itemKey: string | null }[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      const text = typeof entry === "string"
        ? entry
        : (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).text === "string")
          ? (entry as Record<string, unknown>).text as string
          : "";
      const rawItemKey = (entry && typeof entry === "object")
        ? (entry as Record<string, unknown>).itemKey
        : null;
      const itemKey = typeof rawItemKey === "string" && ALLOWED_ARTICLE_ITEM_KEYS.includes(rawItemKey)
        ? rawItemKey
        : null;
      return { text: text.trim(), itemKey };
    })
    .filter((e) => e.text.length > 0)
    .slice(0, 15)
    .map((e) => ({ text: e.text.slice(0, 120), itemKey: e.itemKey }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  if (!token) return jsonResponse({ error: "Kein Zugangscode angegeben" }, 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const linkRes = await fetch(
    `${supabaseUrl}/rest/v1/store_links?select=location_id&access_token=eq.${encodeURIComponent(token)}`,
    { headers: authHeaders },
  );
  const linkRows = await linkRes.json();
  if (!linkRes.ok || !Array.isArray(linkRows) || linkRows.length === 0) {
    return jsonResponse({ error: "Link ungültig oder deaktiviert" }, 404);
  }
  const locationId = linkRows[0].location_id;

  const locRes = await fetch(
    `${supabaseUrl}/rest/v1/locations?select=name,address,store_number,category_key&id=eq.${encodeURIComponent(locationId)}`,
    { headers: authHeaders },
  );
  const locRows = await locRes.json();
  if (!locRes.ok || !Array.isArray(locRows) || locRows.length === 0) {
    return jsonResponse({ error: "Store nicht gefunden" }, 404);
  }
  const store = locRows[0];
  if (!store.category_key) {
    return jsonResponse({ error: "Store hat keine Kategorie hinterlegt" }, 409);
  }

  const resource = url.searchParams.get("resource");

  if (req.method === "POST") {
    // Der einzige erlaubte Schreibzugriff dieser Function -- alles andere
    // bleibt strikt lesend (siehe Kommentar oben).
    if (resource !== "articles") {
      return jsonResponse({ error: "Schreiben nur für resource=articles erlaubt" }, 405);
    }
    let body: { articles?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
    }
    const articles = sanitizeArticles(body.articles);
    // Upsert mit locationId (server-seitig aus dem Token aufgeloest, siehe
    // oben) als store_key -- der Client kann diesen Schluessel nicht
    // beeinflussen, schreibt also unabhaengig vom Request-Inhalt IMMER nur
    // die eigene Artikelliste.
    const saveRes = await fetch(`${supabaseUrl}/rest/v1/store_articles`, {
      method: "POST",
      headers: { ...authHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ store_key: locationId, articles }),
    });
    const saveBody = await saveRes.text();
    return new Response(saveBody, {
      status: saveRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (resource === "identity") {
    return jsonResponse(
      { name: store.name, address: store.address, store_number: store.store_number },
      200,
    );
  }

  if (resource === "articles") {
    const artRes = await fetch(
      `${supabaseUrl}/rest/v1/store_articles?select=articles&store_key=eq.${encodeURIComponent(locationId)}`,
      { headers: authHeaders },
    );
    const artRows = await artRes.json();
    const articles =
      artRes.ok && Array.isArray(artRows) && artRows[0] && Array.isArray(artRows[0].articles)
        ? artRows[0].articles
        : [];
    return jsonResponse({ articles }, 200);
  }

  if (resource === "events") {
    // select/ts/order/limit/type vom Client uebernehmen (gleiche Query-Form
    // wie dashboard.js sie fuer den Admin-Bereich baut), "category" aber
    // IMMER server-seitig ueberschreiben -- siehe Kommentar oben.
    const forwardParams = new URLSearchParams(url.search);
    forwardParams.delete("token");
    forwardParams.delete("resource");
    forwardParams.delete("category");
    forwardParams.set("category", `eq.${store.category_key}`);
    const eventsRes = await fetch(`${supabaseUrl}/rest/v1/events?${forwardParams.toString()}`, {
      headers: authHeaders,
    });
    const body = await eventsRes.text();
    return new Response(body, {
      status: eventsRes.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return jsonResponse({ error: "Unbekannte resource" }, 400);
});
