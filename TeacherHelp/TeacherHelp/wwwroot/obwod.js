"use strict";

// Symulator obwodu: bateria + opornik/żarówka + woltomierz i amperomierz łączone przewodami.
// Każdy zacisk to węzeł; przewody, element, mierniki i bateria to gałęzie. Napięcia węzłów
// liczy analiza węzłowa (bateria jako źródło Nortona), żarówka – iteracyjnie, bo jej opór rośnie z napięciem.

const STATE_KEY = "teacherHelp.circuit";

const R_INTERNAL = 0.2;      // opór wewnętrzny baterii [Ω]
const G_WIRE = 1000;         // przewód: 1 mΩ
const R_AMMETER = 0.05;
const R_VOLTMETER = 1e7;
const G_MIN = 1e-12;         // upływ do masy – węzły bez połączeń nie psują układu równań
const AMMETER_MAX = 1;       // [A] powyżej amperomierz się pali
const SHORT_CURRENT = 2;     // [A] prąd baterii uznawany za zwarcie (najmniejszy opornik daje < 1 A)

// Wartości rzeczywiste lekko odbiegają od nominalnych (15/33/68/150 Ω), jak w prawdziwych opornikach.
// Pokazujemy tylko wartość nominalną – rzeczywistą uczeń może policzyć w arkuszu z U/I.
const BAND = { black: "#1b1b1b", brown: "#7a4a21", orange: "#e8740c", green: "#2f9e44", blue: "#2563eb", grey: "#8a8f98" };
const ELEMENTS = {
  r1: { name: "Opornik 1", nominal: 15, ohms: 15.3, bands: [BAND.brown, BAND.green, BAND.black] },
  r2: { name: "Opornik 2", nominal: 33, ohms: 32.6, bands: [BAND.orange, BAND.orange, BAND.black] },
  r3: { name: "Opornik 3", nominal: 68, ohms: 68.9, bands: [BAND.blue, BAND.grey, BAND.black] },
  r4: { name: "Opornik 4", nominal: 150, ohms: 148.2, bands: [BAND.brown, BAND.green, BAND.brown] },
  bulb: { name: "Żarówka" },
};
const elementLabel = def => def.nominal ? `${def.name} – ${def.nominal} Ω` : def.name;

// Żarówka 12 V / 0,5 A: opór rośnie z napięciem (I ~ U^0,55), na zimno ok. 2,5 Ω.
const BULB = { volts: 12, hotOhms: 24, coldOhms: 2.5, exp: 0.45, watts: 6 };
const bulbOhms = u => Math.max(BULB.coldOhms, BULB.hotOhms * Math.pow(u / BULB.volts, BULB.exp));

// Zaciski: położenie w SVG, kierunek wyjścia przewodu (do krzywej kabla) i biegunowość.
const TERMINALS = {
  "bat+": { x: 265, y: 240, ox: 1, oy: 0, pol: "+" },
  "bat-": { x: 265, y: 360, ox: 1, oy: 0, pol: "-" },
  "el1": { x: 735, y: 240, ox: -1, oy: 0, pol: "" },
  "el2": { x: 735, y: 360, ox: -1, oy: 0, pol: "" },
  "vm+": { x: 455, y: 155, ox: 0, oy: 1, pol: "+" },
  "vm-": { x: 545, y: 155, ox: 0, oy: 1, pol: "-" },
  "am+": { x: 455, y: 445, ox: 0, oy: -1, pol: "+" },
  "am-": { x: 545, y: 445, ox: 0, oy: -1, pol: "-" },
};
const NODES = Object.keys(TERMINALS);
const node = id => NODES.indexOf(id);

const LEADS = { resistor: "M735 240 H850 V360 H735", bulb: "M735 240 H905 V334 H850 V360 H735" };
const WIRE_COLORS = ["red", "black", "blue"]; // kolory w style.css (.wire-line.red itd.)
const DEFAULT_WIRES = [{ a: "bat+", b: "el1", color: "red" }, { a: "el2", b: "bat-", color: "black" }];

