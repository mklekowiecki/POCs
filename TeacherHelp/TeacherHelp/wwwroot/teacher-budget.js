// Panel nauczyciela – gra „Budżet domowy”: start gry, odsłanianie miesięcy każdemu graczowi osobno i klucz do sprawdzania arkuszy.
import { $, el, api, errorText, unauthorized, dashboardHub, setTileInfo } from "./teacher-common.js";

const MONTHS = 3;
const MONTH_NAMES = ["", "wrzesień", "październik", "listopad"];
let lastVersion = -1;
let last = null;
const expanded = new Set(); // gracze z rozwiniętą listą wydarzeń

const zl = n => n.toLocaleString("pl-PL") + " zł";

function show(section) {
  for (const id of ["budget-new", "budget-game"]) $(id).classList.toggle("hidden", id !== section);
}

const stateText = d => d.state === "Finished" ? "Gra zakończona" : "Gra trwa";
const monthText = m => m === 0 ? "jeszcze nie zaczął" : `${m} – ${MONTH_NAMES[m]}` + (m === MONTHS ? " ✓" : "");

function renderEvents(p, month) {
  return el("div", { className: "budget-key" }, ...p.months.map(m => {
    const hidden = m.number > month;
    return el("div", { className: "budget-key-month" + (hidden ? " future" : "") },
      el("h4", { textContent: `${m.number}. ${m.name}` + (hidden ? " (jeszcze ukryty)" : "") }),
      el("ul", {}, ...(m.events.length
        ? m.events.map(e => el("li", {},
            el("span", { textContent: e.title + (e.choice ? " ✋" : "") }),
            el("span", { className: "cost", textContent: e.cost })))
        : [el("li", { className: "muted", textContent: "brak wydarzeń" })])));
  }));
}

function renderPlayers(d) {
  const cols = 9;
  const rows = d.players.flatMap(p => {
    const net = p.profile.income - p.fixedCosts;
    const open = expanded.has(p.id);
    const toggle = el("button", { type: "button", className: "secondary", textContent: open ? "Ukryj" : "Wydarzenia" });
    toggle.addEventListener("click", () => {
      if (!expanded.delete(p.id)) expanded.add(p.id);
      renderPlayers(last);
    });
    const next = el("button", { type: "button", className: "budget-reveal", textContent: `Odsłoń ${MONTH_NAMES[p.month + 1] ?? ""} →`,
      title: `Odsłoń graczowi miesiąc ${p.month + 1}` });
    next.classList.toggle("hidden", d.state !== "Running" || p.month >= MONTHS);
    next.addEventListener("click", async () => {
      next.disabled = true;
      try { await api("POST", `api/teacher/budget/players/${p.id}/next`); } catch (e) { alert(e.message); next.disabled = false; }
    });
    // Odłącz – gracz trafia na listę do wybrania (np. ktoś wybrał z listy nie siebie albo zmienia komputer).
    const disconnect = el("button", { type: "button", className: "secondary", textContent: "Odłącz" });
    disconnect.classList.toggle("hidden", !p.online);
    disconnect.addEventListener("click", async () => {
      try { await api("POST", `api/teacher/budget/players/${p.id}/disconnect`); } catch (e) { alert(e.message); }
    });
    const remove = el("button", { type: "button", className: "danger", textContent: "Usuń" });
    remove.addEventListener("click", async () => {
      if (!confirm(`Usunąć gracza ${p.name}? Po ponownym dołączeniu wylosuje nową sytuację.`)) return;
      try { await api("DELETE", `api/teacher/budget/players/${p.id}`); } catch (e) { alert(e.message); }
    });
    const balance = el("td", { className: "num" + (p.maxBalance < 0 ? " minus" : p.minBalance < 0 ? " risky" : " plus"),
      textContent: p.minBalance === p.maxBalance ? zl(p.minBalance) : `${zl(p.minBalance)} … ${zl(p.maxBalance)}`,
      title: "Saldo po 3 miesiącach: przy najdroższych … najtańszych decyzjach" });
    const row = el("tr", {},
      el("td", {}, el("span", { className: "online-dot" + (p.online ? " on" : ""), title: p.online ? "Strona otwarta" : "Strona zamknięta" }), p.name),
      el("td", { className: "month" + (p.month === MONTHS ? " plus" : "") }, el("span", { textContent: monthText(p.month) }), next),
      el("td", { className: "num", textContent: zl(p.profile.income) }),
      el("td", { className: "text", textContent: p.profile.family }),
      el("td", { className: "text", textContent: p.profile.assets }),
      el("td", { className: "num", textContent: zl(p.fixedCosts) }),
      el("td", { className: "num", textContent: zl(net) }),
      balance,
      el("td", { className: "actions" }, toggle, disconnect, remove));
    return open ? [row, el("tr", { className: "budget-key-row" }, el("td", { colSpan: cols }, renderEvents(p, d.state === "Finished" ? MONTHS : p.month)))] : [row];
  });
  $("budget-tbody").replaceChildren(...(rows.length ? rows
    : [el("tr", {}, el("td", { colSpan: cols, className: "muted", textContent: "Nikt jeszcze nie dołączył." }))]));
}

