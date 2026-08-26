-- Mildert (behebt NICHT vollstaendig): die "events"-Tabelle akzeptiert jeden
-- INSERT vom oeffentlichen anon-Key ohne Server-Validierung des Inhalts
-- (siehe rls_lockdown.sql -- "events_public_insert ... with check(true)" ist
-- fuer das Spiel-Tracking absichtlich noetig, es gibt kein eigenes Backend).
-- Das bedeutet: jeder, der den anon-Key aus dem ausgelieferten Client-Code
-- liest, kann per direktem REST-Aufruf einen beliebigen "amount_cents"-Wert
-- einschleusen -- dieser Wert speist im Partner-Dashboard direkt die
-- "verifizierter Umsatz"/"Provision"-KPIs (siehe dashboard-render.js). Diese
-- Constraint blockt nur die offensichtlichsten Missbrauchsfaelle (negative
-- oder utopisch hohe Betraege wie z.B. 9.999.999,99 EUR fuer einen einzelnen
-- Kassenbon) -- sie verhindert NICHT das Einschleusen eines plausiblen
-- falschen Betrags (z.B. 49,99 EUR fuer einen Store, den der Angreifer nie
-- betreten hat). Eine echte Absicherung braucht eine serverseitige Pruefung
-- des Inserts (z.B. ueber eine Edge Function statt des direkten REST-Inserts,
-- mit Rate-Limiting/Plausibilitaetspruefung pro player_id) -- das ist eine
-- groessere Architekturentscheidung und bewusst NICHT Teil dieser Aenderung.
--
-- 200000 Cent = 2.000 EUR: grosszuegig ueber jedem realistischen
-- Einzelbon-Betrag in diesem Kontext, aber weit unter den utopischen Werten,
-- die ein direkter API-Angriff typischerweise einschleust.
--
-- Einmalig im Supabase SQL-Editor ausfuehren, gefahrlos mehrfach ausfuehrbar.

alter table public.events drop constraint if exists events_amount_cents_sane;
alter table public.events add constraint events_amount_cents_sane
  check (amount_cents is null or (amount_cents >= 0 and amount_cents <= 200000));
