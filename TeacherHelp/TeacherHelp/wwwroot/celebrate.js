"use strict";

// Animacje „zadanie zrobione”. Jeden prosty silnik cząsteczek na płótnie nałożonym na stronę
// (pointer-events: none, więc nie blokuje kliknięć) i zestaw efektów zbudowanych na nim.
const Celebrate = (() => {
  const COLORS = ["#ff4d4d", "#ffb020", "#ffe14d", "#3cc47a", "#3aa0ff", "#8f6bff", "#ff6bd6"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  let canvas = null, ctx = null, particles = [], running = false, last = 0;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.createElement("canvas");
    canvas.className = "celebrate-canvas";
    document.body.append(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // p: { x, y, vx, vy, g (grawitacja), drag, life, ttl, draw(p, alpha), update?(p, dt) }
  function add(p) {
    particles.push(Object.assign({ vx: 0, vy: 0, g: 0, drag: 0, life: 0, rot: 0, vr: 0 }, p));
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // Cząsteczki dodane w trakcie klatki (ślady, wybuchy z onDeath) trafiają do nowej tablicy
    // `particles` i zaczynają żyć od następnej klatki.
    const current = particles;
    particles = [];
    const alive = [];
    for (const p of current) {
      p.life += dt;
      if (p.life >= p.ttl) { p.onDeath?.(p); continue; }
      p.vy += p.g * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.update?.(p, dt);
      const fadeStart = p.fade ?? 0.7;
      const t = p.life / p.ttl;
      const alpha = t < fadeStart ? 1 : 1 - (t - fadeStart) / (1 - fadeStart);
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      p.draw(p);
      ctx.restore();
      alive.push(p);
    }
    particles = alive.concat(particles);
    if (particles.length) requestAnimationFrame(frame);
    else { running = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  const dot = p => { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); };

  function star(p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? p.size * 0.45 : p.size;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  function emoji(p) {
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.font = `${p.size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.char, 0, 0);
  }

  function burst(x, y, count, speed, opts = {}) {
    const color = opts.color ?? pick(COLORS);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.1, 0.1);
      const v = speed * rand(0.4, 1);
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, drag: 1.2,
        ttl: rand(0.9, 1.4), size: rand(1.5, 3), color: opts.multi ? pick(COLORS) : color, draw: dot });
    }
  }

  const effects = {
    fireworks(origin) {
      const count = 4;
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          const x = rand(innerWidth * 0.15, innerWidth * 0.85);
          const targetY = rand(innerHeight * 0.15, innerHeight * 0.45);
          const vy = -Math.sqrt(2 * 600 * (innerHeight - targetY));
          add({ x, y: innerHeight, vx: rand(-40, 40), vy, g: 600, ttl: -vy / 600, fade: 1,
            size: 2.5, color: "#fff3c4", draw: dot,
            update: p => add({ x: p.x, y: p.y, ttl: 0.3, size: 1.5, color: "#ffcf70", draw: dot }),
            onDeath: p => burst(p.x, p.y, 90, 460) });
        }, i * 250);
      }
    },

    confetti() {
      for (let i = 0; i < 160; i++) {
        add({ x: rand(0, innerWidth), y: rand(-innerHeight * 0.4, -10), vx: rand(-30, 30), vy: rand(80, 200),
          g: 30, ttl: rand(2.5, 3.5), fade: 0.8, rot: rand(0, 6), vr: rand(-8, 8),
          w: rand(6, 11), h: rand(3, 6), color: pick(COLORS), phase: rand(0, 6),
          update: (p, dt) => { p.phase += dt * 4; p.x += Math.sin(p.phase) * 40 * dt; },
          draw: p => {
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.cos(p.phase));
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          } });
      }
    },

    balloons() {
      for (let i = 0; i < 14; i++) {
        add({ x: rand(innerWidth * 0.05, innerWidth * 0.95), y: innerHeight + rand(20, 300), vy: rand(-260, -170),
          ttl: rand(3, 4), fade: 0.85, size: rand(18, 30), color: pick(COLORS), phase: rand(0, 6),
          update: (p, dt) => { p.phase += dt * 2; p.x += Math.sin(p.phase) * 25 * dt; },
          draw: p => {
            ctx.strokeStyle = "rgba(120,120,120,.8)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y + p.size * 1.2);
            ctx.quadraticCurveTo(p.x + Math.sin(p.phase) * 8, p.y + p.size * 2, p.x, p.y + p.size * 3);
            ctx.stroke();
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, p.size * 0.85, p.size * 1.1, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(255,255,255,.45)";
            ctx.beginPath();
            ctx.ellipse(p.x - p.size * 0.3, p.y - p.size * 0.4, p.size * 0.18, p.size * 0.3, -0.5, 0, Math.PI * 2);
            ctx.fill();
          } });
      }
    },

    stars(origin) {
      for (let i = 0; i < 36; i++) {
        const a = rand(0, Math.PI * 2), v = rand(150, 480);
        add({ x: origin.x, y: origin.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 250, drag: 1.5,
          ttl: rand(1.2, 1.8), size: rand(7, 14), rot: rand(0, 6), vr: rand(-6, 6), color: pick(COLORS), draw: star });
      }
    },

    emojiRain() {
      const chars = ["🎉", "⭐", "🏆", "👏", "✨", "💯", "🥳", "👍"];
      for (let i = 0; i < 45; i++) {
        add({ x: rand(0, innerWidth), y: rand(-innerHeight * 0.6, -30), vy: rand(150, 300), g: 60,
          ttl: rand(2.6, 3.4), fade: 0.85, size: rand(24, 40), rot: rand(-0.4, 0.4), vr: rand(-1, 1),
          char: pick(chars), draw: emoji });
      }
    },

    rocket(origin) {
      const fromLeft = Math.random() < 0.5;
      const x0 = fromLeft ? -40 : innerWidth + 40;
      const vx = (fromLeft ? 1 : -1) * innerWidth / 1.6;
      add({ x: x0, y: innerHeight * 0.85, vx, vy: -innerHeight / 2.2, ttl: 1.9, fade: 0.9, size: 46,
        // emoji 🚀 leci „w prawo do góry”; przy locie w lewo odbijamy je w poziomie
        draw: p => { ctx.translate(p.x, p.y); if (!fromLeft) ctx.scale(-1, 1); emoji({ ...p, x: 0, y: 0, rot: 0, char: "🚀" }); },
        update: p => {
          for (let i = 0; i < 2; i++)
            add({ x: p.x - Math.sign(vx) * 18, y: p.y + 18, vx: rand(-30, 30), vy: rand(10, 60), drag: 1,
              ttl: rand(0.5, 0.9), size: rand(3, 7), color: pick(["#ffb020", "#ff4d4d", "#cccccc"]), draw: dot });
        },
        onDeath: p => burst(Math.min(Math.max(p.x, 60), innerWidth - 60), Math.max(p.y, 60), 70, 300, { multi: true }) });
    },
  };

  const names = {
    fireworks: "Fajerwerki", confetti: "Konfetti", balloons: "Balony",
    stars: "Gwiazdy", emojiRain: "Deszcz emotek", rocket: "Rakieta",
  };

  function toast(text) {
    const el = document.createElement("div");
    el.className = "celebrate-toast";
    el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  return {
    kinds: Object.keys(effects),
    names,
    /** Odpala efekt `kind`; origin = środek klikniętego kafelka ({x, y} w px okna). */
    play(kind, origin, message) {
      if (message) toast(message);
      if (reducedMotion()) return;
      ensureCanvas();
      (effects[kind] ?? effects.confetti)(origin ?? { x: innerWidth / 2, y: innerHeight / 2 });
    },
    finale(message) {
      if (message) toast(message);
      if (reducedMotion()) return;
      ensureCanvas();
      effects.fireworks();
      effects.confetti();
      setTimeout(() => effects.fireworks(), 1200);
    },
  };
})();
