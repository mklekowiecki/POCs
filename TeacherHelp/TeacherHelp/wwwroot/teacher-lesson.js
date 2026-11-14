// Panel nauczyciela – aplikacja „Lekcja”: sesja zadań, uczniowie i pliki.
import { $, el, api, errorText, unauthorized, dashboardHub, setTileInfo } from "./teacher-common.js";

let lastVersion = -1;

function show(section) {
  for (const id of ["idle", "session"]) $(id).classList.toggle("hidden", id !== section);
}

function taskLabel(t) {
  return t.title ? `${t.number}. ${t.title}` : `Zadanie ${t.number}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function groupsLabel(categories) {
  return categories.length ? `grupa ${categories.join(", ")}` : "wszyscy";
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
      el("span", { className: "muted", textContent: ` ${formatSize(f.size)} · ${target} · ${groupsLabel(f.categories)} ` }),
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
    setTileInfo("lekcja", "Brak sesji");
    show("idle");
    return;
  }
  show("session");

  renderFiles(d);

  // Kolumna „Grupa” tylko przy podziale na grupy (wczytana lista klasy albo ktoś ma już grupę).
  const groups = d.rosterOnly || d.students.some(s => s.category);
  const counts = ["A", "B", "C"].map(c => `${c}: ${d.students.filter(s => s.category === c).length}`);
  const noGroup = d.students.filter(s => !s.category).length;
  $("roster-state").textContent = groups
    ? `(${counts.join(" · ")}${noGroup ? ` · bez grupy: ${noGroup}` : ""})`
    : "(nie wczytano)";

  const n = d.students.length;
  const disconnected = d.students.filter(s => !s.connected).length;
  $("lesson-summary").textContent = `Uczniów: ${n}` + (disconnected ? ` (niepołączonych: ${disconnected})` : "");
  setTileInfo("lekcja", `Sesja trwa · zadań: ${d.tasks.length} · uczniów: ${n}`, true);

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

  $("lesson-thead").replaceChildren(el("tr", {},
    el("th", { textContent: "Uczeń" }),
    ...(groups ? [el("th", { textContent: "Grupa", title: "Uczeń widzi tylko pliki swojej grupy i pliki dla wszystkich" })] : []),
    ...d.tasks.map(t => {
      const th = el("th", { className: "task", textContent: t.number, title: t.title ?? "Kliknij, aby nadać tytuł" });
      th.addEventListener("click", () => rename(t));
      return th;
    }),
    el("th")));

  $("lesson-tbody").replaceChildren(...d.students.map(s => {
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
      ...(groups ? [categoryCell(s)] : []),
      ...d.tasks.map(t => done.has(t.number)
        ? el("td", { className: "yes", textContent: "✓" })
        : el("td")),
      actions);
  }));
}

function categoryCell(s) {
  const select = el("select", { title: `Grupa: ${s.name}` },
    el("option", { value: "", textContent: "—" }),
    ...["A", "B", "C"].map(c => el("option", { value: c, textContent: c })));
  select.value = s.category ?? "";
  select.addEventListener("change", async () => {
    try {
      await api("PUT", `api/teacher/students/${encodeURIComponent(s.id)}/category`, { category: select.value || null });
    } catch (e) {
      alert(e.message);
      select.value = s.category ?? "";
    }
  });
  return el("td", { className: "category" }, select);
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

const hub = dashboardHub("hubs/teacher", render);

export async function start() {
  lastVersion = -1;
  await hub.start();
}

export const stop = () => hub.stop();

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
    if (res.status === 401) { await unauthorized(); return; }
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
  const checked = [...document.querySelectorAll('input[name="upload-category"]:checked')];
  for (const box of checked) form.append("categories", box.value);
  const button = ev.submitter;
  button.disabled = true;
  button.textContent = "Wysyłanie…";
  try {
    const res = await fetch("api/teacher/files", { method: "POST", body: form });
    if (res.status === 401) { await unauthorized(); return; }
    if (res.status === 413) throw new Error("Plik jest za duży (limit 200 MB).");
    if (!res.ok) throw new Error(await errorText(res));
    input.value = "";
    for (const box of checked) box.checked = false;
  } catch (e) {
    $("upload-error").textContent = e.message;
  } finally {
    button.disabled = false;
    button.textContent = "Udostępnij";
  }
});

$("roster-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("roster-error").textContent = "";
  $("roster-result").textContent = "";
  const input = $("roster-input");
  const form = new FormData();
  form.append("file", input.files[0]);
  try {
    const res = await fetch("api/teacher/roster", { method: "POST", body: form });
    if (res.status === 401) { await unauthorized(); return; }
    if (!res.ok) throw new Error(await errorText(res));
    const r = await res.json();
    $("roster-result").textContent = `Wczytano: nowych uczniów ${r.added}, dopasowanych do już obecnych ${r.matched}.`;
    input.value = "";
  } catch (e) {
    $("roster-error").textContent = e.message;
  }
});

$("lesson-export").addEventListener("click", () => { location.href = "api/teacher/export.csv"; });

$("end").addEventListener("click", async () => {
  if (!confirm("Zakończyć sesję? Wszystkie wyniki zostaną usunięte.\nJeśli chcesz je zachować, najpierw użyj „Eksport CSV”.")) return;
  try { await api("POST", "api/teacher/session/end"); } catch (e) { alert(e.message); }
});
