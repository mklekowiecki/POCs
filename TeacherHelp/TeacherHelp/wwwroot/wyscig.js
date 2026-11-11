"use strict";

// „Wyścig do 60” – gra powtórkowa na projektor (wszyscy przy jednym komputerze, gracze lub drużyny po kolei).
// Działa w całości w przeglądarce: stan gry i własne pytania trzymamy w localStorage, więc odświeżenie
// strony nie gubi rozgrywki. Pytania wbudowane są w wyscig-pytania.js (RACE_CATEGORIES, RACE_QUESTIONS).

const FINISH = 60;
const COLS = 10;
const SPECIAL = {
  5: "bonus", 18: "bonus", 34: "bonus", 47: "bonus",
  12: "trap", 26: "trap", 41: "trap", 56: "trap",
  8: "again", 23: "again", 38: "again", 52: "again",
  15: "challenge", 31: "challenge", 45: "challenge",
};
const SPECIAL_TEXT = { bonus: "+2", trap: "−3", again: "↻", challenge: "⚡" };
const COLORS = ["#e5484d", "#2f6fdf", "#1f9d55", "#f59e0b", "#8e4ec6", "#0ea5b7"];
const LETTERS = ["A", "B", "C", "D"];
const SAVE_KEY = "wyscig60.save";
const PREFS_KEY = "wyscig60.prefs";
const OWN_CAT = { id: "wlasne", name: "Własne pytania", icon: "✏️" };

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};
const el = (tag, props = {}, ...children) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* np. tryb prywatny */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* j.w. */ } },
};

// ---------- Preferencje (dźwięk, ostatnie ustawienia) ----------

const prefs = Object.assign(
  { sound: true, names: [], count: 2, cats: RACE_CATEGORIES.map(c => c.id), timer: 30, own: "" },
  storage.get(PREFS_KEY) ?? {});
const savePrefs = () => storage.set(PREFS_KEY, prefs);
// Wbudowane kategorie dodane w nowej wersji gry od razu zaznaczamy także w przeglądarkach z zapisanymi ustawieniami.
{
  const known = prefs.knownCats ?? RACE_CATEGORIES.filter(c => c.id !== "calc").map(c => c.id);
  prefs.cats.push(...RACE_CATEGORIES.map(c => c.id).filter(id => !known.includes(id) && !prefs.cats.includes(id)));
  prefs.knownCats = RACE_CATEGORIES.map(c => c.id);
}

// ---------- Własne pytania ----------

// Format tekstowy (pole w ustawieniach i plik .txt do eksportu/importu):
//   # Nazwa kategorii        – kolejne pytania trafiają do tej kategorii (nazwa wbudowanej = dopisanie do niej)
//   Treść pytania
//   * poprawna odpowiedź     – dokładnie jedna z gwiazdką, razem 2–4 odpowiedzi
//   błędna odpowiedź
//   (pusta linia między pytaniami)
// Pytania bez nagłówka trafiają do kategorii „Własne pytania”. Nagłówek rozpoznajemy tylko między pytaniami.
// Linia zaczynająca się od \ jest dosłowna – tak zapisujemy odpowiedzi „*”, „#” czy „\” (np. znaki w formułach).

/** Kategoria dla nagłówka „# Nazwa”: wbudowana o tej nazwie albo nowa kategoria nauczyciela. */
function categoryFor(name) {
  const key = name.trim().toLocaleLowerCase("pl");
  if (!key || key === OWN_CAT.name.toLocaleLowerCase("pl")) return OWN_CAT;
  return RACE_CATEGORIES.find(c => c.name.toLocaleLowerCase("pl") === key)
    ?? { id: "own:" + key, name: name.trim(), icon: "✏️" };
}

