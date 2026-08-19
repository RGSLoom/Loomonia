-- Loomonia: Artikelstammdaten je Store ("Artikelverwaltung", Einstellungen-
-- Panel im Dashboard). Einmalig im Supabase SQL-Editor ausfuehren:
-- https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new
--
-- Jede Zeile ist die bis zu 15 Artikel umfassende Freitext-Liste EINES
-- Stores. store_key ist aktuell nur 'godadmin' (der interne Teststore, siehe
-- dashboard/index.html Einstellungen-Panel) -- fuer spaeter echte
-- Retailer-Standorte ist das Schema bereits so angelegt, dass store_key dann
-- die jeweilige locations.id sein kann, ohne Migration.
--
-- js/bonscan.js gleicht jede erkannte Bon-Zeile unscharf (Fuzzy Matching)
-- gegen die hier hinterlegte Liste ab, statt frei zu interpretieren.
-- Gefahrlos mehrfach ausfuehrbar (CREATE TABLE IF NOT EXISTS, Policies
-- werden vor dem Neuanlegen gedroppt).

create table if not exists public.store_articles (
  store_key text primary key,           -- 'godadmin' fuer den Teststore, spaeter locations.id
  articles jsonb not null default '[]', -- bis zu 15 Freitext-Artikelnamen, z.B. ["Coca-Cola 0,5L", "Isana Wattepads 14"]
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.store_articles enable row level security;

-- Oeffentlich lesbar: das Spiel braucht die Liste client-seitig fuers
-- Fuzzy-Matching beim Bon-Scan, das Dashboard zum Vorbefuellen des
-- Bearbeiten-Formulars. Schreiben laeuft ausschliesslich ueber die Edge
-- Function store-articles-admin (Service-Role-Key + Admin-Passwort-Hash,
-- siehe supabase/functions/store-articles-admin/index.ts) -- exakt dasselbe
-- Sicherheitsmuster wie bei der "locations"-Tabelle, siehe
-- supabase/rls_lockdown.sql.
drop policy if exists "store_articles_public_select" on public.store_articles;
create policy "store_articles_public_select" on public.store_articles
  for select using (true);
-- Bewusst KEINE insert/update/delete-Policy fuer anon -- die Edge Function
-- nutzt den Service-Role-Key, der RLS ohnehin umgeht.

-- updated_at automatisch bei jedem UPDATE aktualisieren -- gleiches Muster
-- wie locations_set_updated_at in locations_setup.sql.
create or replace function public.store_articles_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists store_articles_set_updated_at on public.store_articles;
create trigger store_articles_set_updated_at
before update on public.store_articles
for each row execute function public.store_articles_set_updated_at();
