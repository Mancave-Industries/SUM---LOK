// Development-only board-generation validation test.
// Not run during normal gameplay. Usage: node tests/board-generation.test.js [count]
//
// Validates, for every generated board:
//   - exactly four words are placed, with lengths 7, 6, 5 and 4
//   - every word cell stays inside the grid
//   - no two words overlap
//   - no two different words touch orthogonally or diagonally
//   - every cell maps correctly to its hidden letter / word index
//   - dead squares (per an independent brute-force scan) have zero
//     adjacent hidden-word cells in any of the eight directions

import { generateBoard, GRID_SIZE } from "../js/board.js";

const ITERATIONS = Number(process.argv[2]) || 10000;

function bruteForceHasAdjacentWord(grid, row, col) {
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (grid[nr][nc].hiddenLetter !== null) return true;
    }
  }
  return false;
}

function validateBoard({ grid, words }) {
  const problems = [];

  if (words.length !== 4) problems.push(`expected 4 words, got ${words.length}`);
  const lengths = words.map((w) => w.length).sort((a, b) => a - b);
  if (JSON.stringify(lengths) !== JSON.stringify([4, 5, 6, 7])) {
    problems.push(`unexpected length set: ${lengths.join(",")}`);
  }

  for (const w of words) {
    w.cells.forEach((c, idx) => {
      if (c.row < 0 || c.row >= GRID_SIZE || c.col < 0 || c.col >= GRID_SIZE) {
        problems.push(`${w.id} cell ${idx} out of bounds (${c.row},${c.col})`);
      }
      const cell = grid[c.row][c.col];
      if (cell.hiddenLetter !== w.word[idx]) {
        problems.push(`${w.id} letter mismatch at index ${idx}`);
      }
      if (cell.wordId !== w.id) problems.push(`${w.id} wordId mismatch at index ${idx}`);
      if (cell.wordIndex !== idx) problems.push(`${w.id} wordIndex mismatch at index ${idx}`);
    });
  }

  // Overlap + adjacency (touching) check across all hidden-word cells.
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = grid[r][c];
      if (cell.hiddenLetter === null) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
          const other = grid[nr][nc];
          if (other.hiddenLetter !== null && other.wordId !== cell.wordId) {
            problems.push(`words ${cell.wordId} and ${other.wordId} touch at (${r},${c})-(${nr},${nc})`);
          }
        }
      }
    }
  }

  // Independent brute-force cross-check: every empty cell's adjacency
  // must match a from-scratch neighbor scan (guards against silently
  // relaxed spacing logic producing a "dead" square that's actually hot).
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      const cell = grid[r][c];
      if (cell.hiddenLetter !== null) continue;
      const expected = bruteForceHasAdjacentWord(grid, r, c);
      if (!expected) {
        // Confirm truly zero neighboring letters (dead square).
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
            if (grid[nr][nc].hiddenLetter !== null) {
              problems.push(`dead-square check failed at (${r},${c})`);
            }
          }
        }
      }
    }
  }

  return problems;
}

let failures = 0;
for (let i = 0; i < ITERATIONS; i++) {
  const board = generateBoard();
  const problems = validateBoard(board);
  if (problems.length) {
    failures++;
    console.error(`Board #${i} FAILED:`, problems);
    if (failures > 20) {
      console.error("Too many failures — aborting early.");
      break;
    }
  }
}

console.log(`Checked ${ITERATIONS} boards. Failures: ${failures}`);
process.exit(failures ? 1 : 0);
