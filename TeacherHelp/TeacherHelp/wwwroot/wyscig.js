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
  { sound: true, motion: true, names: [], count: 2, cats: RACE_CATEGORIES.map(c => c.id), timer: 30, own: "" },
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
// Dźwięk rzutu kostką syntezowany na żywo (bez plików): każde uderzenie o stół to krótki „klak” –
// filtrowany szum (twarda krawędź) i gasnący ton (pudło stołu). Kostka uderza kilkoma krawędziami naraz,
// odbija się coraz słabiej, a na końcu „drobi” po blacie, zanim stanie.
let noiseBuffer = null;

function clack(at, strength) {
  noiseBuffer ??= (() => {
    const buf = audio.createBuffer(1, audio.sampleRate * 0.25, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  })();
  const out = audio.createGain();
  out.connect(audio.destination);

  // Twarde kliknięcie: szum przez filtr pasmowy o losowej wysokości (różne krawędzie brzmią inaczej).
  const noise = audio.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.playbackRate.value = 0.8 + Math.random() * 0.4;
  const band = audio.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2200 + Math.random() * 2600;
  band.Q.value = 2.5 + Math.random() * 3;
  const ng = audio.createGain();
  const nDecay = 0.018 + Math.random() * 0.02;
  ng.gain.setValueAtTime(0.0001, at);
  ng.gain.exponentialRampToValueAtTime(0.9 * strength, at + 0.0015);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + nDecay);
  noise.connect(band).connect(ng).connect(out);
  noise.start(at, Math.random() * 0.2, nDecay + 0.01);

  // Głuche „tok” blatu: krótki ton z szybko opadającą wysokością.
  const body = audio.createOscillator();
  body.type = "sine";
  const f = 380 + Math.random() * 260;
  body.frequency.setValueAtTime(f, at);
  body.frequency.exponentialRampToValueAtTime(f * 0.7, at + 0.05);
  const bg = audio.createGain();
  bg.gain.setValueAtTime(0.0001, at);
  bg.gain.exponentialRampToValueAtTime(0.35 * strength, at + 0.002);
  bg.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  body.connect(bg).connect(out);
  body.start(at);
  body.stop(at + 0.07);
}

/** Cały rzut zsynchronizowany z animacją: odbicia w tych samych chwilach co race-die-bounce. */
function diceSound(totalMs) {
  if (!prefs.sound) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") audio.resume();
    const t0 = audio.currentTime + 0.02;
    const total = totalMs / 1000;
    const rnd = (a, b) => a + Math.random() * (b - a);
    // Odbicia: [chwila jako ułamek rzutu, siła]; każde to 2–4 uderzenia krawędziami w odstępie kilkudziesięciu ms.
    const bounces = [[0.42, 1], [0.68, 0.6], [0.85, 0.35]];
    for (const [frac, strength] of bounces) {
      const hits = 2 + Math.floor(Math.random() * 3);
      let t = t0 + frac * total;
      for (let h = 0; h < hits; h++) {
        clack(t, strength * (h === 0 ? 1 : rnd(0.35, 0.7)));
        t += rnd(0.018, 0.055);
      }
    }
    // Toczenie po blacie: coraz cichsze i coraz gęstsze stuknięcia aż do zatrzymania.
    let t = t0 + 0.87 * total;
    let gap = 0.075;
    let strength = 0.28;
    while (t < t0 + total - 0.02 && strength > 0.03) {
      clack(t, strength);
      t += gap * rnd(0.8, 1.2);
      gap *= 0.82;
      strength *= 0.78;
    }
  } catch { /* brak Web Audio */ }
}

