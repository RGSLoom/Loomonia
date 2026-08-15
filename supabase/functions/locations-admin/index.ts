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

Deno.serve((req) => proxyToTable(req, "locations", ["POST", "PATCH", "DELETE"]));
