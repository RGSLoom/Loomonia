// Passwortsperre fuer dashboard/standorte.html. Nutzt denselben gemeinsamen
// Passwort-Hash wie dashboard/index.html (siehe admin-auth-shared.js) --
// einmal auf einem Geraet eingegeben, entsperrt es beide Dashboards.
//
// Ersetzt die fruehere "wer als Erstes kommt legt das Passwort fest"-Logik:
// der Hash wird jetzt bei jedem Schreiben/Loeschen an die Edge Function
// locations-admin geschickt und DORT serverseitig gegen das Secret
// ADMIN_PASSWORD_HASH geprueft (siehe supabase/functions/_shared/admin-auth.ts).
// Ein falsches Passwort kann also wirklich nichts mehr schreiben, nicht nur
// die UI nicht sehen -- die zugrunde liegende Tabelle "locations" nimmt
// Schreibzugriffe vom oeffentlichen anon-Key seit dem RLS-Lockdown gar
// nicht mehr an (siehe supabase/rls_lockdown.sql).

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

// Von fetchWithAdminAuth() aufgerufen, wenn eine Edge Function den
// gespeicherten Hash ablehnt (401).
window.reshowAdminLock = function (message) {
  document.getElementById("screen-admin").classList.add("hidden");
  document.getElementById("screen-lock").style.display = "flex";
  setLockError(message || "");
};

async function handleLockSubmit() {
  const input = document.getElementById("lock-password");
  const value = input.value;
  if (!value) return;
  setAdminHash(await sha256Hex(value));
  input.value = "";
  setLockError("");
  showAdminScreen();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("lock-submit").addEventListener("click", handleLockSubmit);
  document.getElementById("lock-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLockSubmit();
  });
  document.getElementById("btn-admin-logout").addEventListener("click", () => {
    clearAdminHash();
    window.reshowAdminLock("");
  });

  if (getAdminHash()) {
    showAdminScreen();
  }
});
