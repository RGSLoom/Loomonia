-- Abklingzeit-Briefing (2026-09-07, nach User-Korrektur "jeder Standort muss
-- unabhaengig sein"): serverseitiger Cooldown fuer Standort-Interaktionen,
-- pro Spieler (player_id = gameState.playerId, siehe getPlayerId() in
-- js/state.js) UND PRO STANDORT (location_id) unabhaengig voneinander --
-- Aktivieren von Standort 1 sperrt NICHT auch Standort 2.
--
-- Ersetzt die erste Fassung dieser Tabelle (nur player_id als Primary Key,
-- spielerweit statt pro Standort) -- die Tabelle stand erst wenige Minuten
-- live mit ausschliesslich einem eigenen Testdatensatz, daher hier bewusst
-- ein sauberes drop+create statt einer ALTER-Migration.
--
-- Nur ueber die Edge Function "location-cooldown" mit dem Service-Role-Key
-- erreichbar -- keine einzige anon-Policy, RLS ohne Policies blockt den
-- oeffentlichen anon-Key komplett (identisches Prinzip wie bei
-- store_links_setup.sql). Ohne diese Serverseitigkeit koennte ein Spieler
-- den Cooldown durch simples Loeschen/Bearbeiten von localStorage umgehen
-- (Briefing: "Serverseitige Validierung, nicht clientseitig, um
-- Manipulation zu verhindern").
drop table if exists player_cooldowns;

create table player_cooldowns (
  player_id text not null,
  location_id text not null,
  last_interaction_at timestamptz not null default now(),
  primary key (player_id, location_id)
);

alter table player_cooldowns enable row level security;
-- Bewusst KEINE Policies angelegt (siehe Kommentar oben).