const SVG_NS = "http://www.w3.org/2000/svg";
const $ = id => document.getElementById(id);
const svg = $("board");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function storageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* tryb prywatny */ } }

function loadState() {
  const fallback = { wires: DEFAULT_WIRES.map(w => ({ ...w })), element: "r1", voltage: 6, burned: false };
  try {
    const s = JSON.parse(storageGet(STATE_KEY));
    if (!s || !Array.isArray(s.wires)) return fallback;
    return {
      wires: s.wires.filter(w => w && w.a in TERMINALS && w.b in TERMINALS && w.a !== w.b && WIRE_COLORS.includes(w.color)),
      element: s.element in ELEMENTS ? s.element : "r1",
      voltage: Number.isFinite(s.voltage) ? Math.min(12, Math.max(1.5, s.voltage)) : 6,
      burned: !!s.burned,
    };
  } catch {
    return fallback;
  }
}

const state = loadState();
const saveState = () => storageSet(STATE_KEY, JSON.stringify(state));

// ---------- Obliczenia ----------

// Rozwiązuje G·v = i eliminacją Gaussa z wyborem elementu głównego.
function solveLinear(G, rhs) {
  const n = rhs.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(G[r][c]) > Math.abs(G[p][c])) p = r;
    [G[c], G[p]] = [G[p], G[c]];
    [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = c + 1; r < n; r++) {
      const f = G[r][c] / G[c][c];
      if (f === 0) continue;
      for (let k = c; k < n; k++) G[r][k] -= f * G[c][k];
      rhs[r] -= f * rhs[c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = rhs[r];
    for (let k = r + 1; k < n; k++) s -= G[r][k] * x[k];
    x[r] = s / G[r][r];
  }
  return x;
}

// Napięcia wszystkich zacisków względem „−” baterii przy zadanym oporze elementu.
function nodeVoltages(elementOhms) {
  const ground = node("bat-");
  const n = NODES.length - 1;
  const G = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  const row = i => i < ground ? i : i > ground ? i - 1 : -1;
  const addG = (a, b, g) => {
    const ra = row(node(a)), rb = row(node(b));
    if (ra >= 0) G[ra][ra] += g;
    if (rb >= 0) G[rb][rb] += g;
    if (ra >= 0 && rb >= 0) { G[ra][rb] -= g; G[rb][ra] -= g; }
  };
  for (let i = 0; i < n; i++) G[i][i] += G_MIN;
  for (const w of state.wires) addG(w.a, w.b, G_WIRE);
  addG("bat+", "bat-", 1 / R_INTERNAL);
  rhs[row(node("bat+"))] += state.voltage / R_INTERNAL;
  addG("el1", "el2", 1 / elementOhms);
  addG("vm+", "vm-", 1 / R_VOLTMETER);
  if (!state.burned) addG("am+", "am-", 1 / R_AMMETER);
  const x = solveLinear(G, rhs);
  return id => node(id) === ground ? 0 : x[row(node(id))];
}

function simulate() {
  let ohms, v;
  if (state.element === "bulb") {
    ohms = BULB.coldOhms;
    for (let i = 0; i < 80; i++) {
      v = nodeVoltages(ohms);
      const target = bulbOhms(Math.abs(v("el1") - v("el2")));
      if (Math.abs(target - ohms) < 1e-7 * ohms) break;
      ohms = (ohms + target) / 2;
    }
  } else {
    ohms = ELEMENTS[state.element].ohms;
  }
  v = nodeVoltages(ohms);
  const uEl = v("el1") - v("el2");
  return {
    volts: v("vm+") - v("vm-"),
    amps: state.burned ? 0 : (v("am+") - v("am-")) / R_AMMETER,
    elementAmps: uEl / ohms,
    elementWatts: uEl * uEl / ohms,
    batteryAmps: (state.voltage - (v("bat+") - v("bat-"))) / R_INTERNAL,
    wireAmps: state.wires.map(w => (v(w.a) - v(w.b)) * G_WIRE),
  };
}

// ---------- Rysowanie ----------

