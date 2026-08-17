// Mapbox-GL-JS-Konfiguration: Kartenstile + Access-Token.
//
// Der Token steht bewusst NICHT hier im Code, sondern wird zur Laufzeit von
// der Edge Function "mapbox-token" geholt (liest das Supabase-Secret
// MAPBOX_ACCESS_TOKEN, siehe supabase/functions/README.md). getMapboxToken()
// cached das Ergebnis-Promise, damit bei mehreren Karten auf derselben Seite
// nur eine einzige Anfrage rausgeht.
const MAPBOX_TOKEN_URL = `${SUPABASE_URL}/functions/v1/mapbox-token`;

// Beide Stile stehen zur Wahl -- aktiv ist aktuell "dunkel" (passt zur
// bestehenden violett/cyanen "Cosmic"-Bildsprache des Spiels). Zum Wechseln
// einfach MAP_STYLE auf MAP_STYLE_LIGHT setzen.
const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";
const MAP_STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
const MAP_STYLE = MAP_STYLE_DARK;

let mapboxTokenPromise = null;

function getMapboxToken() {
  if (!mapboxTokenPromise) {
    mapboxTokenPromise = fetch(MAPBOX_TOKEN_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Mapbox-Token konnte nicht geladen werden (${res.status}).`);
        return res.json();
      })
      .then((body) => {
        if (!body.token) throw new Error("Mapbox-Token-Antwort enthielt keinen Token.");
        return body.token;
      });
  }
  return mapboxTokenPromise;
}
