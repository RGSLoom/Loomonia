// Serverseitiger Cooldown fuer Standort-Interaktionen (Abklingzeit-Briefing
// 2026-09-07): 3 Minuten, individuell pro Spieler (gameState.playerId),
// UEBER ALLE Standorte hinweg (nicht pro einzelnem Standort) -- siehe
// supabase/player_cooldowns_setup.sql fuer die Tabelle und
// js/location-cooldown.js fuer den Client-Aufruf. Bewusst OEFFENTLICH/ohne
// Admin-Passwort-Check (wie mapbox-token) -- jeder Spieler ruft das auf,
// nicht nur Admins. Der Schutz kommt hier nicht aus Geheimhaltung, sondern
// daraus, dass NUR diese Function (mit dem Service-Role-Key) auf
// player_cooldowns schreiben/lesen kann (RLS ohne jede Policy, siehe SQL-
// Datei) -- ein Client kann sich also nicht selbst einen frueheren
// last_interaction_at-Wert unterschieben.
//
// "Pruefen" und "Beanspruchen" passieren in EINEM Aufruf/Request (kein
// separates GET-dann-POST): ein einzelnes PATCH mit einer last_interaction_
// at-Bedingung im WHERE ist server-seitig atomar (Postgres serialisiert
// konkurrierende Updates auf dieselbe Zeile), ein zweiter, praktisch
// gleichzeitiger Request desselben Spielers kann den Slot deshalb nicht
// doppelt bekommen.
import { corsHeaders } from "../_shared/cors.ts";

// MUSS mit LOCATION_INTERACTION_COOLDOWN_MS in js/data.js uebereinstimmen.
const COOLDOWN_MS = 3 * 60 * 1000;
const MAX_PLAYER_ID_LENGTH = 200;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: { playerId?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Ungültiger Request-Body" }, 400);
  }
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
  if (!playerId || playerId.length > MAX_PLAYER_ID_LENGTH) {
    return jsonResponse({ error: "Ungültige playerId" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = new Date(now.getTime() - COOLDOWN_MS).toISOString();

  // 1. Versuch: bestehende Zeile atomar aktualisieren, aber NUR wenn ihr
  // last_interaction_at ausserhalb des Cooldown-Fensters liegt -- die
  // Bedingung ist Teil des WHERE (last_interaction_at=lte....), kein
  // separates Lesen-dann-Schreiben.
  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/player_cooldowns?player_id=eq.${encodeURIComponent(playerId)}&last_interaction_at=lte.${encodeURIComponent(cutoffIso)}`,
    {
      method: "PATCH",
      headers: { ...authHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ last_interaction_at: nowIso }),
    },
  );
  if (!updateRes.ok) {
    return jsonResponse({ error: "Cooldown-Prüfung fehlgeschlagen" }, 502);
  }
  const updatedRows = await updateRes.json();
  if (Array.isArray(updatedRows) && updatedRows.length > 0) {
    return jsonResponse({ allowed: true }, 200);
  }

  // Kein Update griff -- entweder gibt es fuer diese playerId noch GAR
  // KEINE Zeile (allererste Interaktion) oder der Cooldown ist noch aktiv.
  // "resolution=ignore-duplicates" laesst den Insert bei einem bereits
  // existierenden Primary Key (player_id) still leerlaufen statt mit 409 zu
  // scheitern.
  const insertRes = await fetch(`${supabaseUrl}/rest/v1/player_cooldowns`, {
    method: "POST",
    headers: { ...authHeaders, Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({ player_id: playerId, last_interaction_at: nowIso }),
  });
  if (!insertRes.ok) {
    return jsonResponse({ error: "Cooldown-Prüfung fehlgeschlagen" }, 502);
  }
  const insertedRows = await insertRes.json();
  if (Array.isArray(insertedRows) && insertedRows.length > 0) {
    return jsonResponse({ allowed: true }, 200);
  }

  // Weder Update noch Insert griffen -> die Zeile existiert bereits UND ihr
  // last_interaction_at liegt noch innerhalb des Cooldown-Fensters. Aktuellen
  // Stand nachlesen, um dem Client die verbleibende Zeit mitzugeben.
  const selectRes = await fetch(
    `${supabaseUrl}/rest/v1/player_cooldowns?select=last_interaction_at&player_id=eq.${encodeURIComponent(playerId)}`,
    { headers: authHeaders },
  );
  const selectRows = await selectRes.json();
  const lastInteractionAt =
    selectRes.ok && Array.isArray(selectRows) && selectRows[0]
      ? new Date(selectRows[0].last_interaction_at).getTime()
      : now.getTime();
  const remainingMs = Math.max(0, COOLDOWN_MS - (now.getTime() - lastInteractionAt));
  return jsonResponse({ allowed: false, remainingMs }, 200);
});
