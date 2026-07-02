// util.js — namespace globale, configurazione e utilità.
// Script classico (niente ES module) per funzionare anche da file://.
(function () {
  "use strict";
  const Game = (window.Game = window.Game || {});

  // ------- Flag di debug (query string) -------
  const params = new URLSearchParams(location.search);
  Game.flags = {
    auto: params.has("auto"),          // partita automatica
    fast: params.has("fast"),          // animazioni x4
    gallery: params.has("gallery"),    // griglia QA volti
    timescale: params.has("fast") ? 4 : 1,
  };

  // ------- Configurazione mondo/gioco -------
  Game.cfg = {
    W: 480,               // risoluzione interna canvas
    H: 600,
    GROUND_Y: 2000,       // y del suolo nel mondo
    TOWER_CX: 240,        // centro torre
    TOWER_R: 100,         // raggio torre (mezza larghezza)
    TOP_Y: 392,           // y dei piedi dei personaggi sulla piattaforma
    FIGHTER_DX: 60,       // offset orizzontale dei due sfidanti dal centro
    DUEL_CAM_Y: 40,       // y (alto viewport) durante il duello
    GRAVITY: 1250,        // px/s^2
    FONT: '"Press Start 2P", monospace',
    MATCH_CHALLENGERS: 15, // sfidanti estratti a caso per partita (oltre a Murgia)
    TOTAL_ROUNDS: 15,     // default, sovrascritto in SM.reset da st.pool.length
  };

  // ------- Utility matematiche -------
  const U = (Game.util = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.rand = (a, b) => a + Math.random() * (b - a);
  U.randInt = (a, b) => Math.floor(U.rand(a, b + 1));
  U.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  U.sign = () => (Math.random() < 0.5 ? -1 : 1);

  // easing
  U.easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  U.easeInOut = (t) => t * t * (3 - 2 * t);       // smoothstep
  U.easeOutBack = (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  U.easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  U.easeInCubic = (t) => t * t * t;

  // value-noise 1D liscio (per shake trauma-based e idle organico). Ritorna [-1,1].
  function _hashF(seed, i) {
    let h = (Math.imul(seed | 0, 374761393) + Math.imul(i | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (h / 4294967295) * 2 - 1;
  }
  U.noise1D = (seed, t) => {
    const i = Math.floor(t), f = t - i;
    const u = f * f * (3 - 2 * f);
    return U.lerp(_hashF(seed, i), _hashF(seed, i + 1), u);
  };

  // Fisher-Yates
  U.shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Hash stabile da stringa (per varianti deterministiche per personaggio)
  U.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  };

  // crea un canvas offscreen
  U.makeCanvas = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  };

  // ellisse "pixel" a righe orizzontali intere (stile retro).
  // opts.thickness: disegna un anello di spessore esatto invece del riempimento pieno.
  // opts.dither: retinatura a scacchiera 50% (si combina con thickness).
  U.pixelEllipse = function (g, cx, cy, rx, ry, color, opts) {
    opts = opts || {};
    cx = Math.round(cx); cy = Math.round(cy);
    rx = Math.round(rx); ry = Math.max(1, Math.round(ry));
    g.fillStyle = color;

    // disegna un segmento orizzontale, pieno o a scacchiera stabile nel mondo
    function seg(x, y, w) {
      if (w <= 0) return;
      if (!opts.dither) { g.fillRect(x, y, w, 1); return; }
      const off = (x + y) & 1;
      for (let px = x + off; px < x + w; px += 2) g.fillRect(px, y, 1, 1);
    }

    const n = opts.thickness;
    const ring = n > 0 && ry - n > 0;
    const ryIn = ring ? ry - n : 0, rxIn = ring ? rx - n : 0;

    for (let dy = -ry; dy <= ry; dy++) {
      const wOut = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) * (dy / ry))));
      if (wOut <= 0) continue;
      if (!ring) { seg(cx - wOut, cy + dy, wOut * 2); continue; }
      const inner = Math.abs(dy) < ryIn;
      const wIn = inner ? Math.round(rxIn * Math.sqrt(Math.max(0, 1 - (dy / ryIn) * (dy / ryIn)))) : 0;
      if (inner && wIn > 0 && wOut - wIn > 0) {
        seg(cx - wOut, cy + dy, wOut - wIn);
        seg(cx + wIn, cy + dy, wOut - wIn);
      } else {
        seg(cx - wOut, cy + dy, wOut * 2);   // riga di calotta: nessuna intersezione interna
      }
    }
  };

  // riempimento dither Bayer 2x2 (matrice 0,2 / 3,1); level tipico 0.25/0.5/0.75
  U.ditherRect = function (g, x, y, w, h, color, level) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const bayer = [[0, 2], [3, 1]];
    const threshold = level * 4;
    g.fillStyle = color;
    for (let py = y; py < y + h; py++) {
      const row = bayer[py & 1];
      for (let bit = 0; bit <= 1; bit++) {
        if (row[bit] >= threshold) continue;
        let px = x + ((bit - (x & 1) + 2) % 2);
        for (; px < x + w; px += 2) g.fillRect(px, py, 1, 1);
      }
    }
  };

  // ------- Palette canonica (unica fonte via CSS :root) -------
  // Il canvas legge gli STESSI hex del DOM: nessuna duplicazione. Ruoli chiave:
  // oro = SOLO vincitore/#1, rosso = pericolo/eliminazione.
  const PAL_KEYS = {
    black: "--db-black", ink: "--db-ink", maroon: "--db-maroon", navy: "--db-navy",
    slate: "--db-slate", brown: "--db-brown", forest: "--db-forest", red: "--db-red",
    gray: "--db-gray", steel: "--db-steel", orange: "--db-orange", silver: "--db-silver",
    green: "--db-green", tan: "--db-tan", cyan: "--db-cyan", gold: "--db-gold",
    white: "--db-white",
  };
  U.palette = {};
  U.readPalette = function () {
    try {
      const cs = getComputedStyle(document.documentElement);
      for (const k in PAL_KEYS) {
        const v = cs.getPropertyValue(PAL_KEYS[k]).trim();
        if (v) U.palette[k] = v;
      }
    } catch (e) { /* file:// senza DOM pronto: fallback sotto */ }
    // fallback DawnBringer-16 se le CSS var non fossero disponibili
    const fb = {
      black: "#140c1c", ink: "#0c0812", maroon: "#442434", navy: "#30346d",
      slate: "#4e4a4e", brown: "#854c30", forest: "#346524", red: "#d04648",
      gray: "#757161", steel: "#597dce", orange: "#d27d2c", silver: "#8595a1",
      green: "#6daa2c", tan: "#d2aa99", cyan: "#6dc2ca", gold: "#dad45e",
      white: "#deeed6",
    };
    for (const k in fb) if (!U.palette[k]) U.palette[k] = fb[k];
    return U.palette;
  };
  U.readPalette();
})();
