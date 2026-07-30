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

// Each turn offers a 12-letter rack rather than the full alphabet. Some of
// the rack is guaranteed to be letters still needed somewhere in the
// unsolved words; the rest are random decoys. A fresh rack is drawn after
// every valid shot.
export const RACK_SIZE = 12;
const RACK_HELPFUL_TARGET = 6;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRemainingNeededLetters(game) {
  const needed = new Set();
  for (const word of game.words) {
    if (word.completed) continue;
    for (const c of word.cells) {
      const cell = game.grid[c.row][c.col];
      if (cell.state !== "exact") needed.add(cell.hiddenLetter);
    }
  }
  return Array.from(needed);
}

/**
 * Builds the next rack: a shuffled mix of letters that are actually still
 * needed somewhere in the unsolved words, topped up with random decoys to
 * reach RACK_SIZE. Not tied to the board's seed — this is a per-turn
 * resource layer on top of the (seed-reproducible) board itself.
 */
export function generateRack(game) {
  const needed = shuffleInPlace(getRemainingNeededLetters(game));
  const helpfulCount = Math.min(needed.length, RACK_HELPFUL_TARGET);
  const rack = needed.slice(0, helpfulCount);

  const decoyPool = shuffleInPlace(ALPHABET.filter((l) => !rack.includes(l)));
  while (rack.length < RACK_SIZE && decoyPool.length) {
    rack.push(decoyPool.pop());
  }

  return shuffleInPlace(rack);
}

export function createGame({ difficulty = "standard", seed = null } = {}) {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.standard;
  const rng = createRng(seed);
  const board = generateBoard({ rng, size: config.size });

  const game = {
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
      lastStandTriggered: false,
    },
    shotLog: [],
    // Per-word arrays of letters confirmed (via any fired shot, anywhere on
    // the board) to appear somewhere in that word — feeds the letter radar.
    radar: Object.fromEntries(board.words.map((w) => [w.id, []])),
    rack: [],
    // One reprieve per game: the shot that would otherwise end the game at
    // 0 strikes instead becomes sudden death — see resolveShot below.
    lastStandUsed: false,
  };
  game.rack = generateRack(game);
  return game;
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

/**
 * Records a fired letter against every word that actually contains it,
 * regardless of which square was targeted or what that square's own
 * result was. This is the radar's data source: firing a letter always
 * tells you which word(s) it belongs to, even on a hot/dead/live miss.
 */
function updateRadarForLetter(game, letter) {
  if (!game.radar) game.radar = {};
  for (const word of game.words) {
    if (!word.word.includes(letter)) continue;
    if (!game.radar[word.id]) game.radar[word.id] = [];
    if (!game.radar[word.id].includes(letter)) game.radar[word.id].push(letter);
  }
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
 * outcome order: invalid -> not in this turn's rack -> blocked duplicate ->
 * exact -> live -> hot/dead, then always checks victory before defeat.
 * Draws a fresh rack on the way out of every shot that actually resolves.
 *
 * A live square's first wrong guess is free; repeat guesses on the same
 * square cost a strike. The first time a strike-costing shot would drop
 * strikes to zero, the game grants one Last Stand reprieve instead of
 * ending: play continues, but the next strike-costing shot ends it for
 * real (see `lastStandUsed` / the `lastStand` field on the return value).
 */
export function resolveShot(game, row, col, letter) {
  if (game.gameOver) return { type: "ignored" };

  const cell = game.grid[row]?.[col];
  if (!cell || cell.resolved) {
    return { type: "invalid" };
  }

  letter = letter.toUpperCase();

  if (!game.rack || !game.rack.includes(letter)) {
    return { type: "not-in-rack", letter };
  }

  if (cell.state === "live" && cell.attemptedLetters.includes(letter)) {
    game.stats.duplicatesBlocked += 1;
    return { type: "blocked-duplicate", cell, letter };
  }

  game.turnCounter += 1;
  game.stats.shotsTotal += 1;
  updateRadarForLetter(game, letter);

  let result;
  let completedWord = null;
  // Whether *this* shot itself spent a strike — the win/loss check below
  // must key off this, not just the ambient strike total, or a free shot
  // fired after a Last Stand reprieve would wrongly end the game (see below).
  let strikeConsumed = false;

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
      // The first wrong guess on a square is free — it's how you find out
      // it's live at all. Every guess after that on the same square is now
      // an informed gamble among remaining candidates, so it costs a strike.
      const isRepeatGuess = cell.attemptedLetters.length > 0;
      cell.state = "live";
      cell.attemptedLetters.push(letter);
      game.stats.liveContacts += 1;
      game.score += SCORING.liveNewLetter;
      if (isRepeatGuess) {
        game.strikesRemaining -= 1;
        strikeConsumed = true;
      }
      result = "live";
    }
  } else if (isAdjacentToHiddenWord(game.grid, row, col)) {
    cell.state = "hot";
    cell.resolved = true;
    cell.resolvedAtTurn = game.turnCounter;
    cell.attemptedLetters.push(letter);
    game.strikesRemaining -= 1;
    strikeConsumed = true;
    game.stats.hotSquares += 1;
    game.score += SCORING.hot;
    result = "hot";
  } else {
    cell.state = "dead";
    cell.resolved = true;
    cell.resolvedAtTurn = game.turnCounter;
    cell.attemptedLetters.push(letter);
    game.strikesRemaining -= 1;
    strikeConsumed = true;
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

  let lastStand = false;

  if (allWordsComplete(game)) {
    endVictory(game);
  } else if (strikeConsumed && game.strikesRemaining <= 0) {
    if (!game.lastStandUsed) {
      // First time hitting zero this game: grant one reprieve instead of
      // ending it. The player stays at 0 strikes; the *next* strike-costing
      // shot (this one doesn't count) ends the game for real.
      game.lastStandUsed = true;
      game.stats.lastStandTriggered = true;
      lastStand = true;
    } else {
      game.lastStandFailed = true;
      endDefeat(game);
    }
  }

  game.rack = generateRack(game);

  return {
    type: result,
    cell,
    letter,
    wordCompleted: completedWord,
    lastStand,
    strikeUsed: strikeConsumed,
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
