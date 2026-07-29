// ui.js — rendering, grid interaction, alphabet controls, overlays,
// messages, animations. Never mutates game state directly; calls into
// game.js and re-renders from the returned/updated state.

import { COLS, GRID_SIZE, rowColToLabel } from "./board.js";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const STATUS_MESSAGES = {
  exact: "EXACT STRIKE — LETTER CONFIRMED",
  live: "LIVE CONTACT — WRONG LETTER",
  hot: "HOT — A WORD IS CLOSE",
  dead: "DEAD — NOTHING NEARBY",
  "blocked-duplicate": "LETTER ALREADY ELIMINATED FOR THIS SQUARE",
  invalid: "SQUARE ALREADY RESOLVED",
  idle: "SELECT A SQUARE TO BEGIN",
  selected: "SELECT A LETTER TO FIRE",
};

export function queryDom() {
  const $ = (id) => document.getElementById(id);
  return {
    screenStart: $("screen-start"),
    screenGame: $("screen-game"),
    resumeBanner: $("resume-banner"),
    btnResume: $("btn-resume"),
    btnNewInstead: $("btn-new-instead"),
    selectDifficulty: $("select-difficulty"),
    btnBegin: $("btn-begin"),
    btnHowto: $("btn-howto"),
    btnStats: $("btn-stats"),
    btnSoundStart: $("btn-sound-start"),
    btnSoundStartLabel: $("btn-sound-start-label"),

    btnMenu: $("btn-menu"),
    strikesValue: $("strikes-value"),
    strikesDisplay: $("strikes-display"),
    scoreValue: $("score-value"),
    btnSound: $("btn-sound"),
    targetLine: $("target-line"),
    wordProgress: $("word-progress"),
    gridColLabels: $("grid-col-labels"),
    gridRowLabels: $("grid-row-labels"),
    grid: $("grid"),
    statusMessage: $("status-message"),
    eliminatedLine: $("eliminated-line"),
    alphabet: $("alphabet"),
    btnLogToggle: $("btn-log-toggle"),
    btnHelp: $("btn-help"),
    btnRestart: $("btn-restart"),
    shotLogPanel: $("shot-log-panel"),
    btnLogClose: $("btn-log-close"),
    shotLogList: $("shot-log-list"),

    overlayHelp: $("overlay-help"),
    overlayStats: $("overlay-stats"),
    statsBody: $("stats-body"),
    overlayConfirm: $("overlay-confirm"),
    btnConfirmCancel: $("btn-confirm-cancel"),
    btnConfirmRestart: $("btn-confirm-restart"),
    overlayResult: $("overlay-result"),
    resultTitle: $("result-title"),
    resultSubtitle: $("result-subtitle"),
    resultWords: $("result-words"),
    resultStats: $("result-stats"),
    btnViewBoard: $("btn-view-board"),
    btnPlayAgain: $("btn-play-again"),
    overlayTutorial: $("overlay-tutorial"),
    btnTutorialStart: $("btn-tutorial-start"),
    regionHintBanner: $("region-hint-banner"),

    cellEls: [],
    letterButtons: {},
  };
}

export function showScreen(dom, name) {
  dom.screenStart.classList.toggle("active", name === "start");
  dom.screenGame.classList.toggle("active", name === "game");
}

// ---------- Grid ----------

export function buildGridLabels(dom) {
  dom.gridColLabels.innerHTML = "";
  COLS.forEach((letter) => {
    const el = document.createElement("div");
    el.className = "grid-label";
    el.textContent = letter;
    dom.gridColLabels.appendChild(el);
  });
  dom.gridRowLabels.innerHTML = "";
  for (let r = 0; r < GRID_SIZE; r++) {
    const el = document.createElement("div");
    el.className = "grid-label";
    el.textContent = String(r + 1);
    dom.gridRowLabels.appendChild(el);
  }
}

export function buildGrid(dom, onCellActivate) {
  dom.grid.innerHTML = "";
  dom.cellEls = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const rowEls = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cell cell--unknown";
      btn.dataset.row = String(row);
      btn.dataset.col = String(col);
      btn.addEventListener("click", () => onCellActivate(row, col));
      dom.grid.appendChild(btn);
      rowEls.push(btn);
    }
    dom.cellEls.push(rowEls);
  }
}

const CELL_GLYPH = { unknown: "", dead: "×", hot: "▲", live: "●" };

