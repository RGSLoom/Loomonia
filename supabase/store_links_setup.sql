-- Magic-Link-Zugangscodes fuer die neue rein lesende Store-Partner-Ansicht
-- (dashboard/store-view.html). Komplett getrennt vom Admin-Passwortschutz
-- und den Edge Functions locations-admin/events-admin (siehe
-- supabase/rls_lockdown.sql, supabase/functions/README.md) -- eigene
-- Tabelle, eigene Edge Functions (store-view, store-links-admin).
--
-- Bewusst KEINE RLS-Policy fuer den oeffentlichen anon-Key auf dieser
-- Tabelle -- weder lesen noch schreiben. Nur die beiden neuen Edge
-- Functions duerfen sie ueber den Service-Role-Key sehen:
--   - store-view: loest einen Token zu genau einem Store auf (read-only)
--   - store-links-admin: erzeugt/erneuert/loescht Tokens (Admin-Passwort-
--     geschuetzt, gleiches Secret wie locations-admin/events-admin)
-- Ohne jede Policy blockt RLS anon-Zugriffe vollstaendig -- es gibt also
-- keinen Weg, ueber den oeffentlichen Key an einen Token heranzukommen oder
-- auch nur zu pruefen, ob einer existiert.
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar.

create table if not exists public.store_links (
  location_id text primary key references public.locations(id) on delete cascade,
  access_token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.store_links enable row level security;

-- Zur Kontrolle nach dem Ausfuehren: sollte KEINE Zeile liefern (keine
-- Policies fuer anon vorhanden).
select schemaname, tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'store_links';
