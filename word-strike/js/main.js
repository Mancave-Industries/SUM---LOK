// main.js — application bootstrap and event wiring.

import * as Game from "./game.js";
import * as UI from "./ui.js";
import * as Audio from "./audio.js";
import * as Storage from "./storage.js";
import { GRID_SIZE } from "./board.js";

const params = new URLSearchParams(location.search);
const DEBUG = params.get("debug") === "true";

let dom = null;
let game = null;
let debugPanelEl = null;

function init() {
  dom = UI.queryDom();

  const prefs = Storage.getPrefs();
  Audio.setEnabled(prefs.soundEnabled);
  updateSoundButtons(prefs.soundEnabled);

  const reduceMotion =
    prefs.reducedMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.documentElement.classList.toggle("reduce-motion", !!reduceMotion);

  UI.buildGridLabels(dom);
  UI.buildGrid(dom, onCellActivate);
  UI.buildAlphabet(dom, onLetterActivate);
  UI.buildRadar(dom);
  UI.buildWordProgress(dom);

  wireStartScreen();
  wireGameScreen();
  wireOverlays();

  if (Storage.loadGame()) {
    dom.resumeBanner.classList.remove("hidden");
  }

  if (DEBUG) setupDebugPanel();

  UI.showScreen(dom, "start");
}

function updateSoundButtons(enabled) {
  dom.btnSound.setAttribute("aria-pressed", String(enabled));
  dom.btnSound.textContent = enabled ? "SND" : "MUTE";
  dom.btnSoundStart.setAttribute("aria-pressed", String(enabled));
  dom.btnSoundStartLabel.textContent = enabled ? "SOUND: ON" : "SOUND: OFF";
}

function toggleSound() {
  const enabled = !Audio.isEnabled();
  Audio.setEnabled(enabled);
  Storage.savePrefs({ soundEnabled: enabled });
  updateSoundButtons(enabled);
}

// ---------- Screen wiring ----------

function wireStartScreen() {
  dom.btnBegin.addEventListener("click", () => {
    startNewGame(dom.selectDifficulty.value);
  });
  dom.btnResume.addEventListener("click", resumeGame);
  dom.btnNewInstead.addEventListener("click", () => {
    Storage.clearSavedGame();
    dom.resumeBanner.classList.add("hidden");
  });
  dom.btnHowto.addEventListener("click", () => UI.openOverlay(dom.overlayHelp));
  dom.btnStats.addEventListener("click", () => {
    UI.renderStats(dom, Storage.deriveStatsView(Storage.getStats()));
    UI.openOverlay(dom.overlayStats);
  });
  dom.btnSoundStart.addEventListener("click", toggleSound);
}

function wireGameScreen() {
  dom.btnMenu.addEventListener("click", () => UI.showScreen(dom, "start"));
  dom.btnSound.addEventListener("click", toggleSound);
  dom.btnHelp.addEventListener("click", () => UI.openOverlay(dom.overlayHelp));
  dom.btnRestart.addEventListener("click", () => UI.openOverlay(dom.overlayConfirm));
  dom.btnLogToggle.addEventListener("click", () => {
    UI.renderShotLog(dom, game);
    dom.shotLogPanel.classList.toggle("hidden");
  });
  dom.btnLogClose.addEventListener("click", () => dom.shotLogPanel.classList.add("hidden"));
  dom.btnRadarToggle.addEventListener("click", () => {
    UI.updateRadar(dom, game);
    dom.radarPanel.classList.toggle("hidden");
  });
  dom.btnRadarClose.addEventListener("click", () => dom.radarPanel.classList.add("hidden"));

  document.addEventListener("keydown", (e) => {
    if (!dom.screenGame.classList.contains("active")) return;
    if (!game || game.gameOver || !game.selected) return;
    const key = e.key.toUpperCase();
    if (/^[A-Z]$/.test(key)) onLetterActivate(key);
  });
}

