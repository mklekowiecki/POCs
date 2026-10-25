// Panel nauczyciela: wspólne logowanie, wybór aplikacji (kafelki) i przełączanie między nimi.
// Aplikacja jest wybierana adresem (#lekcja, #ankieta, #obwod), więc działa „Wstecz” i odświeżenie strony.
// Po zalogowaniu wszystkie huby są połączone naraz – kafelki pokazują na żywo stan lekcji i ankiety.
import { $, setUnauthorizedHandler, setStatusError, resetStatus } from "./teacher-common.js";
import * as lesson from "./teacher-lesson.js";
import * as survey from "./teacher-survey.js";

const APPS = {
  lekcja: { section: "app-lesson", title: "Lekcja", path: "/", module: lesson },
  ankieta: { section: "app-survey", title: "Co kumam?", path: "/ankieta", module: survey },
  obwod: { section: "app-circuit", title: "Obwód elektryczny", path: "/obwod" },
};
const SECTIONS = ["login", "launcher", ...Object.values(APPS).map(a => a.section)];

let loggedIn = false;
let addresses = [];

function route() {
  const app = loggedIn ? APPS[location.hash.slice(1)] : null;
  const section = !loggedIn ? "login" : app ? app.section : "launcher";
  for (const id of SECTIONS) $(id).classList.toggle("hidden", id !== section);
  $("app-bar").classList.toggle("hidden", !app);
  $("logout").classList.toggle("hidden", !loggedIn);
  document.title = app ? `${app.title} – nauczyciel` : "Lekcja Informatyki – nauczyciel";
  if (!app) return;
  $("app-title").textContent = app.title;
  renderAddress(app);
  app.module?.onShow?.();
}

// Adresy dla uczniów: z serwera (adresy kart sieciowych), bo nauczyciel zwykle jest na localhost.
function renderAddress(app) {
  const bases = addresses.length ? addresses : [location.origin];
  $("app-address").replaceChildren(...bases.map(base => {
    const url = base + (app.path === "/" ? "/" : app.path);
    return Object.assign(document.createElement("code"), { textContent: url });
  }));
}

async function loadAddresses() {
  try {
    const res = await fetch("api/teacher/addresses");
    if (res.ok) addresses = await res.json();
  } catch { /* zostaje adres z paska */ }
  route();
}

async function enter() {
  loggedIn = true;
  route();
  loadAddresses();
  await Promise.all([lesson.start(), survey.start()]).catch(e => setStatusError(e.message));
}

async function leave() {
  loggedIn = false;
  await Promise.all([lesson.stop(), survey.stop()]);
  resetStatus();
  route();
}

setUnauthorizedHandler(leave);
addEventListener("hashchange", route);

$("login-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("login-error").textContent = "";
  const res = await fetch("api/teacher/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: $("password").value }),
  });
  if (!res.ok) {
    $("login-error").textContent = "Nieprawidłowe hasło.";
    return;
  }
  $("password").value = "";
  await enter();
});

$("logout").addEventListener("click", async () => {
  await fetch("api/teacher/logout", { method: "POST" });
  await leave();
});

(async () => {
  const me = await fetch("api/teacher/me");
  if (me.ok) await enter();
  else route();
})();