function cellAccessibleLabel(cell, coord, isSelected) {
  if (cell.state === "exact") {
    return `Square ${coord}, exact strike, letter ${cell.hiddenLetter}`;
  }
  if (cell.state === "live") {
    const attempted = cell.attemptedLetters.join(", ");
    return `Square ${coord}, live contact${attempted ? `, attempted letters ${attempted}` : ""}`;
  }
  if (cell.state === "hot") return `Square ${coord}, hot signal, word is nearby`;
  if (cell.state === "dead") return `Square ${coord}, dead zone, nothing nearby`;
  return `Square ${coord}, unresolved${isSelected ? ", selected" : ""}`;
}

export function updateGrid(dom, game) {
  const selected = game.selected;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const cell = game.grid[row][col];
      const el = dom.cellEls[row][col];
      const isSelected = !!selected && selected.row === row && selected.col === col;
      const revealed = !!cell.revealedAfterLoss;

      el.className = "cell cell--" + cell.state;
      if (isSelected) el.classList.add("cell--selected");
      if (revealed) el.classList.add("cell--revealed-loss");
      el.disabled = cell.resolved && !isSelected;

      if (cell.state === "exact") {
        el.textContent = cell.hiddenLetter;
      } else if (revealed) {
        el.textContent = cell.hiddenLetter;
      } else {
        el.textContent = CELL_GLYPH[cell.state] || "";
      }

      const coord = rowColToLabel(row, col);
      el.setAttribute("aria-label", cellAccessibleLabel(cell, coord, isSelected));
    }
  }
}

export function flashCell(dom, row, col, effectClass) {
  const el = dom.cellEls[row]?.[col];
  if (!el) return;
  el.classList.add(effectClass);
  const clear = () => el.classList.remove(effectClass);
  el.addEventListener("animationend", clear, { once: true });
  setTimeout(clear, 900);
}

export function flashWordComplete(dom, word) {
  word.cells.forEach((c, i) => {
    setTimeout(() => flashCell(dom, c.row, c.col, "cell--word-complete"), i * 70);
  });
}

// ---------- Word progress ----------

export function renderWordProgress(dom, game) {
  dom.wordProgress.innerHTML = "";
  const sorted = game.words.slice().sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    const row = document.createElement("div");
    row.className = "word-row" + (word.completed ? " word-row--complete" : "");

    const label = document.createElement("span");
    label.className = "word-row-label";
    label.textContent = `${word.length} LETTERS`;
    row.appendChild(label);

    const lettersWrap = document.createElement("span");
    lettersWrap.className = "word-row-letters";
    word.cells.forEach((c) => {
      const cell = game.grid[c.row][c.col];
      const box = document.createElement("span");
      box.className = "letter-box" + (cell.state === "exact" ? " letter-box--filled" : "");
      box.textContent = cell.state === "exact" ? cell.hiddenLetter : "_";
      lettersWrap.appendChild(box);
    });
    row.appendChild(lettersWrap);
    dom.wordProgress.appendChild(row);
  }
}

// ---------- Alphabet ----------

export function buildAlphabet(dom, onLetterActivate) {
  dom.alphabet.innerHTML = "";
  dom.letterButtons = {};
  LETTERS.forEach((letter) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "letter-btn";
    btn.textContent = letter;
    btn.disabled = true;
    btn.addEventListener("click", () => onLetterActivate(letter));
    dom.alphabet.appendChild(btn);
    dom.letterButtons[letter] = btn;
  });
}

export function updateAlphabet(dom, game) {
  const selected = game.selected;
  if (!selected) {
    dom.alphabet.classList.add("alphabet--inactive");
    dom.eliminatedLine.classList.add("hidden");
    LETTERS.forEach((l) => {
      const btn = dom.letterButtons[l];
      btn.disabled = true;
      btn.classList.remove("letter-btn--eliminated");
      btn.setAttribute("aria-label", `Letter ${l}, select a square first`);
    });
    return;
  }

  dom.alphabet.classList.remove("alphabet--inactive");
  const cell = game.grid[selected.row][selected.col];
  const eliminated = new Set(cell.attemptedLetters);

  if (eliminated.size > 0) {
    dom.eliminatedLine.classList.remove("hidden");
    dom.eliminatedLine.textContent = `ELIMINATED: ${cell.attemptedLetters.join(", ")}`;
  } else {
    dom.eliminatedLine.classList.add("hidden");
  }

  LETTERS.forEach((l) => {
    const btn = dom.letterButtons[l];
    const isEliminated = eliminated.has(l);
    btn.disabled = isEliminated;
    btn.classList.toggle("letter-btn--eliminated", isEliminated);
    btn.setAttribute(
      "aria-label",
      `Letter ${l}${isEliminated ? ", previously attempted, unavailable" : ", available"}`
    );
  });
}

// ---------- HUD ----------

