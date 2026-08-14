// Einfacher Passwortschutz fuer dashboard/standorte.html — bewusst KEIN
// echtes Login-System (siehe Auftrag): das Passwort wird beim allerersten
// Besuch auf diesem Geraet/Browser frei vergeben und nur als SHA-256-Hash in
// localStorage abgelegt (nie im Klartext, nie im Quellcode/Repo). Danach
// muss es bei jeder neuen Browser-Sitzung (sessionStorage) erneut eingegeben
// werden.
//
// WICHTIG: Das ist nur eine UI-Huerde. Die zugrunde liegende Supabase-
// Tabelle "locations" akzeptiert Schreibzugriffe von JEDEM, der den
// oeffentlichen anon-Key aus js/supabase-config.js aus dem (auf GitHub
// Pages oeffentlich ausgelieferten) Quelltext liest — siehe Hinweis in
// supabase/locations_setup.sql. Echte Zugriffskontrolle braucht spaeter
// echte Nutzerrollen/Auth auf Datenbankebene, nicht nur diese Seite hier.

const AUTH_HASH_KEY = "loomonia_standorte_pw_hash";
const AUTH_SESSION_KEY = "loomonia_standorte_unlocked";

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUnlockedThisSession() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === "1";
}

function showAdminScreen() {
  document.getElementById("screen-lock").style.display = "none";
  document.getElementById("screen-admin").classList.remove("hidden");
  document.dispatchEvent(new CustomEvent("standorte-unlocked"));
}

function setLockError(msg) {
  const el = document.getElementById("lock-error");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

async function handleLockSubmit() {
  const input = document.getElementById("lock-password");
  const value = input.value;
  if (!value) return;

  const storedHash = localStorage.getItem(AUTH_HASH_KEY);
  const enteredHash = await sha256Hex(value);

  if (!storedHash) {
    // Erstbesuch auf diesem Geraet -> das eingegebene Passwort wird das
    // neue Passwort fuer zukuenftige Besuche (Hinweis dazu steht bereits
    // dauerhaft im Untertitel, siehe DOMContentLoaded unten).
    localStorage.setItem(AUTH_HASH_KEY, enteredHash);
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    showAdminScreen();
    return;
  }

  if (enteredHash === storedHash) {
    sessionStorage.setItem(AUTH_SESSION_KEY, "1");
    showAdminScreen();
  } else {
    setLockError("Falsches Passwort.");
    input.value = "";
    input.focus();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const hasPassword = !!localStorage.getItem(AUTH_HASH_KEY);
  document.getElementById("lock-sub").textContent = hasPassword
    ? "Interner Bereich · nicht für Store-Partner."
    : "Noch kein Passwort auf diesem Gerät gesetzt — mit dem nächsten Eintrag wird eins festgelegt.";

  if (isUnlockedThisSession()) {
    showAdminScreen();
    return;
  }

  document.getElementById("lock-submit").addEventListener("click", handleLockSubmit);
  document.getElementById("lock-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLockSubmit();
  });
});