function cablePath(a, b, outB) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const k = Math.min(150, Math.max(30, dist * 0.35));
  const sag = Math.min(60, 10 + dist * 0.08);
  const c1 = [a.x + a.ox * k, a.y + a.oy * k + sag];
  const c2 = outB ? [b.x + b.ox * k, b.y + b.oy * k + sag] : [b.x, b.y + sag];
  return `M${a.x} ${a.y} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${b.x} ${b.y}`;
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.append(e);
  return e;
}

function renderPosts() {
  const layer = $("posts");
  for (const [id, t] of Object.entries(TERMINALS)) {
    const kind = t.pol === "+" ? "plus" : t.pol === "-" ? "minus" : "neutral";
    const g = el("g", { class: `post ${kind}`, "data-t": id, transform: `translate(${t.x} ${t.y})` }, layer);
    el("circle", { r: 22, class: "post-hit" }, g);
    el("circle", { r: 12, class: "post-ring" }, g);
    el("circle", { r: 7, class: "post-cap" }, g);
  }
}

// Kropki prądu: przerywana linia przesuwana co klatkę, prędkość rośnie z natężeniem.
const flows = [];

function flowSpeed(amps) {
  const a = Math.abs(amps);
  if (a < 5e-4) return 0;
  return Math.sign(amps) * Math.min(320, 240 * Math.sqrt(a));
}

function renderWires(result) {
  const layer = $("wires");
  layer.replaceChildren();
  flows.length = 0;
  state.wires.forEach((w, i) => {
    const d = cablePath(TERMINALS[w.a], TERMINALS[w.b], true);
    const g = el("g", { class: "wire", "data-i": i }, layer);
    el("path", { d, class: "wire-shadow" }, g);
    el("path", { d, class: `wire-line ${w.color}` }, g);
    const flow = el("path", { d, class: "flow" }, g);
    el("path", { d, class: "wire-hit" }, g).append(Object.assign(document.createElementNS(SVG_NS, "title"),
      { textContent: "Kliknij, aby usunąć przewód" }));
    flows.push({ path: flow, speed: flowSpeed(result.wireAmps[i]), offset: 0 });
  });
  // Wewnątrz baterii prąd płynie od „−” do „+” (ścieżka flow-bat jest tak narysowana).
  flows.push({ path: $("flow-bat"), speed: flowSpeed(result.batteryAmps), offset: 0 });
  flows.push({ path: $("flow-el"), speed: flowSpeed(result.elementAmps), offset: 0 });
  for (const f of flows) f.path.classList.toggle("hidden", f.speed === 0);
}

let lastFrame = performance.now();
function animate(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!reduceMotion) {
    for (const f of flows) {
      if (!f.speed) continue;
      f.offset = (f.offset - f.speed * dt) % 1000;
      f.path.style.strokeDashoffset = f.offset;
    }
  }
  requestAnimationFrame(animate);
}

function renderElement(result) {
  const isBulb = state.element === "bulb";
  $("resistor").classList.toggle("hidden", isBulb);
  $("bulb").classList.toggle("hidden", !isBulb);
  $("lead-el").setAttribute("d", isBulb ? LEADS.bulb : LEADS.resistor);
  $("flow-el").setAttribute("d", isBulb ? LEADS.bulb : LEADS.resistor);
  $("el-name").textContent = elementLabel(ELEMENTS[state.element]);
  if (isBulb) {
    const b = Math.min(1, Math.max(0, result.elementWatts / BULB.watts));
    $("bulb-glow").setAttribute("opacity", Math.pow(b, 0.6).toFixed(3));
    $("bulb-glass").style.fillOpacity = (0.15 + 0.6 * b).toFixed(3);
    $("filament").style.stroke = b < 0.01 ? "" : `hsl(${30 + 25 * b} 100% ${45 + 45 * b}%)`;
  } else {
    ELEMENTS[state.element].bands.forEach((c, i) => $(`band${i}`).setAttribute("fill", c));
  }
}

