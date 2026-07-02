// fx.js — particelle di polvere, testo fluttuante (urlo/onomatopea), coriandoli.
(function () {
  "use strict";
  const Game = window.Game;
  const cfg = Game.cfg;
  const U = Game.util;

  const FX = (Game.fx = {});
  let particles = [];   // polvere (mondo)
  let texts = [];       // testi fluttuanti (mondo)
  let confetti = [];    // coriandoli (schermo)
  let shocks = [];      // shockwave ring (mondo)
  let debris = [];      // detriti permanenti sulla pila (mondo)
  let flashA = 0, flashDecay = 0;   // impact flash full-screen (schermo)

  FX.reset = function () {
    particles = []; texts = []; confetti = []; shocks = []; debris = [];
    flashA = 0; flashDecay = 0;
  };

  const SCREAMS = ["AAAAH!", "NOOOO!", "MAMMAAA!", "VOLOOO!", "PERCHÉ?!", "ADDIOOO!", "AIUTOOO!"];
  const BOOMS = ["SBAM!", "CRASH!", "PATAPUM!", "TONF!", "BLAM!", "SPLASH!"];
  FX.randomScream = () => U.pick(SCREAMS);

  // ---- polvere ----
  FX.spawnDust = function (x, y, n, color) {
    n = n || 18;
    for (let i = 0; i < n; i++) {
      const a = U.rand(-Math.PI, 0);
      const sp = U.rand(40, 200);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp + U.rand(-30, 30),
        vy: Math.sin(a) * sp - U.rand(10, 60),
        life: U.rand(0.4, 0.9), max: 0.9,
        size: U.randInt(2, 5),
        color: color || (Math.random() < 0.5 ? "#caa878" : "#9a8060"),
      });
    }
  };

  FX.spawnPoof = function (x, y) {
    for (let i = 0; i < 14; i++) {
      const a = U.rand(0, Math.PI * 2);
      const sp = U.rand(20, 90);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: U.rand(0.3, 0.6), max: 0.6, size: U.randInt(2, 4),
        color: "#e8e0f0",
      });
    }
  };

  // burst radiale di polvere/detriti all'atterraggio (gravità/drag già nell'update)
  FX.spawnBurst = function (x, y, n) {
    n = n || 30;
    for (let i = 0; i < n; i++) {
      const a = U.rand(-Math.PI, 0.2);              // prevalentemente verso l'alto/lati
      const sp = U.rand(60, 320);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - U.rand(0, 40),
        life: U.rand(0.4, 1.0), max: 1.0,
        size: U.randInt(2, 6),
        color: Math.random() < 0.5 ? "#caa878" : (Math.random() < 0.5 ? "#9a8060" : "#6e5540"),
      });
    }
  };

  // detriti permanenti che si accumulano attorno alla pila (cap per perf)
  FX.addDebris = function (x, y, n) {
    n = n || 4;
    for (let i = 0; i < n; i++) {
      debris.push({
        x: x + U.rand(-22, 22), y: y - U.rand(0, 3),
        size: U.randInt(2, 4),
        color: Math.random() < 0.5 ? "#7d5a48" : "#6e5540",
      });
    }
    if (debris.length > 90) debris.splice(0, debris.length - 90);
  };

  // shockwave ring che si espande e sfuma dal punto d'impatto (mondo)
  FX.shockwave = function (x, y, opts) {
    opts = opts || {};
    shocks.push({
      x, y, t: 0,
      life: opts.life || 0.4,
      maxR: opts.maxR || 46,
      r0: opts.r0 || 4,
      color: opts.color || "255,255,255",
      width: opts.width || 3,
      squash: opts.squash || 1,          // 1 = cerchio, <1 = ellisse a terra
    });
  };

  // flash full-screen (impact): 1-2 frame di bianco a bassa alpha (schermo)
  FX.flash = function (a, dur) {
    flashA = Math.max(flashA, a == null ? 0.5 : a);
    flashDecay = (a == null ? 0.5 : a) / (dur || 0.12);
  };

  // pop-text "K.O." arcade sul punto d'impatto
  FX.ko = function (x, y) {
    FX.addText("K.O.", x, y, {
      color: "#dad45e", size: 30, life: 1.1, vy: -14, outline: "#d04648", pop: true,
    });
  };

  // ---- testo fluttuante ----
  // opts: {color, size, life, vy, wobble, track, dy, outline}
  FX.addText = function (text, x, y, opts) {
    opts = opts || {};
    texts.push({
      text, x, y,
      vy: opts.vy == null ? -30 : opts.vy,
      t: 0, life: opts.life || 1.2,
      size: opts.size || 10,
      color: opts.color || "#fff",
      outline: opts.outline || "#000",
      wobble: opts.wobble || 0,
      track: opts.track || null,
      dy: opts.dy || 0,
      pop: opts.pop || false,
    });
  };

  // frase biografica urlata in caduta (fallback: urlo generico)
  FX.scream = function (track, text) {
    const t = text || FX.randomScream();
    const size = t.length > 24 ? 8 : (t.length > 16 ? 9 : 10);
    FX.addText(t, track.x, track.y - 40, {
      color: "#fff", size, life: 1.6, track, dy: -50, wobble: 5, outline: "#c0293f",
    });
  };

  // goccioline di sudore freddo sopra la testa del personaggio puntato
  FX.spawnSweat = function (x, y) {
    const n = U.randInt(1, 2);
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: U.sign() * U.rand(18, 52), vy: U.rand(-70, -32),
        life: U.rand(0.4, 0.7), max: 0.7,
        size: 2, color: "#9fe8ff",
      });
    }
  };

  FX.boom = function (x, y) {
    FX.addText(U.pick(BOOMS), x, y - 20, {
      color: "#ffd23f", size: 22, life: 1.0, vy: -18, outline: "#c0293f", pop: true,
    });
  };

  // ---- coriandoli (schermo) ----
  FX.confettiBurst = function () {
    const cols = ["#ffd23f", "#ff2e4c", "#2b8cff", "#5cff9d", "#ff9f1c", "#ff6bd6"];
    for (let i = 0; i < 120; i++) {
      confetti.push({
        x: U.rand(0, cfg.W), y: U.rand(-cfg.H, 0),
        vx: U.rand(-30, 30), vy: U.rand(60, 180),
        size: U.randInt(3, 7), rot: U.rand(0, 6.28), vr: U.rand(-6, 6),
        color: U.pick(cols),
      });
    }
  };

  // ---- update ----
  FX.update = function (dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += 400 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const s = texts[i];
      s.t += dt;
      if (s.track) { s.x = s.track.x; s.y = s.track.y + s.dy; }
      else s.y += s.vy * dt;
      if (s.t >= s.life) texts.splice(i, 1);
    }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.vy += 60 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.y > cfg.H + 20) confetti.splice(i, 1);
    }
    for (let i = shocks.length - 1; i >= 0; i--) {
      const s = shocks[i];
      s.t += dt;
      if (s.t >= s.life) shocks.splice(i, 1);
    }
    if (flashA > 0) { flashA = Math.max(0, flashA - flashDecay * dt); }
  };

  // ---- draw mondo (camera applicata) ----
  FX.drawWorld = function (ctx) {
    // detriti permanenti (sotto le particelle)
    for (const d of debris) {
      ctx.fillStyle = d.color;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
    }
    for (const p of particles) {
      ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // shockwave ring (additivo)
    for (const s of shocks) {
      const k = s.t / s.life;
      const r = U.lerp(s.r0, s.maxR, U.easeOutCubic(k));
      const a = (1 - k) * 0.7;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(" + s.color + ",1)";
      ctx.lineWidth = Math.max(1, s.width * (1 - k));
      ctx.beginPath();
      ctx.ellipse(Math.round(s.x), Math.round(s.y), r, r * s.squash, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const s of texts) {
      const k = s.t / s.life;
      let scale = 1;
      if (s.pop) scale = k < 0.2 ? U.lerp(0.2, 1.15, k / 0.2) : U.lerp(1.15, 1, U.clamp((k - 0.2) / 0.3, 0, 1));
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? U.lerp(1, 0, (k - 0.75) / 0.25) : 1;
      const wob = Math.sin(s.t * 18) * s.wobble;
      ctx.translate(Math.round(s.x + wob), Math.round(s.y));
      ctx.scale(scale, scale);
      ctx.font = s.size + "px " + cfg.FONT;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(3, s.size * 0.35);
      ctx.strokeStyle = s.outline;
      ctx.strokeText(s.text, 0, 0);
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // ---- draw schermo (coriandoli + flash) ----
  FX.drawScreen = function (ctx) {
    for (const c of confetti) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
      ctx.restore();
    }
    if (flashA > 0.003) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = U.clamp(flashA, 0, 1);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cfg.W, cfg.H);
      ctx.restore();
    }
  };
})();
