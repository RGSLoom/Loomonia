-- ##########################################################################
-- WARNUNG -- Policy-Abschnitt unten VERALTET (QA-Bug-Liste): Die
-- insert/update/delete-Policies weiter unten oeffnen "using(true)/with
-- check(true)" -- also OEFFENTLICHES, unauthentifiziertes Schreiben/Aendern/
-- Loeschen der KOMPLETTEN locations-Tabelle fuer jeden, der den (im
-- Client-Code offen liegenden) anon-Key kennt. Das war beim erstmaligen
-- Aufsetzen dieser Tabelle so gewollt, wurde aber durch
-- supabase/rls_lockdown.sql WIEDER ENTZOGEN: seither laeuft Schreiben nur
-- noch ueber die Edge Function "locations-admin" (Service-Role-Key,
-- passwortgeschuetzt), anon darf nur noch lesen. Ein erneutes Ausfuehren
-- DIESES kompletten Skripts (z.B. fuer ein neues Projekt "aus Versehen" nach
-- statt vor rls_lockdown.sql, oder zum Pruefen des Schemas) oeffnet die
-- Schreib-Luecke wieder komplett. Tabellen-Erstellung/Trigger/Seed-Daten oben
-- bleiben unbedenklich -- NUR die vier "create policy"-Bloecke unten sind das
-- Risiko. Bei Zweifel danach IMMER zusaetzlich rls_lockdown.sql erneut
-- ausfuehren, das ist der massgebliche, aktuelle Stand.
-- ##########################################################################
--
-- Loomonia: Standorte-Tabelle fuers Store-Manager-Dashboard ("Standortverwaltung",
-- dashboard/standorte.html). Einmalig im Supabase SQL-Editor ausfuehren:
-- https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new
--
-- Danach laedt das Spiel (js/locations.js) Standorte live aus dieser Tabelle
-- statt aus dem frueher fest im Code hinterlegten STORE_LOCATIONS-Array
-- (js/data.js STORE_LOCATIONS_FALLBACK). Das Skript ist gefahrlos mehrfach
-- ausfuehrbar (CREATE TABLE IF NOT EXISTS, Policies werden vor dem Neuanlegen
-- gedroppt, Seed-Daten nutzen ON CONFLICT DO NOTHING).

create table if not exists public.locations (
  id text primary key,
  type text not null default 'store' check (type in ('store', 'landmark')),
  category_key text,      -- Pflicht fuer type='store', Wert aus STORE_CATEGORIES (js/data.js)
  landmark_icon text,     -- Pflicht fuer type='landmark', z.B. "☕" oder "🏛️"
  name text not null,     -- Admin-interner Anzeigename (im Spiel selbst nicht sichtbar)
  address text,           -- Freitext-Adresse, wie im Dashboard eingegeben (nur Referenz)
  lat double precision,   -- NULL = Spiel platziert diesen Ort einmalig zufaellig um den Spieler-Start
  lon double precision,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.locations enable row level security;

-- WICHTIG (Sicherheitshinweis): Der oeffentliche "anon"-Key aus
-- js/supabase-config.js liegt im ausgelieferten Client-Code (auch auf GitHub
-- Pages) offen -- jeder, der ihn aus dem Quelltext liest, kann mit diesen
-- Policies ebenfalls in diese Tabelle schreiben. Der Passwortschutz im
-- Dashboard ist nur eine UI-Huerde gegen zufaelliges Finden, KEINE echte
-- Zugriffskontrolle. Sobald echte Nutzerrollen/Auth existieren, hier auf
-- z.B. `auth.role() = 'authenticated'` umstellen und die "true"-Policies
-- ersetzen.
drop policy if exists "locations_public_select" on public.locations;
create policy "locations_public_select" on public.locations
  for select using (true);

drop policy if exists "locations_public_insert" on public.locations;
create policy "locations_public_insert" on public.locations
  for insert with check (true);

drop policy if exists "locations_public_update" on public.locations;
create policy "locations_public_update" on public.locations
  for update using (true) with check (true);

drop policy if exists "locations_public_delete" on public.locations;
create policy "locations_public_delete" on public.locations
  for delete using (true);

-- updated_at automatisch bei jedem UPDATE aktualisieren -- das Spiel
-- (js/map.js ensureStorePositions) nutzt diesen Zeitstempel, um bereits im
-- Browser gecachte Standort-Positionen bei einer nachtraeglichen Aenderung
-- (z.B. Adresse korrigiert) automatisch zu ueberschreiben.
create or replace function public.locations_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.locations_set_updated_at();

-- Einmalige Migration der bisher fest im Code hinterlegten Standorte
-- (js/data.js STORE_LOCATIONS_FALLBACK). IDs sind bewusst identisch zum
-- bisherigen Code, damit bereits gecachte Spieler-Positionen (localStorage)
-- unveraendert gueltig bleiben.
insert into public.locations (id, type, category_key, name, lat, lon) values
  ('rewe', 'store', 'feinkost', 'Rewe', 48.11885648062791, 7.849983861819728),
  ('kaufland', 'store', 'feinkost', 'Kaufland', 48.11736079020843, 7.848150177677171),
  ('baeckerei', 'store', 'cafe', 'Bäckerei', 48.11926205204506, 7.848623981867512),
  ('modebox', 'store', 'fashion', 'Modebox', 48.12005556052317, 7.849796063929734),
  ('volksbank', 'store', 'bank', 'Volksbank', 48.12025582830878, 7.8492661991757045),
  ('sparkasse', 'store', 'bank', 'Sparkasse', 48.119719552613226, 7.8501486459263585),
  ('mueller', 'store', 'drogerie', 'Müller', 48.11931058495179, 7.849707348109254),
  ('dm', 'store', 'drogerie', 'DM', 48.120860450673504, 7.850241027354685),
  ('mcdonalds', 'store', 'schnellrestaurant', 'McDonald''s', 48.113096001026086, 7.852438811998206),
  ('cheers', 'store', 'bar', 'Cheers', 48.10948560102508, 7.854155425715709),
  ('feinkost_custom', 'store', 'feinkost', 'Feinkost (Custom)', 52.2581271, 5.4698785),
  ('sneaker_default', 'store', 'sneaker', 'Sneaker Store (Standard)', null, null),
  ('juwelier_default', 'store', 'juwelier', 'Juwelier (Standard)', null, null)
on conflict (id) do nothing;