function renderHints(result) {
  const hints = [];
  const short = !state.burned && Math.abs(result.batteryAmps) > SHORT_CURRENT;
  if (state.burned) hints.push("🔥 Amperomierz jest spalony – wymień go, żeby mierzyć natężenie.");
  if (short) hints.push("⚠ Zwarcie baterii! Prąd płynie z pominięciem opornika – usuń przewód.");
  // Szeregowo: przez element płynie ten sam znikomy prąd co przez woltomierz (równolegle byłby dużo większy).
  const vmAmps = Math.abs(result.volts) / R_VOLTMETER;
  if (vmAmps > 1e-8 && Math.abs(result.elementAmps) > 0.5 * vmAmps && Math.abs(result.elementAmps) < 2 * vmAmps)
    hints.push("Woltomierz jest podłączony szeregowo – ma ogromny opór, więc prąd prawie nie płynie, a miernik " +
      "pokazuje napięcie baterii. Woltomierz podłącza się równolegle do badanego elementu.");
  if (result.volts < -0.01) hints.push("Woltomierz pokazuje minus – przewody przy + i COM są zamienione.");
  if (result.amps < -0.001) hints.push("Amperomierz pokazuje minus – przewody przy + i COM są zamienione.");
  $("hints").replaceChildren(...hints.map(h => Object.assign(document.createElement("li"), { textContent: h })));
  $("battery").classList.toggle("short", short);
  $("replace-ammeter").classList.toggle("hidden", !state.burned);
  $("ammeter").classList.toggle("burned", state.burned);
  svg.classList.toggle("am-burned", state.burned);
}

// ---------- Odczyty z fluktuacją ----------

let current = null;

function gauss() {
  return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

// Jak prawdziwy miernik: drobny szum względny i drganie ostatniej cyfry; zero pokazuje stabilnie.
function reading(value, digits) {
  const step = Math.pow(10, -digits);
  if (Math.abs(value) < step / 2) return (0).toFixed(digits).replace(".", ",");
  const noisy = value * (1 + gauss() * 0.003) + gauss() * step * 0.4;
  const text = noisy.toFixed(digits);
  return (Number(text) === 0 ? (0).toFixed(digits) : text).replace(".", ",");
}

function tickMeters() {
  if (!current) return;
  $("vm-value").textContent = reading(current.volts, 2);
  $("am-value").textContent = state.burned ? "" : reading(current.amps, 3);
}

// ---------- Stan i zdarzenia ----------

function update() {
  let result = simulate();
  if (!state.burned && Math.abs(result.amps) > AMMETER_MAX) {
    state.burned = true;
    showBurn(Math.abs(result.amps));
    result = simulate();
  }
  current = result;
  saveState();
  renderWires(result);
  renderElement(result);
  renderHints(result);
  tickMeters();
}

function showBurn(amps) {
  $("burn-current").textContent =
    `Popłynął przez niego prąd ok. ${amps.toFixed(amps < 10 ? 1 : 0).replace(".", ",")} A, a wytrzymuje najwyżej ${AMMETER_MAX} A.`;
  const flash = $("burn-flash");
  flash.classList.remove("go");
  void flash.getBoundingClientRect();
  flash.classList.add("go");
  setTimeout(() => $("burn").showModal(), reduceMotion ? 0 : 700);
}

function replaceAmmeter() {
  state.burned = false;
  state.wires = state.wires.filter(w => !w.a.startsWith("am") && !w.b.startsWith("am"));
  update();
}

function wireColor(a, b) {
  const pol = TERMINALS[a].pol || TERMINALS[b].pol;
  return pol === "+" ? "red" : pol === "-" ? "black" : "blue";
}

function addWire(a, b) {
  if (a === b || state.wires.some(w => (w.a === a && w.b === b) || (w.a === b && w.b === a))) return;
  state.wires.push({ a, b, color: wireColor(a, b) });
  update();
}

// Przeciąganie przewodu albo klik–klik (zacisk zaznaczony czeka na drugi).
let drag = null;
let selected = null;

function svgPoint(e) {
  const p = svg.createSVGPoint();
  p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}

function postAt(p, except) {
  let best = null, bestDist = 28;
  for (const [id, t] of Object.entries(TERMINALS)) {
    const d = Math.hypot(t.x - p.x, t.y - p.y);
    if (id !== except && d < bestDist) { best = id; bestDist = d; }
  }
  return best;
}

function markPosts() {
  for (const g of $("posts").children) {
    g.classList.toggle("selected", g.dataset.t === selected || g.dataset.t === drag?.from);
    g.classList.toggle("target", g.dataset.t === drag?.target);
  }
}

function select(id) {
  selected = id;
  markPosts();
}

svg.addEventListener("pointerdown", e => {
  const post = e.target.closest(".post");
  if (!post) {
    if (!e.target.closest(".wire")) select(null);
    return;
  }
  e.preventDefault();
  const id = post.dataset.t;
  if (selected && selected !== id) {
    addWire(selected, id);
    select(null);
    return;
  }
  drag = { from: id, x: e.clientX, y: e.clientY, moved: false, target: null };
  svg.setPointerCapture(e.pointerId);
  markPosts();
});

svg.addEventListener("pointermove", e => {
  if (!drag) return;
  if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) drag.moved = true;
  if (!drag.moved) return;
  const p = svgPoint(e);
  drag.target = postAt(p, drag.from);
  const end = drag.target ? TERMINALS[drag.target] : { x: p.x, y: p.y };
  const temp = $("temp-wire");
  temp.setAttribute("d", cablePath(TERMINALS[drag.from], end, !!drag.target));
  temp.classList.remove("hidden");
  markPosts();
});

