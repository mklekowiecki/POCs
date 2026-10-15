"use strict";

const $ = id => document.getElementById(id);
const MAX_QUESTIONS = 10;
const EMOJI = ["😵", "😕", "😐", "🙂", "😎"];
let connection = null;
let lastVersion = -1;
let last = null;      // ostatni dashboard
let creating = false; // formularz „Nowa ankieta” otwarty, choć poprzednia ankieta jeszcze jest

function show(section) {
  for (const id of ["login", "create", "results"]) $(id).classList.toggle("hidden", id !== section);
  $("logout").classList.toggle("hidden", section === "login");
}

function setStatus(text, offline) {
  $("status").textContent = text;
  $("status").classList.toggle("offline", !!offline);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Results.BadRequest("...") zwraca tekst jako JSON-owy string (w cudzysłowach).
async function errorText(res) {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parsed;
  } catch { /* zwykły tekst */ }
  return text || res.statusText;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    await stopConnection();
    show("login");
    throw new Error("Wymagane logowanie");
  }
  if (!res.ok) throw new Error(await errorText(res));
  return res;
}

const formatAverage = a => a == null ? "—" : a.toFixed(2).replace(".", ",");

// --- Formularz nowej ankiety ---

function addQuestion(text = "") {
  const list = $("question-list");
  if (list.children.length >= MAX_QUESTIONS) return;
  const input = el("input", { maxLength: 200, value: text, placeholder: "Treść pytania, np. pętla for" });
  const remove = el("button", { type: "button", className: "secondary", textContent: "✕", title: "Usuń pytanie" });
  const li = el("li", {}, input, remove);
  remove.addEventListener("click", () => {
    li.remove();
    if (!list.children.length) addQuestion();
    updateQuestionButtons();
  });
  input.addEventListener("keydown", ev => {
    // Enter w ostatnim polu dodaje kolejne pytanie zamiast od razu startować ankietę.
    if (ev.key === "Enter" && li === list.lastElementChild && input.value.trim() && list.children.length < MAX_QUESTIONS) {
      ev.preventDefault();
      addQuestion();
    }
  });
  list.append(li);
  updateQuestionButtons();
  input.focus();
}

function updateQuestionButtons() {
  const list = $("question-list");
  $("add-question").disabled = list.children.length >= MAX_QUESTIONS;
  for (const b of list.querySelectorAll("button")) b.disabled = list.children.length === 1;
}

function resetCreateForm(questions) {
  $("question-list").replaceChildren();
  for (const q of questions.length ? questions : [""]) addQuestion(q);
  $("create-error").textContent = "";
}

// focus() na ukrytej sekcji nie działa – wołamy po show("create").
function focusFirstQuestion() {
  $("question-list").querySelector("input")?.focus();
}

// --- Wyniki ---

function renderQuestion(q) {
  const max = Math.max(1, ...q.counts);
  const rows = q.counts.map((count, i) => {
    const bar = el("span");
    bar.style.width = `${100 * count / max}%`;
    const pct = q.responses ? Math.round(100 * count / q.responses) : 0;
    return el("div", { className: `dist-row r${i + 1}` },
      el("span", { className: "dist-label", textContent: `${EMOJI[i]} ${i + 1}` }),
      el("div", { className: "dist-bar" }, bar),
      el("span", { className: "dist-count", textContent: q.responses ? `${count} · ${pct}%` : "0" }));
  });
  const level = q.average == null ? "" : q.average < 2.5 ? " low" : q.average < 3.5 ? " mid" : " high";
  return el("div", { className: "card question-stat" },
    el("div", { className: "head" },
      el("span", { className: "label", textContent: `${q.number}. ${q.text}` }),
      el("span", { className: "avg" + level, textContent: formatAverage(q.average),
        title: "Średnia ocena" })),
    ...rows);
}

