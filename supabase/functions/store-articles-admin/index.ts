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

Deno.serve((req) => proxyToTable(req, "store_articles", ["POST", "PATCH", "DELETE"]));
