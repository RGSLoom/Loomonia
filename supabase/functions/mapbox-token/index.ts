// Liefert den Mapbox-Access-Token aus dem Supabase-Secret MAPBOX_ACCESS_TOKEN
// an den (statisch gehosteten, build-losen) Client aus -- so steht der Token
// nirgends im Repo/Client-Code, sondern nur einmalig als Secret in Supabase.
//
// Bewusst OEFFENTLICH/ohne Admin-Passwort-Check (anders als locations-admin/
// events-admin): die Spielkarte wird von jedem Spieler geladen, nicht nur
// von Admins. Das ist unproblematisch, weil Mapbox-Tokens ohnehin dafuer
// gedacht sind, im Client zu stehen -- Schutz vor Missbrauch kommt bei
// Mapbox nicht aus Geheimhaltung, sondern aus der URL/Referrer-Einschraenkung,
// die im Mapbox-Konto fuer diesen Token gesetzt wird (siehe README.md).
import { corsHeaders } from "../_shared/cors.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  if (!token) {
    return jsonResponse({ error: "MAPBOX_ACCESS_TOKEN ist noch nicht als Secret gesetzt." }, 500);
  }

  return jsonResponse({ token }, 200);
});
