-- Ergaenzt die "events"-Tabelle um eine Spalte fuer den rohen, per OCR
-- erkannten Produkttext einer Bon-Zeile (siehe js/bonscan.js
-- matchReceiptText -> grantReceiptItems, js/tracking.js trackEvent).
--
-- Bewusst KEINE neue Tabelle: "events" legt pro Bon-Scan bereits eine Zeile
-- JE ERKANNTER KAUFPOSITION an (grantReceiptItems() ruft trackEvent() in
-- einer Schleife einmal pro Item-Einheit auf), die Granularitaet passt also
-- schon. Nullable, da nicht jeder Scan eine Zeile mit passendem
-- Stichwort-Treffer hat (dann bleibt product_text NULL statt eines
-- erfundenen Werts, siehe Artikel-Ansicht im Store Manager Dashboard).
--
-- Fuer den "Artikel"-Reiter im Store Manager Dashboard (dashboard/index.html,
-- panel-artikel) -- als befristete Zwischenloesung fuer die Pitch-Phase
-- markiert, wird spaeter durch ein Kassen-QR-System ersetzt.
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar:
-- https://supabase.com/dashboard/project/oztsymfskxaeonxqggfb/sql/new

alter table public.events add column if not exists product_text text;