export function updateStrikes(dom, game) {
  dom.strikesValue.textContent = String(Math.max(0, game.strikesRemaining));
  dom.strikesDisplay.classList.toggle("strikes--warning", game.strikesRemaining <= 5 && game.strikesRemaining > 1);
  dom.strikesDisplay.classList.toggle("strikes--final", game.strikesRemaining === 1);
}

export function updateScore(dom, game) {
  dom.scoreValue.textContent = String(game.score);
}

export function updateTargetLine(dom, game) {
  if (game.selected) {
    dom.targetLine.textContent = `TARGET: ${rowColToLabel(game.selected.row, game.selected.col)}`;
  } else {
    dom.targetLine.textContent = "NO TARGET SELECTED";
  }
}

export function setStatus(dom, resultTypeOrText, custom) {
  const text = custom || STATUS_MESSAGES[resultTypeOrText] || resultTypeOrText;
  dom.statusMessage.textContent = text;
  dom.statusMessage.className = "status-message status-message--" + (STATUS_MESSAGES[resultTypeOrText] ? resultTypeOrText : "info");
}

// ---------- Shot log ----------

export function renderShotLog(dom, game) {
  dom.shotLogList.innerHTML = "";
  for (const entry of game.shotLog) {
    const li = document.createElement("li");
    li.className = "shot-log-entry shot-log-entry--" + entry.result.toLowerCase();
    li.innerHTML = `<span class="log-turn">${entry.turn}</span><span class="log-coord">${entry.coord}</span><span class="log-letter">${entry.letter}</span><span class="log-result">${entry.result}</span>`;
    dom.shotLogList.appendChild(li);
  }
}

// ---------- Overlays ----------

export function openOverlay(el) {
  el.classList.remove("hidden");
}
export function closeOverlay(el) {
  el.classList.add("hidden");
}

export function renderStats(dom, statsView) {
  const rows = [
    ["Games Played", statsView.gamesPlayed],
    ["Games Won", statsView.gamesWon],
    ["Win %", `${statsView.winPercentage}%`],
    ["Current Streak", statsView.currentStreak],
    ["Best Streak", statsView.bestStreak],
    ["Best Remaining Strikes", statsView.bestRemainingStrikes],
    ["Avg. Remaining Strikes (Wins)", statsView.averageRemainingInWins],
    ["Fastest Victory", statsView.fastestVictorySeconds !== null ? `${statsView.fastestVictorySeconds}s` : "—"],
    ["Total Exact Strikes", statsView.totalExactStrikes],
    ["Total Dead Squares", statsView.totalDeadSquares],
  ];
  dom.statsBody.innerHTML = rows
    .map(([label, value]) => `<div class="stat-row"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

export function renderResult(dom, game, { won }) {
  dom.resultTitle.textContent = won ? "ALL TARGETS ELIMINATED" : "OUT OF STRIKES";
  dom.overlayResult.classList.toggle("overlay--victory", won);
  dom.overlayResult.classList.toggle("overlay--defeat", !won);

  if (won) {
    dom.resultSubtitle.textContent = `WORD GRID CLEARED WITH ${game.strikesRemaining} STRIKE${game.strikesRemaining === 1 ? "" : "S"} REMAINING`;
  } else {
    const remainingLetters = game.words.reduce((sum, w) => {
      if (w.completed) return sum;
      return sum + w.cells.filter((c) => game.grid[c.row][c.col].state !== "exact").length;
    }, 0);
    dom.resultSubtitle.textContent = `${remainingLetters} TARGET LETTER${remainingLetters === 1 ? "" : "S"} REMAINED`;
  }

  const sorted = game.words.slice().sort((a, b) => b.length - a.length);
  dom.resultWords.innerHTML = sorted
    .map((w) => `<div class="result-word${w.completed ? " result-word--found" : ""}">${w.word}</div>`)
    .join("");

  const elapsed = Math.max(0, Math.floor(((game.endTime || Date.now()) - game.startTime) / 1000));
  const stats = [
    ["Remaining Strikes", game.strikesRemaining],
    ["Total Shots", game.stats.shotsTotal],
    ["Exact Strikes", game.stats.exactStrikes],
    ["Live Contacts", game.stats.liveContacts],
    ["Hot Squares", game.stats.hotSquares],
    ["Dead Squares", game.stats.deadSquares],
    ["Elapsed Time", `${elapsed}s`],
    ["Score", game.score],
  ];
  dom.resultStats.innerHTML = stats
    .map(([label, value]) => `<div class="stat-row"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

export function showRegionHint(dom, durationMs = 3200) {
  dom.regionHintBanner.classList.remove("hidden");
  setTimeout(() => dom.regionHintBanner.classList.add("hidden"), durationMs);
}