function render(d) {
  if (d.version < lastVersion) return; // spóźniona wiadomość
  lastVersion = d.version;
  last = d;
  setTileInfo("budzet", d.state === "None" ? "Brak gry" : `${stateText(d)} · graczy: ${d.players.length}`, d.state === "Running");
  if (d.state === "None") return show("budget-new");

  const running = d.state === "Running";
  $("budget-state").textContent = (running ? "● " : "") + stateText(d);
  $("budget-state").classList.toggle("open", running);
  const done = d.players.filter(p => p.month === MONTHS).length;
  $("budget-summary").textContent = `Graczy: ${d.players.length} · skończyło: ${done}`;
  $("budget-finish").classList.toggle("hidden", !running);
  $("budget-reimport").classList.toggle("hidden", running);
  $("budget-finish").classList.toggle("danger", done < d.players.length);
  $("budget-finish").classList.toggle("success", done === d.players.length);
  renderPlayers(d);
  show("budget-game");
}

const hub = dashboardHub("hubs/budget-teacher", render);

export async function start() {
  lastVersion = -1;
  last = null;
  await hub.start();
}

export const stop = () => hub.stop();

async function startGame() {
  try { await api("POST", "api/teacher/budget/start"); } catch (e) { alert(e.message); }
}

// Wznowienie gry z pliku z „Eksport CSV” (jak przy lekcji). Zwraca komunikat błędu albo null.
async function importGame(file) {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("api/teacher/budget/import", { method: "POST", body: form });
    if (res.status === 401) { await unauthorized(); return null; }
    return res.ok ? null : await errorText(res);
  } catch (e) {
    return e.message;
  }
}

$("budget-start").addEventListener("click", startGame);

$("budget-restart").addEventListener("click", () => {
  if (confirm("Rozpocząć nową grę? Wszyscy gracze stracą wylosowane sytuacje i dołączą od nowa.\n"
    + "Jeśli chcesz kiedyś wrócić do tej gry, najpierw pobierz „Eksport CSV”.")) startGame();
});

$("budget-export").addEventListener("click", () => { location.href = "api/teacher/budget/export.csv"; });

$("budget-import-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("budget-import-error").textContent = "";
  const error = await importGame($("budget-import-input").files[0]);
  if (error) $("budget-import-error").textContent = error;
  else $("budget-import-input").value = "";
});

// Po zakończonej grze: wznowienie innej (albo tej samej) gry z pliku bez przechodzenia przez „Nowa gra”.
$("budget-reimport").addEventListener("click", () => $("budget-reimport-input").click());
$("budget-reimport-input").addEventListener("change", async () => {
  const input = $("budget-reimport-input");
  if (!input.files.length) return;
  const error = await importGame(input.files[0]);
  input.value = "";
  if (error) alert(error);
});

$("budget-finish").addEventListener("click", async () => {
  const behind = last.players.filter(p => p.month < MONTHS).length;
  if (behind && !confirm(`Graczy, którzy jeszcze nie skończyli: ${behind}. Zakończyć grę? Zobaczą wszystkie wydarzenia.`)) return;
  try { await api("POST", "api/teacher/budget/finish"); } catch (e) { alert(e.message); }
});
