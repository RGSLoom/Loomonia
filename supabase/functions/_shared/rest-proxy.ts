// Generischer authentifizierter Proxy vor die normale Supabase-REST-API
// (PostgREST) einer einzelnen Tabelle. Reicht Query-Parameter (select,
// Filter, order, ...) UND den Request-Body 1:1 durch, ersetzt dabei aber den
// oeffentlichen anon-Key durch den Service-Role-Key -- der laeuft nur hier,
// serverseitig bei Supabase, und umgeht damit Row-Level-Security bewusst
// (das ist der ganze Sinn: RLS sperrt den anon-Key aus, diese Function bleibt
// trotzdem funktionsfaehig, aber nur fuer wer den Admin-Passwort-Hash kennt,
// siehe admin-auth.ts).
import { corsHeaders } from "./cors.ts";
import { isAuthorized } from "./admin-auth.ts";

export async function proxyToTable(
  req: Request,
  table: string,
  allowedMethods: string[],
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!allowedMethods.includes(req.method)) {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const incomingUrl = new URL(req.url);
  const targetUrl = `${supabaseUrl}/rest/v1/${table}${incomingUrl.search}`;

  const hasBody = req.method === "POST" || req.method === "PATCH";
  const res = await fetch(targetUrl, {
    method: req.method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: req.headers.get("Prefer") || "return=representation",
    },
    body: hasBody ? await req.text() : undefined,
  });

  const body = await res.text();
  // 204 (z.B. DELETE mit "Prefer: return=minimal") ist ein "null body
  // status" -- die Fetch-Spec verbietet dort JEDEN Body im Response-
  // Konstruktor, auch einen leeren String. Wird das ignoriert, wirft
  // new Response() eine TypeError und die Function antwortet mit 500 statt
  // dem eigentlichen Status. Deshalb hier explizit null statt body.
  const isNullBodyStatus = res.status === 204 || res.status === 205 || res.status === 304;
  return new Response(isNullBodyStatus ? null : body, {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
