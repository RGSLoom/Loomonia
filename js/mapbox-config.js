// Mapbox-GL-JS-Konfiguration: Kartenstile + Access-Token.
//
// Der Token steht bewusst NICHT hier im Code, sondern wird zur Laufzeit von
// der Edge Function "mapbox-token" geholt (liest das Supabase-Secret
// MAPBOX_ACCESS_TOKEN, siehe supabase/functions/README.md). getMapboxToken()
// cached das Ergebnis-Promise, damit bei mehreren Karten auf derselben Seite
// nur eine einzige Anfrage rausgeht.
const MAPBOX_TOKEN_URL = `${SUPABASE_URL}/functions/v1/mapbox-token`;

// Automatische Wahl zwischen hell/dunkel anhand der lokalen Geraete-Uhrzeit
// -- bewusst eine einfache Stundengrenze statt echter Sonnenauf-/
// -untergangsberechnung (kein Standort/keine zusaetzliche API dafuer noetig,
// reicht fuer den gewuenschten Tageszeit-Effekt). Wird nur beim Aufbau der
// Karte einmal ausgewertet (siehe initMap()/initGeocodeMap()) -- ein
// Stilwechsel waehrend einer laufenden Sitzung wuerde ueber setStyle() einen
// kompletten Stil-Neuladen ausloesen, der laut Mapbox vermutlich als neuer
// Kartenaufruf zaehlt (siehe supabase/functions/README.md), das wollen wir
// nicht ungefragt provozieren.
const MAP_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";
const MAP_STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 19;

function currentMapStyle() {
  const hour = new Date().getHours();
  const isDay = hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
  return isDay ? MAP_STYLE_LIGHT : MAP_STYLE_DARK;
}

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
