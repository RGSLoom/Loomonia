-- Verschaerft die RLS-Policies auf "locations" und "events": bisher durfte
-- der oeffentliche anon-Key (liegt offen im ausgelieferten Client-Code,
-- siehe js/supabase-config.js -- jeder kann ihn aus dem Quelltext lesen)
-- uneingeschraenkt lesen, schreiben, aendern UND loeschen (using(true) /
-- with check(true) auf allen vier Operationen). Das wird hier ersetzt durch:
--
--  - locations: anon darf weiterhin NUR lesen (das Spiel zeigt damit die
--    Kartenpunkte an). Schreiben/Aendern/Loeschen geht ab jetzt ausschliesslich
--    ueber die Edge Function "locations-admin" (Service-Role-Key, laeuft
--    serverseitig bei Supabase, nicht im Client-Code -- siehe
--    supabase/functions/locations-admin/index.ts).
--
--  - events: anon darf weiterhin NUR neue Zeilen anlegen (Spiel-Tracking in
--    js/tracking.js braucht nur INSERT). Lesen/Aendern/Loeschen geht ab jetzt
--    ausschliesslich ueber die Edge Function "events-admin" (Service-Role-Key,
--    siehe supabase/functions/events-admin/index.ts).
--
-- WICHTIG -- Reihenfolge: Erst BEIDE Edge Functions deployen und das Secret
-- ADMIN_PASSWORD_HASH setzen (siehe supabase/functions/README.md), DANACH
-- dieses Skript ausfuehren. Sonst funktionieren Standortverwaltung
-- (dashboard/standorte.html) und Dashboard-Lesezugriff/Reset
-- (dashboard/index.html) ab dem Ausfuehren bis zum Deploy nicht mehr.
--
-- Einmalig im Supabase SQL-Editor ausfuehren:
-- https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new
-- Gefahrlos mehrfach ausfuehrbar (droppt zuerst ALLE bestehenden Policies
-- auf den beiden Tabellen, unabhaengig von ihrem Namen, und legt danach
-- genau die gewuenschten neu an -- so ist es egal, ob eine Policy ueber ein
-- fruehreres SQL-Skript oder manuell im Supabase-Studio angelegt wurde).

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'locations' loop
    execute format('drop policy if exists %I on public.locations', pol.policyname);
  end loop;
end $$;

create policy "locations_public_select" on public.locations
  for select using (true);
-- Bewusst KEINE insert/update/delete-Policy fuer anon mehr. Die Edge
-- Function locations-admin nutzt den Service-Role-Key, der RLS ohnehin
-- umgeht -- braucht deshalb keine eigene Policy.

do $$
declare
  pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'events' loop
    execute format('drop policy if exists %I on public.events', pol.policyname);
  end loop;
end $$;

create policy "events_public_insert" on public.events
  for insert with check (true);
-- Bewusst KEINE select/update/delete-Policy fuer anon mehr. Lesen (Dashboard-
-- KPIs) und Loeschen (Testdaten-Reset) laufen ab jetzt ueber die Edge
-- Function events-admin mit Service-Role-Key.

-- Zur Kontrolle nach dem Ausfuehren: sollte je Tabelle genau eine Zeile
-- liefern (locations_public_select / events_public_insert).
select schemaname, tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename in ('locations', 'events');
