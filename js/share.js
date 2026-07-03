// share.js — condivisione della classifica finale: card PNG renderizzata su
// canvas offscreen + export a cascata (share sheet con file → download →
// testo negli appunti). Nessuna persistenza: il dato vive solo nel PNG/testo.
// NB: le foto caricate da file:// "sporcano" il canvas e toBlob lancia
// SecurityError; questo è l'UNICO punto del gioco che usa toBlob, dentro
// try/catch con fallback al solo testo. Mai API di readback dei pixel.
(function () {
  "use strict";
  const Game = window.Game;
  const U = Game.util;

  const S = (Game.share = {});

  const FILE_NAME = "chi-butti-giu-classifica.png";
  const TITLE = "Chi butti giù dalla torre?";

  // ---- layout card (larghezza fissa, altezza calcolata; coordinate intere) ----
  const W = 640;
  const PANEL_X = 40, PANEL_W = 560, PANEL_PAD = 8, ROW_H = 30;
  const PANEL_TOP = 426;   // sotto header + blocco vincitore
  const FEET_Y = 360;      // piedi del vincitore (sprite ~240px alto con scale 1)

  // Carica in anticipo le taglie di font usate dalla card: se "Press Start 2P"
  // non fosse pronto, il canvas disegnerebbe col fallback monospace.
  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const sizes = ["24px", "16px", "10px", "8px", "7px"];
    return Promise.all(sizes.map((s) => document.fonts.load(s + ' "Press Start 2P"')))
      .catch(() => { /* si disegna comunque */ });
  }

  // titolo con "ombra" arcade come nel gioco: ink dietro, rosso in mezzo, oro davanti
  function arcadeTitle(g, text, x, y) {
    g.fillStyle = "#0c0812"; g.fillText(text, x + 6, y + 6);
    g.fillStyle = "#ff2e4c"; g.fillText(text, x + 3, y + 3);
    g.fillStyle = "#ffd23f"; g.fillText(text, x, y);
  }

  // disegna l'intera card e la ritorna come canvas offscreen
  function renderCard(winner, ordered) {
    const FONT = Game.cfg.FONT;
    const panelH = PANEL_PAD * 2 + ordered.length * ROW_H;
    const footTop = PANEL_TOP + panelH + 14;
    const H = footTop + 48;              // due righe footer + margine + cornice

    const canvas = U.makeCanvas(W, H);
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;

    // sfondo pieno + cornice arcade: anello esterno ink, anello interno oro
    g.fillStyle = "#17111f"; g.fillRect(0, 0, W, H);
    g.fillStyle = "#0c0812";
    g.fillRect(0, 0, W, 4); g.fillRect(0, H - 4, W, 4);
    g.fillRect(0, 0, 4, H); g.fillRect(W - 4, 0, 4, H);
    g.fillStyle = "#ffd23f";
    g.fillRect(4, 4, W - 8, 4); g.fillRect(4, H - 8, W - 8, 4);
    g.fillRect(4, 4, 4, H - 8); g.fillRect(W - 8, 4, 4, H - 8);

    // header: titolo su due righe centrate
    g.textAlign = "center"; g.textBaseline = "top";
    g.font = "24px " + FONT;
    arcadeTitle(g, "CHI BUTTI GIÙ", 320, 30);
    arcadeTitle(g, "DALLA TORRE?", 320, 62);

    // blocco vincitore: sprite grande in posa "cheer" + corona sopra la testa
    Game.sprites.drawBig(g, winner.id, 320, FEET_Y, 1, "cheer");
    g.textAlign = "center"; g.textBaseline = "top";
    g.font = "24px " + FONT; g.fillStyle = "#ffd23f";
    g.fillText("♛", 320, 92);
    g.font = "16px " + FONT; g.fillStyle = "#f4ecff";
    g.fillText(winner.name, 320, 382);
    g.font = "8px " + FONT; g.fillStyle = "#b9a7d6";
    g.fillText(winner.years + " · " + winner.role, 320, 408);

    // pannello classifica: righe alternate (zebra sottile) su fondo più chiaro
    g.fillStyle = "#1c1230";
    g.fillRect(PANEL_X, PANEL_TOP, PANEL_W, panelH);
    const HEAD = Game.sprites.HEAD;
    ordered.forEach((c, i) => {
      const rowY = PANEL_TOP + PANEL_PAD + i * ROW_H;
      if (i % 2 === 1) { g.fillStyle = "#0f0a1c"; g.fillRect(PANEL_X, rowY, PANEL_W, ROW_H); }
      const cy = rowY + ROW_H / 2;
      g.font = "10px " + FONT;
      g.textBaseline = "middle";
      g.textAlign = "right";
      g.fillStyle = i === 0 ? "#ffd23f" : "#ff9f1c";
      g.fillText(String(i + 1), PANEL_X + 52, cy);
      // mini-testa 24×24 (downscale nearest della testa 160×160 già baked)
      const entry = Game.sprites.store[c.id];
      if (entry && entry.head) g.drawImage(entry.head, 0, 0, HEAD, HEAD, PANEL_X + 64, rowY + 3, 24, 24);
      g.textAlign = "left";
      g.fillStyle = i === 0 ? "#ffd23f" : "#f4ecff";
      g.fillText((i === 0 ? "♛ " : "") + c.name, PANEL_X + 96, cy);
    });

    // footer: disclaimer + firma
    g.textAlign = "center"; g.textBaseline = "top";
    g.font = "7px " + FONT;
    g.fillStyle = "#8f7db0";
    g.fillText("Satira. Nessuna persona è stata davvero buttata giù dalla torre.", 320, footTop);
    g.fillStyle = "#b9a7d6";
    g.fillText("CHI BUTTI GIÙ DALLA TORRE?", 320, footTop + 17);

    return canvas;
  }

  // ---- testo di fallback / didascalia dello share ----
  function rankingText(ordered) {
    const medals = ["\u{1F3C6}", "\u{1F948}", "\u{1F949}"]; // 🏆 🥈 🥉
    const lines = ordered.map((c, i) =>
      (i < 3 ? medals[i] + " " : "") + (i + 1) + ". " + c.name);
    return "\u{1F3F0} " + TITLE + "\n\n" + lines.join("\n") +
      "\n\nSopravvissuti: 1 su " + ordered.length +
      ". Satira: nessuno è stato davvero buttato giù dalla torre.";
  }

  function shortText(ordered) {
    return "\u{1F3C6} Vince " + ordered[0].name +
      "! Sopravvissuti: 1 su " + ordered.length + ".";
  }

  // ---- copia negli appunti (clipboard API, poi fallback legacy) ----
  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { /* ok resta false */ }
    ta.remove();
    if (!ok) throw new Error("copia negli appunti non riuscita");
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return; }
      catch (e) { /* permesso negato: tenta il fallback legacy */ }
    }
    legacyCopy(text);
  }

  // Condivide la classifica finale. Risolve con 'shared' | 'downloaded' |
  // rende la card e prova a produrne il blob PNG. Con foto tainted (file://)
  // il SecurityError arriva sincrono nel try; ritorna null → fallback testo.
  async function renderBlob(winner, ordered) {
    await loadFonts();
    const canvas = renderCard(winner, ordered);
    try {
      return await new Promise((res, rej) => {
        try { canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob null"))), "image/png"); }
        catch (e) { rej(e); }
      });
    } catch (e) { return null; }
  }

  function downloadBlob(blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = FILE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // revoke tardivo: con "chiedi dove salvare" attivo il download parte solo
    // alla conferma dell'utente, e un revoke precoce lo romperebbe
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  // Share sheet solo su dispositivi touch/mobile: su desktop (es. Chromium su
  // macOS) il file passato allo share sheet nativo viene materializzato con un
  // nome temporaneo che PERDE l'estensione .png — meglio il download diretto,
  // dove a.download garantisce il nome esatto.
  function isTouchDevice() {
    return navigator.maxTouchPoints > 0 &&
      window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  }

  // Scarica SEMPRE il PNG (nessuno share sheet). Risolve con 'downloaded';
  // se il PNG è impossibile (canvas tainted da file://) copia il testo → 'copied'.
  S.downloadRanking = async function (winner, ordered) {
    const blob = await renderBlob(winner, ordered);
    if (blob) { downloadBlob(blob); return "downloaded"; }
    await copyText(rankingText(ordered));
    return "copied";
  };

  // 'copied' | 'cancelled' (share sheet annullato dall'utente); rigetta solo
  // per errori imprevisti.
  S.shareRanking = async function (winner, ordered) {
    const blob = await renderBlob(winner, ordered);

    if (blob) {
      // 2) share sheet nativo con allegato: SOLO su touch/mobile (vedi
      //    isTouchDevice) e solo con user activation ancora attiva: per spec
      //    share() la richiede, e senza la promise può restare pendente per
      //    sempre (pulsante bloccato su "…")
      try {
        const file = new File([blob], FILE_NAME, { type: "image/png" });
        const activated = !navigator.userActivation || navigator.userActivation.isActive;
        if (isTouchDevice() && activated && navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: TITLE, text: shortText(ordered) });
          return "shared";
        }
      } catch (e) {
        if (e && e.name === "AbortError") return "cancelled";
        // share negato/fallito per altro motivo: si prosegue col download
      }
      // 3) niente share sheet: download diretto del PNG
      downloadBlob(blob);
      return "downloaded";
    }

    // 4) niente PNG possibile: copia la classifica come testo
    await copyText(rankingText(ordered));
    return "copied";
  };
})();
