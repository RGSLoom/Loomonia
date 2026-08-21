-- Analog zu events_category_nullable.sql: die Spalte "store_id" hat
-- serverseitig eine NOT-NULL-Bedingung, obwohl js/tracking.js fuer Bon-Scans
-- ohne per Adresse identifizierten Store (payload.storeId=null, siehe
-- receiptStoreId in js/bonscan.js) client-seitig auf "unbekannt" ausweicht.
-- Real per Test-Insert bestaetigt: HTTP 400 (Code 23502, "null value in
-- column store_id violates not-null constraint") beim Versuch, store_id
-- direkt als NULL zu senden.
--
-- js/tracking.js schickt seit dem zugehoerigen Fix ohnehin nie mehr NULL
-- (Fallback "unbekannt") -- dieses Skript ist trotzdem empfehlenswert, damit
-- die Datenbank die tatsaechliche Datenmodellierung der App abbildet, statt
-- sich nur auf den Client-seitigen Fallback zu verlassen.
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar:
-- https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new

alter table public.events alter column store_id drop not null;