function wireOverlays() {
  document.querySelectorAll(".btn-close-overlay").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.close;
      if (targetId) UI.closeOverlay(document.getElementById(targetId));
    });
  });
  [dom.overlayHelp, dom.overlayStats, dom.overlayTutorial].forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) UI.closeOverlay(overlay);
    });
  });

  dom.btnConfirmCancel.addEventListener("click", () => UI.closeOverlay(dom.overlayConfirm));
  dom.btnConfirmRestart.addEventListener("click", () => {
    UI.closeOverlay(dom.overlayConfirm);
    startNewGame(game ? game.difficulty : dom.selectDifficulty.value);
  });

  dom.btnViewBoard.addEventListener("click", () => UI.closeOverlay(dom.overlayResult));
  dom.btnPlayAgain.addEventListener("click", () => {
    UI.closeOverlay(dom.overlayResult);
    startNewGame(game.difficulty);
  });

  dom.btnTutorialStart.addEventListener("click", () => {
    Storage.savePrefs({ tutorialSeen: true });
    UI.closeOverlay(dom.overlayTutorial);
  });
}

// ---------- Game lifecycle ----------

function startNewGame(difficulty) {
  const seedParam = params.get("seed");
  const seed = DEBUG && seedParam ? Number(seedParam) : null;

  game = Game.createGame({ difficulty, seed });
  Storage.saveGame(game);
  dom.resumeBanner.classList.add("hidden");

  UI.showScreen(dom, "game");
  refreshAll();
  UI.setStatus(dom, "idle");
  dom.shotLogPanel.classList.add("hidden");
  dom.radarPanel.classList.add("hidden");

  const config = Game.getConfig(game);
  if (config.revealRegions) {
    highlightRegions(Game.getRegionHints(game));
    UI.showRegionHint(dom);
  }

  const prefs = Storage.getPrefs();
  if (!prefs.tutorialSeen) {
    UI.openOverlay(dom.overlayTutorial);
  }

  if (DEBUG) refreshDebugPanel();
}

function resumeGame() {
  const saved = Storage.loadGame();
  if (!saved) return;
  game = saved;
  dom.resumeBanner.classList.add("hidden");
  UI.showScreen(dom, "game");
  refreshAll();
  UI.setStatus(dom, "idle", game.selected ? "SELECT A LETTER TO FIRE" : undefined);
  if (DEBUG) refreshDebugPanel();
}

function highlightRegions(hints) {
  const flagged = [];
  hints.forEach((hint) => {
    for (let r = Math.max(0, hint.minRow); r <= Math.min(GRID_SIZE - 1, hint.maxRow); r++) {
      for (let c = Math.max(0, hint.minCol); c <= Math.min(GRID_SIZE - 1, hint.maxCol); c++) {
        const el = dom.cellEls[r][c];
        el.classList.add("cell--region-hint");
        flagged.push(el);
      }
    }
  });
  setTimeout(() => flagged.forEach((el) => el.classList.remove("cell--region-hint")), 3200);
}

function onCellActivate(row, col) {
  if (!game || game.gameOver) return;
  const cell = game.grid[row][col];
  if (cell.resolved) return;
  const res = Game.selectCell(game, row, col);
  if (res.ok) {
    Audio.play("select");
    Storage.saveGame(game);
    refreshAll();
    UI.setStatus(dom, "selected");
  }
}

function onLetterActivate(letter) {
  if (!game || game.gameOver || !game.selected) return;
  const { row, col } = game.selected;
  const result = Game.resolveShot(game, row, col, letter);
  handleResult(result, row, col);
}

const FLASH_CLASS = {
  exact: "cell--flash-exact",
  live: "cell--flash-live",
  hot: "cell--flash-hot",
  dead: "cell--flash-dead",
};

