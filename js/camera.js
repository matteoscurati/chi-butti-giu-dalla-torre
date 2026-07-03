// camera.js — camera verticale (pan intro, follow caduta) con shake trauma-based
// e kick direzionale (game feel, Eiserloh). Niente roll né zoom: la camera applica
// una sola translate intera, così i pixel del mondo restano sulla griglia.
(function () {
  "use strict";
  const Game = window.Game;
  const cfg = Game.cfg;
  const U = Game.util;

  const cam = (Game.camera = {
    y: cfg.GROUND_Y - cfg.H,   // bordo superiore del viewport nel mondo
    trauma: 0,                 // 0..1 -> shake = trauma^2
    kickX: 0, kickY: 0,        // impulso direzionale (spinta/rinculo), decade
    _ox: 0, _oy: 0,
  });

  // limiti verticali del viewport
  cam.minY = cfg.DUEL_CAM_Y;                       // più in alto (mostra la cima)
  cam.maxY = cfg.GROUND_Y - cfg.H * 0.72;          // più in basso (mostra il suolo)

  cam.clampY = function (y) { return U.clamp(y, cam.minY, cam.maxY); };
  cam.set = function (y) { cam.y = cam.clampY(y); };

  // segue un target mondo mantenendolo a ~42% dell'altezza
  cam.follow = function (worldY) {
    const target = cam.clampY(worldY - cfg.H * 0.42);
    cam.y = U.lerp(cam.y, target, 0.18);
  };

  // ---- trauma / shake ----
  cam.addTrauma = function (a) { cam.trauma = U.clamp(cam.trauma + a, 0, 1); };
  // compat con lo shake precedente: mag -> trauma
  cam.shake = function (mag, dur) { cam.addTrauma(U.clamp(mag / 10, 0.12, 1)); };
  // impulso direzionale (spinta): bias orizzontale + un po' di trauma
  cam.punch = function (px, py, trauma) {
    cam.kickX += px || 0; cam.kickY += py || 0;
    cam.addTrauma(trauma == null ? 0.35 : trauma);
  };

  cam.update = function (dt) {
    // kick decay (esponenziale rapido)
    const kd = Math.pow(0.0009, dt);
    cam.kickX *= kd; cam.kickY *= kd;
    if (Math.abs(cam.kickX) < 0.05) cam.kickX = 0;
    if (Math.abs(cam.kickY) < 0.05) cam.kickY = 0;

    if (cam.trauma > 0) {
      cam.trauma = Math.max(0, cam.trauma - 1.4 * dt);   // decadimento lineare
      const s = cam.trauma * cam.trauma;                 // shake = trauma^2
      const tt = performance.now() / 1000;
      const maxOff = 15;
      cam._ox = maxOff * s * U.noise1D(101, tt * 24);        // bias orizzontale (ampio)
      cam._oy = maxOff * 0.65 * s * U.noise1D(202, tt * 24);
    } else {
      cam._ox = 0; cam._oy = 0;
    }
  };

  // applica la trasformazione: world -> schermo (una sola translate intera)
  cam.apply = function (ctx) {
    ctx.translate(Math.round(cam.kickX + cam._ox), Math.round(-cam.y + cam.kickY + cam._oy));
  };

  // converte un punto schermo in coord mondo (al netto di shake/kick)
  cam.screenToWorld = function (sx, sy) {
    return { x: sx - cam._ox - cam.kickX, y: sy + cam.y - cam._oy - cam.kickY };
  };
})();
