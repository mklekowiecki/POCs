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

function taskLabel(t) {
  return t.title ? `${t.number}. ${t.title}` : `Zadanie ${t.number}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderFiles(d) {
  $("files-count").textContent = d.files.length;

  const select = $("upload-task");
  const selected = select.value;
  select.replaceChildren(
    el("option", { value: "", textContent: "materiały ogólne" }),
    ...d.tasks.map(t => el("option", { value: String(t.number), textContent: taskLabel(t) })));
  if ([...select.options].some(o => o.value === selected)) select.value = selected;

  const tasksByNumber = new Map(d.tasks.map(t => [t.number, t]));
  $("files-list").replaceChildren(...d.files.map(f => {
    const remove = el("button", { type: "button", className: "danger", textContent: "Usuń" });
    remove.addEventListener("click", () => removeFile(f));
    const target = f.taskNumber == null ? "materiały ogólne" : taskLabel(tasksByNumber.get(f.taskNumber));
    return el("li", {},
      el("a", { href: `api/files/${encodeURIComponent(f.id)}`, download: f.name, textContent: f.name }),
      el("span", { className: "muted", textContent: ` ${formatSize(f.size)} · ${target} ` }),
      remove);
  }));
}

async function removeFile(f) {
  if (!confirm(`Usunąć plik „${f.name}”?`)) return;
  try { await api("DELETE", `api/teacher/files/${encodeURIComponent(f.id)}`); } catch (e) { alert(e.message); }
}

function render(d) {
  if (d.version < lastVersion) return; // spóźniona wiadomość
  lastVersion = d.version;

  if (!d.active) {
    show("idle");
    return;
  }
  show("session");

  renderFiles(d);

  const n = d.students.length;
  const disconnected = d.students.filter(s => !s.connected).length;
  $("summary").textContent = `Uczniów: ${n}` + (disconnected ? ` (niepołączonych: ${disconnected})` : "");

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
    const actions = el("td", { className: "actions" });
    if (s.connected) {
      const disconnect = el("button", { type: "button", className: "secondary", textContent: "Odłącz",
        title: "Uczeń wybierze siebie z listy na ekranie logowania – postęp zostaje" });
      disconnect.addEventListener("click", () => disconnectStudent(s));
      actions.append(disconnect);
    }
    actions.append(remove);
    const name = el("td", { textContent: s.name });
    if (!s.connected) name.append(el("span", { className: "badge", textContent: "niepołączony" }));
    return el("tr", {},
      name,
      ...d.tasks.map(t => done.has(t.number)
        ? el("td", { className: "yes", textContent: "✓" })
        : el("td")),
      actions);
  }));
}

async function rename(t) {
  const title = prompt(`Tytuł zadania ${t.number} (puste = bez tytułu):`, t.title ?? "");
  if (title === null) return;
  try { await api("PUT", `api/teacher/tasks/${t.number}`, { title }); } catch (e) { alert(e.message); }
}

async function removeStudent(s) {
  if (!confirm(`Usunąć ucznia „${s.name}” z sesji? Jego postęp zostanie utracony.`)) return;
  try { await api("DELETE", `api/teacher/students/${encodeURIComponent(s.id)}`); } catch (e) { alert(e.message); }
}

async function disconnectStudent(s) {
  if (!confirm(`Odłączyć ucznia „${s.name}” od komputera? Postęp zostaje, a uczeń wybierze siebie z listy przy ponownym wejściu.`)) return;
  try { await api("POST", `api/teacher/students/${encodeURIComponent(s.id)}/disconnect`); } catch (e) { alert(e.message); }
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

$("import-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("import-error").textContent = "";
  const input = $("import-input");
  const form = new FormData();
  form.append("file", input.files[0]);
  try {
    const res = await fetch("api/teacher/session/import", { method: "POST", body: form });
    if (res.status === 401) { await stopConnection(); show("login"); return; }
    if (!res.ok) throw new Error(await errorText(res));
    input.value = "";
  } catch (e) {
    $("import-error").textContent = e.message;
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

$("upload-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("upload-error").textContent = "";
  const input = $("upload-input");
  const form = new FormData();
  for (const file of input.files) form.append("files", file);
  form.append("task", $("upload-task").value);
  const button = ev.submitter;
  button.disabled = true;
  button.textContent = "Wysyłanie…";
  try {
    const res = await fetch("api/teacher/files", { method: "POST", body: form });
    if (res.status === 401) { await stopConnection(); show("login"); return; }
    if (res.status === 413) throw new Error("Plik jest za duży (limit 200 MB).");
    if (!res.ok) throw new Error(await errorText(res));
    input.value = "";
  } catch (e) {
    $("upload-error").textContent = e.message;
  } finally {
    button.disabled = false;
    button.textContent = "Udostępnij";
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