function handleResult(result, row, col) {
  if (result.type === "blocked-duplicate" || result.type === "not-in-rack") {
    Audio.play("duplicate");
    UI.setStatus(dom, result.type);
    return;
  }
  if (result.type === "invalid" || result.type === "ignored") return;

  // Render the resolved state first, then layer the flash animation on top
  // of it — flashing before rendering would have the very next render wipe
  // the flash class before the browser ever paints it.
  refreshAll();
  Audio.play(result.type);
  if (FLASH_CLASS[result.type]) UI.flashCell(dom, row, col, FLASH_CLASS[result.type]);
  if (result.type === "exact") {
    UI.flashWordProgressLetter(dom, result.cell.wordId, result.cell.wordIndex);
  }

  const statusKey = result.type === "live" && result.strikeUsed ? "live-strike" : result.type;
  UI.setStatus(dom, statusKey);

  if (result.lastStand) {
    Audio.play("lastStand", 0.15);
    setTimeout(() => {
      if (!game.gameOver) UI.setStatus(dom, "last-stand");
    }, 260);
  } else if (result.wordCompleted) {
    Audio.play("complete", 0.15);
    UI.flashWordComplete(dom, result.wordCompleted);
    setTimeout(() => {
      if (!game.gameOver) UI.setStatus(dom, "idle", "TARGET WORD DESTROYED");
    }, 260);
  } else if (!game.gameOver && game.strikesRemaining === 1) {
    setTimeout(() => UI.setStatus(dom, "idle", "FINAL STRIKE"), 260);
  } else if (!game.gameOver && game.strikesRemaining === 5 && (result.type === "hot" || result.type === "dead")) {
    Audio.play("warning", 0.2);
  }

  if (game.gameOver) {
    finishGame();
  } else {
    Storage.saveGame(game);
  }

  if (DEBUG) refreshDebugPanel();
}

function finishGame() {
  Storage.clearSavedGame();
  const won = game.outcome === "win";
  Storage.recordGameResult({
    won,
    remainingStrikes: game.strikesRemaining,
    elapsedSeconds: Game.elapsedSeconds(game),
    exactStrikes: game.stats.exactStrikes,
    deadSquares: game.stats.deadSquares,
  });
  refreshAll();
  setTimeout(() => {
    Audio.play(won ? "victory" : "defeat");
    UI.renderResult(dom, game, { won });
    UI.openOverlay(dom.overlayResult);
  }, won ? 550 : 320);
}

function refreshAll() {
  UI.updateGrid(dom, game);
  UI.updateWordProgress(dom, game);
  UI.renderRack(dom, game);
  UI.updateStrikes(dom, game);
  UI.updateScore(dom, game);
  UI.updateTargetLine(dom, game);
  if (!dom.shotLogPanel.classList.contains("hidden")) UI.renderShotLog(dom, game);
  if (!dom.radarPanel.classList.contains("hidden")) UI.updateRadar(dom, game);
}

// ---------- Debug mode (?debug=true) ----------

function setupDebugPanel() {
  debugPanelEl = document.createElement("div");
  debugPanelEl.id = "debug-panel";
  debugPanelEl.className = "debug-panel";
  document.body.appendChild(debugPanelEl);

  // Debug-only introspection hook for automated end-to-end testing.
  window.__wordstrike = {
    isGameOver: () => !!(game && game.gameOver),
    getOutcome: () => (game ? game.outcome : null),
    getWords: () => (game ? JSON.parse(JSON.stringify(game.words)) : []),
    getRack: () => (game ? game.rack.slice() : []),
    forceRackInclude: (letter) => {
      if (!game) return;
      if (!game.rack.includes(letter)) game.rack[0] = letter;
      UI.renderRack(dom, game);
    },
    setStrikes: (n) => {
      if (!game) return;
      game.strikesRemaining = n;
      refreshAll();
    },
  };
}

function refreshDebugPanel() {
  if (!debugPanelEl || !game) return;
  const wordLines = game.words
    .map((w) => `${w.id} ${w.word} [${w.orientation}] @${w.cells[0].row},${w.cells[0].col}`)
    .join("<br>");
  debugPanelEl.innerHTML = `
    <strong>DEBUG</strong> seed=${game.seed} difficulty=${game.difficulty}<br>
    ${wordLines}<br>
    rack: ${(game.rack || []).slice().sort().join(" ")}<br>
    <button id="debug-regen">REGENERATE BOARD</button>
  `;
  document.getElementById("debug-regen").addEventListener("click", () => {
    startNewGame(game.difficulty);
  });
}

document.addEventListener("DOMContentLoaded", init);
