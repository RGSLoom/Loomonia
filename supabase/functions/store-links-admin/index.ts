// Verwaltung der Magic-Link-Zugangscodes (Erzeugen/Erneuern/Loeschen) fuer
// dashboard/store-view.html -- ausschliesslich fuer die Standortverwaltung
// (dashboard/standorte.html), deshalb ganz normal ueber denselben
// Admin-Passwort-Hash geschuetzt wie locations-admin/events-admin (siehe
// supabase/functions/_shared/admin-auth.ts). Die oeffentliche Lese-Function
// store-view.ts kennt dieses Passwort NICHT und braucht es auch nicht --
// beide Wege sind bewusst getrennt.
//
// GET: alle bestehenden Links (fuers Anzeigen in der Standortverwaltung).
// POST { location_id }: neuen Token erzeugen (ueberschreibt einen evtl.
//   vorher bestehenden Token fuer denselben Store -- alte Links dieses
//   Stores werden dadurch automatisch ungueltig, andere Stores bleiben
//   unberuehrt).
// DELETE ?location_id=X: Link deaktivieren (Zeile loeschen).
import { corsHeaders } from "../_shared/cors.ts";
import { isAuthorized } from "../_shared/admin-auth.ts";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// 204 (z.B. DELETE mit "Prefer: return=minimal") ist ein "null body status"
// -- die Fetch-Spec verbietet dort JEDEN Body im Response-Konstruktor, auch
// einen leeren String. Ohne diese Sonderbehandlung wirft new Response()
// eine TypeError und die Function antwortet mit 500 statt dem eigentlichen
// Status (live beim Testen aufgefallen: DELETE loeschte korrekt, lieferte
// aber "500 Internal Server Error" zurueck).
async function passthroughResponse(res: Response): Promise<Response> {
  const body = await res.text();
  const isNullBodyStatus = res.status === 204 || res.status === 205 || res.status === 304;
  return new Response(isNullBodyStatus ? null : body, {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isAuthorized(req)) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  if (req.method === "GET") {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/store_links?select=location_id,access_token,created_at`,
      { headers: authHeaders },
    );
    return passthroughResponse(res);
  }

  if (req.method === "POST") {
    const payload = await req.json().catch(() => ({}));
    const locationId = payload.location_id;
    if (!locationId || typeof locationId !== "string") {
      return jsonResponse({ error: "location_id fehlt" }, 400);
    }
    const accessToken = generateToken();
    const res = await fetch(`${supabaseUrl}/rest/v1/store_links`, {
      method: "POST",
      headers: { ...authHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ location_id: locationId, access_token: accessToken }),
    });
    return passthroughResponse(res);
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const locationId = url.searchParams.get("location_id");
    if (!locationId) return jsonResponse({ error: "location_id fehlt" }, 400);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/store_links?location_id=eq.${encodeURIComponent(locationId)}`,
      { method: "DELETE", headers: { ...authHeaders, Prefer: "return=minimal" } },
    );
    return passthroughResponse(res);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
});
