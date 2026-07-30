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
      if (cell.hiddenLetter !== null || cell.resolved) continue;
      if (isAdjacentToHiddenWord(game.grid, r, c) === wantAdjacent) return { row: r, col: c };
    }
  }
  return null;
}

function wrongLetterFor(correct) {
  return correct === "A" ? "B" : "A";
}

// Shot resolution now requires the fired letter to be in the current turn's
// rack. Most cases below are testing resolution logic, not rack drawing, so
// they force the letter into the rack first — rack behavior itself gets its
// own dedicated case (12).
function ensureInRack(game, letter) {
  if (!game.rack.includes(letter)) game.rack.push(letter);
}

// 1. Correct letter on a word square: reveals letter, costs zero strikes.
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const before = game.strikesRemaining;
  ensureInRack(game, word.word[0]);
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
  ensureInRack(game, wrong);
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
  ensureInRack(game, wrong);
  resolveShot(game, target.row, target.col, wrong);
  const shotsAfterFirst = game.stats.shotsTotal;
  const strikesAfterFirst = game.strikesRemaining;
  ensureInRack(game, wrong); // rack cycles each shot; keep it available to isolate the duplicate check
  const result = resolveShot(game, target.row, target.col, wrong);
  assert(result.type === "blocked-duplicate", "case 3: expected blocked-duplicate result");
  assert(game.strikesRemaining === strikesAfterFirst, "case 3: strikes must not be consumed");
  assert(game.stats.shotsTotal === shotsAfterFirst, "case 3: shotsTotal must not increase");
  assert(game.stats.duplicatesBlocked === 1, "case 3: duplicatesBlocked should be 1");
}

// 4. A different incorrect letter on a live square: allowed, but — since
// the first free guess is already spent — costs a strike (case 13 covers
// this rule directly; this case just confirms the guess itself is still
// permitted and recorded, distinct from the blocked-duplicate case above).
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const wrong1 = wrongLetterFor(word.word[0]);
  const wrong2 = wrong1 === "A" ? "C" : "B";
  ensureInRack(game, wrong1);
  resolveShot(game, target.row, target.col, wrong1);
  const before = game.strikesRemaining;
  ensureInRack(game, wrong2);
  const result = resolveShot(game, target.row, target.col, wrong2);
  assert(result.type === "live", "case 4: expected live result for a new wrong letter");
  assert(game.strikesRemaining === before - 1, "case 4: repeat wrong guess costs a strike");
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
    ensureInRack(game, "Q");
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
    ensureInRack(game, "Q");
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
    w.cells.forEach((c, idx) => {
      ensureInRack(game, w.word[idx]);
      resolveShot(game, c.row, c.col, w.word[idx]);
    });
  }
  const last = w3;
  last.cells.slice(0, -1).forEach((c, idx) => {
    ensureInRack(game, w3.word[idx]);
    resolveShot(game, c.row, c.col, w3.word[idx]);
  });
  assert(!game.gameOver, "case 7: game should not be over before the final letter");

  game.strikesRemaining = 0; // artificial test state, per spec section 30 case 7

  const finalCell = last.cells[last.cells.length - 1];
  const finalLetter = w3.word[w3.word.length - 1];
  ensureInRack(game, finalLetter);
  const result = resolveShot(game, finalCell.row, finalCell.col, finalLetter);
  assert(result.type === "exact", "case 7: final shot should be an exact strike");
  assert(game.gameOver && game.outcome === "win", "case 7: victory must win over a zero-strike loss");
}

// 8. Final ammunition-consuming miss produces defeat if hidden letters
// remain — with the Last Stand reprieve already spent (artificial test
// state; case 14 covers the reprieve itself in detail).
{
  const game = freshGame();
  game.strikesRemaining = 1;
  game.lastStandUsed = true;
  const cell = findEmptyCell(game, false) || findEmptyCell(game, true);
  assert(!!cell, "case 8: an empty cell should exist to spend the final strike on");
  if (cell) {
    ensureInRack(game, "Q");
    const result = resolveShot(game, cell.row, cell.col, "Q");
    assert(game.gameOver && game.outcome === "loss", "case 8: should end in defeat");
    assert(result.gameOver === true, "case 8: result should report gameOver");
  }
}

