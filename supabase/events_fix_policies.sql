-- Notfall-Fix: aktuell schlagen ALLE Schreibversuche auf "events" fehl
-- ("new row violates row-level security policy for table events", Code
-- 42501) -- unabhaengig von type/player_id/ts. Das heisst: das Spiel kann
-- gerade GAR KEINE neuen Ereignisse mehr an Supabase melden (Spieler-
-- Zaehlung, Item-Vergaben, Bon-Scans, Trophaeen), obwohl die Belohnungen im
-- Spiel selbst lokal trotzdem vergeben werden -- die Meldung an die
-- Datenbank scheitert nur lautlos im Hintergrund.
--
-- KORRIGIERT (QA-Review, siehe Bug-Liste): Die urspruengliche Fassung dieses
-- "Notfall-Fixes" hat zusaetzlich SELECT- und DELETE-Policies fuer den
-- oeffentlichen anon-Key wieder angelegt -- das war NIE noetig, um das
-- Insert-Problem zu beheben, hebt aber den bewussten RLS-Lockdown aus
-- rls_lockdown.sql wieder auf: Jeder, der den (im Client-Code oeffentlich
-- sichtbaren) anon-Key kennt, koennte die komplette events-Tabelle ohne
-- Passwort lesen UND loeschen -- exakt der Zugriff, den events-admin (Edge
-- Function, Service-Role-Key + Admin-Passwort) eigentlich exklusiv haben
-- soll. Lesen/Loeschen laeuft weiterhin ausschliesslich ueber events-admin,
-- siehe supabase/functions/events-admin/index.ts. Falls die urspruengliche
-- Fassung dieses Skripts bereits im Supabase SQL-Editor ausgefuehrt wurde,
-- dieses korrigierte Skript erneut ausfuehren, um SELECT/DELETE fuer anon
-- wieder zu entfernen.
--
-- Stellt NUR die INSERT-Policy fuer den oeffentlichen anon-Key wieder her.
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar.

alter table public.events enable row level security;

drop policy if exists "events_public_select" on public.events;
drop policy if exists "events_public_delete" on public.events;

drop policy if exists "events_public_insert" on public.events;
create policy "events_public_insert" on public.events
  for insert with check (true);
