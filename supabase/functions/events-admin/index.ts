// Serverseitiger Lese- und Loeschzugriff auf die "events"-Tabelle mit dem
// Service-Role-Key -- ersetzt das bisherige direkte Lesen (Dashboard-KPIs)
// und Loeschen (Testdaten-Reset) ueber den oeffentlichen anon-Key aus
// dashboard/js/dashboard.js. Neue Zeilen anlegen (Spiel-Tracking, siehe
// js/tracking.js) bleibt bewusst AUSSEN VOR: das laeuft weiterhin direkt und
// oeffentlich per INSERT ueber den anon-Key (siehe supabase/rls_lockdown.sql,
// events_public_insert bleibt bestehen) -- dafuer braucht es keine Function.
//
// Aufruf: GET (Events lesen, gleiche Query-Parameter wie vorher direkt gegen
// PostgREST) oder DELETE (Reset), jeweils mit Header
// "x-admin-password-hash".
import { proxyToTable } from "../_shared/rest-proxy.ts";

Deno.serve((req) => proxyToTable(req, "events", ["GET", "DELETE"]));