const sfx = {
  step: () => tone(520, 0.05, "triangle", 0, 0.08),
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

let tokens = [];     // pionki graczy (elementy w warstwie nad planszą), w kolejności state.players
let scoreRows = [];  // wiersze tabeli wyników, budowane raz – dzięki temu paski postępu płynnie rosną

/** Ponawia animację CSS przypiętą do klasy (zdjęcie klasy, wymuszenie przeliczenia, założenie). */
function replay(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
}

function buildBoard() {
  const board = $("board");
  board.replaceChildren();
  const start = el("div", { className: "race-cell start", id: "cell-0" }, el("span", { className: "race-num", textContent: "Start" }));
  start.style.setProperty("--n", 0);
  board.append(start);
  for (let n = 1; n <= FINISH; n++) {
    const kind = n === FINISH ? "finish" : SPECIAL[n] ?? "q";
    const label = n === FINISH ? "🏁" : SPECIAL_TEXT[kind] ?? "?";
    const { row, col } = cellPlace(n);
    const cell = el("div", { className: `race-cell ${kind}`, id: `cell-${n}` },
      el("span", { className: "race-num", textContent: n }),
      el("span", { className: "race-icon", textContent: label }));
    if (n % COLS === 0 && n < FINISH) cell.classList.add("turn");
    cell.style.gridRow = row + 1;
    cell.style.gridColumn = col;
    // Odcień postępu: od chłodnego błękitu na starcie do ciepłego pomarańczu przy mecie.
    cell.style.setProperty("--h", Math.round(215 - (n / FINISH) * 190));
    cell.style.setProperty("--n", n);
    board.append(cell);
  }
  const layer = el("div", { className: "race-layer", id: "tokens" });
  board.append(layer);
  tokens = state.players.map((p, i) => {
    const token = el("div", { className: "race-token instant", title: p.name },
      el("span", { className: "race-token-body", textContent: i + 1 }));
    token.style.setProperty("--c", p.color);
    layer.append(token);
    return token;
  });
  buildScores();
  // Kafelki i pionki „wskakują” tylko przy wejściu na planszę.
  board.classList.add("enter");
  setTimeout(() => board.classList.remove("enter"), 2200);
}

function buildScores() {
  scoreRows = state.players.map((p, i) => {
    const row = {
      name: el("span", { className: "race-score-name", textContent: p.name }),
      pos: el("span", { className: "race-score-pos" }),
      fill: el("span", { className: "race-fill" }),
      pts: el("span", { className: "race-score-pts" }),
      points: p.points,
    };
    const chip = el("span", { className: "race-chip", textContent: i + 1 });
    row.li = el("li", {}, chip,
      el("div", {}, el("div", { className: "race-score-top" }, row.name, row.pos), el("div", { className: "race-track" }, row.fill)),
      row.pts);
    row.li.style.setProperty("--c", p.color);
    return row;
  });
  $("scores").replaceChildren(...scoreRows.map(r => r.li));
}

/** Ustawia pionki na środkach ich pól; kilka pionków na jednym polu rozsuwa na boki. */
function layoutTokens(instant = false) {
  if (!tokens.length || !$("board").offsetWidth) return;
  const groups = new Map();
  state.players.forEach((p, i) => groups.set(p.pos, [...(groups.get(p.pos) ?? []), i]));
  const size = tokens[0].offsetWidth;
  for (const [pos, list] of groups) {
    const cell = $(`cell-${pos}`);
    const gap = Math.min(size * 0.82, (cell.offsetWidth - size - 6) / Math.max(1, list.length - 1));
    list.forEach((i, k) => {
      const x = cell.offsetLeft + cell.offsetWidth / 2 + (k - (list.length - 1) / 2) * gap;
      const y = cell.offsetTop + cell.offsetHeight * (pos === 0 ? 0.5 : 0.6);
      const token = tokens[i];
      const active = i === state.turn && !state.finished;
      token.classList.toggle("instant", instant);
      token.classList.toggle("active", active);
      token.style.zIndex = active ? 3 : 2;
      token.style.transform = `translate(${x}px, ${y}px)`;
    });
  }
}

function renderSide() {
  const p = current();
  const name = $("turn-name");
  if (name.textContent !== p.name) {
    name.textContent = p.name;
    replay(name, "swap");
  }
  $("turn-card").style.setProperty("--c", p.color);
  for (const [i, row] of scoreRows.entries()) {
    const pl = state.players[i];
    row.li.classList.toggle("active", i === state.turn && !state.finished);
    row.pos.textContent = `pole ${pl.pos}`;
    row.fill.style.width = `${(pl.pos / FINISH) * 100}%`;
    row.pts.textContent = `${pl.points} pkt`;
    if (pl.points !== row.points) {
      row.points = pl.points;
      replay(row.pts, "pop");
      setTimeout(() => row.pts.classList.remove("pop"), 900);
    }
  }
  const ready = !busy && !state.finished;
  $("btn-roll").disabled = !ready;
  $("btn-roll").classList.toggle("ready", ready);
}

function render() {
  layoutTokens();
  renderSide();
}

function message(html) {
  const box = $("message");
  box.innerHTML = `<span>${html}</span>`;
  replay(box, "in");
}

/** Duży napis na środku planszy, np. „Kolej: Drużyna 2” – znika sam i niczego nie blokuje. */
function banner(html, color) {
  const box = $("banner");
  box.innerHTML = html;
  box.style.setProperty("--c", color);
  replay(box, "show");
}

/** Napis wyskakujący z pola, na którym stoi gracz (np. „+1 pkt”). */
function floatText(p, text, kind = "") {
  const cell = $(`cell-${p.pos}`);
  const node = el("div", { className: `race-float ${kind}`, textContent: text });
  node.style.left = `${cell.offsetLeft + cell.offsetWidth / 2}px`;
  node.style.top = `${cell.offsetTop}px`;
  $("tokens").append(node);
  setTimeout(() => node.remove(), 1500);
}

/** Pierścień wokół pola, na którym zatrzymał się pionek. */
function land(p) {
  const cell = $(`cell-${p.pos}`);
  cell.style.setProperty("--ring", p.color);
  replay(cell, "land");
  setTimeout(() => cell.classList.remove("land"), 800);
}

/** Gwiazdki wylatujące z pola gracza (dobra odpowiedź). */
function sparkle(p) {
  const r = $(`cell-${p.pos}`).getBoundingClientRect();
  window.Celebrate?.play("stars", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
}

// Po zmianie rozmiaru okna pionki trzeba przeliczyć (bez animacji przesuwania).
new ResizeObserver(() => { if (state) layoutTokens(true); }).observe($("board"));

// ---------- Kostka i ruch ----------

// Animacje włącza/wyłącza przycisk w nagłówku (domyślnie włączone, niezależnie od ustawień systemu).
const reducedMotion = () => !prefs.motion;

// Kostka 3D: sześć ścianek z oczkami; obrót sześcianu pokazuje wylosowaną ściankę.
// [obrót X, obrót Y] w stopniach, który ustawia daną ściankę przodem.
const FACE_ROTATION = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
let cube = null;
let spins = 0;

function buildDie() {
  cube = el("div", { className: "race-cube" }, ...[1, 2, 3, 4, 5, 6].map(v =>
    el("div", { className: `race-face f${v}` }, ...Array.from({ length: 9 }, () => el("i")))));
  $("die").replaceChildren(cube);
}

const ROLL_MS = 2200; // czas rzutu – taki sam jak --roll w wyscig.css

function showDie(v) {
  const [x, y] = FACE_ROTATION[v];
  // Każdy rzut dokłada pełne obroty (3 w pionie, 2 w poziomie), więc kostka zawsze toczy się w tę samą stronę
  // i ląduje na właściwej ściance.
  cube.style.transform = `translateZ(calc(var(--d) / -2)) rotateX(${x + spins * 1080}deg) rotateY(${y + spins * 720}deg)`;
  $("die").setAttribute("aria-label", `Kostka: ${v}`);
}

async function rollDie() {
  const die = $("die");
  const v = 1 + Math.floor(Math.random() * 6);
  die.classList.remove("landed");
  spins++;
  showDie(v);
  replay(die, "rolling");
  // Stukot kostki o stół przy każdym odbiciu (w rytmie animacji race-die-bounce).
  diceSound(reducedMotion() ? 400 : ROLL_MS);
  await sleep(reducedMotion() ? 250 : ROLL_MS);
  die.classList.remove("rolling");
  replay(die, "landed");
  await sleep(reducedMotion() ? 0 : 350);
  return v;
}

/** Przesuwa pionek pole po polu do celu; do przodu podskakuje, do tyłu zjeżdża szybciej. */
async function moveTo(p, target) {
  target = Math.max(0, Math.min(FINISH, target));
  const i = state.players.indexOf(p);
  const back = target < p.pos;
  const ms = back ? 110 : 210;
  const body = tokens[i].firstElementChild;
  tokens[i].style.setProperty("--step", `${ms}ms`);
  while (p.pos !== target) {
    p.pos += back ? -1 : 1;
    sfx.step();
    layoutTokens();
    replay(body, "hop");
    await sleep(ms);
  }
  body.classList.remove("hop");
  land(p);
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
  const next = current();
  banner(again ? `↻ <b>${esc(next.name)}</b> rzuca jeszcze raz!` : `Kolej: <b>${esc(next.name)}</b>`, next.color);
}

/** Skutek pola, na którym stanął gracz. Zwraca true, gdy gracz rzuca jeszcze raz. */
async function resolveField(p, from) {
  if (p.pos === FINISH) return finalQuestion(p, from);
  const kind = SPECIAL[p.pos];
  if (kind === "bonus") {
    sfx.bonus();
    message(`<b>${esc(p.name)}</b>: pole <b>+2</b> – dwa pola do przodu!`);
    floatText(p, "+2 pola", "good");
    await sleep(650);
    await moveTo(p, p.pos + 2);
    if (p.pos === FINISH) return finalQuestion(p, from);
    return false;
  }
  if (kind === "trap") {
    sfx.trap();
    message(`<b>${esc(p.name)}</b>: pole <b>−3</b> – trzy pola do tyłu.`);
    floatText(p, "−3 pola", "bad");
    await sleep(650);
    await moveTo(p, p.pos - 3);
    return false;
  }
  if (kind === "again") {
    sfx.bonus();
    message(`<b>${esc(p.name)}</b>: pole <b>↻</b> – rzucasz jeszcze raz!`);
    floatText(p, "↻ jeszcze raz", "again");
    return true;
  }
  if (kind === "challenge") {
    const risk = await askChallenge(p);
    const ok = await askQuestion(p, risk ? "Wyzwanie ⚡" : "Pytanie");
    if (risk) {
      if (ok) {
        p.points++;
        message(`<b>${esc(p.name)}</b> wygrywa wyzwanie: <b>+3 pola</b> i punkt!`);
        floatText(p, "⚡ +3 pola", "gold");
        sparkle(p);
        renderSide();
        await sleep(500);
        await moveTo(p, p.pos + 3);
        if (p.pos === FINISH) return finalQuestion(p, from);
      } else {
        message(`<b>${esc(p.name)}</b> przegrywa wyzwanie: <b>−3 pola</b>.`);
        floatText(p, "−3 pola", "bad");
        await sleep(500);
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
    floatText(p, "+1 pkt", "good");
    sparkle(p);
    renderSide();
    await sleep(700);
  } else {
    message(`<b>${esc(p.name)}</b>: niestety źle – powrót na pole ${from}.`);
    floatText(p, "↩ powrót", "bad");
    await sleep(450);
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
    layoutTokens();
    renderSide();
    banner(`🏆 <b>${esc(p.name)}</b> wygrywa!`, p.color);
    window.Celebrate?.finale();
    await sleep(2400);
    return false;
  }
  message(`<b>${esc(p.name)}</b>: zła odpowiedź na mecie – powrót na pole ${from}.`);
  floatText(p, "↩ powrót", "bad");
  await sleep(450);
  await moveTo(p, from);
  return false;
}

// ---------- Okna: pytanie i wyzwanie ----------

let dialogKeys = null; // obsługa klawiszy w otwartym oknie

/** Zamyka okno z krótką animacją wyjścia. */
async function closeDialog(dlg) {
  dlg.classList.add("closing");
  await sleep(reducedMotion() ? 0 : 170);
  dlg.classList.remove("closing");
  dlg.close();
}

function askChallenge(p) {
  return new Promise(resolve => {
    const dlg = $("dlg-challenge");
    $("challenge-who").textContent = p.name;
    $("challenge-who").style.color = p.color;
    let closed = false;
    const done = async risk => {
      if (closed) return;
      closed = true;
      dialogKeys = null;
      await closeDialog(dlg);
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
    dlg.style.setProperty("--c", p.color);
    $("q-who").textContent = p.name;
    $("q-kind").textContent = kind;
    $("q-cat").textContent = cat ? `${cat.icon} ${cat.name}` : "";
    $("q-text").textContent = q.q;
    $("q-feedback").textContent = "";
    $("q-feedback").className = "race-feedback";
    $("btn-next").classList.add("hidden");
    // Odpowiedzi wjeżdżają po kolei (--i steruje opóźnieniem animacji).
    const buttons = answers.map((a, i) => {
      const b = el("button", { type: "button", className: "race-answer" },
        el("span", { className: "race-letter", textContent: LETTERS[i] }), el("span", { textContent: a }));
      b.style.setProperty("--i", i);
      return b;
    });
    $("q-answers").replaceChildren(...buttons);

    // Licznik czasu
    let timerId = null;
    const bar = $("q-timer");
    bar.classList.toggle("hidden", !state.timer);
    bar.classList.remove("low");
    if (state.timer) {
      const end = performance.now() + state.timer * 1000;
      let lastSec = state.timer;
      const span = $("q-timer-bar");
      const tick = () => {
        const left = Math.max(0, end - performance.now());
        span.style.width = `${(left / (state.timer * 1000)) * 100}%`;
        bar.classList.toggle("low", left < 5000);
        const sec = Math.ceil(left / 1000);
        $("q-secs").textContent = sec;
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
      bar.classList.remove("low");
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
      let closed = false;
      next.onclick = async () => {
        if (closed) return;
        closed = true;
        dialogKeys = null;
        await closeDialog(dlg);
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
  $("summary-winner").textContent = w ? `🏆 Wygrywa ${w.name}!` : "Gra zakończona przed metą";
  const rank = ranking();
  // Podium: drugie miejsce po lewej, pierwsze w środku, trzecie po prawej; słupki rosną od najniższego.
  const top = rank.slice(0, 3);
  const order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
  $("podium").replaceChildren(...order.map(k => {
    const col = el("div", { className: `race-podium-col p${k + 1}` },
      el("div", { className: "race-podium-medal", textContent: ["🥇", "🥈", "🥉"][k] }),
      el("div", { className: "race-podium-name", textContent: top[k].name }),
      el("div", { className: "race-podium-bar", textContent: k + 1 }));
    col.style.setProperty("--c", top[k].color);
    return col;
  }));
  const chip = p => {
    const c = el("span", { className: "race-chip", textContent: p.i + 1 });
    c.style.setProperty("--c", p.color);
    return c;
  };
  $("summary-body").replaceChildren(...rank.map((p, k) => el("tr", {},
    el("td", { textContent: k + 1 }),
    el("td", { className: "text" }, el("span", { className: "race-who" }, chip(p), p.name)),
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

// Przełączniki segmentowe (grupy radio): liczba graczy i czas na odpowiedź.
const seg = {
  get: id => +($(id).querySelector("input:checked")?.value ?? 0),
  set: (id, value) => {
    const input = $(id).querySelector(`input[value="${value}"]`) ?? $(id).querySelector("input");
    input.checked = true;
  },
};

function renderNames() {
  const n = seg.get("player-count");
  const box = $("player-names");
  const old = [...box.querySelectorAll("input")].map(i => i.value);
  // Istniejące pola zostają (bez ponownej animacji), dokładamy albo zdejmujemy tylko końcowe.
  while (box.children.length > n) box.lastElementChild.remove();
  for (let i = box.children.length; i < n; i++) {
    const input = el("input", { maxLength: 30, value: old[i] ?? prefs.names[i] ?? `Drużyna ${i + 1}`, ariaLabel: `Nazwa gracza ${i + 1}` });
    const label = el("label", { className: "race-name" }, el("span", { className: "race-chip", textContent: i + 1 }), input);
    label.style.setProperty("--c", COLORS[i]);
    box.append(label);
  }
}

function renderCategories() {
  const all = allQuestions();
  $("category-list").replaceChildren(...categories().map(c => {
    const count = all.filter(q => q.c === c.id).length;
    const box = el("input", { type: "checkbox", value: c.id, checked: prefs.cats.includes(c.id) });
    return el("label", { className: "race-cat" }, box,
      el("span", { className: "race-cat-icon", textContent: c.icon }),
      el("span", { className: "race-cat-name", textContent: c.name }),
      el("span", { className: "race-cat-count", textContent: count }));
  }));
}

function checkAllCategories(on) {
  for (const box of document.querySelectorAll("#category-list input")) box.checked = on;
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
  seg.set("player-count", prefs.count);
  $("player-names").replaceChildren();
  renderNames();
  $("own-text").value = prefs.own;
  const own = parseOwn(prefs.own);
  $("own-count").textContent = own.questions.length;
  $("own-error").textContent = own.error;
  renderCategories();
  seg.set("timer", prefs.timer);
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
  const timer = seg.get("timer");
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
  showDie(1);
  message(`Kolej: <b>${esc(current().name)}</b> – rzuć kostką!`);
  layoutTokens(true);
  renderSide();
  setTimeout(() => banner(`Kolej: <b>${esc(current().name)}</b>`, current().color), 900);
}

function playAgain() {
  newGame(state.players.map(p => p.name), state.cats, state.timer);
  startBoard();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- Przyciski i klawisze ----------

function showMotion() {
  $("btn-motion").setAttribute("aria-pressed", prefs.motion);
  $("btn-motion").classList.toggle("off", !prefs.motion);
  document.body.classList.toggle("no-motion", !prefs.motion);
  window.Celebrate?.setMotion(prefs.motion);
}

function showSound() {
  $("btn-sound").setAttribute("aria-pressed", prefs.sound);
  $("btn-sound").classList.toggle("off", !prefs.sound);
  $("sound-icon").textContent = prefs.sound ? "🔊" : "🔇";
}

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
$("btn-again").addEventListener("click", playAgain);
$("btn-players").addEventListener("click", showSetup);
$("btn-copy").addEventListener("click", copyList);
$("btn-rules").addEventListener("click", () => $("dlg-rules").showModal());
$("btn-rules-close").addEventListener("click", () => $("dlg-rules").close());
$("btn-sound").addEventListener("click", () => { prefs.sound = !prefs.sound; savePrefs(); showSound(); });
$("btn-motion").addEventListener("click", () => { prefs.motion = !prefs.motion; savePrefs(); showMotion(); });
$("btn-cats-all").addEventListener("click", () => checkAllCategories(true));
$("btn-cats-none").addEventListener("click", () => checkAllCategories(false));
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

showSound();
showMotion();
buildDie();
showSetup();