// 9. Completed word triggers only once and awards its bonus only once.
{
  const game = freshGame();
  const word = game.words[0];
  word.cells.forEach((c, idx) => {
    ensureInRack(game, word.word[idx]);
    resolveShot(game, c.row, c.col, word.word[idx]);
  });
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
  ensureInRack(gameA, gameA.words[0].word[0]);
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

// 11. Letter radar: firing a letter reveals which word(s) contain it,
// regardless of which square was targeted or that square's own outcome.
{
  const game = freshGame();
  const [w0, w1] = game.words;

  // A miss elsewhere on the board (empty cell) still records the letter
  // against any word that actually contains it.
  const emptyCell = findEmptyCell(game, true) || findEmptyCell(game, false);
  const sharedLetter = w0.word[0];
  ensureInRack(game, sharedLetter);
  resolveShot(game, emptyCell.row, emptyCell.col, sharedLetter);
  assert(
    game.radar[w0.id].includes(sharedLetter),
    "case 11: firing a letter anywhere should mark it on every word containing it"
  );

  // A live (wrong-letter) shot on a different word's square should also
  // populate radar entries for whichever word(s) actually contain that letter.
  const wrongLetterForW1 = w1.word[0] === "A" ? "B" : "A";
  const targetCell = w1.cells[0];
  ensureInRack(game, wrongLetterForW1);
  resolveShot(game, targetCell.row, targetCell.col, wrongLetterForW1);
  const containingWords = game.words.filter((w) => w.word.includes(wrongLetterForW1));
  for (const w of containingWords) {
    assert(
      game.radar[w.id].includes(wrongLetterForW1),
      `case 11: radar for ${w.id} should include ${wrongLetterForW1} once fired anywhere`
    );
  }

  // Firing the same letter again must not duplicate the radar entry.
  const beforeLen = game.radar[w0.id].length;
  const anotherEmptyCell = findEmptyCell(game, true) || findEmptyCell(game, false);
  if (anotherEmptyCell && !(anotherEmptyCell.row === emptyCell.row && anotherEmptyCell.col === emptyCell.col)) {
    ensureInRack(game, sharedLetter);
    resolveShot(game, anotherEmptyCell.row, anotherEmptyCell.col, sharedLetter);
    assert(game.radar[w0.id].length === beforeLen, "case 11: repeated letter must not duplicate a radar entry");
  }
}

// 12. Letter rack: a letter not in the current rack is rejected without
// cost, and a fresh rack is drawn after every valid shot.
{
  const game = freshGame();
  assert(Array.isArray(game.rack) && game.rack.length === 12, "case 12: a fresh game should start with a 12-letter rack");

  const outsideLetter = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((l) => !game.rack.includes(l));
  assert(!!outsideLetter, "case 12: there should be at least one letter outside a 12-letter rack");
  if (outsideLetter) {
    const cell = findEmptyCell(game, true) || findEmptyCell(game, false);
    const before = game.strikesRemaining;
    const shotsBefore = game.stats.shotsTotal;
    const result = resolveShot(game, cell.row, cell.col, outsideLetter);
    assert(result.type === "not-in-rack", "case 12: a letter outside the rack should be rejected");
    assert(game.strikesRemaining === before, "case 12: rejecting an out-of-rack letter must not cost a strike");
    assert(game.stats.shotsTotal === shotsBefore, "case 12: rejecting an out-of-rack letter must not count as a shot");
    assert(!cell.resolved, "case 12: the targeted cell must remain unresolved");
  }

  const rackBefore = game.rack.slice();
  const cell2 = findEmptyCell(game, true) || findEmptyCell(game, false);
  const letter = game.rack[0];
  resolveShot(game, cell2.row, cell2.col, letter);
  assert(
    game.rack.length === 12 && JSON.stringify(game.rack.slice().sort()) !== JSON.stringify(rackBefore.slice().sort()),
    "case 12: the rack should be redrawn after a valid shot"
  );
}

// 13. First wrong guess on a live square is free; a second, different
// wrong guess on that same square costs a strike.
{
  const game = freshGame();
  const word = game.words[0];
  const target = word.cells[0];
  const correct = word.word[0];
  const wrong1 = correct === "A" ? "B" : "A";
  const wrong2 = correct === "C" || wrong1 === "C" ? "D" : "C";

  ensureInRack(game, wrong1);
  const before1 = game.strikesRemaining;
  const r1 = resolveShot(game, target.row, target.col, wrong1);
  assert(r1.type === "live" && r1.strikeUsed === false, "case 13: first wrong guess should be free");
  assert(game.strikesRemaining === before1, "case 13: strikes unchanged after first wrong guess");

  ensureInRack(game, wrong2);
  const before2 = game.strikesRemaining;
  const r2 = resolveShot(game, target.row, target.col, wrong2);
  assert(r2.type === "live" && r2.strikeUsed === true, "case 13: repeat wrong guess should cost a strike");
  assert(game.strikesRemaining === before2 - 1, "case 13: exactly one strike consumed on repeat wrong guess");
}

// 14. Last Stand: the first strike-costing shot to reach zero grants one
// reprieve (game continues); a later strike-costing miss then ends it for
// real, but a surviving exact strike in between keeps the game alive.
{
  const game = freshGame();
  game.strikesRemaining = 1; // artificial test state, mirrors case 7/8's approach

  const cellA = findEmptyCell(game, false) || findEmptyCell(game, true);
  ensureInRack(game, "Q");
  const triggerResult = resolveShot(game, cellA.row, cellA.col, "Q");
  assert(triggerResult.lastStand === true, "case 14: hitting zero for the first time should trigger Last Stand");
  assert(!game.gameOver, "case 14: Last Stand should not end the game immediately");
  assert(game.lastStandUsed === true, "case 14: lastStandUsed should now be set");
  assert(game.strikesRemaining <= 0, "case 14: strikes should sit at zero during Last Stand");

  // Surviving an exact strike during Last Stand should not end the game.
  const word = game.words.find((w) => !w.completed);
  const survivorCell = word.cells.find((c) => game.grid[c.row][c.col].state !== "exact");
  const idx = word.cells.indexOf(survivorCell);
  ensureInRack(game, word.word[idx]);
  const surviveResult = resolveShot(game, survivorCell.row, survivorCell.col, word.word[idx]);
  assert(surviveResult.type === "exact", "case 14: survival shot should be an exact strike");
  assert(!game.gameOver, "case 14: an exact strike during Last Stand must not end the game");

  // The next strike-costing miss, with the reprieve already spent, ends it for real.
  const cellB = findEmptyCell(game, false) || findEmptyCell(game, true);
  assert(!!cellB, "case 14: a second empty cell should exist to spend the failing shot on");
  if (cellB) {
    ensureInRack(game, "Z");
    const failResult = resolveShot(game, cellB.row, cellB.col, "Z");
    assert(failResult.lastStand === false, "case 14: this shot should not grant a second reprieve");
    assert(game.gameOver && game.outcome === "loss", "case 14: the reprieve is spent, so this miss ends the game");
    assert(game.lastStandFailed === true, "case 14: lastStandFailed should be recorded");
  }
}

console.log(`Gameplay tests: ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