function endDrag(e, cancelled) {
  if (!drag) return;
  const { from, moved } = drag;
  const target = cancelled ? null : postAt(svgPoint(e), from);
  drag = null;
  $("temp-wire").classList.add("hidden");
  if (moved) {
    if (target) addWire(from, target);
    select(null);
  } else {
    select(selected === from ? null : from);
  }
}
svg.addEventListener("pointerup", e => endDrag(e, false));
svg.addEventListener("pointercancel", e => endDrag(e, true));

$("wires").addEventListener("click", e => {
  const wire = e.target.closest(".wire");
  if (!wire) return;
  state.wires.splice(Number(wire.dataset.i), 1);
  update();
});

document.addEventListener("keydown", e => { if (e.key === "Escape") select(null); });

$("reset-wires").addEventListener("click", () => {
  state.wires = DEFAULT_WIRES.map(w => ({ ...w }));
  update();
});
$("clear-wires").addEventListener("click", () => {
  state.wires = [];
  update();
});
$("replace-ammeter").addEventListener("click", replaceAmmeter);
$("burn").addEventListener("close", () => { if ($("burn").returnValue === "replace") replaceAmmeter(); });

function renderElementChoices() {
  $("elements").replaceChildren(...Object.entries(ELEMENTS).flatMap(([key, def]) => {
    const input = Object.assign(document.createElement("input"),
      { type: "radio", name: "element", value: key, id: `el-${key}`, checked: key === state.element });
    input.addEventListener("change", () => { state.element = key; update(); });
    const label = Object.assign(document.createElement("label"), { htmlFor: input.id });
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    if (def.bands) {
      icon.className = "mini-resistor";
      icon.append(...[...def.bands, "#c9a227"].map(c => Object.assign(document.createElement("i"), { style: `background:${c}` })));
    } else {
      icon.className = "mini-bulb";
      icon.textContent = "💡";
    }
    label.append(icon, document.createTextNode(def.name));
    if (def.nominal) label.append(Object.assign(document.createElement("span"), { className: "el-ohms", textContent: `${def.nominal} Ω` }));
    return [input, label];
  }));
}

const voltage = $("voltage");
function showVoltage() {
  const text = `${state.voltage.toFixed(1).replace(".", ",")} V`;
  $("voltage-value").textContent = text;
  $("bat-volt").textContent = text;
}
voltage.value = state.voltage;
voltage.addEventListener("input", () => {
  state.voltage = Number(voltage.value);
  showVoltage();
  update();
});

renderPosts();
renderElementChoices();
showVoltage();
update();
setInterval(tickMeters, 400);
requestAnimationFrame(animate);