/** Zamienia tekst z pytaniami na listę; zwraca { questions, cats (kategorie spoza wbudowanych), error }. */
function parseOwn(text) {
  const questions = [];
  const cats = [];
  let cat = OWN_CAT;
  let block = [];
  let error = "";
  const flush = () => {
    if (!block.length || error) return;
    const literal = l => l.startsWith("\\") ? l.slice(1) : l;
    const q = literal(block[0]);
    const answers = block.slice(1).map(l => l.startsWith("*")
      ? { text: l.replace(/^\*\s*/, ""), ok: true }
      : { text: literal(l), ok: false });
    block = [];
    const n = questions.length + 1;
    const correct = answers.filter(a => a.ok);
    if (answers.length < 2 || answers.length > 4)
      error = `Pytanie ${n} („${q}”): potrzeba od 2 do 4 odpowiedzi.`;
    else if (correct.length !== 1)
      error = `Pytanie ${n} („${q}”): oznacz gwiazdką dokładnie jedną poprawną odpowiedź.`;
    if (error) return;
    questions.push({ c: cat.id, q, a: [correct[0].text, ...answers.filter(a => !a.ok).map(a => a.text)] });
    if (!RACE_CATEGORIES.includes(cat) && !cats.includes(cat)) cats.push(cat);
  };
  for (const raw of text.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) flush();
    else if (line.startsWith("#") && !block.length) cat = categoryFor(line.slice(1));
    else block.push(line);
    if (error) break;
  }
  flush();
  return { questions, cats, error };
}

