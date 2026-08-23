// Passwortsperre fuers Haupt-Dashboard (dashboard/index.html, Umsatz-/
// Events-Ansicht) -- war bisher komplett ungeschuetzt und fuer jeden mit der
// URL einsehbar. Nutzt denselben Mechanismus wie dashboard/standorte.html:
// Passwort-Hash lokal merken, aber echte Pruefung passiert serverseitig in
// den Edge Functions (siehe admin-auth-shared.js). Bewusst weiterhin KEIN
// echtes Login-System mit eigenen Nutzerkonten -- das bleibt eine separate,
// groessere Aufgabe.

function showAdminScreen() {
  document.getElementById("screen-lock").style.display = "none";
  document.dispatchEvent(new CustomEvent("dashboard-unlocked"));
}

function setLockError(msg) {
  const el = document.getElementById("lock-error");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}

// Von fetchWithAdminAuth() aufgerufen, wenn eine Edge Function den
// gespeicherten Hash ablehnt (401) -- Sperre wieder anzeigen, Store-
// Auswahl/Dashboard-Screens verstecken, bis erneut ein (hoffentlich
// richtiges) Passwort eingegeben wurde.
window.reshowAdminLock = function (message) {
  document.getElementById("screen-select").style.display = "none";
  document.getElementById("screen-dashboard").style.display = "none";
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
  // Ohne gespeicherten Hash bleibt #screen-lock einfach sichtbar (Standard-
  // Zustand im HTML) -- kein extra Aufruf noetig.
});
