// Zugangsdaten fuer die Supabase-Projekt-REST-API (siehe Plan/Setup-
// Anleitung). SUPABASE_ANON_KEY ist bewusst ein oeffentlicher, fuer
// Client-Code gedachter Schluessel (kein Passwort/Secret) — abgesichert
// ueber Row-Level-Security-Policies in der Datenbank, nicht durch
// Geheimhaltung dieses Keys. ("Publishable key" ist Supabases neue
// Bezeichnung fuer denselben Zweck, den frueher der "anon public" JWT-Key
// hatte — NICHT der "Secret key".)
const SUPABASE_URL = "https://oztsymfskxaeonxqggfb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_eLpKDhCusR_w3Fc6eh_0Lw_k8aiE-oO";
