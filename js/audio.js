// audio.js — SFX chiptune sintetizzati con WebAudio (nessun asset esterno).
(function () {
  "use strict";
  const Game = window.Game;
  const A = (Game.audio = {});

  let ctx = null;
  let master = null;
  let muted = false;

  A.init = function () {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
  };

  A.resume = function () {
    if (ctx && ctx.state === "suspended") ctx.resume();
  };

  A.setMuted = function (m) {
    muted = m;
    if (master) master.gain.value = m ? 0 : 0.5;
  };
  A.toggleMute = function () { A.setMuted(!muted); return muted; };

  function now() { return ctx.currentTime; }

  // Oscillatore semplice con inviluppo
  function tone(type, f0, f1, t0, dur, vol, dest) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(dest || master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    return o;
  }

  // Rumore bianco bufferizzato
  function noiseBuffer(dur) {
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function noise(t0, dur, vol, filterType, f0, f1) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = src;
    if (filterType) {
      const filt = ctx.createBiquadFilter();
      filt.type = filterType;
      filt.frequency.setValueAtTime(f0, t0);
      if (f1) filt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      src.connect(filt); node = filt;
    }
    node.connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function guard() { if (!ctx || muted) return false; A.resume(); return true; }

  // ----- Effetti -----
  A.click = function () {
    if (!guard()) return;
    tone("square", 660, 880, now(), 0.06, 0.25);
  };

  A.hover = function () {
    if (!guard()) return;
    tone("square", 440, 520, now(), 0.03, 0.12);
  };

  A.gong = function () {
    if (!guard()) return;
    const t = now();
    tone("triangle", 180, 120, t, 0.5, 0.35);
    tone("sine", 90, 70, t, 0.6, 0.3);
  };

  A.riser = function (dur) {
    if (!guard()) return;
    tone("sawtooth", 120, 700, now(), dur || 2.0, 0.15);
  };

  // urlo di caduta: sweep discendente con vibrato + whoosh
  A.scream = function () {
    if (!guard()) return;
    const t = now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const vib = ctx.createOscillator();
    const vibg = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(200, t + 1.1);
    vib.frequency.value = 14; vibg.gain.value = 40;
    vib.connect(vibg).connect(o.frequency);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(master);
    o.start(t); vib.start(t); o.stop(t + 1.25); vib.stop(t + 1.25);
    noise(t, 1.0, 0.06, "bandpass", 800, 300);
  };

  // tonfo d'impatto
  A.thud = function () {
    if (!guard()) return;
    const t = now();
    tone("sine", 120, 45, t, 0.35, 0.5);
    tone("triangle", 80, 40, t, 0.3, 0.4);
    noise(t, 0.18, 0.4, "lowpass", 500, 120);
  };

  A.challenger = function () {
    if (!guard()) return;
    const t = now();
    [523, 659, 784].forEach((f, i) => tone("square", f, f, t + i * 0.09, 0.12, 0.25));
  };

  A.fanfare = function () {
    if (!guard()) return;
    const t = now();
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((f, i) => {
      tone("square", f, f, t + i * 0.13, 0.16, 0.28);
      tone("triangle", f / 2, f / 2, t + i * 0.13, 0.16, 0.15);
    });
  };
})();
