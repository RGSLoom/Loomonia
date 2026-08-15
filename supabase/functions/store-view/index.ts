// Rein lesende Magic-Link-Ansicht fuer einzelne Store-Partner
// (dashboard/store-view.html?token=...). Bewusst KOMPLETT UNABHAENGIG vom
// Admin-Passwortschutz und von locations-admin/events-admin: kein
// ADMIN_PASSWORD_HASH-Check, keine gemeinsame Auth -- stattdessen loest
// diese Function einen langen Zufalls-Token ueber die eigene, oeffentlich
// unerreichbare Tabelle "store_links" zu GENAU EINEM Store auf (siehe
// supabase/store_links_setup.sql) und liefert ausschliesslich dessen Zahlen.
//
// Sicherheitsprinzip: welche "category" (= Store, siehe dashboard/js/
// stores-config.js) angezeigt wird, wird IMMER hier serverseitig aus dem
// Token aufgeloest, NIE aus einem vom Client mitgeschickten Parameter
// uebernommen -- ein gueltiger Token fuer Store A kann dadurch nie Zahlen
// von Store B sehen, egal was der Client an Query-Parametern mitschickt.
//
// Nur GET, keine Schreib-/Loeschoperation -- das ist an dieser Stelle nicht
// nur eine RLS-Einschraenkung, sondern bereits im Code der Function so
// festgelegt.
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

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

  if (resource === "identity") {
    return jsonResponse(
      { name: store.name, address: store.address, store_number: store.store_number },
      200,
    );
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