/** Pytania w formacie tekstowym, pogrupowane nagłówkami kategorii. */
function questionsToText(questions, cats) {
  const escape = s => /^[*#\\]/.test(s) ? "\\" + s : s;
  const parts = [];
  for (const cat of cats) {
    const list = questions.filter(q => q.c === cat.id);
    if (!list.length) continue;
    parts.push(`# ${cat.name}\n\n` + list.map(q => [escape(q.q), `* ${q.a[0]}`, ...q.a.slice(1).map(escape)].join("\n")).join("\n\n"));
  }
  return parts.join("\n\n") + "\n";
}

const own = () => parseOwn(prefs.own);
const ownQuestions = () => own().questions;
const questionKey = q => q.c + "|" + q.q;
/** Wbudowane + własne; pytania powtórzone (np. po imporcie pełnego eksportu) liczą się raz. */
function allQuestions() {
  const seen = new Set();
  return [...RACE_QUESTIONS, ...ownQuestions()].filter(q => !seen.has(questionKey(q)) && seen.add(questionKey(q)));
}
const categories = () => [...RACE_CATEGORIES, ...own().cats];

function download(name, text, bom = true) {
  // BOM pomaga Notatnikowi rozpoznać UTF-8 w plikach .txt; w .json go nie dajemy.
  const url = URL.createObjectURL(new Blob([(bom ? "\uFEFF" : "") + text], { type: "text/plain;charset=utf-8" }));
  const a = el("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportQuestions(all) {
  const date = new Date().toISOString().slice(0, 10);
  if (all) {
    download(`wyscig-pytania-wszystkie-${date}.txt`, questionsToText(allQuestions(), categories()));
    $("own-info").textContent = `Wyeksportowano ${allQuestions().length} pytań.`;
    return;
  }
  const { questions, cats } = own();
  if (!questions.length) { $("own-info").textContent = "Brak własnych pytań do eksportu."; return; }
  download(`wyscig-pytania-wlasne-${date}.txt`, questionsToText(questions, [...RACE_CATEGORIES, ...cats]));
  $("own-info").textContent = `Wyeksportowano ${questions.length} pytań.`;
}

async function importQuestions(file) {
  importText(await file.text(), file.name);
}

/** Dopisuje pytania z tekstu do własnych (bez powtórek). Zwraca false, gdy tekst ma błąd. */
function importText(text, name) {
  const parsed = parseOwn(text);
  if (parsed.error) { $("own-info").textContent = ""; $("own-error").textContent = `Plik ${name}: ${parsed.error}`; return false; }
  if (!parsed.questions.length) { $("own-info").textContent = `Plik ${name} nie zawiera pytań.`; return true; }
  const before = new Set(allQuestions().map(questionKey));
  const fresh = parsed.questions.filter(q => !before.has(questionKey(q)));
  const textarea = $("own-text");
  // Dopisujemy na końcu; nagłówek „# Własne pytania” pilnuje, żeby pytania bez nagłówka z pliku nie trafiły
  // do ostatniej kategorii z pola.
  if (fresh.length) {
    const added = questionsToText(fresh, [...RACE_CATEGORIES, OWN_CAT, ...parsed.cats]);
    textarea.value = (textarea.value.trim() ? textarea.value.trimEnd() + "\n\n" : "") + added;
  }
  onOwnInput();
  $("own-box").open = true;
  const skipped = parsed.questions.length - fresh.length;
  $("own-info").textContent = `Zaimportowano ${fresh.length} pytań` + (skipped ? ` (pominięte powtórki: ${skipped}).` : ".");
  return true;
}

// ---------- Zapis gry do pliku ----------
// Plik .json ze stanem gry i własnymi pytaniami z jej zakresu – grę można dokończyć na innej lekcji
// albo na innym komputerze.

function saveGameFile() {
  if (!state || busy) return;
  const ownUsed = ownQuestions().filter(q => state.cats.includes(q.c));
  const data = {
    app: "wyscig60", version: 1, savedAt: new Date().toISOString(),
    questions: ownUsed.length ? questionsToText(ownUsed, categories()) : "",
    state,
  };
  const stamp = new Date().toLocaleString("sv").slice(0, 16).replace(" ", "_").replace(":", "-");
  download(`wyscig60-gra-${stamp}.json`, JSON.stringify(data, null, 2), false);
  const info = state.finished ? $("copy-info") : $("message");
  if (state.finished) info.textContent = "Zapisano grę do pliku.";
  else message(`💾 Zapisano grę do pliku. Kolej: <b>${esc(current().name)}</b>.`);
}

/** Sprawdza stan z pliku i uzupełnia brakujące pola; zwraca null, gdy plik nie jest zapisem tej gry. */
function readSavedState(data) {
  const s = data?.app === "wyscig60" ? data.state : null;
  const players = s?.players;
  if (!Array.isArray(players) || players.length < 1 || players.length > COLORS.length) return null;
  const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return {
    players: players.map((p, i) => ({
      name: String(p?.name ?? `Gracz ${i + 1}`).slice(0, 30), color: COLORS[i],
      pos: num(p?.pos, FINISH), points: num(p?.points, 9999), good: num(p?.good, 9999), bad: num(p?.bad, 9999),
    })),
    turn: num(s.turn, players.length - 1),
    cats: Array.isArray(s.cats) ? s.cats.map(String) : RACE_CATEGORIES.map(c => c.id),
    timer: num(s.timer, 600),
    deck: Array.isArray(s.deck) ? s.deck.map(String) : [],
    wrongs: Array.isArray(s.wrongs) ? s.wrongs.filter(w => w && w.q).map(w => ({
      who: String(w.who ?? ""), q: String(w.q), correct: String(w.correct ?? ""), given: String(w.given ?? "") })) : [],
    winner: Number.isInteger(s.winner) && s.winner >= 0 && s.winner < players.length ? s.winner : null,
    finished: !!s.finished,
  };
}

async function loadGameFile(file) {
  $("setup-error").textContent = "";
  let data;
  try { data = JSON.parse((await file.text()).replace(/^\uFEFF/, "")); } catch { data = null; }
  const loaded = readSavedState(data);
  if (!loaded) { $("setup-error").textContent = `Plik ${file.name} nie jest zapisem gry „Wyścig do 60”.`; return; }
  // Własne pytania z pliku dopisujemy do tej przeglądarki, żeby gra miała z czego losować.
  if (typeof data.questions === "string" && data.questions.trim() && !importText(data.questions, file.name)) return;
  state = loaded;
  save();
  if (state.finished) showSummary();
  else startBoard();
}

// ---------- Dźwięk ----------

let audio = null;
function tone(freq, dur = 0.12, type = "sine", delay = 0, gain = 0.15) {
  if (!prefs.sound) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch { /* brak Web Audio */ }
}
const sfx = {
  step: () => tone(520, 0.05, "triangle", 0, 0.08),
  dice: () => { for (let i = 0; i < 5; i++) tone(200 + Math.random() * 300, 0.04, "square", i * 0.06, 0.05); },
  good: () => { tone(660, 0.12); tone(880, 0.18, "sine", 0.12); },
  bad: () => { tone(300, 0.18, "sawtooth", 0, 0.08); tone(200, 0.25, "sawtooth", 0.15, 0.08); },
  bonus: () => { tone(523, 0.1); tone(659, 0.1, "sine", 0.1); tone(784, 0.15, "sine", 0.2); },
  trap: () => { tone(400, 0.12, "triangle"); tone(300, 0.12, "triangle", 0.12); tone(220, 0.2, "triangle", 0.24); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "sine", i * 0.15)),
  tick: () => tone(1000, 0.03, "square", 0, 0.04),
};


// ---------- Stan gry ----------

/** state: { players: [{ name, color, pos, points, good, bad }], turn, cats, timer, deck, wrongs, winner, finished } */
let state = null;
let busy = false;

function newGame(names, cats, timer) {
  state = {
    players: names.map((name, i) => ({ name, color: COLORS[i], pos: 0, points: 0, good: 0, bad: 0 })),
    turn: 0, cats, timer, deck: [], wrongs: [], winner: null, finished: false,
  };
  save();
}

const save = () => storage.set(SAVE_KEY, state);
const current = () => state.players[state.turn];

/** Kolejne pytanie z potasowanej talii; po wyczerpaniu talia tasuje się od nowa. */
function drawQuestion() {
  const all = allQuestions();
  // Gdy zakres się opróżnił (np. usunięto własne pytania przed wznowieniem gry), bierzemy wszystkie wbudowane.
  if (!all.some(q => state.cats.includes(q.c))) state.cats = RACE_CATEGORIES.map(c => c.id);
  const ok = q => q && state.cats.includes(q.c);
  state.deck = state.deck.filter(k => ok(questionByKey(k, all)));
  if (!state.deck.length) state.deck = shuffle(all.filter(ok).map(questionKey));
  const key = state.deck.shift();
  return questionByKey(key, all);
}
// Talia trzyma klucze pytań (kategoria + treść) – działa też po edycji własnych pytań między sesjami.
const questionByKey = (key, all) => all.find(q => questionKey(q) === key);

// ---------- Plansza ----------

function cellPlace(n) {
  const row = Math.floor((n - 1) / COLS);
  const idx = (n - 1) % COLS;
  return { row: row + 1, col: row % 2 === 0 ? idx + 1 : COLS - idx };
}

function buildBoard() {
  const board = $("board");
  board.replaceChildren();
  const start = el("div", { className: "race-cell start", id: "cell-0" }, el("span", { className: "race-num", textContent: "Start" }));
  board.append(start);
  for (let n = 1; n <= FINISH; n++) {
    const kind = n === FINISH ? "finish" : SPECIAL[n] ?? "q";
    const label = n === FINISH ? "🏁" : SPECIAL_TEXT[kind] ?? "?";
    const { row, col } = cellPlace(n);
    const cell = el("div", { className: `race-cell ${kind}`, id: `cell-${n}` },
      el("span", { className: "race-num", textContent: n }),
      el("span", { className: "race-icon", textContent: label }));
    cell.style.gridRow = row + 1;
    cell.style.gridColumn = col;
    // Kolor postępu: od chłodnego na starcie do ciepłego przy mecie.
    cell.style.setProperty("--p", (n / FINISH).toFixed(3));
    board.append(cell);
  }
}

function renderTokens() {
  document.querySelectorAll(".race-token").forEach(t => t.remove());
  for (const [i, p] of state.players.entries()) {
    const token = el("span", { className: "race-token" + (i === state.turn && !state.finished ? " active" : ""), textContent: i + 1, title: p.name });
    token.style.background = p.color;
    $(`cell-${p.pos}`).append(token);
  }
}

function renderSide() {
  const p = current();
  $("turn-name").textContent = p.name;
  $("turn-name").style.color = p.color;
  $("scores").replaceChildren(...state.players.map((pl, i) =>
    el("li", { className: i === state.turn ? "active" : "" },
      el("span", { className: "race-dot", style: `background:${pl.color}` }),
      el("span", { className: "race-score-name", textContent: pl.name }),
      el("span", { className: "race-score-pos", textContent: `pole ${pl.pos}` }),
      el("span", { className: "race-score-pts", textContent: `${pl.points} pkt` }))));
  $("btn-roll").disabled = busy || state.finished;
}

function render() {
  renderTokens();
  renderSide();
}

function message(html) { $("message").innerHTML = html; }

// ---------- Kostka i ruch ----------

async function rollDie() {
  const die = $("die");
  sfx.dice();
  die.classList.add("rolling");
  for (let i = 0; i < 8; i++) {
    die.dataset.v = 1 + Math.floor(Math.random() * 6);
    await sleep(70);
  }
  const v = 1 + Math.floor(Math.random() * 6);
  die.dataset.v = v;
  die.classList.remove("rolling");
  return v;
}

/** Przesuwa pionek pole po polu do celu (w obie strony). */
async function moveTo(p, target) {
  target = Math.max(0, Math.min(FINISH, target));
  while (p.pos !== target) {
    p.pos += p.pos < target ? 1 : -1;
    sfx.step();
    renderTokens();
    await sleep(170);
  }
  renderSide();
}

async function roll() {
  if (busy || !state || state.finished) return;
  busy = true;
  renderSide();
  const p = current();
  const from = p.pos;
  const v = await rollDie();
  message(`<b>${esc(p.name)}</b> wyrzuca <b>${v}</b>.`);
  await moveTo(p, from + v);
  let again = false;
  try {
    again = await resolveField(p, from);
  } finally {
    busy = false;
  }
  if (state.finished) return showSummary();
  if (!again) state.turn = (state.turn + 1) % state.players.length;
  save();
  render();
}

/** Skutek pola, na którym stanął gracz. Zwraca true, gdy gracz rzuca jeszcze raz. */
async function resolveField(p, from) {
  if (p.pos === FINISH) return finalQuestion(p, from);
  const kind = SPECIAL[p.pos];
  if (kind === "bonus") {
    sfx.bonus();
    message(`<b>${esc(p.name)}</b>: pole <b>+2</b> – dwa pola do przodu!`);
    await sleep(500);
    await moveTo(p, p.pos + 2);
    if (p.pos === FINISH) return finalQuestion(p, from);
    return false;
  }
  if (kind === "trap") {
    sfx.trap();
    message(`<b>${esc(p.name)}</b>: pole <b>−3</b> – trzy pola do tyłu.`);
    await sleep(500);
    await moveTo(p, p.pos - 3);
    return false;
  }
  if (kind === "again") {
    sfx.bonus();
    message(`<b>${esc(p.name)}</b>: pole <b>↻</b> – rzucasz jeszcze raz!`);
    return true;
  }
  if (kind === "challenge") {
    const risk = await askChallenge(p);
    const ok = await askQuestion(p, risk ? "Wyzwanie ⚡" : "Pytanie");
    if (risk) {
      if (ok) {
        p.points++;
        message(`<b>${esc(p.name)}</b> wygrywa wyzwanie: <b>+3 pola</b> i punkt!`);
        await moveTo(p, p.pos + 3);
        if (p.pos === FINISH) return finalQuestion(p, from);
      } else {
        message(`<b>${esc(p.name)}</b> przegrywa wyzwanie: <b>−3 pola</b>.`);
        await moveTo(p, p.pos - 3);
      }
      return false;
    }
    return afterNormal(p, from, ok);
  }
  const ok = await askQuestion(p, "Pytanie");
  return afterNormal(p, from, ok);
}

async function afterNormal(p, from, ok) {
  if (ok) {
    p.points++;
    message(`<b>${esc(p.name)}</b>: dobrze! +1 punkt, zostajesz na polu ${p.pos}.`);
  } else {
    message(`<b>${esc(p.name)}</b>: niestety źle – powrót na pole ${from}.`);
    await moveTo(p, from);
  }
  return false;
}

async function finalQuestion(p, from) {
  message(`<b>${esc(p.name)}</b> dociera do mety! Pytanie finałowe…`);
  const ok = await askQuestion(p, "Pytanie finałowe 🏁");
  if (ok) {
    p.points++;
    state.winner = state.players.indexOf(p);
    state.finished = true;
    save();
    sfx.win();
    message(`🏆 <b>${esc(p.name)}</b> wygrywa!`);
    if (window.Celebrate) Celebrate.finale(`🏆 ${p.name} wygrywa!`);
    await sleep(2200);
    return false;
  }
  message(`<b>${esc(p.name)}</b>: zła odpowiedź na mecie – powrót na pole ${from}.`);
  await moveTo(p, from);
  return false;
}

// ---------- Okna: pytanie i wyzwanie ----------

let dialogKeys = null; // obsługa klawiszy w otwartym oknie

function askChallenge(p) {
  return new Promise(resolve => {
    const dlg = $("dlg-challenge");
    $("challenge-who").textContent = p.name;
    const done = risk => {
      dialogKeys = null;
      dlg.close();
      resolve(risk);
    };
    $("btn-ch-yes").onclick = () => done(true);
    $("btn-ch-no").onclick = () => done(false);
    dlg.oncancel = e => e.preventDefault();
    dialogKeys = key => {
      if (key === "t") done(true);
      else if (key === "n") done(false);
      else return false;
      return true;
    };
    tone(880, 0.1); tone(990, 0.1, "sine", 0.1);
    dlg.showModal();
  });
}

function askQuestion(p, kind) {
  const q = drawQuestion();
  return new Promise(resolve => {
    const dlg = $("dlg-question");
    const correct = q.a[0];
    const answers = shuffle([...q.a]);
    const cat = categories().find(c => c.id === q.c);
    $("q-who").textContent = p.name;
    $("q-who").style.background = p.color;
    $("q-kind").textContent = kind;
    $("q-cat").textContent = cat ? `${cat.icon} ${cat.name}` : "";
    $("q-text").textContent = q.q;
    $("q-feedback").textContent = "";
    $("q-feedback").className = "race-feedback";
    $("btn-next").classList.add("hidden");
    const buttons = answers.map((a, i) => el("button", { type: "button", className: "race-answer" },
      el("span", { className: "race-letter", textContent: LETTERS[i] }), el("span", { textContent: a })));
    $("q-answers").replaceChildren(...buttons);


    // Licznik czasu
    let timerId = null;
    const bar = $("q-timer");
    bar.classList.toggle("hidden", !state.timer);
    if (state.timer) {
      const end = performance.now() + state.timer * 1000;
      let lastSec = state.timer;
      const span = bar.firstElementChild;
      const tick = () => {
        const left = Math.max(0, end - performance.now());
        span.style.width = `${(left / (state.timer * 1000)) * 100}%`;
        bar.classList.toggle("low", left < 5000);
        const sec = Math.ceil(left / 1000);
        if (sec !== lastSec && sec <= 5 && sec > 0) sfx.tick();
        lastSec = sec;
        if (left <= 0) answer(-1);
      };
      tick();
      timerId = setInterval(tick, 100);
    }

    let answered = false;
    function answer(i) {
      if (answered) return;
      answered = true;
      clearInterval(timerId);
      const ok = i >= 0 && answers[i] === correct;
      buttons.forEach((b, k) => {
        b.disabled = true;
        if (answers[k] === correct) b.classList.add("correct");
        else if (k === i) b.classList.add("wrong");
      });
      const fb = $("q-feedback");
      if (ok) {
        p.good++;
        sfx.good();
        fb.textContent = "✅ Dobrze!";
        fb.classList.add("ok");
      } else {
        p.bad++;
        sfx.bad();
        fb.textContent = i < 0 ? `⏰ Koniec czasu! Poprawna odpowiedź: ${correct}` : `❌ Źle. Poprawna odpowiedź: ${correct}`;
        fb.classList.add("bad");
        state.wrongs.push({ who: p.name, q: q.q, correct, given: i < 0 ? "(brak odpowiedzi)" : answers[i] });
      }
      const next = $("btn-next");
      next.classList.remove("hidden");
      next.focus();
      next.onclick = () => {
        dialogKeys = null;
        dlg.close();
        resolve(ok);
      };
      dialogKeys = key => {
        if (key === "enter" || key === " ") { next.click(); return true; }
        return false;
      };
    }

    buttons.forEach((b, i) => b.addEventListener("click", () => answer(i)));
    dialogKeys = key => {
      const i = LETTERS.indexOf(key.toUpperCase());
      if (i >= 0 && i < answers.length) { answer(i); return true; }
      return false;
    };
    dlg.oncancel = e => e.preventDefault();
    dlg.showModal();
    $("q-answers").focus?.();
  });
}

// ---------- Podsumowanie ----------

function ranking() {
  return state.players
    .map((p, i) => ({ ...p, i }))
    .sort((a, b) => (b.i === state.winner) - (a.i === state.winner) || b.pos - a.pos || b.points - a.points);
}

/** Pytania z błędami, bez powtórek, z liczbą pomyłek. */
function discussion() {
  const map = new Map();
  for (const w of state.wrongs) {
    const item = map.get(w.q) ?? { q: w.q, correct: w.correct, count: 0, who: new Set() };
    item.count++;
    item.who.add(w.who);
    map.set(w.q, item);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function showSummary() {
  state.finished = true;
  save();
  show("summary");
  const w = state.winner != null ? state.players[state.winner] : null;
  $("summary-winner").textContent = w ? `🏆 Zwycięzca: ${w.name}` : "Gra zakończona przed metą.";
  $("summary-body").replaceChildren(...ranking().map((p, k) => el("tr", {},
    el("td", { textContent: k + 1 }),
    el("td", { className: "text" }, el("span", { className: "race-dot", style: `background:${p.color}` }), " " + p.name),
    el("td", { textContent: p.pos }),
    el("td", { textContent: p.points }),
    el("td", { textContent: p.good }),
    el("td", { textContent: p.bad }))));
  const items = discussion();
  $("discuss").replaceChildren(...(items.length
    ? items.map(d => el("li", {},
        el("div", { className: "race-discuss-q", textContent: d.q }),
        el("div", { className: "race-discuss-a", textContent: `✔ ${d.correct}` }),
        el("div", { className: "muted", textContent: `błędy: ${d.count} (${[...d.who].join(", ")})` })))
    : [el("li", { className: "muted", textContent: "Brak błędnych odpowiedzi – brawo!" })]));
  $("copy-info").textContent = "";
}

async function copyList() {
  const lines = ["Wyścig do 60 – podsumowanie", ""];
  for (const [k, p] of ranking().entries())
    lines.push(`${k + 1}. ${p.name} – pole ${p.pos}, ${p.points} pkt (dobre: ${p.good}, błędne: ${p.bad})`);
  lines.push("", "Do omówienia:");
  const items = discussion();
  if (!items.length) lines.push("(brak)");
  for (const [k, d] of items.entries()) lines.push(`${k + 1}. ${d.q} – poprawnie: ${d.correct} (błędy: ${d.count})`);
  const text = lines.join("\n");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Bez HTTPS schowek bywa niedostępny – kopiujemy przez zaznaczenie.
    const ta = el("textarea", { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  $("copy-info").textContent = "Skopiowano.";
}

// ---------- Ustawienia ----------

function show(section) {
  for (const id of ["setup", "game", "summary"]) $(id).classList.toggle("hidden", id !== section);
}

function renderNames() {
  const n = +$("player-count").value;
  const box = $("player-names");
  const old = [...box.querySelectorAll("input")].map(i => i.value);
  box.replaceChildren(...Array.from({ length: n }, (_, i) => {
    const input = el("input", { maxLength: 30, value: old[i] ?? prefs.names[i] ?? (n === 1 ? "Gracz" : `Drużyna ${i + 1}`) });
    return el("label", { className: "race-name" }, el("span", { className: "race-dot", style: `background:${COLORS[i]}` }), input);
  }));
}

function renderCategories() {
  const all = allQuestions();
  $("category-list").replaceChildren(...categories().map(c => {
    const count = all.filter(q => q.c === c.id).length;
    const box = el("input", { type: "checkbox", value: c.id, checked: prefs.cats.includes(c.id) });
    return el("label", { className: "race-cat" }, box, ` ${c.icon} ${c.name} `, el("span", { className: "muted", textContent: `(${count})` }));
  }));
}

function onOwnInput() {
  const before = new Set(categories().map(c => c.id));
  prefs.own = $("own-text").value;
  const { questions, error } = parseOwn(prefs.own);
  $("own-error").textContent = error;
  $("own-count").textContent = questions.length;
  const now = categories().map(c => c.id);
  const cats = [...document.querySelectorAll("#category-list input:checked")].map(i => i.value)
    .filter(id => now.includes(id));
  // Nowe kategorie (z pola albo z importu) od razu zaznaczamy w zakresie.
  cats.push(...now.filter(id => !before.has(id)));
  prefs.cats = [...new Set(cats)];
  savePrefs();
  renderCategories();
}

function showSetup() {
  $("player-count").value = prefs.count;
  renderNames();
  $("own-text").value = prefs.own;
  const own = parseOwn(prefs.own);
  $("own-count").textContent = own.questions.length;
  $("own-error").textContent = own.error;
  renderCategories();
  $("timer").value = prefs.timer;
  const saved = storage.get(SAVE_KEY);
  const canResume = saved?.players?.length && !saved.finished;
  $("resume-box").classList.toggle("hidden", !canResume);
  if (canResume) {
    const leader = [...saved.players].sort((a, b) => b.pos - a.pos)[0];
    $("resume-info").textContent = `${saved.players.map(p => p.name).join(", ")} (prowadzi ${leader.name}, pole ${leader.pos})`;
  }
  $("setup-error").textContent = "";
  show("setup");
}

function startFromSetup() {
  const names = [...document.querySelectorAll("#player-names input")].map((i, k) => i.value.trim() || `Gracz ${k + 1}`);
  const cats = [...document.querySelectorAll("#category-list input:checked")].map(i => i.value);
  const timer = +$("timer").value;
  if (!cats.length) { $("setup-error").textContent = "Zaznacz co najmniej jeden zakres pytań."; return; }
  if ($("own-error").textContent) { $("setup-error").textContent = "Popraw własne pytania – błąd jest opisany pod polem z pytaniami."; return; }
  Object.assign(prefs, { names, count: names.length, cats, timer });
  savePrefs();
  newGame(names, cats, timer);
  startBoard();
}

function startBoard() {
  show("game");
  buildBoard();
  busy = false;
  message(`Kolej: <b>${esc(current().name)}</b> – rzuć kostką!`);
  render();
}

function replay() {
  newGame(state.players.map(p => p.name), state.cats, state.timer);
  startBoard();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Przyciski i klawisze ----------

function setToggle(btn, on) { btn.setAttribute("aria-pressed", on); btn.classList.toggle("off", !on); }

$("player-count").addEventListener("change", renderNames);
$("own-text").addEventListener("input", onOwnInput);
$("btn-start").addEventListener("click", startFromSetup);
$("btn-own-import").addEventListener("click", () => $("own-file").click());
$("own-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) await importQuestions(file);
});
$("btn-own-export").addEventListener("click", () => exportQuestions(false));
$("btn-all-export").addEventListener("click", () => exportQuestions(true));
$("btn-resume").addEventListener("click", () => { state = storage.get(SAVE_KEY); startBoard(); });
$("btn-load").addEventListener("click", () => $("game-file").click());
$("game-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (file) await loadGameFile(file);
});
$("btn-save").addEventListener("click", saveGameFile);
$("btn-save-summary").addEventListener("click", saveGameFile);
$("btn-roll").addEventListener("click", roll);
$("btn-end").addEventListener("click", () => { if (!busy && confirm("Zakończyć grę i pokazać podsumowanie?")) showSummary(); });
$("btn-again").addEventListener("click", replay);
$("btn-players").addEventListener("click", showSetup);
$("btn-copy").addEventListener("click", copyList);
$("btn-rules").addEventListener("click", () => $("dlg-rules").showModal());
$("btn-rules-close").addEventListener("click", () => $("dlg-rules").close());
$("btn-sound").addEventListener("click", e => { prefs.sound = !prefs.sound; savePrefs(); setToggle(e.currentTarget, prefs.sound); });
$("btn-full").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});

document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (dialogKeys) {
    if (dialogKeys(key)) e.preventDefault();
    return;
  }
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (key === " " && !typing && !$("game").classList.contains("hidden") && !$("dlg-rules").open) {
    e.preventDefault();
    roll();
  }
});

setToggle($("btn-sound"), prefs.sound);
showSetup();
