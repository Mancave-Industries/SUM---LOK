// board.js — grid creation, word placement, spacing validation,
// adjacency calculations, coordinate conversion. No DOM access.

import { pickWordSet } from "./words.js";

export const GRID_SIZE = 8;
export const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"];

const NEIGHBOR_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

/** Deterministic PRNG (mulberry32). Same seed -> same sequence. */
export function createRng(seed) {
  let a =
    seed == null
      ? (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
      : seed >>> 0;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.seed = a >>> 0;
  return rng;
}

export function rowColToLabel(row, col) {
  return `${COLS[col]}${row + 1}`;
}

export function labelToRowCol(label) {
  const col = COLS.indexOf(label[0].toUpperCase());
  const row = parseInt(label.slice(1), 10) - 1;
  return { row, col };
}

function cellKey(row, col) {
  return row * GRID_SIZE + col;
}

function inBounds(row, col, size) {
  return row >= 0 && row < size && col >= 0 && col < size;
}

function wordCells(word, row, col, orientation) {
  const cells = [];
  for (let i = 0; i < word.length; i++) {
    cells.push(orientation === "H" ? { row, col: col + i } : { row: row + i, col });
  }
  return cells;
}

/** Attempts to place every word (with an 8-direction buffer between words). */
function tryPlaceAll(words, size, rng, maxAttemptsPerWord) {
  const reserved = new Set();
  const placements = [];

  for (const word of words) {
    let placed = null;

    for (let attempt = 0; attempt < maxAttemptsPerWord; attempt++) {
      const orientation = rng() < 0.5 ? "H" : "V";
      let row, col;
      if (orientation === "H") {
        row = Math.floor(rng() * size);
        col = Math.floor(rng() * (size - word.length + 1));
      } else {
        row = Math.floor(rng() * (size - word.length + 1));
        col = Math.floor(rng() * size);
      }

      const cells = wordCells(word, row, col, orientation);
      const fits = cells.every((c) => !reserved.has(cellKey(c.row, c.col)));
      if (!fits) continue;

      for (const c of cells) {
        reserved.add(cellKey(c.row, c.col));
        for (const [dr, dc] of NEIGHBOR_OFFSETS) {
          const nr = c.row + dr;
          const nc = c.col + dc;
          if (inBounds(nr, nc, size)) reserved.add(cellKey(nr, nc));
        }
      }

      placed = { word, orientation, row, col, cells };
      break;
    }

    if (!placed) return null;
    placements.push(placed);
  }

  return placements;
}

/**
 * Generates a full, validated board: an 8x8 grid of cell objects plus a
 * word list. Retries with a fresh word set / placement order whenever a
 * board can't be completed rather than relaxing the spacing rule.
 */
export function generateBoard({
  rng = createRng(),
  size = GRID_SIZE,
  maxBoardAttempts = 300,
  maxAttemptsPerWord = 400,
} = {}) {
  for (let boardAttempt = 0; boardAttempt < maxBoardAttempts; boardAttempt++) {
    const words = pickWordSet(rng);
    // Try a handful of placement orders for this word set before giving
    // up on it entirely and drawing a fresh set of words.
    for (let orderAttempt = 0; orderAttempt < 5; orderAttempt++) {
      const order = shuffle(words, rng);
      const placements = tryPlaceAll(order, size, rng, maxAttemptsPerWord);
      if (placements) {
        return buildBoardFromPlacements(placements, size);
      }
    }
  }
  throw new Error("Failed to generate a valid board after maximum attempts");
}

function shuffle(arr, rng) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createEmptyGrid(size) {
  const grid = [];
  for (let row = 0; row < size; row++) {
    const line = [];
    for (let col = 0; col < size; col++) {
      line.push({
        row,
        col,
        hiddenLetter: null,
        wordId: null,
        wordIndex: null,
        state: "unknown",
        attemptedLetters: [],
        resolved: false,
      });
    }
    grid.push(line);
  }
  return grid;
}

function buildBoardFromPlacements(placements, size) {
  const grid = createEmptyGrid(size);
  const words = placements.map((p) => {
    const id = `w${p.word.length}`;
    p.cells.forEach((c, idx) => {
      const cell = grid[c.row][c.col];
      cell.hiddenLetter = p.word[idx];
      cell.wordId = id;
      cell.wordIndex = idx;
    });
    return {
      id,
      word: p.word,
      length: p.word.length,
      orientation: p.orientation,
      cells: p.cells,
      completed: false,
    };
  });
  // Keep word list ordered longest-first for stable UI display regardless
  // of the randomised placement order.
  words.sort((a, b) => b.length - a.length);
  return { grid, words, size };
}

export function isAdjacentToHiddenWord(grid, row, col) {
  const size = grid.length;
  for (const [dr, dc] of NEIGHBOR_OFFSETS) {
    const nr = row + dr;
    const nc = col + dc;
    if (inBounds(nr, nc, size) && grid[nr][nc].hiddenLetter !== null) {
      return true;
    }
  }
  return false;
}
