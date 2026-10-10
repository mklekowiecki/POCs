"use strict";

const $ = id => document.getElementById(id);
let connection = null;
let lastVersion = -1;

function show(section) {
  for (const id of ["login", "idle", "session"]) $(id).classList.toggle("hidden", id !== section);
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
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res;
}

function taskLabel(t) {
  return t.title ? `${t.number}. ${t.title}` : `Zadanie ${t.number}`;
}

function render(d) {
  if (d.version < lastVersion) return; // spóźniona wiadomość
  lastVersion = d.version;

  if (!d.active) {
    show("idle");
    return;
  }
  show("session");

  const n = d.students.length;
  $("summary").textContent = `Uczniów: ${n}`;

  const statsByNumber = new Map(d.stats.map(s => [s.number, s]));
  $("stats").replaceChildren(...d.tasks.map(t => {
    const s = statsByNumber.get(t.number);
    const bar = el("span");
    bar.style.width = `${n ? s.percent : 0}%`;
    return el("div", { className: "stat", title: taskLabel(t) },
      el("div", { className: "head" },
        el("span", { className: "label", textContent: taskLabel(t) }),
        el("span", { className: "pct", textContent: n ? `${s.percent}%` : "—" })),
      el("div", { className: "bar" }, bar),
      el("div", { className: "count", textContent: `${s.doneCount} / ${n}` }));
  }));

  $("thead").replaceChildren(el("tr", {},
    el("th", { textContent: "Uczeń" }),
    ...d.tasks.map(t => {
      const th = el("th", { className: "task", textContent: t.number, title: t.title ?? "Kliknij, aby nadać tytuł" });
      th.addEventListener("click", () => rename(t));
      return th;
    }),
    el("th")));

  $("tbody").replaceChildren(...d.students.map(s => {
    const done = new Set(s.done);
    const remove = el("button", { type: "button", className: "danger", textContent: "Usuń" });
    remove.addEventListener("click", () => removeStudent(s));
    return el("tr", {},
      el("td", { textContent: s.login }),
      ...d.tasks.map(t => done.has(t.number)
        ? el("td", { className: "yes", textContent: "✓" })
        : el("td")),
      el("td", { className: "actions" }, remove));
  }));
}

async function rename(t) {
  const title = prompt(`Tytuł zadania ${t.number} (puste = bez tytułu):`, t.title ?? "");
  if (title === null) return;
  try { await api("PUT", `api/teacher/tasks/${t.number}`, { title }); } catch (e) { alert(e.message); }
}

async function removeStudent(s) {
  if (!confirm(`Usunąć ucznia „${s.login}” z sesji? Jego postęp zostanie utracony.`)) return;
  try { await api("DELETE", `api/teacher/students/${encodeURIComponent(s.id)}`); } catch (e) { alert(e.message); }
}

async function startConnection() {
  await stopConnection();
  lastVersion = -1;
  connection = new signalR.HubConnectionBuilder()
    .withUrl("hubs/teacher")
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

$("start-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("start-error").textContent = "";
  try {
    await api("POST", "api/teacher/session/start", { taskCount: Number($("task-count").value) });
  } catch (e) {
    $("start-error").textContent = e.message;
  }
});

$("add-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  try {
    await api("POST", "api/teacher/tasks", { title: $("add-title").value });
    $("add-title").value = "";
  } catch (e) {
    alert(e.message);
  }
});

$("export").addEventListener("click", () => { location.href = "api/teacher/export.csv"; });

$("end").addEventListener("click", async () => {
  if (!confirm("Zakończyć sesję? Wszystkie wyniki zostaną usunięte.\nJeśli chcesz je zachować, najpierw użyj „Eksport CSV”.")) return;
  try { await api("POST", "api/teacher/session/end"); } catch (e) { alert(e.message); }
});

(async () => {
  const me = await fetch("api/teacher/me");
  if (me.ok) await startConnection().catch(e => setStatus(e.message, true));
  else show("login");
})();
