-- Behebt: Bank-Standort-Besuche (siehe grantRandomItemFromStore() in
-- js/drawgame.js, categoryKey "bank") senden ein "coins_received"-Event,
-- das die Check-Constraint "events_type_check" bisher nicht kannte
-- ('store_selected', 'item_free_received', 'item_receipt_scanned',
-- 'trophy_unlocked') -> jeder einzelne Insert wurde von Postgres mit
-- HTTP 400 abgelehnt, unbemerkt (js/tracking.js faengt in fetch().catch()
-- nur Netzwerkfehler ab, keine 4xx-Antworten). Bank-Muenzen-Drops waren
-- dadurch im Dashboard komplett unsichtbar (QA-Bug-Liste, dieselbe
-- Fehlerklasse wie zuvor bei "trophy_unlocked", siehe
-- events_fix_type_check.sql).
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar.

alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('store_selected', 'item_free_received', 'item_receipt_scanned', 'trophy_unlocked', 'coins_received'));
