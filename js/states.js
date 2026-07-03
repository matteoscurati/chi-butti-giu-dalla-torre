// states.js — macchina a stati del gioco (flusso completo del duello).
(function () {
  "use strict";
  const Game = window.Game;
  const cfg = Game.cfg;
  const U = Game.util;
  const cam = Game.camera;
  const A = Game.audio;
  const FX = Game.fx;
  const UI = Game.ui;
  const SP = Game.sprites;

  const SM = (Game.states = {});
  const SW = SP.SW, SH = SP.SH;
  const leftX = cfg.TOWER_CX - cfg.FIGHTER_DX;
  const rightX = cfg.TOWER_CX + cfg.FIGHTER_DX;

  // stato globale della partita
  const st = {
    phase: "boot",
    t: 0,               // timer di fase (secondi)
    pool: [],           // sfidanti (tutti tranne Murgia), mescolati
    nextIndex: 0,
    champion: null,     // fighter corrente sulla torre
    challenger: null,   // sfidante corrente
    left: null, right: null,
    falling: null,      // corpo in caduta
    push: null,
    eliminated: [],     // in ordine di eliminazione (0 = primo buttato giù)
    winner: null,
    camFrom: 0,
    skip: false,
  };
  SM.st = st;

  function makeFighter(char, x, facing) {
    return { char, x, y: cfg.TOP_Y, facing, phase: U.hash(char.id) % 100 / 10, rising: false, feetFrom: 0 };
  }

  function setPhase(p) { st.phase = p; st.t = 0; st.skip = false; }

  // ---------- avvio / reset ----------
  SM.reset = function () {
    const all = window.CHARACTERS || [];
    const murgia = all.find((c) => c.fixed) || all[0];
    st.pool = U.shuffle(all.filter((c) => c !== murgia)).slice(0, cfg.MATCH_CHALLENGERS);
    st.total = st.pool.length + 1;         // partecipanti in questa partita (Murgia + sfidanti estratti)
    cfg.TOTAL_ROUNDS = st.pool.length;     // duelli = sfidanti estratti
    st.nextIndex = 0;
    st.champion = makeFighter(murgia, leftX, 1);
    st.challenger = null;
    st.left = st.champion; st.right = null;
    st.falling = null; st.push = null;
    st.eliminated = [];
    st.winner = null;
    st._resultsShown = false;
    FX.reset();
    if (Game.time) Game.time.clear();
    cam.zoom = 1; cam.zoomTarget = 1; cam.trauma = 0; cam.kickX = 0; cam.kickY = 0;
    Game.tower.corpses.length = 0;
    UI.resetRanking(st.total);
    UI.hideResults();
    UI.hideBanner();
  };

  SM.startIntro = function () {
    SM.reset();
    // primo sfidante subito presente (duello con Murgia)
    st.challenger = makeFighter(st.pool[st.nextIndex++], rightX, -1);
    st.right = st.challenger;
    st.round = 1;
    cam.set(cfg.GROUND_Y - cfg.H);
    setPhase("intro");
    A.riser(3.0);
  };

  // ---------- transizioni principali ----------
  function beginAwait() {
    UI.setNameplates(st.left.char, st.right.char);
    UI.setRound(st.round, cfg.TOTAL_ROUNDS);
    UI.setCanvasPickable(true);
    setPhase("await");
    st.hoverSide = null;
  }

  function doPick(side) {
    if (st.phase !== "await") return;
    const victim = side === "left" ? st.left : st.right;
    const survivor = side === "left" ? st.right : st.left;
    if (!victim || !survivor) return;
    UI.setCanvasPickable(false);
    UI.clearHighlight();
    A.click();
    st.push = {
      survivor, victim, side,
      dir: Math.sign(victim.x - survivor.x) || 1,
      sBaseX: survivor.x,
      hit: false,
    };
    setPhase("push");
  }

  function launchVictim() {
    const v = st.push.victim;
    const outDir = v.x <= cfg.TOWER_CX ? -1 : 1;   // buttato verso l'esterno
    st.falling = {
      id: v.char.id, char: v.char,
      x: v.x, y: cfg.TOP_Y - SH / 2,
      vx: outDir * U.rand(260, 350),
      vy: -320,
      angle: 0, omega: U.sign() * U.rand(4.5, 9),
      facing: v.facing,
    };
    // rimuovi la vittima dallo slot; il superstite diventa campione
    if (st.push.side === "left") { st.left = null; st.champion = st.right; }
    else { st.right = null; st.champion = st.left; }
    FX.scream(st.falling, v.char.fallQuote);
    A.scream();
    Game.time.slowMo(0.45, 0.4);       // slow-mo drammatico alla caduta
    cam.setZoom(1.2);                  // zoom punch-in sul perdente
    setPhase("fall");
  }

  function onImpact() {
    const f = st.falling;
    f.y = cfg.GROUND_Y - SH * 0.32;
    const isFinal = st.nextIndex >= st.pool.length;   // ultimo sfidante -> K.O. finale
    FX.spawnBurst(f.x, cfg.GROUND_Y - 4, isFinal ? 46 : 32);
    FX.shockwave(f.x, cfg.GROUND_Y - 3, { maxR: isFinal ? 156 : 116, squash: 0.3, life: 0.5, color: "235,215,175", width: 8 });
    FX.addDebris(f.x, cfg.GROUND_Y - 4, 4);
    FX.flash(0.5, 0.12);
    FX.ko(f.x, cfg.GROUND_Y - 116);
    Game.time.hitStop(isFinal ? 0.16 : 0.09);
    cam.setZoom(1);                                    // termina il punch-in
    cam.addTrauma(isFinal ? 0.9 : 0.68);
    A.thud();
    Game.tower.addCorpse(f.id, f.x, f.facing);
    // classifica: k-esimo eliminato -> rank (TOTAL - (k-1))
    const rank = st.total - st.eliminated.length;
    st.eliminated.push(f.char);
    UI.setRank(rank, f.char);
    st.falling = null;
    setPhase("impact");
  }

  function afterImpact() {
    if (st.nextIndex >= st.pool.length) {
      // esauriti gli sfidanti -> vittoria del campione
      st.winner = st.champion.char;
      UI.setRank(1, st.winner);
      beginVictory();
    } else {
      st.camFrom = cam.y;
      setPhase("return");
    }
  }

  function beginChallengerEnter() {
    // riposiziona il campione a sinistra
    st.champion.x = leftX; st.champion.facing = 1;
    st.left = st.champion; st.right = null;
    // nuovo sfidante che sbuca dalla botola a destra
    const c = makeFighter(st.pool[st.nextIndex++], rightX, -1);
    c.rising = true; c.y = cfg.TOP_Y + SH; c.feetFrom = cfg.TOP_Y + SH;
    st.challenger = c; st.right = c;
    st.round++;
    UI.setNameplates(st.left.char, st.right.char);
    UI.setRound(st.round, cfg.TOTAL_ROUNDS);
    UI.showBanner();
    A.challenger();
    FX.spawnPoof(rightX, cfg.TOP_Y - 12);
    setPhase("enter");
  }

  function beginVictory() {
    UI.setCanvasPickable(false);
    // il campione al centro della piattaforma, l'altro slot vuoto
    st.champion.x = cfg.TOWER_CX; st.champion.facing = 1;
    st.left = st.champion; st.right = null;
    FX.confettiBurst();
    A.fanfare();
    setPhase("victory");
  }

  // ---------- input ----------
  SM.hover = function (wx, wy) {
    if (st.phase !== "await") return;
    const side = fighterAt(wx, wy);
    if (side !== st.hoverSide) {
      st.hoverSide = side;
      if (side) { UI.highlight(side); A.hover(); }
      else UI.clearHighlight();
    }
  };

  SM.pickSide = function (side) { doPick(side); };  // da nameplate

  SM.click = function (wx, wy) {
    if (st.phase === "await") {
      const side = fighterAt(wx, wy);
      if (side) doPick(side);
      return;
    }
    // clic altrove: salta l'animazione corrente
    st.skip = true;
  };

  function fighterAt(wx, wy) {
    for (const [f, side] of [[st.left, "left"], [st.right, "right"]]) {
      if (!f || f.rising) continue;
      const bx = f.x - SW / 2 - 10, by = f.y - (SH + 16) - 6;
      if (wx >= bx && wx <= bx + SW + 20 && wy >= by && wy <= by + SH + 16 + 12) return side;
    }
    return null;
  }

  // ---------- update ----------
  SM.update = function (dt) {
    cam.update(dt);
    FX.update(dt);
    const ph = st.phase;
    st.t += dt;

    if (ph === "intro") {
      const dur = 3.2;
      let p = st.t / dur;
      if (st.skip) { p = 1; st.skip = false; }
      cam.set(U.lerp(cfg.GROUND_Y - cfg.H, cfg.DUEL_CAM_Y, U.easeInOutCubic(U.clamp(p, 0, 1))));
      if (p >= 1) { A.gong(); beginAwait(); }
    }
    else if (ph === "await") {
      cam.set(cfg.DUEL_CAM_Y);
      // il personaggio puntato "suda freddo": goccioline sopra la testa
      if (st.hoverSide) {
        st.sweatT = (st.sweatT || 0) + dt;
        if (st.sweatT > 0.13) {                 // sudore accelerato sul bersaglio
          st.sweatT = 0;
          const f = st.hoverSide === "left" ? st.left : st.right;
          if (f) FX.spawnSweat(f.x + U.rand(-20, 20), f.y - SH + 8);
        }
      }
      if (Game.flags.auto && st.t > 0.25) doPick(Math.random() < 0.5 ? "left" : "right");
    }
    else if (ph === "push") {
      const dur = 0.16;
      const p = U.clamp(st.t / dur, 0, 1);
      const s = st.push.survivor;
      s.x = st.push.sBaseX + st.push.dir * 26 * Math.sin(p * Math.PI);
      // contatto della spinta: hit-stop + flash + shockwave + kick orizzontale
      if (p >= 0.5 && !st.push.hit) {
        st.push.hit = true;
        const v = st.push.victim;
        const cx = v.x - st.push.dir * 20, cy = cfg.TOP_Y - SH * 0.55;
        Game.time.hitStop(0.08);
        FX.flash(0.3, 0.1);
        FX.shockwave(cx, cy, { maxR: 60, life: 0.3, color: "255,240,210", width: 6 });
        cam.punch(st.push.dir * 12, 0, 0.32);
      }
      if (p >= 1) { s.x = st.push.sBaseX; launchVictim(); }
    }
    else if (ph === "fall") {
      const f = st.falling;
      f.vy += cfg.GRAVITY * dt;
      f.omega += Math.sign(f.omega) * 3.0 * dt;   // il tumbling accelera nella caduta
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.angle += f.omega * dt;
      // rimbalza sui bordi del mondo
      if (f.x < 24) { f.x = 24; f.vx = Math.abs(f.vx) * 0.6; }
      if (f.x > cfg.W - 24) { f.x = cfg.W - 24; f.vx = -Math.abs(f.vx) * 0.6; }
      cam.follow(f.y);
      if (f.y >= cfg.GROUND_Y - SH * 0.32) onImpact();
    }
    else if (ph === "impact") {
      const dur = 0.6;
      if (st.skip) { st.skip = false; st.t = dur; }
      if (st.t >= dur) afterImpact();
    }
    else if (ph === "return") {
      const dur = 0.9;
      let p = st.t / dur;
      if (st.skip) { p = 1; st.skip = false; }
      cam.set(U.lerp(st.camFrom, cfg.DUEL_CAM_Y, U.easeInOutCubic(U.clamp(p, 0, 1))));
      if (p >= 1) beginChallengerEnter();
    }
    else if (ph === "enter") {
      cam.set(cfg.DUEL_CAM_Y);
      const dur = 0.7;
      let p = U.clamp(st.t / dur, 0, 1);
      if (st.skip) { p = 1; st.skip = false; }
      const c = st.challenger;
      c.y = U.lerp(c.feetFrom, cfg.TOP_Y, U.easeOutBack(p));
      if (p >= 1) { c.rising = false; c.y = cfg.TOP_Y; UI.hideBanner(); beginAwait(); }
    }
    else if (ph === "victory") {
      cam.set(cfg.DUEL_CAM_Y);
      if (st.t > (Game.flags.fast ? 0.6 : 1.8) && !st._resultsShown) {
        st._resultsShown = true;
        const ordered = [st.winner].concat(st.eliminated.slice().reverse());
        UI.showResults(st.winner, ordered);
      }
    }
  };

  // ---------- render ----------
  SM.render = function (ctx, dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    Game.tower.drawBackground(ctx, dt);

    ctx.save();
    cam.apply(ctx);
    Game.tower.drawWorld(ctx);

    const t = performance.now() / 1000;

    if (st.phase === "victory" && st.champion) {
      // vincitore che esulta con saltelli sulla piattaforma
      const jump = Math.abs(Math.sin(st.t * 5)) * 24;
      SP.drawBig(ctx, st.champion.char.id, st.champion.x, cfg.TOP_Y - jump, 1, "cheer");
    } else {
      // campione/sfidante in cima (idle), con evidenziazione al hover
      drawTopFighter(ctx, st.left, "left", t);
      drawTopFighter(ctx, st.right, "right", t);
    }

    // corpo in caduta (frame flail alternati + stretch/wind-streaks)
    if (st.falling) {
      const f = st.falling;
      SP.drawRotated(ctx, f.id, f.x, f.y, f.facing, f.angle, 1, t, { vx: f.vx, vy: f.vy });
    }
    // superstite che spinge (durante push è già in st.left/right)

    FX.drawWorld(ctx);
    ctx.restore();

    FX.drawScreen(ctx);

    if (st.phase === "victory") drawVictoryText(ctx, t);
  };

  function drawTopFighter(ctx, f, side, t) {
    if (!f) return;
    const opts = { phase: f.phase };
    if (st.phase === "await" && st.hoverSide === side) {
      opts.danger = true; opts.glow = "#d04648"; opts.tremble = true;
    }
    if (f.rising) {
      // clip: mostra solo la parte sopra la piattaforma (effetto botola)
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, -10000, cfg.W, cfg.TOP_Y + 10000 + 2);
      ctx.clip();
      SP.drawIdle(ctx, f.char.id, f.x, f.y, f.facing, t, opts);
      ctx.restore();
    } else {
      SP.drawIdle(ctx, f.char.id, f.x, f.y, f.facing, t, opts);
    }
  }

  function drawVictoryText(ctx, t) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const s = 1 + Math.sin(t * 4) * 0.06;
    ctx.translate(cfg.W / 2, 100);
    ctx.scale(s, s);
    ctx.font = '48px ' + cfg.FONT;
    ctx.lineWidth = 12; ctx.lineJoin = "round"; ctx.strokeStyle = "#c0293f";
    ctx.strokeText("WINNER!", 0, 0);
    ctx.fillStyle = "#ffd23f";
    ctx.fillText("WINNER!", 0, 0);
    ctx.restore();
  }

  SM.currentPhase = function () { return st.phase; };
})();
