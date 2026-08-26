-- ##########################################################################
-- WARNUNG -- VERALTET, NICHT MEHR AUSFUEHREN (QA-Bug-Liste):
-- Dieses Skript oeffnet "for delete using (true)" -- also OEFFENTLICHES
-- Loeschen der KOMPLETTEN events-Tabelle fuer jeden, der den (im Client-Code
-- offen liegenden) anon-Key kennt. Das war zum Zeitpunkt dieses Skripts
-- gewollt (Reset-Button im Dashboard), wurde aber durch
-- supabase/rls_lockdown.sql WIEDER ENTZOGEN: seither laeuft Loeschen
-- ausschliesslich ueber die Edge Function "events-admin" (Service-Role-Key,
-- passwortgeschuetzt). Ein erneutes Ausfuehren DIESES Skripts (z.B. beim
-- Troubleshooting, auf einem frischen Projekt in falscher Reihenfolge, oder
-- per Copy-Paste) oeffnet die Luecke wieder -- IMMER rls_lockdown.sql als
-- massgeblichen, aktuellen Stand verwenden, dieses Skript nur zur
-- historischen Nachvollziehbarkeit noch im Repo.
-- ##########################################################################
--
-- Behebt den eigentlichen Grund, warum "Testdaten zuruecksetzen" im
-- Store-Manager-Dashboard bisher nichts loeschte: die Tabelle "events" hat
-- Row-Level-Security aktiviert, aber nie eine Regel bekommen, die dem
-- oeffentlichen anon-Key das Loeschen erlaubt. Ohne DELETE-Policy meldet
-- Supabase trotzdem "204 Erfolg" zurueck, loescht dabei aber 0 Zeilen -> der
-- Button wirkte funktionslos, obwohl kein Fehler auftrat.
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar.
-- Betrifft ausschliesslich "events" -- die "locations"-Tabelle ist davon
-- nicht betroffen und hatte ihre DELETE-Policy bereits (siehe
-- supabase/locations_setup.sql).

drop policy if exists "events_public_delete" on public.events;
create policy "events_public_delete" on public.events
  for delete using (true);
