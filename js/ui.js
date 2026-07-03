// ui.js — gestione DOM: nameplate, VS, contatore round, banner, classifica, risultati.
(function () {
  "use strict";
  const Game = window.Game;
  const UI = (Game.ui = {});

  let el = {};
  let rankSlots = [];          // rank(1..N) -> <li>
  let TOTAL = 16;              // default (Murgia + MATCH_CHALLENGERS), passato da buildRanking(total)

  // callback impostati dalla state machine
  UI.onPick = null;            // (side) => void   side: 'left'|'right'
  UI.onHover = null;           // (side|null) => void
  UI.onStart = null;
  UI.onRematch = null;

  UI.init = function () {
    el = {
      plateL: document.getElementById("plate-left"),
      plateR: document.getElementById("plate-right"),
      vs: document.getElementById("vs-text"),
      round: document.getElementById("round-counter"),
      banner: document.getElementById("challenger-banner"),
      title: document.getElementById("title-screen"),
      startBtn: document.getElementById("start-btn"),
      loadFill: document.getElementById("loading-fill"),
      loadLabel: document.getElementById("loading-label"),
      loadRow: document.getElementById("loading-row"),
      results: document.getElementById("results-screen"),
      winnerName: document.getElementById("winner-name"),
      winnerRole: document.getElementById("winner-role"),
      winnerCanvas: document.getElementById("winner-canvas"),
      finalRanking: document.getElementById("final-ranking"),
      rematchBtn: document.getElementById("rematch-btn"),
      rankingList: document.getElementById("ranking-list"),
      muteBtn: document.getElementById("mute-btn"),
      canvas: document.getElementById("game"),
    };

    // nameplate: hover + click
    for (const [node, side] of [[el.plateL, "left"], [el.plateR, "right"]]) {
      node.addEventListener("mouseenter", () => UI.onHover && UI.onHover(side));
      node.addEventListener("mouseleave", () => UI.onHover && UI.onHover(null));
      node.addEventListener("click", () => UI.onPick && UI.onPick(side));
    }
    el.startBtn.addEventListener("click", () => UI.onStart && UI.onStart());
    el.rematchBtn.addEventListener("click", () => UI.onRematch && UI.onRematch());
    el.muteBtn.addEventListener("click", () => {
      const m = Game.audio.toggleMute();
      el.muteBtn.textContent = "AUDIO: " + (m ? "OFF" : "ON");
    });

    UI.buildRanking((Game.cfg.MATCH_CHALLENGERS || 15) + 1);
  };

  // ---- loading ----
  UI.setLoading = function (frac) {
    el.loadFill.style.width = Math.round(frac * 100) + "%";
    el.loadLabel.textContent = frac >= 1 ? "PRONTO!" : "CARICAMENTO… " + Math.round(frac * 100) + "%";
  };
  UI.showStart = function () {
    el.loadRow.classList.add("hidden");
    el.startBtn.classList.remove("hidden");
  };
  UI.hideTitle = function () { el.title.classList.add("hidden"); };

  // ---- nameplate ----
  UI.setNameplates = function (leftChar, rightChar) {
    fillPlate(el.plateL, leftChar);
    fillPlate(el.plateR, rightChar);
    el.plateL.classList.remove("dimmed", "candidate");
    el.plateR.classList.remove("dimmed", "candidate");
  };
  function fillPlate(node, char) {
    node.querySelector(".np-name").textContent = char ? char.name : "—";
    node.querySelector(".np-role").textContent = char ? char.role : "—";
  }
  UI.highlight = function (side) {
    el.plateL.classList.toggle("candidate", side === "left");
    el.plateR.classList.toggle("candidate", side === "right");
    el.plateL.classList.toggle("dimmed", side === "right");
    el.plateR.classList.toggle("dimmed", side === "left");
  };
  UI.clearHighlight = function () {
    el.plateL.classList.remove("candidate", "dimmed");
    el.plateR.classList.remove("candidate", "dimmed");
  };

  UI.setRound = function (n, total) {
    el.round.textContent = "ROUND " + n + "/" + total;
  };

  UI.showBanner = function () {
    el.banner.classList.remove("hidden");
    // riavvia animazione
    el.banner.querySelector("span").style.animation = "none";
    void el.banner.offsetWidth;
    el.banner.querySelector("span").style.animation = "";
  };
  UI.hideBanner = function () { el.banner.classList.add("hidden"); };

  UI.setCanvasPickable = function (on) {
    el.canvas.classList.toggle("can-pick", !!on);
  };

  // ---- classifica ----
  UI.buildRanking = function (total) {
    TOTAL = total || TOTAL;
    el.rankingList.innerHTML = "";
    rankSlots = [];
    for (let r = 1; r <= TOTAL; r++) {
      const li = document.createElement("li");
      li.className = "empty";
      const rk = document.createElement("span"); rk.className = "rk"; rk.textContent = r;
      const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = "\u2014";
      li.append(rk, nm);
      el.rankingList.appendChild(li);
      rankSlots[r] = li;
    }
  };

  UI.setRank = function (rank, char, opts) {
    opts = opts || {};
    const li = rankSlots[rank];
    if (!li) return;
    li.classList.remove("empty");
    if (rank === 1) li.classList.add("champion");
    const crown = rank === 1 ? "\u265B " : "";
    li.textContent = "";
    const rk = document.createElement("span"); rk.className = "rk"; rk.textContent = rank;
    const img = document.createElement("img"); img.alt = ""; img.src = char.faceImage;
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = crown + char.name;
    li.append(rk, img, nm);
    if (opts.flash !== false) {
      li.classList.add("flash");
      setTimeout(() => li.classList.remove("flash"), 700);
      li.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  };

  UI.resetRanking = function (total) { UI.buildRanking(total); };

  // ---- risultati ----
  UI.showResults = function (winner, ordered) {
    el.winnerName.textContent = winner.name;
    el.winnerRole.textContent = winner.years + " · " + winner.role;
    // sprite grande del vincitore
    const wc = el.winnerCanvas.getContext("2d");
    wc.imageSmoothingEnabled = false;
    wc.clearRect(0, 0, el.winnerCanvas.width, el.winnerCanvas.height);
    // scala 1.0: gli sprite ora sono 144×224+testa con blocchi nativi da 4px,
    // così i blocchi restano interi (pixel-perfect) nel canvas 176×272.
    Game.sprites.drawBig(wc, winner.id, el.winnerCanvas.width / 2, el.winnerCanvas.height - 16, 1.0, "cheer");
    // classifica finale
    el.finalRanking.innerHTML = "";
    ordered.forEach((c, i) => {
      const li = document.createElement("li");
      if (i === 0) li.classList.add("top1");
      const rk = document.createElement("span"); rk.className = "rk"; rk.textContent = i + 1;
      const img = document.createElement("img"); img.alt = ""; img.src = c.faceImage;
      const nm = document.createElement("span"); nm.textContent = (i === 0 ? "\u265B " : "") + c.name;
      li.append(rk, img, nm);
      el.finalRanking.appendChild(li);
    });
    el.results.classList.remove("hidden");
  };
  UI.hideResults = function () { el.results.classList.add("hidden"); };
})();
