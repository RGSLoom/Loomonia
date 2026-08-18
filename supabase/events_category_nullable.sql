-- Behebt die eigentliche Ursache dafuer, dass Bon-Scans bei nicht gelisteten
-- Retailern (z.B. Rossmann) NIE im Dashboard ankamen: die Spalte "category"
-- hat eine NOT-NULL-Bedingung, obwohl das Spiel fuer nicht im Store-Katalog
-- hinterlegte Laden bewusst category=null sendet ("Retailer nicht gelistet",
-- siehe ANY_STORE_ITEM_POOL in js/bonscan.js). Jeder einzelne Datensatz
-- eines solchen Scans wurde dadurch mit HTTP 400 (Code 23502, "null value
-- in column category violates not-null constraint") abgelehnt -- lautlos,
-- da js/tracking.js Netzwerkfehler abfaengt, aber keine 4xx-Antworten der
-- Datenbank. Das Spiel-Item wurde trotzdem lokal vergeben (unabhaengig von
-- der Datenbank), nur der Dashboard-Eintrag fehlte.
--
-- js/tracking.js schickt seit dem zugehoerigen Fix ohnehin nie mehr NULL
-- (Fallback "unbekannt") -- dieses Skript ist trotzdem empfehlenswert, damit
-- die Datenbank die tatsaechliche Datenmodellierung der App abbildet, statt
-- sich nur auf den Client-seitigen Fallback zu verlassen.
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar:
-- https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new

alter table public.events alter column category drop not null;
