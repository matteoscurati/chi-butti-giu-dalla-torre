// tower.js — cielo/nuvole, torre di mattoni (cache offscreen), suolo, pila di corpi.
(function () {
  "use strict";
  const Game = window.Game;
  const cfg = Game.cfg;
  const U = Game.util;

  const T = (Game.tower = {});
  const CX = cfg.TOWER_CX, R = cfg.TOWER_R;
  const TOP = cfg.TOP_Y;                 // superficie piattaforma (piedi)
  const CACHE_TOP = TOP - 28;            // include i merli posteriori
  const CACHE_W = R * 2 + 16;
  const CACHE_H = cfg.GROUND_Y - CACHE_TOP + 4;

  let towerCache = null;
  const clouds = [];
  T.corpses = [];

  // ---- costruzione cache torre ----
  function buildTower() {
    const c = U.makeCanvas(CACHE_W, CACHE_H);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    const ox = CACHE_W / 2;              // centro torre nella cache
    const toLocal = (y) => y - CACHE_TOP;
    const left = ox - R, right = ox + R;

    const bodyTop = toLocal(TOP);        // corpo cilindrico da qui in giù
    const bodyBot = toLocal(cfg.GROUND_Y);

    // --- mattoni ---
    const brickH = 12, brickW = 26, mortar = "#3d2f2a";
    const bricks = ["#8a6552", "#7d5a48", "#946b56", "#71503f", "#835d4b"];
    for (let y = bodyTop; y < bodyBot; y += brickH) {
      const row = Math.floor((y - bodyTop) / brickH);
      const off = row % 2 ? brickW / 2 : 0;
      for (let x = left - brickW; x < right + brickW; x += brickW) {
        const bx = x + off;
        const h = U.hash(row * 131 + Math.round(bx));
        g.fillStyle = bricks[h % bricks.length];
        const w = Math.min(bx + brickW - 1, right) - Math.max(bx, left);
        if (w <= 0) continue;
        g.fillRect(Math.max(bx, left), y, w, brickH - 1);
      }
      // mortaio orizzontale
      g.fillStyle = mortar;
      g.fillRect(left, y + brickH - 1, R * 2, 1);
    }

    // --- ombreggiatura cilindrica (bordi scuri, centro chiaro) ---
    const grad = g.createLinearGradient(left, 0, right, 0);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.28, "rgba(0,0,0,0.10)");
    grad.addColorStop(0.5, "rgba(255,240,210,0.14)");
    grad.addColorStop(0.72, "rgba(0,0,0,0.10)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = grad;
    g.fillRect(left, bodyTop, R * 2, bodyBot - bodyTop);
    // ombra crescente verso la base
    const vg = g.createLinearGradient(0, bodyBot - 240, 0, bodyBot);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = vg;
    g.fillRect(left, bodyBot - 240, R * 2, 240);

    // bordi netti
    g.fillStyle = "#2c211d";
    g.fillRect(left - 1, bodyTop, 2, bodyBot - bodyTop);
    g.fillRect(right - 1, bodyTop, 2, bodyBot - bodyTop);

    // --- merli posteriori (dietro ai personaggi) ---
    const merlonW = 16, gap = 10, my = toLocal(TOP - 26);
    g.fillStyle = "#6f4f3f";
    for (let x = left + 2; x < right - merlonW; x += merlonW + gap) {
      g.fillRect(x, my, merlonW, 22);
    }
    g.fillStyle = "#5a3f32";
    for (let x = left + 2; x < right - merlonW; x += merlonW + gap) {
      g.fillRect(x, my, merlonW, 3);
    }

    // --- cornicione / mensole appena sotto la piattaforma ---
    g.fillStyle = "#6a4c3d";
    g.fillRect(left - 5, bodyTop + 2, R * 2 + 10, 8);
    g.fillStyle = "#4a342a";
    g.fillRect(left - 5, bodyTop + 10, R * 2 + 10, 2);

    // --- piattaforma (ellisse) ---
    g.fillStyle = "#8c8494";
    g.beginPath();
    g.ellipse(ox, bodyTop + 4, R - 4, (R - 4) * 0.32, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#6c6478";
    g.beginPath();
    g.ellipse(ox, bodyTop + 6, R - 8, (R - 8) * 0.3, 0, 0, Math.PI * 2);
    g.fill();
    // lastre
    g.strokeStyle = "#5a5266"; g.lineWidth = 1;
    for (let a = -2; a <= 2; a++) {
      g.beginPath();
      g.moveTo(ox + a * 14, bodyTop + 2);
      g.lineTo(ox + a * 22, bodyTop + 14);
      g.stroke();
    }

    // --- porta alla base + finestrelle ---
    g.fillStyle = "#241814";
    const doorY = bodyBot - 54;
    g.fillRect(ox - 12, doorY, 24, 54);
    g.beginPath(); g.ellipse(ox, doorY, 12, 12, 0, Math.PI, 0); g.fill();
    g.fillStyle = "#3a2a22";
    g.fillRect(ox - 12, doorY, 24, 3);
    g.fillStyle = "#1c1410";
    for (let i = 0; i < 4; i++) {
      const wy = bodyTop + 120 + i * 260;
      if (wy > bodyBot - 90) break;
      g.fillRect(ox - 26, wy, 10, 18);
      g.fillRect(ox + 16, wy, 10, 18);
    }

    // edera sparsa
    g.fillStyle = "rgba(46,86,40,0.75)";
    for (let i = 0; i < 60; i++) {
      const h = U.hash(i * 977);
      const x = left + (h % (R * 2));
      const y = bodyTop + 40 + ((h >>> 4) % (bodyBot - bodyTop - 80));
      g.fillRect(x, y, 3, 3);
      if ((h >>> 8) & 1) g.fillRect(x + 2, y + 2, 2, 2);
    }

    towerCache = c;
  }

  T.init = function () {
    buildTower();
    clouds.length = 0;
    for (let i = 0; i < 10; i++) {
      clouds.push({
        x: U.rand(0, cfg.W),
        y: U.rand(-40, cfg.GROUND_Y - 300),
        s: U.rand(0.6, 1.4),
        spd: U.rand(3, 9),
      });
    }
    T.corpses.length = 0;
  };

  // ---- cielo con gradiente dipendente dall'altezza camera ----
  function drawSky(ctx, camY) {
    const horizon = cfg.GROUND_Y;
    // t=0 in cima (cielo alto), t=1 vicino al suolo
    const t = U.clamp((camY + cfg.H * 0.5) / horizon, 0, 1);
    const g = ctx.createLinearGradient(0, 0, 0, cfg.H);
    const top = mix([28, 26, 74], [58, 120, 190], t);
    const bot = mix([120, 150, 210], [232, 198, 150], t);
    g.addColorStop(0, rgb(top));
    g.addColorStop(1, rgb(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cfg.W, cfg.H);
    // sole in alto
    const sunScreenY = 70 - camY * 0.12;
    if (sunScreenY > -60 && sunScreenY < cfg.H) {
      ctx.fillStyle = "rgba(255,236,170,0.9)";
      ctx.beginPath(); ctx.arc(cfg.W - 70, sunScreenY, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(255,236,170,0.25)";
      ctx.beginPath(); ctx.arc(cfg.W - 70, sunScreenY, 46, 0, Math.PI * 2); ctx.fill();
    }
  }
  function mix(a, b, t) { return [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)]; }
  function rgb(c) { return "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"; }

  function drawClouds(ctx, camY, dt) {
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    for (const c of clouds) {
      c.x += c.spd * dt;
      if (c.x > cfg.W + 60) c.x = -60;
      const sy = c.y - camY * 0.55;   // parallasse
      if (sy < -50 || sy > cfg.H + 50) continue;
      puff(ctx, c.x, sy, c.s);
    }
  }
  function puff(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 12 * s, 0, Math.PI * 2);
    ctx.arc(x + 14 * s, y + 3 * s, 9 * s, 0, Math.PI * 2);
    ctx.arc(x - 13 * s, y + 3 * s, 8 * s, 0, Math.PI * 2);
    ctx.arc(x + 2 * s, y - 6 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- suolo ----
  function drawGround(ctx) {
    const gy = cfg.GROUND_Y;
    ctx.fillStyle = "#3f7a34";
    ctx.fillRect(0, gy, cfg.W, cfg.H);
    ctx.fillStyle = "#2f5e28";
    ctx.fillRect(0, gy, cfg.W, 6);
    // terra sotto l'erba
    ctx.fillStyle = "#4a3526";
    ctx.fillRect(0, gy + 20, cfg.W, cfg.H);
    // ciuffi d'erba
    ctx.fillStyle = "#4f9640";
    for (let i = 0; i < 40; i++) {
      const h = U.hash(i * 313);
      const x = h % cfg.W;
      ctx.fillRect(x, gy - 3, 2, 4);
      ctx.fillRect(x + 3, gy - 2, 2, 3);
    }
    // zona d'impatto (terra battuta attorno alla base)
    ctx.fillStyle = "rgba(80,60,44,0.6)";
    ctx.beginPath();
    ctx.ellipse(CX, gy + 6, R + 40, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- pila di corpi ----
  // x = punto d'impatto (dallo stato); viene comunque limitato attorno alla base.
  T.addCorpse = function (id, x, facing) {
    const n = T.corpses.length;
    const level = Math.min(n, 40);
    const px = x == null ? CX + U.rand(-96, 96) : U.clamp(x, CX - 100, CX + 100);
    T.corpses.push({
      id,
      x: px,
      y: cfg.GROUND_Y - 3 - level * 1.6 - U.rand(0, 4),
      angle: U.sign() * U.rand(1.35, 1.75),   // ~sdraiato
      facing: facing || U.sign(),
      ft: U.pick([0, 0.15]),                   // varia il frame flail nella pila
    });
  };

  function drawCorpses(ctx) {
    for (const b of T.corpses) {
      Game.sprites.drawRotated(ctx, b.id, b.x, b.y, b.facing, b.angle, 1, b.ft);
    }
  }

  // ---- render mondo completo (con camera applicata all'esterno) ----
  // drawBackground: cielo/nuvole in coordinate schermo (prima della camera)
  T.drawBackground = function (ctx, dt) {
    drawSky(ctx, Game.camera.y);
    drawClouds(ctx, Game.camera.y, dt);
  };

  // drawWorld: torre + suolo + corpi in coordinate mondo (camera già applicata)
  T.drawWorld = function (ctx) {
    if (towerCache) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(towerCache, CX - CACHE_W / 2, CACHE_TOP);
    }
    drawGround(ctx);
    drawCorpses(ctx);
  };
})();
