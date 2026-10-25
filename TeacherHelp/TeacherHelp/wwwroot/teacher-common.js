// Wspólne narzędzia modułów panelu nauczyciela (teacher.js, teacher-lesson.js, teacher-survey.js).

export const $ = id => document.getElementById(id);

export function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Results.BadRequest("...") zwraca tekst jako JSON-owy string (w cudzysłowach).
export async function errorText(res) {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "string") return parsed;
  } catch { /* zwykły tekst */ }
  return text || res.statusText;
}

// Po 401 (np. wygasło cookie) panel wraca do ekranu logowania – ustawia to teacher.js.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) { onUnauthorized = handler; }
export function unauthorized() { return onUnauthorized(); }

export async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) {
    await unauthorized();
    throw new Error("Wymagane logowanie");
  }
  if (!res.ok) throw new Error(await errorText(res));
  return res;
}

// Jeden wskaźnik połączenia w nagłówku dla wszystkich hubów panelu.
const offline = new Set();
let connected = false;

function renderStatus() {
  const status = $("status");
  status.textContent = !connected ? "" : offline.size ? "Brak połączenia – łączę ponownie…" : "Połączono";
  status.classList.toggle("offline", connected && offline.size > 0);
}

export function setStatusError(message) {
  $("status").textContent = message;
  $("status").classList.add("offline");
}

// Hub z „dashboardem”: po połączeniu i po każdym wznowieniu pobiera pełny widok, potem dostaje zmiany.
export function dashboardHub(url, render) {
  let connection = null;
  return {
    async start() {
      await this.stop();
      connection = new signalR.HubConnectionBuilder()
        .withUrl(url)
        .withAutomaticReconnect({ nextRetryDelayInMilliseconds: () => 2000 })
        .build();
      connection.on("dashboard", render);
      connection.onreconnecting(() => { offline.add(url); renderStatus(); });
      connection.onreconnected(async () => {
        offline.delete(url);
        renderStatus();
        render(await connection.invoke("GetDashboard"));
      });
      await connection.start();
      connected = true;
      renderStatus();
      render(await connection.invoke("GetDashboard"));
    },
    async stop() {
      offline.delete(url);
      if (connection) {
        const c = connection;
        connection = null;
        await c.stop().catch(() => {});
      }
    },
  };
}

export function resetStatus() {
  connected = false;
  offline.clear();
  renderStatus();
}

// Krótki opis stanu aplikacji na jej kafelku (np. „Sesja trwa · uczniów: 12”).
export function setTileInfo(app, text, live) {
  const info = $(`tile-info-${app}`);
  info.textContent = text;
  info.classList.toggle("live", !!live);
}

// Czy sekcja aplikacji jest teraz na ekranie (focus() w ukrytej sekcji nie działa).
export const isVisible = id => !$(id).closest(".hidden");
