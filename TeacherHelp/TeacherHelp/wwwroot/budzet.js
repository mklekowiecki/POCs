"use strict";

// Gra „Budżet domowy” – strona gracza. Pokazuje tylko wylosowaną sytuację i wydarzenia odsłoniętych miesięcy;
// liczenie (saldo, stałe wydatki) uczeń robi sam w arkuszu kalkulacyjnym.

const BROWSER_KEY = "teacherHelp.budgetBrowser";
const NAME_KEY = "teacherHelp.budgetName";

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* tryb prywatny */ } }

const $ = id => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Jak w ankiecie: getRandomValues działa też po zwykłym HTTP (crypto.randomUUID wymaga HTTPS).
const browserId = storageGet(BROWSER_KEY) ?? (() => {
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
  storageSet(BROWSER_KEY, id);
  return id;
})();

const zl = n => n.toLocaleString("pl-PL") + " zł";

const MONTHS = 3;

let current = null;

const connection = new signalR.HubConnectionBuilder()
  .withUrl("hubs/budget")
  .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 2000 })
  .build();

function show(section) {
  for (const id of ["waiting", "join", "play"]) $(id).classList.toggle("hidden", id !== section);
}

function setStatus(text, offline) {
  $("status").textContent = text;
  $("status").classList.toggle("offline", !!offline);
}

// Pod najnowszym miesiącem: co dalej (kolejny miesiąc odsłania prowadzący, każdemu osobno).
function monthFooter(m) {
  if (current.state !== "playing" || m.number !== current.month) return [];
  return [el("p", { className: "budget-done", textContent: m.number >= MONTHS
    ? "To był ostatni miesiąc. Sprawdź saldo i poczekaj na podsumowanie prowadzącego."
    : "Gdy wszystko z tego miesiąca będzie w arkuszu, zgłoś się do prowadzącego – odsłoni Ci kolejny miesiąc." })];
}

function renderMonth(m, isNew) {
  const events = m.events.map(e => el("li", { className: "budget-event" + (e.choice ? " choice" : "") },
    el("div", { className: "head" },
      el("strong", { textContent: e.title }),
      ...(e.choice ? [el("span", { className: "budget-tag", textContent: "Twoja decyzja" })] : [])),
    el("p", { textContent: e.text })));
  return el("section", { className: "card budget-month" + (isNew ? " new" : "") },
    el("h3", { textContent: `Miesiąc ${m.number} – ${m.name}` }),
    el("ol", { className: "budget-steps" },
      el("li", { textContent: `Dodaj do arkusza zarobki: ${zl(current.profile.income)}.` }),
      el("li", { textContent: "Odejmij stałe wydatki (rachunki, jedzenie, paliwo)." }),
      el("li", { textContent: events.length ? "Uwzględnij wydarzenia tego miesiąca:" : "W tym miesiącu nic się nie wydarzyło." })),
    el("ul", { className: "budget-events" }, ...events),
    ...monthFooter(m));
}

function render(view) {
  const previousMonth = current?.gameId === view.gameId ? current.month : null;
  current = view;
  $("player").textContent = view.name ?? "";
  if (view.state === "waiting") return show("waiting");
  if (view.state === "join") {
    if (!$("name").value) $("name").value = storageGet(NAME_KEY) ?? "";
    renderReturn(view.available);
    show("join");
    return;
  }

  const p = view.profile;
  $("income").textContent = zl(p.income);
  $("family").textContent = `${p.family} (razem ${p.persons} ${p.persons < 5 ? "osoby" : "osób"})`;
  $("assets").textContent = p.assets;
  $("finished").classList.toggle("hidden", view.state !== "finished");
  $("prepare").classList.toggle("hidden", view.months.length > 0);
  // Najnowszy miesiąc na górze; wyróżniony tylko, gdy właśnie się pojawił (nie po odświeżeniu strony).
  const latest = view.months.length;
  $("months").replaceChildren(...[...view.months].reverse()
    .map(m => renderMonth(m, previousMonth !== null && m.number === latest && latest > previousMonth)));
  show("play");
}

// Powrót do gry (np. wznowionej przez prowadzącego z pliku): gracze bez otwartej przeglądarki.
function renderReturn(players) {
  $("return").classList.toggle("hidden", players.length === 0);
  $("return-list").replaceChildren(...players.map(p => {
    const btn = el("button", { type: "button", className: "secondary", textContent: p.name });
    btn.addEventListener("click", () => claim(p, btn));
    return btn;
  }));
}

async function claim(player, btn) {
  if (!confirm(`Czy na pewno jesteś: ${player.name}?`)) return;
  $("return-error").textContent = "";
  btn.disabled = true;
  try {
    const status = await connection.invoke("Claim", browserId, current.gameId, player.id);
    if (status === "NotAvailable")
      $("return-error").textContent = `${player.name} gra już na innym komputerze. Jeśli to Ty – poproś prowadzącego o odłączenie.`;
    else if (status !== "Ok") $("return-error").textContent = JOIN_ERRORS[status] ?? status;
    await refresh();
  } catch {
    $("return-error").textContent = "Brak połączenia z serwerem – spróbuj ponownie.";
  } finally {
    btn.disabled = false;
  }
}

async function refresh() {
  render(await connection.invoke("GetView", browserId));
}

const JOIN_ERRORS = {
  NotRunning: "Gra się zmieniła albo zakończyła – odśwież stronę.",
  InvalidName: "Wpisz imię i nazwisko (do 60 znaków).",
  InvalidBrowser: "Przeglądarka nie pozwala zapisać danych – poproś prowadzącego o pomoc.",
};

$("join-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  $("join-error").textContent = "";
  $("join-submit").disabled = true;
  const name = $("name").value.trim();
  storageSet(NAME_KEY, name);
  try {
    const status = await connection.invoke("Join", browserId, current.gameId, name);
    if (status !== "Ok") $("join-error").textContent = JOIN_ERRORS[status] ?? status;
    await refresh();
  } catch {
    $("join-error").textContent = "Brak połączenia z serwerem – spróbuj ponownie.";
  } finally {
    $("join-submit").disabled = false;
  }
});

connection.on("changed", () => refresh().catch(() => {}));
connection.onreconnecting(() => setStatus("Brak połączenia – łączę ponownie…", true));
connection.onreconnected(async () => {
  setStatus("Połączono");
  await refresh().catch(() => {});
});

async function start() {
  try {
    await connection.start();
    setStatus("Połączono");
    await refresh();
  } catch {
    setStatus("Brak połączenia – łączę ponownie…", true);
    setTimeout(start, 2000);
  }
}
start();
