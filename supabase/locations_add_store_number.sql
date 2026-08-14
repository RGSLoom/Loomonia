-- Ergaenzung zu locations_setup.sql: optionales Feld fuer die interne
-- Store-Nummer des Kunden (z.B. deren eigene Filialnummer), zeigbar im
-- Store-Manager-Dashboard statt einer festen "DEMO"-Platzhalter-ID.
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar.

alter table public.locations add column if not exists store_number text;
