// camera.js — camera verticale (pan intro, follow caduta) con shake trauma-based,
// roll rotazionale, zoom punch-in e kick direzionale (game feel, Eiserloh).
(function () {
  "use strict";
  const Game = window.Game;
  const cfg = Game.cfg;
  const U = Game.util;

  const cam = (Game.camera = {
    y: cfg.GROUND_Y - cfg.H,   // bordo superiore del viewport nel mondo
    trauma: 0,                 // 0..1 -> shake = trauma^2
    zoom: 1,
    zoomTarget: 1,
    kickX: 0, kickY: 0,        // impulso direzionale (spinta/rinculo), decade
    _ox: 0, _oy: 0, _roll: 0,
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
  // zoom punch-in verso z, poi torna a 1 (gestito da zoomTarget)
  cam.setZoom = function (z) { cam.zoomTarget = z; };

  cam.update = function (dt) {
    // zoom easing
    cam.zoom = U.lerp(cam.zoom, cam.zoomTarget, 1 - Math.pow(0.0025, dt));
    if (Math.abs(cam.zoom - cam.zoomTarget) < 0.002) cam.zoom = cam.zoomTarget;
    // kick decay (esponenziale rapido)
    const kd = Math.pow(0.0009, dt);
    cam.kickX *= kd; cam.kickY *= kd;
    if (Math.abs(cam.kickX) < 0.05) cam.kickX = 0;
    if (Math.abs(cam.kickY) < 0.05) cam.kickY = 0;

    if (cam.trauma > 0) {
      cam.trauma = Math.max(0, cam.trauma - 1.4 * dt);   // decadimento lineare
      const s = cam.trauma * cam.trauma;                 // shake = trauma^2
      const tt = performance.now() / 1000;
      const maxOff = 15, maxRoll = 0.055;
      cam._ox = maxOff * s * U.noise1D(101, tt * 24);        // bias orizzontale (ampio)
      cam._oy = maxOff * 0.65 * s * U.noise1D(202, tt * 24);
      cam._roll = maxRoll * s * U.noise1D(303, tt * 19);
    } else {
      cam._ox = 0; cam._oy = 0; cam._roll = 0;
    }
  };

  // applica la trasformazione: world -> schermo (zoom/roll attorno al centro schermo)
  cam.apply = function (ctx) {
    const z = cam.zoom;
    if (z !== 1 || cam._roll) {
      ctx.translate(cfg.W / 2, cfg.H / 2);
      if (cam._roll) ctx.rotate(cam._roll);
      if (z !== 1) ctx.scale(z, z);
      ctx.translate(-cfg.W / 2, -cfg.H / 2);
    }
    ctx.translate(Math.round(cam.kickX + cam._ox), Math.round(-cam.y + cam.kickY + cam._oy));
  };

  // converte un punto schermo in coord mondo (valido in await: zoom=1, roll=0, offset=0)
  cam.screenToWorld = function (sx, sy) {
    return { x: sx - cam._ox - cam.kickX, y: sy + cam.y - cam._oy - cam.kickY };
  };
})();
