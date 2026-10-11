"use strict";

const TOKEN_KEY = "teacherHelp.token";
const LOGIN_KEY = "teacherHelp.lastLogin";
const ANIM_KEY = "teacherHelp.animations";

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* tryb prywatny */ }
}

const $ = id => document.getElementById(id);

function fileLinks(files) {
  return files.map(f => {
    const a = document.createElement("a");
    a.href = `api/files/${encodeURIComponent(f.id)}`;
    a.download = f.name;
    a.textContent = `📄 ${f.name}`;
    const li = document.createElement("li");
    li.append(a);
    return li;
  });
}
const connection = new signalR.HubConnectionBuilder()
  .withUrl("hubs/student")
  .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 2000 })
  .build();

function show(section) {
  for (const id of ["waiting", "login", "tasks"]) $(id).classList.toggle("hidden", id !== section);
}

function setStatus(text, offline) {
  $("status").textContent = text;
  $("status").classList.toggle("offline", !!offline);
}

function render(view, sentToken) {
  if (view.state === "waiting") {
    $("who").textContent = "";
    show("waiting");
    return;
  }
  if (view.state === "login") {
    // Token nieważny: nowa sesja albo nauczyciel usunął ucznia. Czyścimy tylko token, z którym
    // wysłano zapytanie - w międzyczasie uczeń mógł już dołączyć i dostać nowy.
    if (sentToken && storageGet(TOKEN_KEY) === sentToken) storageSet(TOKEN_KEY, null);
    $("who").textContent = "";
    if ($("login").classList.contains("hidden")) $("login-input").value = storageGet(LOGIN_KEY) ?? "";
    show("login");
    return;
  }
  $("who").textContent = view.login;
  $("materials").classList.toggle("hidden", view.files.length === 0);
  $("materials-list").replaceChildren(...fileLinks(view.files));
  const tiles = $("tiles");
  tiles.replaceChildren(...view.tasks.map(t => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile" + (t.done ? " done" : "");
    btn.setAttribute("aria-pressed", String(t.done));
    const num = document.createElement("span");
    num.className = "num";
    num.textContent = t.number;
    btn.append(num);
    if (t.title) {
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = t.title;
      btn.append(title);
    }
    btn.addEventListener("click", () => toggle(t, btn));
    const card = document.createElement("div");
    card.className = "tile-card";
    card.append(btn);
    if (t.files.length) {
      const list = document.createElement("ul");
      list.className = "files";
      list.append(...fileLinks(t.files));
      card.append(list);
    }
    return card;
  }));
  show("tasks");
}

let refreshSeq = 0;

async function refresh() {
  const seq = ++refreshSeq;
  const token = storageGet(TOKEN_KEY);
  try {
    const view = await connection.invoke("GetView", token);
    if (seq === refreshSeq) render(view, token); // ignorujemy odpowiedzi na starsze zapytania
  } catch (e) {
    console.error(e);
  }
}

// Każde zadanie dostaje losowo jedną animację i trzyma ją do końca sesji (zapis w localStorage
// razem z tokenem ucznia). Losujemy spośród najrzadziej użytych, żeby kolejne zadania się różniły.
function animationFor(number) {
  const token = storageGet(TOKEN_KEY);
  let saved = {};
  try { saved = JSON.parse(storageGet(ANIM_KEY) ?? "{}"); } catch { /* uszkodzony wpis */ }
  if (saved.token !== token) saved = { token, tasks: {} };
  if (!Celebrate.kinds.includes(saved.tasks[number])) {
    const used = Object.values(saved.tasks);
    const counts = Celebrate.kinds.map(k => used.filter(u => u === k).length);
    const min = Math.min(...counts);
    const candidates = Celebrate.kinds.filter((_, i) => counts[i] === min);
    saved.tasks[number] = candidates[Math.floor(Math.random() * candidates.length)];
    storageSet(ANIM_KEY, JSON.stringify(saved));
  }
  return saved.tasks[number];
}

async function toggle(task, btn) {
  btn.disabled = true;
  const rect = btn.getBoundingClientRect();
  const origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const tiles = [...$("tiles").querySelectorAll(".tile")];
  const willBeDone = !task.done;
  const completesAll = willBeDone && tiles.every(t => t === btn || t.classList.contains("done"));
  try {
    const ok = await connection.invoke("Toggle", storageGet(TOKEN_KEY), task.number);
    if (ok && willBeDone) {
      if (completesAll && tiles.length > 1) Celebrate.finale("Wszystkie zadania zrobione! 🏆");
      else Celebrate.play(animationFor(task.number), origin, `Brawo! Zadanie ${task.number} zrobione`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await refresh();
  }
}

$("login-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const login = $("login-input").value.trim();
  $("login-error").textContent = "";
  if (!login) return;
  try {
    const result = await connection.invoke("Join", login);
    switch (result.status) {
      case "Ok":
        storageSet(TOKEN_KEY, result.token);
        storageSet(LOGIN_KEY, login);
        break;
      case "LoginTaken":
        $("login-error").textContent = "Ten login jest już zajęty – wybierz inny.";
        return;
      case "InvalidLogin":
        $("login-error").textContent = "Login musi mieć od 1 do 40 znaków.";
        return;
      default:
        break;
    }
  } catch (e) {
    $("login-error").textContent = "Brak połączenia z serwerem.";
    return;
  }
  await refresh();
});

connection.on("changed", refresh);
connection.onreconnecting(() => setStatus("Brak połączenia – łączę ponownie…", true));
connection.onreconnected(() => { setStatus("Połączono"); refresh(); });

async function start() {
  for (;;) {
    try {
      await connection.start();
      setStatus("Połączono");
      await refresh();
      return;
    } catch {
      setStatus("Brak połączenia – łączę ponownie…", true);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
connection.onclose(() => start());
start();
