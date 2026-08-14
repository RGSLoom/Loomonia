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
