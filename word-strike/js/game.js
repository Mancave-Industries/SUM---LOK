// game.js — core state, shot resolution, strikes, scoring, statistics,
// win/loss checks. No DOM access.

import { generateBoard, createRng, isAdjacentToHiddenWord, rowColToLabel } from "./board.js";

export const DIFFICULTIES = {
  standard: {
    id: "standard",
    label: "STANDARD",
    strikes: 20,
    size: 8,
    revealRegions: false,
    fadeMarkers: false,
  },
  recruit: {
    id: "recruit",
    label: "RECRUIT",
    strikes: 22,
    size: 8,
    revealRegions: true,
    fadeMarkers: false,
  },
  veteran: {
    id: "veteran",
    label: "VETERAN",
    strikes: 17,
    size: 8,
    revealRegions: false,
    fadeMarkers: false,
  },
  blackout: {
    id: "blackout",
    label: "BLACKOUT",
    strikes: 15,
    size: 8,
    revealRegions: false,
    fadeMarkers: true,
    fadeAfterTurns: 6,
  },
};

export const SCORING = {
  exact: 100,
  liveNewLetter: 15,
  hot: 5,
  dead: 0,
  wordBonus: { 4: 400, 5: 500, 6: 600, 7: 700 },
  strikeRemaining: 250,
  victoryBonus: 1000,
};

export function createGame({ difficulty = "standard", seed = null } = {}) {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
  const rng = createRng(seed);
  const board = generateBoard({ rng, size: config.size });

  return {
    difficulty: config.id,
    seed: rng.seed,
    size: board.size,
    grid: board.grid,
    words: board.words,
    strikesStarting: config.strikes,
    strikesRemaining: config.strikes,
    score: 0,
    selected: null,
    gameOver: false,
    outcome: null,
    startTime: Date.now(),
    endTime: null,
    turnCounter: 0,
    stats: {
      shotsTotal: 0,
      exactStrikes: 0,
      liveContacts: 0,
      hotSquares: 0,
      deadSquares: 0,
      duplicatesBlocked: 0,
      wordsCompleted: 0,
    },
    shotLog: [],
  };
}

export function getConfig(game) {
  return DIFFICULTIES[game.difficulty] || DIFFICULTIES.standard;
}

export function allWordsComplete(game) {
  return game.words.every((w) => w.completed);
}

export function elapsedSeconds(game) {
  const end = game.endTime || Date.now();
  return Math.max(0, Math.floor((end - game.startTime) / 1000));
}

export function selectCell(game, row, col) {
  if (game.gameOver) return { ok: false, reason: "game-over" };
  const cell = game.grid[row]?.[col];
  if (!cell) return { ok: false, reason: "out-of-bounds" };
  if (cell.resolved) return { ok: false, reason: "already-resolved" };
  game.selected = { row, col };
  return { ok: true };
}

export function clearSelection(game) {
  game.selected = null;
}

function findWord(game, wordId) {
  return game.words.find((w) => w.id === wordId) || null;
}

function checkWordCompletion(game, word) {
  const complete = word.cells.every(
    (c) => game.grid[c.row][c.col].state === "exact"
  );
  if (complete && !word.completed) {
    word.completed = true;
    game.stats.wordsCompleted += 1;
    game.score += SCORING.wordBonus[word.length] || 0;
    return true;
  }
  return false;
}

function endVictory(game) {
  game.gameOver = true;
  game.outcome = "win";
  game.endTime = Date.now();
  game.score += SCORING.victoryBonus + game.strikesRemaining * SCORING.strikeRemaining;
}

function endDefeat(game) {
  game.gameOver = true;
  game.outcome = "loss";
  game.endTime = Date.now();
  for (const row of game.grid) {
    for (const cell of row) {
      if (cell.hiddenLetter !== null && cell.state !== "exact") {
        cell.revealedAfterLoss = true;
      }
    }
  }
  for (const word of game.words) {
    if (!word.completed) word.revealedAfterLoss = true;
  }
}

/**
 * Resolves a fired letter against a grid square, following the fixed
 * outcome order: invalid -> blocked duplicate -> exact -> live -> hot/dead,
 * then always checks victory before defeat.
 */
export function resolveShot(game, row, col, letter) {
  if (game.gameOver) return { type: "ignored" };

  const cell = game.grid[row]?.[col];
  if (!cell || cell.resolved) {
    return { type: "invalid" };
  }

  letter = letter.toUpperCase();

  if (cell.state === "live" && cell.attemptedLetters.includes(letter)) {
    game.stats.duplicatesBlocked += 1;
    return { type: "blocked-duplicate", cell, letter };
  }

  game.turnCounter += 1;
  game.stats.shotsTotal += 1;

  let result;
  let completedWord = null;

  if (cell.hiddenLetter !== null) {
    if (cell.hiddenLetter === letter) {
      cell.state = "exact";
      cell.resolved = true;
      game.stats.exactStrikes += 1;
      game.score += SCORING.exact;
      const word = findWord(game, cell.wordId);
      if (word && checkWordCompletion(game, word)) completedWord = word;
      result = "exact";
    } else {
      cell.state = "live";
      cell.attemptedLetters.push(letter);
      game.stats.liveContacts += 1;
      game.score += SCORING.liveNewLetter;
      result = "live";
    }
  } else if (isAdjacentToHiddenWord(game.grid, row, col)) {
    cell.state = "hot";
    cell.resolved = true;
    cell.resolvedAtTurn = game.turnCounter;
    game.strikesRemaining -= 1;
    game.stats.hotSquares += 1;
    game.score += SCORING.hot;
    result = "hot";
  } else {
    cell.state = "dead";
    cell.resolved = true;
    cell.resolvedAtTurn = game.turnCounter;
    game.strikesRemaining -= 1;
    game.stats.deadSquares += 1;
    game.score += SCORING.dead;
    result = "dead";
  }

  game.shotLog.unshift({
    turn: game.turnCounter,
    coord: rowColToLabel(row, col),
    letter,
    result: result.toUpperCase(),
  });

  game.selected = null;

  if (allWordsComplete(game)) {
    endVictory(game);
  } else if (game.strikesRemaining <= 0) {
    endDefeat(game);
  }

  return {
    type: result,
    cell,
    letter,
    wordCompleted: completedWord,
    gameOver: game.gameOver,
    outcome: game.outcome,
  };
}

/** Bounding-box hints for a brief "region reveal" (Recruit mode only). */
export function getRegionHints(game) {
  return game.words.map((w) => {
    const rows = w.cells.map((c) => c.row);
    const cols = w.cells.map((c) => c.col);
    return {
      wordId: w.id,
      minRow: Math.min(...rows) - 1,
      maxRow: Math.max(...rows) + 1,
      minCol: Math.min(...cols) - 1,
      maxCol: Math.max(...cols) + 1,
    };
  });
}
