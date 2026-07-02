// sprites.js — volto foto (testone) + corpo pixel art con abito coerente,
// animazioni (idle/flail/cheer), testa indipendente con bob/tilt, tremolio.
// NB: le immagini locali "sporcano" il canvas: solo drawImage/compositing,
// mai getImageData/toDataURL -> ok anche da file://.
(function () {
  "use strict";
  const Game = window.Game;
  const U = Game.util;

  const S = (Game.sprites = {});
  const SW = 56, SH = 86;
  // Teste più grandi/riconoscibili (bobblehead SF2). FACE = area volto, HEAD = canvas
  // con cornice+outline, PX = risoluzione della foto quantizzata (posterize senza readback).
  const FACE = 52, HEAD = 60, PX = 30;
  const OUTLINE = "#0c0812";         // outline scuro condiviso (ruolo ink)
  const CX = SW / 2;                 // 28
  const HEAD_CY = 25;                // centro testa nello sprite (y dall'alto)
  const NECK_Y = 42;
  const SHOULDER_Y = 49;
  const HIP_Y = 66;
  const FOOT_Y = 83;
  S.SW = SW; S.SH = SH; S.HEAD = HEAD;

  const SKINS = ["#f2cda3", "#e8bb8d", "#d6a878", "#b98a5e", "#8d5a3a"];

  // ---- tile di dither ordinato 4x4 (Bayer) su canvas PROPRIO (non-tainted) ----
  // Compositato in multiply a bassa alpha sulla testa per texture retro; niente
  // dither su outline/feature piccole (si applica solo all'area volto).
  let ditherTile = null;
  function getDitherTile() {
    if (ditherTile) return ditherTile;
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // Bayer 4x4
    const t = U.makeCanvas(4, 4);
    const g = t.getContext("2d");
    for (let i = 0; i < 16; i++) {
      const x = i % 4, y = (i / 4) | 0;
      // valori bassi -> pixel scuro: dà una trama a soglia
      const v = B[i] / 15;
      const a = (1 - v) * 0.5;         // 0..0.5
      g.fillStyle = "rgba(20,12,28," + a.toFixed(3) + ")";
      g.fillRect(x, y, 1, 1);
    }
    ditherTile = t;
    return t;
  }

  // ---- mappe abito ----
  const LOWER = {
    suit: "pants", blackshirt: "pants", tux: "pants", sweater: "pants",
    coat: "pants", pantsuit: "pants", dress: "skirt", skirtsuit: "skirt",
    gown: "gown", cycling: "bare", football: "bare", keeper: "bare",
    tennis: "bare", running: "bare", swim: "bare", moto: "colored",
    astronaut: "colored", fencing: "colored",
  };
  const SHORT_SLEEVE = { dress: 1, gown: 1, football: 1, tennis: 1, running: 1, swim: 1, cycling: 1 };
  const SHORTS = { cycling: "#17171c", football: "#eef0f6", keeper: "#17171c", tennis: "#eef0f6", running: "#20242c" };
  const SPORT_SHOE = { cycling: 1, football: 1, keeper: 1, tennis: 1, running: 1, swim: 1 };
  // secondary motion: outfit con un elemento penzolante (cravatta/sciarpa/sash)
  const DANGLE = { suit: "tie", tux: "tie", blackshirt: "tie", pantsuit: "tie", coat: "scarf", gown: "sash" };

  const POSE = {
    idleA: { arm: "down", legSpread: 0, lift: 0 },
    idleB: { arm: "down", legSpread: 0, lift: 1 },
    flailA: { arm: "up", legSpread: 6, lift: 0 },
    flailB: { arm: "out", legSpread: -6, lift: 2 },
    cheer: { arm: "cheer", legSpread: 0, lift: 0 },
  };

  // micro-font 3x5 per i numeri di maglia
  const DIGITS = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
    "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
    "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
    "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, Math.round(r * (1 + f))));
    g = Math.max(0, Math.min(255, Math.round(g * (1 + f))));
    b = Math.max(0, Math.min(255, Math.round(b * (1 + f))));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  function variantFor(char) {
    const h = U.hash(char.id);
    const skin = SKINS[(h >>> 6) % SKINS.length];
    let o = char.outfit;
    if (!o) {
      if (char.category === "sport") o = { t: "running", c: "#2b6fd6", a: "#eef0f6" };
      else if (char.gender === "f") o = { t: "dress", c: "#7a3a5a", a: "#d8b02a" };
      else o = { t: "suit", c: "#2b3040", a: "#c0293f" };
    }
    return { skin, o };
  }

  // disegna un arto spesso tra due punti (per braccia/gambe con angoli)
  function limb(g, x0, y0, x1, y1, w, color) {
    const dx = x1 - x0, dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    g.fillStyle = color;
    const hw = w / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      g.fillRect(Math.round(x0 + dx * t - hw), Math.round(y0 + dy * t - hw), w, w);
    }
  }

  function drawNumber(g, str, cx, cy, color) {
    g.fillStyle = color;
    const dw = 3, dh = 5, gap = 1, total = str.length * (dw + gap) - gap;
    let ox = cx - total / 2;
    for (const ch of str) {
      const pat = DIGITS[ch];
      if (pat) for (let r = 0; r < dh; r++) for (let c = 0; c < dw; c++)
        if (pat[r][c] === "1") g.fillRect(Math.round(ox + c), cy + r, 1, 1);
      ox += dw + gap;
    }
  }

  function drawShoe(g, x, color, sport) {
    g.fillStyle = color;
    if (sport) { g.fillRect(x - 6, FOOT_Y - 2, 12, 4); g.fillStyle = shade(color, -0.2); g.fillRect(x - 6, FOOT_Y + 1, 12, 1); }
    else g.fillRect(x - 6, FOOT_Y - 2, 13, 4);
  }

  // ---- gambe ----
  function drawLower(g, v, pose) {
    const o = v.o, lower = LOWER[o.t] || "pants", s = pose.legSpread;
    const lx = CX - 6, rx = CX + 6;
    if (lower === "gown") return;                       // coperta dalla gonna lunga
    if (lower === "skirt") {                            // gambe scoperte sotto la gonna
      limb(g, lx, 74, lx - s * 0.4, FOOT_Y, 6, v.skin);
      limb(g, rx, 74, rx + s * 0.4, FOOT_Y, 6, v.skin);
      drawShoe(g, lx - s * 0.4, "#7a2f3a", false);
      drawShoe(g, rx + s * 0.4, "#7a2f3a", false);
    } else if (lower === "bare") {                      // pantaloncini + gambe + scarpe sport
      const shorts = SHORTS[o.t] || "#20242c";
      g.fillStyle = shorts; g.fillRect(CX - 12, HIP_Y - 2, 24, 10);
      limb(g, lx, 74, lx - s * 0.4, FOOT_Y, 6, v.skin);
      limb(g, rx, 74, rx + s * 0.4, FOOT_Y, 6, v.skin);
      if (o.t === "football" || o.t === "keeper") {     // calzettoni
        g.fillStyle = o.a; g.fillRect(lx - s * 0.4 - 3, FOOT_Y - 8, 6, 6); g.fillRect(rx + s * 0.4 - 3, FOOT_Y - 8, 6, 6);
      }
      drawShoe(g, lx - s * 0.4, "#f4f4f8", true);
      drawShoe(g, rx + s * 0.4, "#f4f4f8", true);
    } else if (lower === "colored") {                   // gambe colorate (tuta/leathers)
      limb(g, lx, HIP_Y, lx - s, FOOT_Y, 8, o.c);
      limb(g, rx, HIP_Y, rx + s, FOOT_Y, 8, o.c);
      g.fillStyle = o.a; g.fillRect(lx - s - 4, HIP_Y, 2, FOOT_Y - HIP_Y); g.fillRect(rx + s + 2, HIP_Y, 2, FOOT_Y - HIP_Y);
      const boot = o.t === "astronaut" ? "#c9ced8" : "#17171c";
      drawShoe(g, lx - s, boot, false); drawShoe(g, rx + s, boot, false);
    } else {                                            // pantaloni
      const trouser = o.t === "pantsuit" ? o.c : shade(o.c, -0.12);
      limb(g, lx, HIP_Y, lx - s, FOOT_Y, 8, trouser);
      limb(g, rx, HIP_Y, rx + s, FOOT_Y, 8, trouser);
      drawShoe(g, lx - s, "#0d0a14", false); drawShoe(g, rx + s, "#0d0a14", false);
    }
  }

  // ---- busto/abito ----
  function drawTorso(g, v, sy) {
    const o = v.o, c = o.c, a = o.a;
    const jl = shade(c, 0.12), jd = shade(c, -0.26);
    const halfW = 14;
    const bot = HIP_Y;
    switch (o.t) {
      case "dress": {
        g.fillStyle = c; g.fillRect(CX - 11, sy, 22, 12);
        g.fillStyle = a; g.fillRect(CX - 11, sy, 3, 4); g.fillRect(CX + 8, sy, 3, 4);   // spalline
        for (let i = 0; i < 16; i++) { const w = 22 + i * 1.1; g.fillStyle = i % 4 === 3 ? jd : c; g.fillRect(Math.round(CX - w / 2), sy + 12 + i, Math.round(w), 1); }
        g.fillStyle = a; g.fillRect(CX - 9, sy + 12, 18, 2);   // vita
        break;
      }
      case "gown": {
        g.fillStyle = c; g.fillRect(CX - 10, sy, 20, 12);
        g.fillStyle = a; g.fillRect(CX - 10, sy, 3, 12);       // sciarpa/sash
        for (let i = 0; i < FOOT_Y - (sy + 12); i++) { const w = 20 + i * 0.75; g.fillStyle = c; g.fillRect(Math.round(CX - w / 2), sy + 12 + i, Math.round(w), 1); }
        g.fillStyle = jd; g.fillRect(CX - 1, sy + 12, 2, FOOT_Y - sy - 12);
        break;
      }
      case "skirtsuit": {
        g.fillStyle = c; g.fillRect(CX - 13, sy, 26, 14);
        g.fillStyle = "#eef0f6"; g.fillRect(CX - 4, sy, 8, 12); // camicetta
        g.fillStyle = a; g.fillRect(CX - 6, sy, 5, 5); g.fillStyle = a; g.fillRect(CX + 1, sy, 5, 5); // collo
        for (let i = 0; i < 12; i++) { const w = 24 + i; g.fillStyle = c; g.fillRect(Math.round(CX - w / 2), sy + 14 + i, Math.round(w), 1); } // gonna a ginocchio
        break;
      }
      case "pantsuit": {
        g.fillStyle = c; g.fillRect(CX - halfW, sy, 28, bot - sy);
        g.fillStyle = jl; g.fillRect(CX - halfW, sy, 3, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 5, sy, 10, 14);       // top interno
        break;
      }
      case "coat": {
        g.fillStyle = c; g.fillRect(CX - halfW, sy, 28, bot - sy + 8);
        g.fillStyle = jd; g.fillRect(CX - 1, sy, 2, bot - sy + 8);
        g.fillStyle = a; g.fillRect(CX - 7, sy - 1, 14, 4);    // collo/sciarpa
        break;
      }
      case "sweater": {
        g.fillStyle = c; g.fillRect(CX - 13, sy, 26, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 6, sy, 12, 3);
        g.fillStyle = jd; g.fillRect(CX - 13, bot - 3, 26, 3); // orlo
        break;
      }
      case "cycling": {
        g.fillStyle = c; g.fillRect(CX - 13, sy, 26, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 13, sy + 7, 26, 4);   // banda
        g.fillStyle = shade(c, -0.2); g.fillRect(CX - 13, sy, 4, bot - sy); g.fillRect(CX + 9, sy, 4, bot - sy);
        break;
      }
      case "football": case "keeper": {
        g.fillStyle = c; g.fillRect(CX - 13, sy, 26, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 13, sy, 26, 3);        // colletto/spalle
        if (o.t === "keeper") { g.fillStyle = shade(c, 0.15); g.fillRect(CX - 13, sy + 6, 26, 4); }
        break;
      }
      case "tennis": {
        g.fillStyle = c; g.fillRect(CX - 12, sy, 24, bot - sy);
        g.fillStyle = "#eef0f6"; g.fillRect(CX - 4, sy, 8, 6);  // colletto polo
        break;
      }
      case "running": {
        g.fillStyle = c; g.fillRect(CX - 10, sy, 20, bot - sy); // canotta
        g.fillStyle = a; g.fillRect(CX - 3, sy + 3, 6, 6);
        break;
      }
      case "swim": {
        g.fillStyle = c; g.fillRect(CX - 11, sy, 22, bot - sy + 4);
        g.fillStyle = a; g.fillRect(CX - 11, sy + 4, 22, 2);
        break;
      }
      case "astronaut": {
        g.fillStyle = c; g.fillRect(CX - 15, sy - 2, 30, bot - sy + 6);
        g.fillStyle = a; g.fillRect(CX - 15, sy + 6, 30, 3);   // trim arancio
        g.fillStyle = "#c0293f"; g.fillRect(CX - 12, sy, 5, 5); // patch
        g.fillStyle = "#8fb3c9"; g.fillRect(CX + 6, sy, 6, 4);  // controlli petto
        break;
      }
      case "moto": {
        g.fillStyle = c; g.fillRect(CX - 14, sy, 28, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 14, sy, 4, bot - sy); g.fillRect(CX + 10, sy, 4, bot - sy);
        break;
      }
      case "fencing": {
        g.fillStyle = c; g.fillRect(CX - 13, sy, 26, bot - sy);
        g.fillStyle = shade(c, -0.12); g.fillRect(CX - 1, sy, 2, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 13, sy, 26, 2);
        break;
      }
      case "tux": {
        g.fillStyle = c; g.fillRect(CX - 14, sy, 28, bot - sy);
        g.fillStyle = "#f4f4f8"; g.fillRect(CX - 5, sy, 10, bot - sy); // plastron
        g.fillStyle = a; g.fillRect(CX - 4, sy + 1, 8, 3);             // papillon
        g.fillStyle = jd; g.fillRect(CX - 14, sy, 4, bot - sy); g.fillRect(CX + 10, sy, 4, bot - sy);
        break;
      }
      case "blackshirt": {
        g.fillStyle = c; g.fillRect(CX - 14, sy, 28, bot - sy);
        g.fillStyle = shade(c, 0.18); g.fillRect(CX - 4, sy, 8, bot - sy); // abbottonatura
        g.fillStyle = a; g.fillRect(CX - 1, sy, 2, bot - sy);
        break;
      }
      default: { // suit
        g.fillStyle = c; g.fillRect(CX - 14, sy, 28, bot - sy);
        g.fillStyle = jl; g.fillRect(CX - 14, sy, 3, bot - sy);
        g.fillStyle = jd; g.fillRect(CX + 11, sy, 3, bot - sy);
        g.fillStyle = "#eef0f6"; g.fillRect(CX - 5, sy, 10, 15);       // camicia
        if (o.tie !== false) { g.fillStyle = a; g.fillRect(CX - 2, sy + 1, 4, 16); g.fillRect(CX - 3, sy, 6, 3); }
      }
    }
  }

  // ---- braccia ----
  function drawArms(g, v, sy, arm) {
    const o = v.o;
    const shortSleeve = !!SHORT_SLEEVE[o.t];
    const sleeve = o.t === "astronaut" ? o.c : o.c;
    const shL = CX - 12, shR = CX + 12, shy = sy + 2;
    let hands;
    if (arm === "up") hands = [[CX - 24, sy - 12], [CX + 24, sy - 12]];
    else if (arm === "out") hands = [[CX - 26, sy + 4], [CX + 26, sy + 4]];
    else if (arm === "cheer") hands = [[CX - 9, sy - 20], [CX + 9, sy - 20]];
    else hands = [[CX - 16, HIP_Y + 1], [CX + 16, HIP_Y + 1]];
    const anchors = [[shL, shy], hands[0], [shR, shy], hands[1]];
    for (let s = 0; s < 2; s++) {
      const [ax, ay] = anchors[s * 2], [hx, hy] = anchors[s * 2 + 1];
      const ex = (ax + hx) / 2, ey = (ay + hy) / 2;   // gomito
      limb(g, ax, ay, ex, ey, 5, sleeve);
      limb(g, ex, ey, hx, hy, shortSleeve ? 5 : 5, shortSleeve ? v.skin : sleeve);
      g.fillStyle = v.skin; g.fillRect(Math.round(hx - 2), Math.round(hy - 2), 4, 4); // mano
      if (o.t === "keeper") { g.fillStyle = o.a; g.fillRect(Math.round(hx - 3), Math.round(hy - 3), 6, 6); } // guantoni
    }
  }

  // corpo completo (senza testa) su un frame
  function drawBodyFrame(g, char, frameName) {
    const v = variantFor(char);
    const pose = POSE[frameName];
    const sy = SHOULDER_Y - pose.lift;
    drawLower(g, v, pose);
    drawTorso(g, v, sy);
    drawArms(g, v, sy, pose.arm);
    // collo
    g.fillStyle = v.skin; g.fillRect(CX - 4, NECK_Y, 8, 8);
    g.fillStyle = shade(v.skin, -0.15); g.fillRect(CX - 4, NECK_Y + 6, 8, 2);
    if (v.o.num) drawNumber(g, v.o.num, CX, sy + 4, v.o.t === "moto" ? "#17171c" : "#17171c");
  }

  // ---- cornice testa: outline scuro + rim light + ombra interna ----
  function frameHead(face) {
    const head = U.makeCanvas(HEAD, HEAD);
    const hg = head.getContext("2d");
    hg.imageSmoothingEnabled = false;
    const m = (HEAD - FACE) / 2;                 // margine cornice (4)
    hg.fillStyle = OUTLINE; hg.fillRect(m - 2, m - 2, FACE + 4, FACE + 4);  // outline 2px
    hg.drawImage(face, m, m);
    // rim light top/right (luce dall'alto-destra), 1px in screen
    hg.globalCompositeOperation = "screen";
    hg.fillStyle = "rgba(255,246,214,0.55)";
    hg.fillRect(m, m, FACE, 1);
    hg.fillRect(m + FACE - 1, m, 1, FACE);
    hg.globalCompositeOperation = "source-over";
    // ombra interna bottom/left
    hg.fillStyle = "rgba(0,0,0,0.32)"; hg.fillRect(m, m + FACE - 1, FACE, 1);
    hg.fillStyle = "rgba(0,0,0,0.18)"; hg.fillRect(m, m, 1, FACE);
    return head;
  }

  // ---- innesto volto (crop sul viso, posterize senza readback) ----
  function bakeHead(img, char) {
    const F = FACE;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    let side, sx, sy;
    const r = char.faceRect;
    if (r) { sx = r.x * iw; sy = r.y * ih; side = r.w * iw; }
    else {
      side = Math.min(iw, ih) * 0.80;            // crop un po' più largo (capelli/mascella)
      sx = (iw - side) / 2;
      sy = ih * 0.04;
      if (sy + side > ih) sy = Math.max(0, ih - side);
    }
    // 1) posterize/pixel: downscale (smoothing on = media colori) -> upscale (off = pixel netti)
    const small = U.makeCanvas(PX, PX);
    const sg = small.getContext("2d");
    sg.imageSmoothingEnabled = true;
    sg.drawImage(img, sx, sy, side, side, 0, 0, PX, PX);
    const face = U.makeCanvas(F, F);
    const g = face.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, PX, PX, 0, 0, F, F);
    // 2) grading + volume (diagonale: ombra bottom-left, luce top-right)
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "rgba(255,224,186,0.12)"; g.fillRect(0, 0, F, F);
    const vol = g.createLinearGradient(0, F, F, 0);
    vol.addColorStop(0, "rgba(40,26,60,0.32)");
    vol.addColorStop(0.5, "rgba(255,255,255,0)");
    vol.addColorStop(1, "rgba(255,240,210,0.10)");
    g.fillStyle = vol; g.fillRect(0, 0, F, F);
    g.globalCompositeOperation = "overlay";
    g.fillStyle = "rgba(120,80,150,0.07)"; g.fillRect(0, 0, F, F);
    // 3) dither ordinato (pattern da canvas proprio) a bassa alpha
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = 0.20;
    g.fillStyle = g.createPattern(getDitherTile(), "repeat");
    g.fillRect(0, 0, F, F);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    return frameHead(face);
  }

  function placeholderHead(char) {
    const head = U.makeCanvas(HEAD, HEAD);
    const g = head.getContext("2d");
    const h = U.hash(char.id);
    const m = (HEAD - FACE) / 2;
    g.fillStyle = OUTLINE; g.fillRect(m - 2, m - 2, FACE + 4, FACE + 4);
    g.fillStyle = "hsl(" + (h % 360) + ",40%,55%)"; g.fillRect(m, m, FACE, FACE);
    g.fillStyle = "#fff"; g.font = Math.round(FACE * 0.4) + 'px ' + Game.cfg.FONT;
    g.textAlign = "center"; g.textBaseline = "middle";
    const ini = char.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    g.fillText(ini, HEAD / 2, HEAD / 2);
    return head;
  }

  function buildFrames(char) {
    const frames = {};
    const offs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const name of ["idleA", "idleB", "flailA", "flailB", "cheer"]) {
      // 1) corpo su canvas temporaneo (solo fillRect: non-tainted)
      const body = U.makeCanvas(SW, SH);
      const bg = body.getContext("2d");
      bg.imageSmoothingEnabled = false;
      drawBodyFrame(bg, char, name);
      // 2) outline: silhouette scura espansa via draw shiftato + source-in (no readback)
      const sil = U.makeCanvas(SW, SH);
      const sgx = sil.getContext("2d");
      sgx.imageSmoothingEnabled = false;
      for (const [dx, dy] of offs) sgx.drawImage(body, dx, dy);
      sgx.globalCompositeOperation = "source-in";
      sgx.fillStyle = OUTLINE; sgx.fillRect(0, 0, SW, SH);
      // 3) frame finale: outline sotto, corpo sopra
      const c = U.makeCanvas(SW, SH);
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(sil, 0, 0);
      g.drawImage(body, 0, 0);
      frames[name] = c;
    }
    return frames;
  }

  // ---- caricamento + baking ----
  S.store = {};
  S.bakeAll = function (characters, onProgress, onDone) {
    let loaded = 0;
    const total = characters.length;
    characters.forEach((char) => {
      const img = new Image();
      const finish = (head) => {
        S.store[char.id] = { char, head, frames: buildFrames(char), v: variantFor(char) };
        loaded++;
        if (onProgress) onProgress(loaded, total);
        if (loaded === total && onDone) onDone();
      };
      img.onload = () => { try { finish(bakeHead(img, char)); } catch (e) { finish(placeholderHead(char)); } };
      img.onerror = () => { console.warn("Immagine non caricata:", char.faceImage); finish(placeholderHead(char)); };
      img.src = char.faceImage;
    });
    if (total === 0 && onDone) onDone();
  };

  function drawHeadOn(ctx, head, x, y, tilt) {
    ctx.save();
    ctx.translate(x, y);
    if (tilt) ctx.rotate(tilt);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(head, -HEAD / 2, -HEAD / 2);
    ctx.restore();
  }

  // ombra di contatto sotto i piedi (rx/squash variabili per il teeter)
  function contactShadow(ctx, x, y, rx, alpha) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0," + (alpha == null ? 0.30 : alpha) + ")";
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y) - 1, rx, rx * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // secondary motion: elemento penzolante (cravatta/sciarpa/sash) con follow-through.
  // Chiamata DENTRO il transform del corpo (x=0 = CX). L'angolo insegue la velocità del teeter.
  function drawDangle(ctx, v, teeterVel, breath) {
    const kind = DANGLE[v.o.t];
    if (!kind) return;
    let ay, len, wdt;
    if (kind === "tie") { ay = -SH + SHOULDER_Y + 6; len = 6; wdt = 3; }
    else if (kind === "scarf") { ay = -SH + SHOULDER_Y + 1; len = 8; wdt = 4; }
    else { ay = -SH + SHOULDER_Y + 9; len = 9; wdt = 4; } // sash
    const ang = U.clamp(-teeterVel * 0.5, -0.5, 0.5) + breath * 0.04;
    const x1 = Math.sin(ang) * len, y1 = ay + Math.cos(ang) * len;
    const ang2 = ang * 1.7;
    const x2 = x1 + Math.sin(ang2) * len, y2 = y1 + Math.cos(ang2) * len;
    ctx.strokeStyle = v.o.a; ctx.lineWidth = wdt; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, ay); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }

  // wind-streaks in caduta (aria che sfreccia), disegnate in coord mondo attorno all'anchor
  function drawWindStreaks(ctx, x, y, vx, vy, t) {
    const spd = Math.hypot(vx, vy);
    if (spd < 260) return;
    const dir = Math.atan2(vy, vx);
    const n = 5, len = Math.min(spd * 0.045, 28);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(dir);
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const yy = (i - (n - 1) / 2) * (SH / n);
      const j = (U.hash(i * 97 + Math.floor(t * 45)) % 100) / 100;
      const bx = -SW * 0.5 - 2 - j * 6;
      const l = len * (0.6 + j * 0.6);
      ctx.moveTo(bx, yy); ctx.lineTo(bx - l, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---- disegno idle (ancora ai piedi) con respiro, teeter, weight-shift, follow-through ----
  S.drawIdle = function (ctx, id, x, y, facing, t, opts) {
    const e = S.store[id]; if (!e) return;
    opts = opts || {};
    const ph = opts.phase || 0;
    const seed = U.hash(id) % 997;
    const scared = !!opts.tremble;

    // drivers procedurali (deterministici, niente stato per-entità)
    const breath = Math.sin(t * 2.0 + ph);
    const tw = 0.5;
    const teeter = U.noise1D(seed, t * tw) * (scared ? 0.02 : 0.05);         // sway lento sul cornicione
    const teeterVel = (teeter - U.noise1D(seed, (t - 0.05) * tw) * (scared ? 0.02 : 0.05)) / 0.05;
    const weightX = U.noise1D(seed + 7, t * tw * 0.75) * 1.5;                // spostamento del peso
    const tremX = scared ? U.rand(-1.1, 1.1) : 0;
    const tremY = scared ? U.rand(-0.5, 0.5) : 0;

    // squash & stretch (volume ~costante, ancorato ai piedi)
    const sxs = 1 - breath * 0.02;
    const sys = 1 + breath * 0.024;

    const headBob = Math.sin(t * 2.4 + ph) * 1.3 + (scared ? U.rand(-0.7, 0.7) : 0);
    const tilt = teeter * 0.7 + Math.sin(t * 1.1 + ph) * 0.025;

    // ombra: si schiaccia col teeter e respira col corpo
    const shR = 17 + breath * 0.6 - Math.abs(teeter) * 24;
    contactShadow(ctx, x + weightX, y, Math.max(10, shR), 0.30);

    const px = Math.round(x + weightX + tremX), py = Math.round(y + tremY);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(teeter);                                   // teeter attorno ai piedi
    ctx.scale((facing < 0 ? -1 : 1) * sxs, sys);
    if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = 14; }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(e.frames.idleA, -SW / 2, -SH);
    ctx.shadowBlur = 0;
    drawDangle(ctx, e.v, teeterVel, breath);              // secondary motion
    drawHeadOn(ctx, e.head, 0, -(SH - HEAD_CY) + headBob, tilt);
    ctx.restore();

    if (opts.danger || opts.outline) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(teeter);
      if (opts.danger) {
        // reticolo di mira rosso pulsante (corner brackets)
        const pulse = 0.5 + 0.5 * Math.sin(t * 8);
        const g = 4 + pulse * 3;
        const bx = -SW / 2 - g, by = -SH - g, bw = SW + g * 2, bh = SH + g * 2, L = 11;
        ctx.globalAlpha = 0.55 + 0.45 * pulse;
        ctx.strokeStyle = "#d04648"; ctx.lineWidth = 2; ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.moveTo(bx, by + L); ctx.lineTo(bx, by); ctx.lineTo(bx + L, by);
        ctx.moveTo(bx + bw - L, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + L);
        ctx.moveTo(bx, by + bh - L); ctx.lineTo(bx, by + bh); ctx.lineTo(bx + L, by + bh);
        ctx.moveTo(bx + bw - L, by + bh); ctx.lineTo(bx + bw, by + bh); ctx.lineTo(bx + bw, by + bh - L);
        ctx.stroke();
      } else {
        ctx.strokeStyle = opts.outline; ctx.lineWidth = 2;
        ctx.strokeRect(-SW / 2 - 2, -SH - 2, SW + 4, SH + 4);
      }
      ctx.restore();
    }
  };

  // ---- disegno ruotato (caduta/cadavere); anchor = centro sprite ----
  // opts.vx/vy presenti = caduta drammatica (stretch lungo velocità + wind-streaks + flail veloce)
  S.drawRotated = function (ctx, id, x, y, facing, angle, alpha, t, opts) {
    const e = S.store[id]; if (!e) return;
    opts = opts || {};
    const fast = opts.vx != null;
    const frame = (Math.floor((t || 0) * (fast ? 18 : 10)) % 2) ? e.frames.flailB : e.frames.flailA;
    if (fast) drawWindStreaks(ctx, x, y, opts.vx, opts.vy, t);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (fast) {
      const spd = Math.hypot(opts.vx, opts.vy);
      const st = 1 + Math.min(spd / 1100, 0.42);          // stretch lungo la velocità
      const vdir = Math.atan2(opts.vy, opts.vx);
      ctx.rotate(vdir); ctx.scale(st, 1 / st); ctx.rotate(-vdir);
    }
    ctx.rotate(angle);
    ctx.scale(facing < 0 ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, -SW / 2, -SH / 2);
    drawHeadOn(ctx, e.head, 0, HEAD_CY - SH / 2, 0);
    ctx.restore();
  };

  // ---- sprite grande (vincitore) ----
  S.drawBig = function (ctx, id, cx, cy, scale, frameName) {
    const e = S.store[id]; if (!e) return;
    const frame = e.frames[frameName] || e.frames.idleA;
    contactShadow(ctx, cx, cy, 18 * scale, 0.28);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.drawImage(frame, -SW / 2, -SH);
    drawHeadOn(ctx, e.head, 0, -(SH - HEAD_CY), 0);
    ctx.restore();
  };

  // ---- gallery (QA volti) ----
  S.drawGallery = function (ctx, characters, scroll) {
    const cfg = Game.cfg;
    ctx.fillStyle = "#15101f";
    ctx.fillRect(0, 0, cfg.W, cfg.H);
    const cols = 5, cw = cfg.W / cols, ch = 140;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    characters.forEach((char, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = col * cw + cw / 2;
      const y = row * ch + 12 - (scroll || 0);
      if (y < -ch || y > cfg.H) return;
      ctx.fillStyle = "#ffd23f";
      ctx.font = '5px ' + cfg.FONT;
      ctx.fillText(char.name.slice(0, 14), x, y + 2);
      S.drawBig(ctx, char.id, x, y + 128, 1.0, "idleA");
    });
  };
})();
