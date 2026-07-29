// Development-only gameplay logic tests. Usage: node tests/gameplay.test.js

import { createGame, resolveShot } from "../js/game.js";
import { isAdjacentToHiddenWord } from "../js/board.js";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function freshGame(seed = 12345) {
  return createGame({ difficulty: "standard", seed });
}

function findEmptyCell(game, wantAdjacent) {
  for (let r = 0; r < game.size; r++) {
    for (let c = 0; c < game.size; c++) {
      const cell = game.grid[r][c];
      if (cell.hiddenLetter !== null) continue;
      if (isAdjacentToHiddenWord(game.grid, r, c) === wantAdjacent) return { row: r, col: c };
    }
  }
  return null;
}

function wrongLetterFor(correct) {
  return correct === "A" ? "B" : "A";
}

// 1. Correct letter on a word square: reveals letter, costs zero strikes.
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const before = game.strikesRemaining;
  const result = resolveShot(game, target.row, target.col, word.word[0]);
  assert(result.type === "exact", "case 1: expected exact result");
  assert(game.strikesRemaining === before, "case 1: strikes must not be consumed");
  assert(game.grid[target.row][target.col].state === "exact", "case 1: cell state must be exact");
  assert(game.stats.exactStrikes === 1, "case 1: exactStrikes stat should be 1");
}

// 2. Incorrect letter on a word square: live contact, zero strikes, records attempt.
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const wrong = wrongLetterFor(word.word[0]);
  const before = game.strikesRemaining;
  const result = resolveShot(game, target.row, target.col, wrong);
  assert(result.type === "live", "case 2: expected live result");
  assert(game.strikesRemaining === before, "case 2: strikes must not be consumed");
  assert(
    game.grid[target.row][target.col].attemptedLetters.includes(wrong),
    "case 2: wrong letter should be recorded"
  );
}

// 3. Repeating the same incorrect letter: blocked, zero strikes, no extra valid shot.
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const wrong = wrongLetterFor(word.word[0]);
  resolveShot(game, target.row, target.col, wrong);
  const shotsAfterFirst = game.stats.shotsTotal;
  const strikesAfterFirst = game.strikesRemaining;
  const result = resolveShot(game, target.row, target.col, wrong);
  assert(result.type === "blocked-duplicate", "case 3: expected blocked-duplicate result");
  assert(game.strikesRemaining === strikesAfterFirst, "case 3: strikes must not be consumed");
  assert(game.stats.shotsTotal === shotsAfterFirst, "case 3: shotsTotal must not increase");
  assert(game.stats.duplicatesBlocked === 1, "case 3: duplicatesBlocked should be 1");
}

// 4. A different incorrect letter on a live square: allowed, zero strikes.
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const wrong1 = wrongLetterFor(word.word[0]);
  const wrong2 = wrong1 === "A" ? "C" : "B";
  resolveShot(game, target.row, target.col, wrong1);
  const before = game.strikesRemaining;
  const result = resolveShot(game, target.row, target.col, wrong2);
  assert(result.type === "live", "case 4: expected live result for a new wrong letter");
  assert(game.strikesRemaining === before, "case 4: strikes must not be consumed");
  assert(
    game.grid[target.row][target.col].attemptedLetters.length === 2,
    "case 4: both wrong letters should be recorded"
  );
}

// 5. Empty adjacent square: hot, costs one strike.
{
  const game = freshGame();
  const cell = findEmptyCell(game, true);
  assert(!!cell, "case 5: a hot candidate cell should exist on this seeded board");
  if (cell) {
    const before = game.strikesRemaining;
    const result = resolveShot(game, cell.row, cell.col, "Q");
    assert(result.type === "hot", "case 5: expected hot result");
    assert(game.strikesRemaining === before - 1, "case 5: exactly one strike should be consumed");
  }
}

// 6. Empty non-adjacent square: dead, costs one strike.
{
  const game = freshGame();
  const cell = findEmptyCell(game, false);
  assert(!!cell, "case 6: a dead candidate cell should exist on this seeded board");
  if (cell) {
    const before = game.strikesRemaining;
    const result = resolveShot(game, cell.row, cell.col, "Q");
    assert(result.type === "dead", "case 6: expected dead result");
    assert(game.strikesRemaining === before - 1, "case 6: exactly one strike should be consumed");
  }
}

// 7. Final exact strike produces victory even at zero strikes (win checked before loss).
{
  const game = freshGame();
  const [w0, w1, w2, w3] = game.words;
  for (const w of [w0, w1, w2]) {
    w.cells.forEach((c, idx) => resolveShot(game, c.row, c.col, w.word[idx]));
  }
  const last = w3;
  last.cells.slice(0, -1).forEach((c, idx) => resolveShot(game, c.row, c.col, w3.word[idx]));
  assert(!game.gameOver, "case 7: game should not be over before the final letter");

  game.strikesRemaining = 0; // artificial test state, per spec section 30 case 7

  const finalCell = last.cells[last.cells.length - 1];
  const finalLetter = w3.word[w3.word.length - 1];
  const result = resolveShot(game, finalCell.row, finalCell.col, finalLetter);
  assert(result.type === "exact", "case 7: final shot should be an exact strike");
  assert(game.gameOver && game.outcome === "win", "case 7: victory must win over a zero-strike loss");
}

// 8. Final ammunition-consuming miss produces defeat if hidden letters remain.
{
  const game = freshGame();
  game.strikesRemaining = 1;
  const cell = findEmptyCell(game, false) || findEmptyCell(game, true);
  assert(!!cell, "case 8: an empty cell should exist to spend the final strike on");
  if (cell) {
    const result = resolveShot(game, cell.row, cell.col, "Q");
    assert(game.gameOver && game.outcome === "loss", "case 8: should end in defeat");
    assert(result.gameOver === true, "case 8: result should report gameOver");
  }
}

// 9. Completed word triggers only once and awards its bonus only once.
{
  const game = freshGame();
  const word = game.words[0];
  word.cells.forEach((c, idx) => resolveShot(game, c.row, c.col, word.word[idx]));
  assert(word.completed === true, "case 9: word should be marked completed");
  assert(game.stats.wordsCompleted === 1, "case 9: wordsCompleted should be 1");
  const scoreAfterFirstCompletion = game.score;
  // Attempting to fire again at an already-resolved cell of the same word
  // must be rejected and must not re-award the bonus.
  const again = resolveShot(game, word.cells[0].row, word.cells[0].col, word.word[0]);
  assert(again.type === "invalid", "case 9: firing at a resolved cell should be invalid");
  assert(game.score === scoreAfterFirstCompletion, "case 9: score must not change on invalid shot");
  assert(game.stats.wordsCompleted === 1, "case 9: wordsCompleted must stay 1");
}

// 10. Restart clears all temporary game state.
{
  const gameA = freshGame();
  resolveShot(gameA, gameA.words[0].cells[0].row, gameA.words[0].cells[0].col, gameA.words[0].word[0]);
  const gameB = createGame({ difficulty: "standard", seed: 999 });
  assert(gameB.stats.shotsTotal === 0, "case 10: fresh game should have zero shots");
  assert(gameB.shotLog.length === 0, "case 10: fresh game should have an empty shot log");
  assert(gameB.gameOver === false, "case 10: fresh game should not be over");
  assert(
    gameB.strikesRemaining === gameB.strikesStarting,
    "case 10: fresh game strikes should equal its starting allotment"
  );
}

console.log(`Gameplay tests: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