function renderResults(d) {
  const open = d.state === "Open";
  $("state-badge").textContent = open ? "● Ankieta otwarta" : "Ankieta zamknięta";
  $("state-badge").classList.toggle("open", open);
  $("summary").textContent = `Odpowiedzi: ${d.responseCount}` + (open ? ` / otwarte strony: ${d.openPages}` : "")
    + ` · ${d.named ? "imienna" : "anonimowa"}`;
  $("close").classList.toggle("hidden", !open);

  $("question-stats").replaceChildren(...d.questions.map(renderQuestion));

  $("comments-count").textContent = d.comments.length ? `(${d.comments.length})` : "";
  $("comments").replaceChildren(...(d.comments.length
    ? d.comments.map(c => el("li", { textContent: c }))
    : [el("li", { className: "muted empty", textContent: "Brak komentarzy." })]));
  // W trybie imiennym komentarze są w tabeli przy uczniu.
  $("comments-panel").classList.toggle("hidden", d.named);

  $("responses-panel").classList.toggle("hidden", !d.named);
  if (d.named) {
    $("thead").replaceChildren(el("tr", {},
      el("th", { textContent: "Uczeń" }),
      ...d.questions.map(q => el("th", { textContent: q.number, title: q.text })),
      el("th", { className: "comment", textContent: "Komentarz" })));
    $("tbody").replaceChildren(...(d.responses.length
      ? d.responses.map(r => el("tr", {},
          el("td", { textContent: r.name }),
          ...r.ratings.map(v => el("td", { className: `rating r${v}`, textContent: v })),
          el("td", { className: "comment", textContent: r.comment ?? "" })))
      : [el("tr", {}, el("td", { colSpan: d.questions.length + 2, className: "muted", textContent: "Brak odpowiedzi." }))]));
  }
}

function render(d) {
  if (d.version < lastVersion) return; // spóźniona wiadomość
  lastVersion = d.version;
  const wasNone = !last || last.state === "None";
  last = d;
  if (d.state === "None") {
    if (wasNone && !$("create").classList.contains("hidden")) return; // nie kasujemy wpisanych pytań
    creating = false;
    $("cancel-create").classList.add("hidden");
    resetCreateForm([]);
    show("create");
    focusFirstQuestion();
    return;
  }
  if (creating) return; // nauczyciel pisze nową ankietę – wyniki poprzedniej odświeżą się po „Anuluj”
  renderResults(d);
  show("results");
}

// --- Połączenie ---

async function startConnection() {
  await stopConnection();
  lastVersion = -1;
  last = null;
  connection = new signalR.HubConnectionBuilder()
    .withUrl("hubs/survey-teacher")
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 2000 })
    .build();
  connection.on("dashboard", render);
  connection.onreconnecting(() => setStatus("Brak połączenia – łączę ponownie…", true));
  connection.onreconnected(async () => {
    setStatus("Połączono");
    render(await connection.invoke("GetDashboard"));
  });
  await connection.start();
  setStatus("Połączono");
  render(await connection.invoke("GetDashboard"));
}

async function stopConnection() {
  if (connection) {
    const c = connection;
    connection = null;
    await c.stop().catch(() => {});
  }
}

// --- Zdarzenia ---

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
  await startConnection().catch(e => setStatus(e.message, true));
});

$("logout").addEventListener("click", async () => {
  await fetch("api/teacher/logout", { method: "POST" });
  await stopConnection();
  setStatus("");
  show("login");
});

$("add-question").addEventListener("click", () => addQuestion());

$("create-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("create-error").textContent = "";
  const questions = [...$("question-list").querySelectorAll("input")].map(i => i.value.trim()).filter(Boolean);
  if (!questions.length) {
    $("create-error").textContent = "Wpisz co najmniej jedno pytanie.";
    return;
  }
  if (last && last.state !== "None" && last.responseCount > 0 && !last.exported
      && !confirm("Wyniki poprzedniej ankiety nie zostały wyeksportowane i przepadną.\nRozpocząć nową ankietę?")) return;
  const named = document.querySelector('input[name="mode"]:checked').value === "named";
  try {
    await api("POST", "api/teacher/survey/start", { questions, named });
    creating = false;
    if (last) { renderResults(last); show("results"); }
  } catch (e) {
    $("create-error").textContent = e.message;
  }
});

$("new-survey").addEventListener("click", () => {
  creating = true;
  // Podpowiadamy pytania z poprzedniej ankiety – zwykle zmienia się tylko część.
  resetCreateForm(last ? last.questions.map(q => q.text) : []);
  $("cancel-create").classList.remove("hidden");
  show("create");
  focusFirstQuestion();
});

$("cancel-create").addEventListener("click", () => {
  creating = false;
  if (last && last.state !== "None") { renderResults(last); show("results"); }
});

$("close").addEventListener("click", async () => {
  if (!confirm("Zamknąć ankietę? Uczniowie nie będą mogli już odpowiadać.")) return;
  try { await api("POST", "api/teacher/survey/close"); } catch (e) { alert(e.message); }
});

$("export").addEventListener("click", () => { location.href = "api/teacher/survey/export.csv"; });

(async () => {
  const me = await fetch("api/teacher/me");
  if (me.ok) await startConnection().catch(e => setStatus(e.message, true));
  else show("login");
})();
