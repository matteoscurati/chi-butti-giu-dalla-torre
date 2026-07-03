// main.js — boot, game loop (rAF), scaling canvas, input, wiring.
(function () {
  "use strict";
  const Game = window.Game;
  const cfg = Game.cfg;
  const UI = Game.ui;
  const SM = Game.states;
  const cam = Game.camera;

  let canvas, ctx, screen, wrap;
  let started = false;
  let last = 0;
  let galleryScroll = 0;

  // ---- controllo tempo (hit-stop / slow-mo), guidato via delta-time (non setTimeout) ----
  let hitstopT = 0, slowT = 0, slowFactor = 0.3;
  Game.time = {
    hitStop(sec) { hitstopT = Math.max(hitstopT, sec); },
    slowMo(sec, factor) { slowT = Math.max(slowT, sec); if (factor != null) slowFactor = factor; },
    clear() { hitstopT = 0; slowT = 0; },
  };

  // ---- scala intera del canvas (pixel-perfect) ----
  function fitCanvas() {
    if (!wrap || !screen) return;
    const availW = wrap.clientWidth, availH = wrap.clientHeight;
    if (availW <= 0 || availH <= 0) return;
    const border = 8; // 4px per lato di #screen
    // scala a passi di 0.25: con blocchi d'arte da 4px, ogni quarto rende
    // il blocco a dimensione intera (2/3/5/6px...) restando pixel-perfect e
    // sfruttando meglio lo schermo rispetto alla sola scala intera.
    // Minimo 0.5 (blocchi 2px): sui telefoni il canvas 640 deve poter scendere.
    const scale = Math.max(0.5, Math.floor(
      4 * Math.min((availW - border) / cfg.W, (availH - border) / cfg.H)
    ) / 4);
    screen.style.width = (cfg.W * scale) + "px";
    screen.style.height = (cfg.H * scale) + "px";
    document.documentElement.style.setProperty("--scale", scale);
  }

  function boot() {
    canvas = document.getElementById("game");
    screen = document.getElementById("screen");
    wrap = document.getElementById("canvas-wrap");
    ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;

    fitCanvas();
    window.addEventListener("resize", fitCanvas);

    UI.init();
    wireInput();

    // carica il font bitmap poi effettua il baking degli sprite
    const fontReady = (document.fonts && document.fonts.load)
      ? Promise.all([
          document.fonts.load('10px "Press Start 2P"'),
          document.fonts.load('20px "Press Start 2P"'),
        ]).catch(() => {})
      : Promise.resolve();

    fontReady.then(() => {
      if (Game.flags.gallery) { bakeThen(startGallery); return; }
      bakeThen(() => {
        Game.tower.init();
        cam.set(cfg.DUEL_CAM_Y);
        UI.showStart();
        if (Game.flags.auto) startGame(false);  // avvio automatico (debug), senza audio
      });
    });

    requestAnimationFrame(loop);
  }

  function bakeThen(done) {
    const chars = window.CHARACTERS || [];
    if (!chars.length) {
      UI.setLoading(1);
      console.error("Nessun personaggio: manca js/data.js (esegui tools/fetch_faces.mjs).");
      done();
      return;
    }
    UI.setLoading(0);
    Game.sprites.bakeAll(
      chars,
      (n, total) => UI.setLoading(n / total),
      () => done()
    );
  }

  function startGame(userGesture) {
    if (started) return;
    UI.hideTitle();
    // l'audio si inizializza solo dopo un gesto utente (evita warning autoplay)
    if (userGesture !== false) { Game.audio.init(); Game.audio.resume(); }
    Game.tower.init();
    SM.startIntro();
    started = true;
  }

  // ---- input ----
  // Su touch niente hover: il PRIMO tap seleziona il bersaglio (stessa
  // evidenziazione dell'hover), il SECONDO tap sullo stesso conferma la spinta.
  let lastPointerTouch = false;

  function wireInput() {
    window.addEventListener("pointerdown", (ev) => {
      lastPointerTouch = ev.pointerType === "touch";
    }, { capture: true, passive: true });

    UI.onStart = () => startGame(true);
    UI.onRematch = () => { SM.startIntro(); };
    UI.onPick = (side) => {
      // touch sul nameplate: primo tap seleziona, secondo conferma
      if (lastPointerTouch && SM.currentPhase() === "await" && SM.st.hoverSide !== side) {
        UI.onHover(side);
        return;
      }
      SM.pickSide(side);
    };
    UI.onHover = (side) => {
      if (SM.currentPhase() !== "await") return;
      SM.st.hoverSide = side;
      if (side) UI.highlight(side); else UI.clearHighlight();
    };

    const toWorld = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const sx = (ev.clientX - rect.left) / rect.width * cfg.W;
      const sy = (ev.clientY - rect.top) / rect.height * cfg.H;
      return cam.screenToWorld(sx, sy);
    };

    canvas.addEventListener("mousemove", (ev) => {
      if (!started) return;
      if (lastPointerTouch) return;   // mousemove sintetico post-tap: ignorato
      const w = toWorld(ev);
      SM.hover(w.x, w.y);
    });
    canvas.addEventListener("click", (ev) => {
      if (!started) { return; }
      Game.audio.resume();
      const w = toWorld(ev);
      // touch sul canvas: primo tap seleziona, tap su vuoto deseleziona
      if (lastPointerTouch && SM.currentPhase() === "await") {
        const side = SM.sideAt(w.x, w.y);
        if (side && SM.st.hoverSide !== side) { UI.onHover(side); return; }
        if (!side && SM.st.hoverSide) { UI.onHover(null); return; }
      }
      SM.click(w.x, w.y);
    });
    canvas.addEventListener("mouseleave", () => { if (started && !lastPointerTouch) SM.hover(-999, -999); });

    // scroll gallery
    window.addEventListener("wheel", (ev) => {
      if (!Game.flags.gallery) return;
      galleryScroll = Math.max(0, galleryScroll + ev.deltaY);
    }, { passive: true });

    // ---- tastiera: ←/→ (o A/D) seleziona, Invio/Spazio conferma o salta,
    //      Esc annulla la selezione, M audio on/off ----
    window.addEventListener("keydown", (ev) => {
      const k = ev.key;
      if (k === "m" || k === "M") {
        const btn = document.getElementById("mute-btn");
        if (btn) btn.click();
        return;
      }
      const confirm = k === "Enter" || k === " ";
      if (confirm) ev.preventDefault();       // niente scroll/attivazioni di default

      // titolo: avvia quando il pulsante è pronto
      if (!started) {
        const btn = document.getElementById("start-btn");
        if (confirm && btn && !btn.classList.contains("hidden")) startGame(true);
        return;
      }
      Game.audio.resume();

      // risultati: rivincita
      const results = document.getElementById("results-screen");
      if (results && !results.classList.contains("hidden")) {
        if (confirm) SM.startIntro();
        return;
      }

      if (SM.currentPhase() === "await") {
        if (k === "ArrowLeft" || k === "a" || k === "A") { ev.preventDefault(); UI.onHover("left"); }
        else if (k === "ArrowRight" || k === "d" || k === "D") { ev.preventDefault(); UI.onHover("right"); }
        else if (k === "Escape") UI.onHover(null);
        else if (confirm && SM.st.hoverSide) SM.pickSide(SM.st.hoverSide);
      } else if (confirm) {
        SM.st.skip = true;                    // salta l'animazione corrente, come il clic
      }
    });
  }

  // ---- gallery ----
  let galleryOn = false;
  function startGallery() {
    galleryOn = true;
    UI.hideTitle();
    document.getElementById("hud").style.visibility = "hidden";
  }

  // ---- loop ----
  function loop(now) {
    const rawDt = last ? (now - last) / 1000 : 0;
    last = now;

    let scale = Game.flags.timescale;
    if (slowT > 0) { slowT -= rawDt; scale *= slowFactor; }
    let simDt = Math.min(rawDt, 0.032) * scale;
    let renderDt = Math.min(rawDt, 0.05);
    if (hitstopT > 0) { hitstopT -= rawDt; simDt = 0; renderDt = 0; }  // freeze totale

    if (galleryOn) {
      Game.sprites.drawGallery(ctx, window.CHARACTERS || [], galleryScroll);
      requestAnimationFrame(loop);
      return;
    }

    if (started) {
      SM.update(simDt);
      SM.render(ctx, renderDt);
    } else {
      // backdrop del titolo: cielo + torre
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      Game.tower.drawBackground(ctx, renderDt);
      ctx.save();
      cam.apply(ctx);
      Game.tower.drawWorld(ctx);
      ctx.restore();
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
