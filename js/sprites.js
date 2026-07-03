// sprites.js — volto foto (testone) + corpo pixel art con abito coerente,
// animazioni (idle/flail/cheer) a frame baked, testa indipendente con bob a step.
// Movimento 2D puro: niente rotate/scale continui, solo translate intere,
// flip ±1 e matrici esatte a 90°; tutti i driver sono quantizzati al blocco K.
// NB: le immagini locali "sporcano" il canvas: solo drawImage/compositing,
// mai getImageData/toDataURL -> ok anche da file://.
(function () {
  "use strict";
  const Game = window.Game;
  const U = Game.util;

  const S = (Game.sprites = {});
  // Griglia di design a mezza risoluzione: il corpo si disegna su GW×GH e viene
  // upscalato ×K con un singolo drawImage -> blocchi 2×2 netti (mai scale+fillRect,
  // i fill sotto transform vengono antialiasati).
  const K = 4;                       // fattore blocco (pixel "chunky")
  const GW = 36, GH = 56;            // griglia di design
  const SW = GW * K, SH = GH * K;    // sprite finale 144×224
  // Teste più grandi/riconoscibili (bobblehead SF2). FACE = area volto, HEAD = canvas
  // con cornice+outline, PX = risoluzione della foto quantizzata (posterize senza readback).
  const FACE = 144, HEAD = 160, PX = 36; // FACE = 4·PX esatto -> pixel foto 4×4 uniformi
  const OUTLINE = "#0c0812";         // outline scuro condiviso (ruolo ink)
  const CX = GW / 2;                 // 18 (griglia di design)
  const HEAD_CY = 64;                // centro testa nello sprite (y dall'alto, coord FINALI)
  const NECK_Y = 27;                 // da qui in giù: coordinate di design (metà delle finali)
  const SHOULDER_Y = 32;
  const HIP_Y = 43;
  const FOOT_Y = 54;
  S.SW = SW; S.SH = SH; S.HEAD = HEAD; S.K = K;

  const SKINS = ["#f2cda3", "#e8bb8d", "#d6a878", "#b98a5e", "#8d5a3a"];

  // ---- tile di dither ordinato 4x4 (Bayer) su canvas PROPRIO (non-tainted) ----
  // Compositato in multiply a bassa alpha sulla testa per texture retro; niente
  // dither su outline/feature piccole (si applica solo all'area volto).
  // Celle 4×4 (tile 16×16) per non spezzare la griglia 4px della foto.
  let ditherTile = null;
  function getDitherTile() {
    if (ditherTile) return ditherTile;
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // Bayer 4x4
    const t = U.makeCanvas(16, 16);
    const g = t.getContext("2d");
    for (let i = 0; i < 16; i++) {
      const x = i % 4, y = (i / 4) | 0;
      // valori bassi -> pixel scuro: dà una trama a soglia
      const v = B[i] / 15;
      const a = (1 - v) * 0.5;         // 0..0.5
      g.fillStyle = "rgba(20,12,28," + a.toFixed(3) + ")";
      g.fillRect(x * 4, y * 4, 4, 4);
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

  const POSE = {
    idleA: { arm: "down", legSpread: 0, lift: 0 },
    idleB: { arm: "down", legSpread: 0, lift: 1 },
    flailA: { arm: "up", legSpread: 4, lift: 0 },
    flailB: { arm: "out", legSpread: -4, lift: 2 },
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
    x = Math.round(x);               // i piedi allargati arrivano con offset frazionari
    g.fillStyle = color;
    if (sport) { g.fillRect(x - 4, FOOT_Y - 1, 8, 2); g.fillStyle = shade(color, -0.2); g.fillRect(x - 4, FOOT_Y, 8, 1); }
    else g.fillRect(x - 4, FOOT_Y - 1, 8, 2);
  }

  // ---- gambe ----
  function drawLower(g, v, pose) {
    const o = v.o, lower = LOWER[o.t] || "pants", s = pose.legSpread;
    const lx = CX - 4, rx = CX + 4;
    // piedi allargati arrotondati alla griglia (s*0.4 è frazionario)
    const flx = Math.round(lx - s * 0.4), frx = Math.round(rx + s * 0.4);
    if (lower === "gown") return;                       // coperta dalla gonna lunga
    if (lower === "skirt") {                            // gambe scoperte sotto la gonna
      limb(g, lx, 48, flx, FOOT_Y, 4, v.skin);
      limb(g, rx, 48, frx, FOOT_Y, 4, v.skin);
      drawShoe(g, flx, "#7a2f3a", false);
      drawShoe(g, frx, "#7a2f3a", false);
    } else if (lower === "bare") {                      // pantaloncini + gambe + scarpe sport
      const shorts = SHORTS[o.t] || "#20242c";
      g.fillStyle = shorts; g.fillRect(CX - 8, HIP_Y - 1, 16, 7);
      limb(g, lx, 48, flx, FOOT_Y, 4, v.skin);
      limb(g, rx, 48, frx, FOOT_Y, 4, v.skin);
      if (o.t === "football" || o.t === "keeper") {     // calzettoni
        g.fillStyle = o.a; g.fillRect(flx - 2, FOOT_Y - 5, 4, 4); g.fillRect(frx - 2, FOOT_Y - 5, 4, 4);
      }
      drawShoe(g, flx, "#f4f4f8", true);
      drawShoe(g, frx, "#f4f4f8", true);
    } else if (lower === "colored") {                   // gambe colorate (tuta/leathers)
      limb(g, lx, HIP_Y, lx - s, FOOT_Y, 5, o.c);
      limb(g, rx, HIP_Y, rx + s, FOOT_Y, 5, o.c);
      g.fillStyle = o.a; g.fillRect(lx - s - 2, HIP_Y, 1, FOOT_Y - HIP_Y); g.fillRect(rx + s + 2, HIP_Y, 1, FOOT_Y - HIP_Y);
      const boot = o.t === "astronaut" ? "#c9ced8" : "#17171c";
      drawShoe(g, lx - s, boot, false); drawShoe(g, rx + s, boot, false);
    } else {                                            // pantaloni
      const trouser = o.t === "pantsuit" ? o.c : shade(o.c, -0.12);
      limb(g, lx, HIP_Y, lx - s, FOOT_Y, 5, trouser);
      limb(g, rx, HIP_Y, rx + s, FOOT_Y, 5, trouser);
      drawShoe(g, lx - s, "#0d0a14", false); drawShoe(g, rx + s, "#0d0a14", false);
    }
  }

  // ---- busto/abito ----
  function drawTorso(g, v, sy) {
    const o = v.o, c = o.c, a = o.a;
    const jl = shade(c, 0.12), jd = shade(c, -0.26);
    const halfW = 9;
    const bot = HIP_Y;
    switch (o.t) {
      case "dress": {
        g.fillStyle = c; g.fillRect(CX - 7, sy, 14, 8);
        g.fillStyle = a; g.fillRect(CX - 7, sy, 2, 3); g.fillRect(CX + 5, sy, 2, 3);   // spalline
        for (let i = 0; i < 10; i++) { const w = 14 + i * 1.1; g.fillStyle = i % 4 === 3 ? jd : c; g.fillRect(Math.round(CX - w / 2), sy + 8 + i, Math.round(w), 1); }
        g.fillStyle = a; g.fillRect(CX - 6, sy + 8, 12, 1);   // vita
        break;
      }
      case "gown": {
        g.fillStyle = c; g.fillRect(CX - 7, sy, 14, 8);
        g.fillStyle = a; g.fillRect(CX - 7, sy, 2, 8);        // sciarpa/sash
        for (let i = 0; i < FOOT_Y - (sy + 8); i++) { const w = 14 + i * 0.75; g.fillStyle = c; g.fillRect(Math.round(CX - w / 2), sy + 8 + i, Math.round(w), 1); }
        g.fillStyle = jd; g.fillRect(CX - 1, sy + 8, 1, FOOT_Y - sy - 8);
        break;
      }
      case "skirtsuit": {
        g.fillStyle = c; g.fillRect(CX - 8, sy, 16, 9);
        g.fillStyle = "#eef0f6"; g.fillRect(CX - 3, sy, 6, 8); // camicetta
        g.fillStyle = a; g.fillRect(CX - 4, sy, 3, 3); g.fillStyle = a; g.fillRect(CX + 1, sy, 3, 3); // collo
        for (let i = 0; i < 8; i++) { const w = 16 + i; g.fillStyle = c; g.fillRect(Math.round(CX - w / 2), sy + 9 + i, Math.round(w), 1); } // gonna a ginocchio
        break;
      }
      case "pantsuit": {
        g.fillStyle = c; g.fillRect(CX - halfW, sy, 18, bot - sy);
        g.fillStyle = jl; g.fillRect(CX - halfW, sy, 2, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 3, sy, 6, 9);         // top interno
        break;
      }
      case "coat": {
        g.fillStyle = c; g.fillRect(CX - halfW, sy, 18, bot - sy + 5);
        g.fillStyle = jd; g.fillRect(CX - 1, sy, 1, bot - sy + 5);
        g.fillStyle = a; g.fillRect(CX - 5, sy - 1, 10, 3);    // collo/sciarpa
        break;
      }
      case "sweater": {
        g.fillStyle = c; g.fillRect(CX - 8, sy, 16, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 4, sy, 8, 2);
        g.fillStyle = jd; g.fillRect(CX - 8, bot - 2, 16, 2); // orlo
        break;
      }
      case "cycling": {
        g.fillStyle = c; g.fillRect(CX - 8, sy, 16, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 8, sy + 5, 16, 3);   // banda
        g.fillStyle = shade(c, -0.2); g.fillRect(CX - 8, sy, 3, bot - sy); g.fillRect(CX + 5, sy, 3, bot - sy);
        break;
      }
      case "football": case "keeper": {
        g.fillStyle = c; g.fillRect(CX - 8, sy, 16, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 8, sy, 16, 2);         // colletto/spalle
        if (o.t === "keeper") { g.fillStyle = shade(c, 0.15); g.fillRect(CX - 8, sy + 4, 16, 3); }
        break;
      }
      case "tennis": {
        g.fillStyle = c; g.fillRect(CX - 8, sy, 16, bot - sy);
        g.fillStyle = "#eef0f6"; g.fillRect(CX - 3, sy, 6, 4);  // colletto polo
        break;
      }
      case "running": {
        g.fillStyle = c; g.fillRect(CX - 7, sy, 14, bot - sy); // canotta
        g.fillStyle = a; g.fillRect(CX - 2, sy + 2, 4, 4);
        break;
      }
      case "swim": {
        g.fillStyle = c; g.fillRect(CX - 7, sy, 14, bot - sy + 3);
        g.fillStyle = a; g.fillRect(CX - 7, sy + 3, 14, 1);
        break;
      }
      case "astronaut": {
        g.fillStyle = c; g.fillRect(CX - 10, sy - 1, 20, bot - sy + 4);
        g.fillStyle = a; g.fillRect(CX - 10, sy + 4, 20, 2);   // trim arancio
        g.fillStyle = "#c0293f"; g.fillRect(CX - 8, sy, 3, 3);  // patch
        g.fillStyle = "#8fb3c9"; g.fillRect(CX + 4, sy, 4, 3);  // controlli petto
        break;
      }
      case "moto": {
        g.fillStyle = c; g.fillRect(CX - 9, sy, 18, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 9, sy, 3, bot - sy); g.fillRect(CX + 6, sy, 3, bot - sy);
        break;
      }
      case "fencing": {
        g.fillStyle = c; g.fillRect(CX - 8, sy, 16, bot - sy);
        g.fillStyle = shade(c, -0.12); g.fillRect(CX - 1, sy, 1, bot - sy);
        g.fillStyle = a; g.fillRect(CX - 8, sy, 16, 1);
        break;
      }
      case "tux": {
        g.fillStyle = c; g.fillRect(CX - 9, sy, 18, bot - sy);
        g.fillStyle = "#f4f4f8"; g.fillRect(CX - 3, sy, 6, bot - sy); // plastron
        g.fillStyle = a; g.fillRect(CX - 3, sy + 1, 6, 2);             // papillon
        g.fillStyle = jd; g.fillRect(CX - 9, sy, 3, bot - sy); g.fillRect(CX + 6, sy, 3, bot - sy);
        break;
      }
      case "blackshirt": {
        g.fillStyle = c; g.fillRect(CX - 9, sy, 18, bot - sy);
        g.fillStyle = shade(c, 0.18); g.fillRect(CX - 3, sy, 6, bot - sy); // abbottonatura
        g.fillStyle = a; g.fillRect(CX - 1, sy, 1, bot - sy);
        break;
      }
      default: { // suit
        g.fillStyle = c; g.fillRect(CX - 9, sy, 18, bot - sy);
        g.fillStyle = jl; g.fillRect(CX - 9, sy, 2, bot - sy);
        g.fillStyle = jd; g.fillRect(CX + 7, sy, 2, bot - sy);
        g.fillStyle = "#eef0f6"; g.fillRect(CX - 3, sy, 6, 10);       // camicia
        if (o.tie !== false) { g.fillStyle = a; g.fillRect(CX - 1, sy + 1, 3, 10); g.fillRect(CX - 2, sy, 4, 2); }
      }
    }
  }

  // ---- braccia ----
  function drawArms(g, v, sy, arm) {
    const o = v.o;
    const shortSleeve = !!SHORT_SLEEVE[o.t];
    const sleeve = o.t === "astronaut" ? o.c : o.c;
    const shL = CX - 8, shR = CX + 8, shy = sy + 1;
    let hands;
    if (arm === "up") hands = [[CX - 16, sy - 8], [CX + 16, sy - 8]];
    else if (arm === "out") hands = [[CX - 17, sy + 3], [CX + 17, sy + 3]];
    else if (arm === "cheer") hands = [[CX - 6, sy - 13], [CX + 6, sy - 13]];
    else hands = [[CX - 10, HIP_Y + 1], [CX + 10, HIP_Y + 1]];
    const anchors = [[shL, shy], hands[0], [shR, shy], hands[1]];
    for (let s = 0; s < 2; s++) {
      const [ax, ay] = anchors[s * 2], [hx, hy] = anchors[s * 2 + 1];
      const ex = (ax + hx) / 2, ey = (ay + hy) / 2;   // gomito
      limb(g, ax, ay, ex, ey, 3, sleeve);
      limb(g, ex, ey, hx, hy, 3, shortSleeve ? v.skin : sleeve);
      g.fillStyle = v.skin; g.fillRect(Math.round(hx - 1), Math.round(hy - 1), 3, 3); // mano
      if (o.t === "keeper") { g.fillStyle = o.a; g.fillRect(Math.round(hx - 2), Math.round(hy - 2), 4, 4); } // guantoni
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
    g.fillStyle = v.skin; g.fillRect(CX - 3, NECK_Y, 6, 5);
    g.fillStyle = shade(v.skin, -0.15); g.fillRect(CX - 3, NECK_Y + 4, 6, 1);
    if (v.o.num) drawNumber(g, v.o.num, CX, sy + 3, v.o.t === "moto" ? "#17171c" : "#17171c");
  }

  // ---- cornice testa: outline scuro + rim light + ombra interna ----
  function frameHead(face) {
    const head = U.makeCanvas(HEAD, HEAD);
    const hg = head.getContext("2d");
    hg.imageSmoothingEnabled = false;
    const m = (HEAD - FACE) / 2;                 // margine cornice (8)
    hg.fillStyle = OUTLINE; hg.fillRect(m - 4, m - 4, FACE + 8, FACE + 8);  // outline 4px
    hg.drawImage(face, m, m);
    // rim light top/right (luce dall'alto-destra), 4px in screen (griglia foto 4px)
    hg.globalCompositeOperation = "screen";
    hg.fillStyle = "rgba(255,246,214,0.55)";
    hg.fillRect(m, m, FACE, 4);
    hg.fillRect(m + FACE - 4, m, 4, FACE);
    hg.globalCompositeOperation = "source-over";
    // ombra interna bottom/left
    hg.fillStyle = "rgba(0,0,0,0.32)"; hg.fillRect(m, m + FACE - 4, FACE, 4);
    hg.fillStyle = "rgba(0,0,0,0.18)"; hg.fillRect(m, m, 4, FACE);
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
    g.fillStyle = OUTLINE; g.fillRect(m - 4, m - 4, FACE + 8, FACE + 8);
    g.fillStyle = "hsl(" + (h % 360) + ",40%,55%)"; g.fillRect(m, m, FACE, FACE);
    g.fillStyle = "#fff"; g.font = Math.round(FACE * 0.4) + 'px ' + Game.cfg.FONT;
    g.textAlign = "center"; g.textBaseline = "middle";
    const ini = char.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    g.fillText(ini, HEAD / 2, HEAD / 2);
    return head;
  }

  function buildFrames(char) {
    const frames = {};
    const offs = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // ±1 px di design = 2 px finali
    for (const name of ["idleA", "idleB", "flailA", "flailB", "cheer"]) {
      // 1) corpo sulla griglia di design (solo fillRect: non-tainted)
      const body = U.makeCanvas(GW, GH);
      const bg = body.getContext("2d");
      bg.imageSmoothingEnabled = false;
      drawBodyFrame(bg, char, name);
      // 2) outline: silhouette scura espansa via draw shiftato + source-in (no readback)
      const sil = U.makeCanvas(GW, GH);
      const sgx = sil.getContext("2d");
      sgx.imageSmoothingEnabled = false;
      for (const [dx, dy] of offs) sgx.drawImage(body, dx, dy);
      sgx.globalCompositeOperation = "source-in";
      sgx.fillStyle = OUTLINE; sgx.fillRect(0, 0, GW, GH);
      // 3) composizione a risoluzione di design: outline sotto, corpo sopra
      const design = U.makeCanvas(GW, GH);
      const dg = design.getContext("2d");
      dg.imageSmoothingEnabled = false;
      dg.drawImage(sil, 0, 0);
      dg.drawImage(body, 0, 0);
      // 4) upscale ×K in un solo drawImage a scala intera -> blocchi 2×2 netti
      const c = U.makeCanvas(SW, SH);
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      g.drawImage(design, 0, 0, GW, GH, 0, 0, SW, SH);
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

  function drawHeadOn(ctx, head, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(head, -HEAD / 2, -HEAD / 2);
    ctx.restore();
  }

  // ombra di contatto sotto i piedi (rx variabile col frame di respiro):
  // ellisse a gradoni di blocchi, righe non sovrapposte -> alpha uniforme
  function contactShadow(ctx, x, y, rx, alpha) {
    const B = K, ry = Math.max(B, rx * 0.34);
    const rows = Math.max(1, Math.round(ry / B));
    const cx = Math.round(x), cy = Math.round(y) - 1;
    ctx.fillStyle = "rgba(0,0,0," + (alpha == null ? 0.30 : alpha) + ")";
    for (let i = 0; i < rows; i++) {
      const t = (i + 0.5) / rows;
      const hw = Math.max(B, Math.round(rx * Math.sqrt(1 - t * t) / B) * B);
      ctx.fillRect(cx - hw, cy - (i + 1) * B, hw * 2, B);
      ctx.fillRect(cx - hw, cy + i * B, hw * 2, B);
    }
  }

  // speed-lines verticali in caduta (aria che sfreccia), in coord mondo attorno
  // all'anchor: fillRect a colore pieno, jitter quantizzato a 12Hz (mai per-frame)
  function drawSpeedLines(ctx, x, y, vx, vy, t) {
    const spd = Math.hypot(vx, vy);
    if (spd <= 520 || Math.abs(vy) <= Math.abs(vx)) return;
    const len = Math.round(U.clamp(spd * 0.045, 16, 56) / K) * K;
    const bx = Math.round(x / K) * K, by = Math.round(y / K) * K;
    const n = 5;
    ctx.fillStyle = U.palette.silver;
    for (let i = 0; i < n; i++) {
      const j = U.hash(i * 97 + Math.floor(t * 12) + "") % 4;   // U.hash vuole una stringa
      const sx = bx - SW / 2 + Math.round((i + 0.5) * SW / n / K) * K;
      const sy = by - SH / 2 - 2 * K - j * K - len;             // dietro al moto (sopra il corpo)
      ctx.fillRect(sx, sy, K / 2, len);
    }
  }

  // ---- disegno idle (ancora ai piedi): frame baked + driver a step discreti ----
  S.drawIdle = function (ctx, id, x, y, facing, t, opts) {
    const e = S.store[id]; if (!e) return;
    opts = opts || {};
    const ph = opts.phase || 0;
    const seed = U.hash(id) % 997;
    const scared = !!opts.tremble;

    // driver deterministici quantizzati al blocco K (mai rotazioni/scale/alpha continui)
    const isB = Math.floor(t * 1.4 + ph) % 2 === 1;                 // respiro: alterna i frame baked
    const frame = isB ? e.frames.idleB : e.frames.idleA;
    const weightX = Math.round(U.noise1D(seed + 7, t * 0.4)) * K;   // spostamento del peso ∈ {−K,0,+K}
    let tremX = 0;
    if (scared) {                                                    // tremolio a 12Hz, quantizzato
      const step = Math.floor(t * 12);
      tremX = ((U.hash(id + "|" + step) % 3) - 1) * K;
    }
    const headBob = Math.round(Math.sin(t * 2.4 + ph)) * K;          // ∈ {−K,0,+K}
    const headLift = isB ? K : 0;                                    // la testa segue il lift di idleB

    const px = Math.round(x + weightX + tremX), py = Math.round(y);
    contactShadow(ctx, px, y, Math.round(SW * 0.30) - (isB ? K : 0), 0.30);

    ctx.save();
    ctx.translate(px, py);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, -SW / 2, -SH);
    drawHeadOn(ctx, e.head, 0, -(SH - HEAD_CY) - headLift + headBob);
    ctx.restore();

    if (opts.danger) drawHoverMark(ctx, px, py, t);
  };

  // hover sul bersaglio: cornice rossa on/off secco + freccia oro puntata in giù.
  // Tutto fillRect a coordinate intere, alpha sempre 1, nessuna rotazione.
  function drawHoverMark(ctx, px, py, t) {
    ctx.save();
    ctx.translate(px, py);
    // bounds dell'intero sprite: la testa (HEAD) è più larga e più alta del box corpo
    const bx = -HEAD / 2 - 2 * K, bw = HEAD + 4 * K;
    const by = -(SH - HEAD_CY) - HEAD / 2 - 3 * K, bh = -by + K;
    if (Math.floor(t * 12) % 2 === 0) {
      // cornice spessa K con gap 2K attorno allo sprite (testa inclusa)
      ctx.fillStyle = U.palette.red;
      ctx.fillRect(bx, by, bw, K);
      ctx.fillRect(bx, by + bh - K, bw, K);
      ctx.fillRect(bx, by, K, bh);
      ctx.fillRect(bx + bw - K, by, K, bh);
    }
    // freccia stabile (non lampeggia): punta 1/3/5 blocchi + gambo 3×2, bob a 2 frame
    const bob = (Math.floor(t * 4) % 2) * K;
    const tipY = by - 2 * K - bob;
    ctx.fillStyle = U.palette.gold;
    for (let r = 0; r < 3; r++) ctx.fillRect(-(2 * r + 1) * K / 2, tipY - (r + 1) * K, (2 * r + 1) * K, K);
    ctx.fillRect(-3 * K / 2, tipY - 5 * K, 3 * K, 2 * K);
    ctx.restore();
  }

  // ---- disegno ruotato (caduta/cadavere); anchor = centro sprite ----
  // Orientamento quantizzato a 90° con matrici esatte (mai ctx.rotate).
  // opts.vx/vy presenti = caduta: il flail segue il quarto di giro + speed-lines.
  S.drawRotated = function (ctx, id, x, y, facing, angle, alpha, t, opts) {
    const e = S.store[id]; if (!e) return;
    opts = opts || {};
    const fast = opts.vx != null;
    // round (non floor): quantizzazione simmetrica — con omega negativo floor
    // farebbe scattare il corpo a 270° al primo frame invece che a −45°
    const qi = ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4;
    const frame = fast
      ? (qi % 2 ? e.frames.flailB : e.frames.flailA)      // 8 pose distinte nel tumbling
      : ((Math.floor((t || 0) * 10) % 2) ? e.frames.flailB : e.frames.flailA);
    if (fast) drawSpeedLines(ctx, x, y, opts.vx, opts.vy, t);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(Math.round(x), Math.round(y));
    if (qi === 1) ctx.transform(0, 1, -1, 0, 0, 0);
    else if (qi === 2) ctx.transform(-1, 0, 0, -1, 0, 0);
    else if (qi === 3) ctx.transform(0, -1, 1, 0, 0, 0);
    ctx.scale(facing < 0 ? -1 : 1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame, -SW / 2, -SH / 2);
    drawHeadOn(ctx, e.head, 0, HEAD_CY - SH / 2);
    ctx.restore();
  };

  // ---- sprite grande (vincitore) ----
  // NB: scale deve essere INTERO (i fill sotto scale frazionario si antialiasano)
  S.drawBig = function (ctx, id, cx, cy, scale, frameName) {
    const e = S.store[id]; if (!e) return;
    const frame = e.frames[frameName] || e.frames.idleA;
    contactShadow(ctx, cx, cy, 46 * scale, 0.28);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(scale, scale);
    ctx.drawImage(frame, -SW / 2, -SH);
    drawHeadOn(ctx, e.head, 0, -(SH - HEAD_CY));
    ctx.restore();
  };

  // ---- gallery (QA volti) ----
  S.drawGallery = function (ctx, characters, scroll) {
    const cfg = Game.cfg;
    ctx.fillStyle = "#15101f";
    ctx.fillRect(0, 0, cfg.W, cfg.H);
    const cols = 4, cw = cfg.W / cols, ch = 288;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    characters.forEach((char, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = col * cw + cw / 2;
      const y = row * ch + 12 - (scroll || 0);
      if (y < -ch || y > cfg.H) return;
      ctx.fillStyle = "#ffd23f";
      ctx.font = '7px ' + cfg.FONT;
      ctx.fillText(char.name.slice(0, 14), x, y + 2);
      S.drawBig(ctx, char.id, x, y + 268, 1.0, "idleA");
    });
  };
})();
