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

    // --- mattoni con ombreggiatura cilindrica per-mattone (niente gradienti) ---
    // shadeHex: moltiplica i canali di #rrggbb (duplicato locale: sprites.js è off-limits)
    function shadeHex(hex, mult) {
      const r = U.clamp(Math.round(parseInt(hex.slice(1, 3), 16) * mult), 0, 255);
      const gg = U.clamp(Math.round(parseInt(hex.slice(3, 5), 16) * mult), 0, 255);
      const b = U.clamp(Math.round(parseInt(hex.slice(5, 7), 16) * mult), 0, 255);
      return "#" + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
    }
    const brickH = 12, brickW = 26, mortar = "#3d2f2a";
    const bricks = ["#8a6552", "#7d5a48", "#946b56", "#71503f", "#835d4b"];
    // rampa: 7 livelli di luce × 5 colori base = 35 tinte, calcolate una volta
    const SHADE_MULT = [1.12, 1.0, 0.84, 0.68, 0.52, 0.40, 0.30];
    const ramp = SHADE_MULT.map((m) => bricks.map((hex) => shadeHex(hex, m)));
    const THRESH = [0.32, 0.55, 0.75, 0.90];   // confini colonna in frazione di R
    // fondo di malta opaco: i gap di 1px tra mattoni non devono lasciar trasparire il cielo
    g.fillStyle = mortar;
    g.fillRect(left, bodyTop, R * 2, bodyBot - bodyTop);
    for (let y = bodyTop; y < bodyBot; y += brickH) {
      const row = Math.floor((y - bodyTop) / brickH);
      const off = row % 2 ? brickW / 2 : 0;
      // scurimento crescente verso la base (sostituisce il vecchio gradiente verticale)
      const distBot = bodyBot - y;
      const extraDark = distBot < 10 * brickH ? 2 : distBot < 20 * brickH ? 1 : 0;
      for (let x = left - brickW; x < right + brickW; x += brickW) {
        const bx = x + off;
        const w = Math.min(bx + brickW - 1, right) - Math.max(bx, left);
        if (w <= 0) continue;
        const brickIdx = U.hash(row * 131 + Math.round(bx)) % bricks.length;
        // livello colonna: distanza dal centro come frazione di R (0 = chiaro, 4 = scuro)
        const d = Math.abs((bx + brickW / 2) - ox) / R;
        let level = d < 0.32 ? 0 : d < 0.55 ? 1 : d < 0.75 ? 2 : d < 0.90 ? 3 : 4;
        // dither di transizione: vicino a un confine alterna i due livelli per riga
        for (let ti = 0; ti < THRESH.length; ti++) {
          if (Math.abs(d - THRESH[ti]) <= 0.04) { level = (row & 1) ? ti + 1 : ti; break; }
        }
        g.fillStyle = ramp[Math.min(6, level + extraDark)][brickIdx];
        g.fillRect(Math.max(bx, left), y, w, brickH - 1);
      }
      // mortaio orizzontale
      g.fillStyle = mortar;
      g.fillRect(left, y + brickH - 1, R * 2, 1);
    }

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

    // --- piattaforma (ellissi pixel) ---
    U.pixelEllipse(g, ox, bodyTop + 4, R - 4, Math.round((R - 4) * 0.32), "#8c8494");
    U.pixelEllipse(g, ox, bodyTop + 6, R - 8, Math.round((R - 8) * 0.3), "#6c6478");
    // lastre (linee a gradini pixel)
    g.fillStyle = "#5a5266";
    for (let a = -2; a <= 2; a++) {
      for (let yy = 0; yy <= 12; yy += 2) {
        const x = Math.round(U.lerp(ox + a * 14, ox + a * 22, yy / 12));
        g.fillRect(x, bodyTop + 2 + yy, 1, 2);
      }
    }

    // --- porta alla base + finestrelle ---
    g.fillStyle = "#241814";
    const doorY = bodyBot - 54;
    g.fillRect(ox - 12, doorY, 24, 54);
    // arco: ellisse piena, la metà inferiore cade nel rettangolo già pieno (stesso colore)
    U.pixelEllipse(g, ox, doorY, 12, 12, "#241814");
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
    g.fillStyle = U.palette.forest;
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
    skyStep = -1;   // forza la ricostruzione della cache cielo
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

  // ---- cielo a bande quantizzate sull'altezza camera (cache offscreen) ----
  let skyCache = null, skyStep = -1;
  const SKY_STEPS = 24;

  // sole bakeato una volta: alone dithered (fa filtrare le bande) + disco pieno
  let sunCache = null;
  function sunSprite() {
    if (sunCache) return sunCache;
    const c = U.makeCanvas(96, 96);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    U.pixelEllipse(g, 48, 48, 44, 44, "#ffe9a8", { dither: true });
    U.pixelEllipse(g, 48, 48, 30, 30, "#ffe9a8");
    sunCache = c;
    return sunCache;
  }

  // ricostruisce il cielo (8 bande solide + 7 cuciture dithered) solo al cambio step
  function buildSky(step) {
    const c = U.makeCanvas(cfg.W, cfg.H);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    const top = mix([28, 26, 74], [58, 120, 190], step / SKY_STEPS);
    const bot = mix([120, 150, 210], [232, 198, 150], step / SKY_STEPS);
    const bandH = Math.ceil(cfg.H / 8);
    for (let i = 0; i < 8; i++) {
      const y = i * bandH;
      g.fillStyle = rgb(mix(top, bot, i / 7));
      g.fillRect(0, y, cfg.W, Math.min(bandH, cfg.H - y));
    }
    // cuciture SNES: 2px dither col colore della banda inferiore, ai 7 confini interni
    for (let i = 1; i < 8; i++) {
      U.ditherRect(g, 0, i * bandH - 1, cfg.W, 2, rgb(mix(top, bot, i / 7)), 0.5);
    }
    return c;
  }

  function drawSky(ctx, camY) {
    const horizon = cfg.GROUND_Y;
    // t=0 in cima (cielo alto), t=1 vicino al suolo, quantizzato su 24 step
    const t = U.clamp((camY + cfg.H * 0.5) / horizon, 0, 1);
    const step = Math.round(t * SKY_STEPS);
    if (step !== skyStep) { skyCache = buildSky(step); skyStep = step; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(skyCache, 0, 0);
    // sole in alto (sprite bakeato)
    const sunScreenY = 70 - camY * 0.12;
    if (sunScreenY > -60 && sunScreenY < cfg.H) {
      ctx.drawImage(sunSprite(), Math.round(cfg.W - 70 - 48), Math.round(sunScreenY - 48));
    }
  }
  function mix(a, b, t) { return [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)]; }
  function rgb(c) { return "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")"; }

  function drawClouds(ctx, camY, dt) {
    for (const c of clouds) {
      c.x += c.spd * dt;
      if (c.x > cfg.W + 60) c.x = -60;
      const sy = c.y - camY * 0.55;   // parallasse
      if (sy < -50 || sy > cfg.H + 50) continue;
      puff(ctx, Math.round(c.x), Math.round(sy), c.s);
    }
  }
  // silhouette NES: corpo + gobbe bianche opache, riga d'ombra argento
  function puff(ctx, x, y, s) {
    ctx.fillStyle = U.palette.white;
    ctx.fillRect(x + Math.round(-20 * s), y + Math.round(-4 * s), Math.round(40 * s), Math.round(10 * s));
    ctx.fillRect(x + Math.round(-8 * s), y + Math.round(-10 * s), Math.round(16 * s), Math.round(6 * s));
    ctx.fillRect(x + Math.round(-16 * s), y + Math.round(-8 * s), Math.round(8 * s), Math.round(5 * s));
    ctx.fillRect(x + Math.round(4 * s), y + Math.round(-8 * s), Math.round(11 * s), Math.round(5 * s));
    ctx.fillStyle = U.palette.silver;
    ctx.fillRect(x + Math.round(-18 * s), y + Math.round(4 * s), Math.round(36 * s), Math.round(2 * s));
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
    // zona d'impatto (terra battuta attorno alla base): pre-renderizzata,
    // il dither espanderebbe in migliaia di fillRect a ogni frame
    if (!impactCache) buildImpact();
    ctx.drawImage(impactCache, CX - (R + 40) - 1, gy + 6 - 15);
  }

  // cache della zona d'impatto (bordo dithered + nucleo pieno)
  let impactCache = null;
  function buildImpact() {
    const rx = R + 40, ry = 14;
    const c = U.makeCanvas(rx * 2 + 2, ry * 2 + 2);
    const g = c.getContext("2d");
    U.pixelEllipse(g, rx + 1, ry + 1, rx, ry, "#6e5540", { dither: true });
    U.pixelEllipse(g, rx + 1, ry + 1, R + 30, 10, "#6e5540");
    impactCache = c;
  }

  // ---- pila di corpi ----
  // x = punto d'impatto (dallo stato); viene comunque limitato attorno alla base.
  T.addCorpse = function (id, x, facing) {
    const n = T.corpses.length;
    const level = Math.min(n, 40);
    const px = x == null ? CX + U.rand(-110, 110) : U.clamp(x, CX - 116, CX + 116);
    T.corpses.push({
      id,
      x: px,
      y: cfg.GROUND_Y - 3 - level * 2.0 - U.rand(0, 4),
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
