-- Abklingzeit-Briefing (2026-09-07): serverseitiger Cooldown fuer
-- Standort-Interaktionen. Eine Zeile PRO SPIELER (player_id = gameState.
-- playerId, siehe getPlayerId() in js/state.js), NICHT pro Standort -- der
-- Cooldown gilt spielerweit ueber alle Standorte hinweg (Briefing:
-- "individueller Timer pro Spieler, nicht global, nicht pro Standort").
--
-- Nur ueber die Edge Function "location-cooldown" mit dem Service-Role-Key
-- erreichbar -- keine einzige anon-Policy, RLS ohne Policies blockt den
-- oeffentlichen anon-Key komplett (identisches Prinzip wie bei
-- store_links_setup.sql). Ohne diese Serverseitigkeit koennte ein Spieler
-- den Cooldown durch simples Loeschen/Bearbeiten von localStorage umgehen
-- (Briefing: "Serverseitige Validierung, nicht clientseitig, um
-- Manipulation zu verhindern").
create table if not exists player_cooldowns (
  player_id text primary key,
  last_interaction_at timestamptz not null default now()
);

alter table player_cooldowns enable row level security;
-- Bewusst KEINE Policies angelegt (siehe Kommentar oben).
