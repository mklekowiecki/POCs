"use strict";

const BROWSER_KEY = "teacherHelp.surveyBrowser";
const NAME_KEY = "teacherHelp.surveyName";

const SCALE = [
  { value: 1, emoji: "😵", label: "Nic nie kumam" },
  { value: 2, emoji: "😕", label: "Słabo" },
  { value: 3, emoji: "😐", label: "Coś tam kumam" },
  { value: 4, emoji: "🙂", label: "Dobrze" },
  { value: 5, emoji: "😎", label: "Kumam wszystko" },
];

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* tryb prywatny */ } }

const $ = id => document.getElementById(id);

// Losowy identyfikator przeglądarki – jedna odpowiedź na przeglądarkę. crypto.randomUUID wymaga HTTPS,
// getRandomValues działa też po zwykłym HTTP w sieci szkolnej.
const browserId = storageGet(BROWSER_KEY) ?? (() => {
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, "0")).join("");
  storageSet(BROWSER_KEY, id);
  return id;
})();

let current = null; // ostatni widok: { state, surveyId, named, questions }

const connection = new signalR.HubConnectionBuilder()
  .withUrl("hubs/survey")
  .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 2000 })
  .build();

function show(section) {
  for (const id of ["waiting", "open", "voted", "closed"]) $(id).classList.toggle("hidden", id !== section);
}

function setStatus(text, offline) {
  $("status").textContent = text;
  $("status").classList.toggle("offline", !!offline);
}

function renderForm(view) {
  $("mode-hint").textContent = view.named
    ? "📝 Ankieta imienna – nauczyciel zobaczy Twoje imię przy odpowiedziach."
    : "🔒 Ankieta anonimowa – nauczyciel nie wie, kto co zaznaczył.";
  $("name-row").classList.toggle("hidden", !view.named);
  $("name").required = view.named;
  if (view.named && !$("name").value) $("name").value = storageGet(NAME_KEY) ?? "";
  $("comment").value = "";
  $("submit-error").textContent = "";

  $("questions").replaceChildren(...view.questions.map(q => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "survey-question";
    const legend = document.createElement("legend");
    legend.textContent = q.text;
    const scale = document.createElement("div");
    scale.className = "scale";
    for (const s of SCALE) {
      const input = Object.assign(document.createElement("input"),
        { type: "radio", name: `q${q.number}`, value: String(s.value), id: `q${q.number}-${s.value}` });
      input.addEventListener("change", updateSubmit);
      const label = Object.assign(document.createElement("label"), { htmlFor: input.id, title: s.label });
      const emoji = Object.assign(document.createElement("span"), { className: "emoji", textContent: s.emoji });
      emoji.setAttribute("aria-hidden", "true");
      const num = Object.assign(document.createElement("span"), { className: "num", textContent: s.value });
      const text = Object.assign(document.createElement("span"), { className: "text", textContent: s.label });
      label.append(emoji, num, text);
      scale.append(input, label);
    }
    fieldset.append(legend, scale);
    return fieldset;
  }));
  updateSubmit();
}

function ratings() {
  return current.questions.map(q => {
    const checked = document.querySelector(`input[name="q${q.number}"]:checked`);
    return checked ? Number(checked.value) : null;
  });
}

function updateSubmit() {
  const missing = ratings().filter(r => r === null).length;
  $("submit").disabled = missing > 0;
  $("submit").textContent = missing > 0 ? `Wyślij (brakuje ocen: ${missing})` : "Wyślij";
}

function render(view) {
  // Formularz budujemy od nowa tylko przy nowej ankiecie – zwykły sygnał "changed" nie kasuje zaznaczeń.
  const same = current && current.state === view.state && current.surveyId === view.surveyId;
  current = view;
  if (view.state === "open" && !same) renderForm(view);
  show(view.state);
}

async function refresh() {
  render(await connection.invoke("GetView", browserId));
}

function confirmSubmit() {
  const dlg = $("confirm");
  return new Promise(resolve => {
    dlg.addEventListener("close", () => resolve(dlg.returnValue === "yes"), { once: true });
    dlg.returnValue = "no";
    dlg.showModal();
    $("confirm-yes").focus();
  });
}

const SUBMIT_ERRORS = {
  NotOpen: "Ankieta została już zamknięta albo zmieniona.",
  AlreadyVoted: "Z tej przeglądarki już odpowiedziano.",
  InvalidName: "Wpisz imię i nazwisko (do 60 znaków).",
  InvalidAnswers: "Zaznacz ocenę przy każdym pytaniu.",
};

$("survey-form").addEventListener("submit", async ev => {
  ev.preventDefault();
  const values = ratings();
  if (values.includes(null)) return;
  if (!await confirmSubmit()) return;
  $("submit-error").textContent = "";
  $("submit").disabled = true;
  const name = $("name").value.trim();
  if (current.named) storageSet(NAME_KEY, name);
  try {
    const status = await connection.invoke("Submit", browserId, current.surveyId,
      current.named ? name : null, values, $("comment").value);
    if (status !== "Ok") $("submit-error").textContent = SUBMIT_ERRORS[status] ?? status;
    await refresh();
  } catch {
    $("submit-error").textContent = "Brak połączenia z serwerem – spróbuj ponownie.";
  } finally {
    updateSubmit();
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
