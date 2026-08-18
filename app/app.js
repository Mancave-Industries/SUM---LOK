// QUYPTICK game engine. Loads a puzzle definition (grid entries with real,
// mechanically-verified cryptic clues from the cryptic-setter's clue bank)
// and renders a playable crossword: type letters, entries lock in green
// once correct, and the bonus entry stays hidden until the other five are
// solved, matching the "closes off the grid" mechanic from the design.

const state = {
  puzzle: null,
  cellMap: new Map(), // "r,c" -> { r, c, number, entries: [entryIndex,...] }
  rows: 0,
  cols: 0,
  letters: {}, // "r,c" -> letter
  solved: new Set(), // entry indices
  activeEntry: 0,
  cursor: 0, // index within the active entry's cells
  bonusUnlocked: false,
  startTime: null,
  finishTime: null,
  soundOn: true,
  letterStatus: {}, // "A".."Z" -> 'green'|'yellow'|'gray', best result seen so far
  feedback: null, // { entryIndex, cells: {"r,c": 'green'|'yellow'|'gray'} } while a wrong guess is flashing
  submitting: false, // true during the flash window — input is paused
  justSolvedEntry: null, // entry index to flip-animate for one render, then cleared
  guessHistory: {}, // entryIndex -> [{ letters: 'ABCDEFGH', statuses: [...] }, ...], every submitted attempt
  attemptsUsed: 0, // wrong full-submissions across the WHOLE puzzle, shared pool (not per-entry)
  maxAttempts: 5,
  failed: false, // true once attemptsUsed is exhausted without solving every entry — permanent for this puzzle
  justFailedEntries: null, // Set of entry indices to flip-reveal for one render on fail, then cleared
};

const FEEDBACK_RANK = { gray: 0, yellow: 1, green: 2 };

// Real Wordle reveals one tile at a time, left to right, instead of every
// letter flipping and coloring at once — REVEAL_STAGGER_MS is the delay
// between each tile's flip starting, REVEAL_FLIP_MS how long one tile's
// flip takes. cascadeDuration() is how long the whole row takes to finish
// revealing, used to size the timeouts that follow a submitted guess.
const REVEAL_STAGGER_MS = 120;
const REVEAL_FLIP_MS = 450;
function cascadeDuration(letterCount) {
  return (letterCount - 1) * REVEAL_STAGGER_MS + REVEAL_FLIP_MS;
}

// Standard Wordle two-pass scoring: greens first (consuming those answer
// letters), then yellows against whatever's left, so a repeated letter in
// the guess only lights up as many times as it actually appears unmatched
// in the answer.
function computeWordleFeedback(guess, answer) {
  const g = guess.split('');
  const a = answer.split('');
  const result = new Array(g.length).fill('gray');
  const consumed = new Array(a.length).fill(false);
  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) {
      result[i] = 'green';
      consumed[i] = true;
    }
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'green') continue;
    const idx = a.findIndex((ch, j) => !consumed[j] && ch === g[i]);
    if (idx !== -1) {
      result[i] = 'yellow';
      consumed[idx] = true;
    }
  }
  return result;
}

// Keeps every submitted attempt at an entry, not just the live one —
// same idea as Wordle keeping every past guess row on screen instead of
// only ever showing the most recent try.
function recordGuess(entryIndex, letters, statuses) {
  if (!state.guessHistory[entryIndex]) state.guessHistory[entryIndex] = [];
  state.guessHistory[entryIndex].push({ letters, statuses });
}

function updateLetterStatus(letters, statuses) {
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const current = state.letterStatus[letter];
    if (!current || FEEDBACK_RANK[statuses[i]] > FEEDBACK_RANK[current]) {
      state.letterStatus[letter] = statuses[i];
    }
  }
}

// Small synthesized sound effects via WebAudio — no audio files to fetch,
// nothing to fail loading. AudioContext is created lazily on first use so
// it starts inside a real user gesture (typing/clicking), satisfying
// browser autoplay policies.
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function beep(freq, duration, type, gainPeak, startDelay) {
  if (!state.soundOn) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + (startDelay || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak || 0.12, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function playTick() { beep(700, 0.035, 'square', 0.045); }
function playCorrect() {
  beep(660, 0.09, 'sine', 0.12);
  beep(880, 0.12, 'sine', 0.12, 0.09);
}
function playWrong() { beep(170, 0.18, 'sawtooth', 0.09); }
function playComplete() {
  [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.16, 'sine', 0.14, i * 0.09));
}
function playFail() {
  [392, 330, 262].forEach((f, i) => beep(f, 0.22, 'sine', 0.11, i * 0.14));
}

function entryCells(entry) {
  const cells = [];
  for (let i = 0; i < entry.answer.length; i++) {
    const r = entry.direction === 'down' ? entry.row + i : entry.row;
    const c = entry.direction === 'across' ? entry.col + i : entry.col;
    cells.push({ r, c, i });
  }
  return cells;
}

function buildCellMap(entries) {
  const map = new Map();
  let rows = 0;
  let cols = 0;
  entries.forEach((entry, idx) => {
    entryCells(entry).forEach(({ r, c, i }) => {
      rows = Math.max(rows, r + 1);
      cols = Math.max(cols, c + 1);
      const key = `${r},${c}`;
      if (!map.has(key)) map.set(key, { r, c, number: null, entries: [] });
      const cell = map.get(key);
      cell.entries.push({ entryIndex: idx, posInEntry: i });
      if (i === 0) cell.number = entry.number;
    });
  });
  return { map, rows, cols };
}

const PUZZLE_INDEX_KEY = 'quyptick-puzzle-index';

function currentPuzzleIndex(total) {
  const saved = parseInt(localStorage.getItem(PUZZLE_INDEX_KEY) || '0', 10);
  if (Number.isNaN(saved)) return 0;
  return Math.min(Math.max(saved, 0), total - 1);
}

// Puzzles are picked from the manifest list by position, not by matching
// today's real date — there's no daily lock while this is still being
// iterated on. goToPuzzle() below moves through the list and reloads.
async function loadPuzzle() {
  // Puzzle content changes on every content update but the URL never
  // does, so a plain fetch is exactly the case browsers (mobile Safari
  // especially) cache indefinitely — cache: 'no-store' forces a fresh
  // request instead of silently serving yesterday's clues.
  const manifest = await (await fetch('puzzles/manifest.json', { cache: 'no-store' })).json();
  const index = currentPuzzleIndex(manifest.puzzles.length);
  const id = manifest.puzzles[index];
  const puzzle = await (await fetch(`puzzles/${id}.json`, { cache: 'no-store' })).json();
  puzzle._id = id;
  puzzle._index = index;
  puzzle._total = manifest.puzzles.length;
  puzzle._manifest = manifest.puzzles;
  return puzzle;
}

function goToPuzzle(index) {
  const total = state.puzzle._total;
  const wrapped = ((index % total) + total) % total;
  localStorage.setItem(PUZZLE_INDEX_KEY, String(wrapped));
  location.reload();
}

function nonBonusEntries() {
  return state.puzzle.entries.map((e, i) => i).filter((i) => !state.puzzle.entries[i].bonus);
}

function bonusEntryIndex() {
  return state.puzzle.entries.findIndex((e) => e.bonus);
}

function isEntrySolved(idx) {
  return state.solved.has(idx);
}

function checkBonusUnlock() {
  const allDone = nonBonusEntries().every((i) => state.solved.has(i));
  if (allDone && !state.bonusUnlocked) {
    state.bonusUnlocked = true;
    document.getElementById('bonus-badge').classList.add('show');
    render();
    setActiveEntry(bonusEntryIndex());
    saveProgress();
  }
}

function checkAllSolved() {
  if (state.puzzle.entries.every((_, i) => state.solved.has(i))) {
    state.finishTime = Date.now();
    showSolvedPanel();
    saveStreak();
  }
}

function setActiveEntry(idx) {
  if (idx === bonusEntryIndex() && !state.bonusUnlocked) return;
  state.activeEntry = idx;
  state.cursor = 0;
  render();
}

// Cursor advances exactly one cell per keystroke and always overwrites
// whatever's there — including a letter a crossing entry already placed.
// Correct play reproduces the same letter at shared cells, so this is a
// no-op visually; it also keeps keystroke count and cursor position in
// exact lockstep with the answer. Filling the last cell no longer
// auto-submits — Wordle mechanics call for an explicit Enter, which is
// also what makes per-letter green/yellow/gray feedback meaningful (you
// see it, then act on it, rather than it flashing past mid-keystroke).
function typeLetter(letter) {
  if (state.submitting || state.failed) return;
  const entry = state.puzzle.entries[state.activeEntry];
  if (isEntrySolved(state.activeEntry)) return;
  const cells = entryCells(entry);
  if (state.cursor >= cells.length) return;
  const { r, c } = cells[state.cursor];
  state.letters[`${r},${c}`] = letter.toUpperCase();
  playTick();
  state.cursor = Math.min(state.cursor + 1, cells.length - 1);
  render();
  saveProgress();
}

function backspace() {
  if (state.submitting || state.failed) return;
  const entry = state.puzzle.entries[state.activeEntry];
  if (isEntrySolved(state.activeEntry)) return;
  const cells = entryCells(entry);
  const { r, c } = cells[state.cursor];
  if (state.letters[`${r},${c}`]) {
    delete state.letters[`${r},${c}`];
  } else {
    state.cursor = Math.max(0, state.cursor - 1);
    const prev = cells[state.cursor];
    delete state.letters[`${prev.r},${prev.c}`];
  }
  render();
  saveProgress();
}

function submitEntry() {
  if (state.submitting || state.failed) return;
  const idx = state.activeEntry;
  if (isEntrySolved(idx)) return;
  const entry = state.puzzle.entries[idx];
  const cells = entryCells(entry);
  const full = cells.every(({ r, c }) => state.letters[`${r},${c}`]);
  if (!full) {
    flashShake();
    showToast('Not enough letters');
    return;
  }

  const guess = cells.map(({ r, c }) => state.letters[`${r},${c}`]).join('');
  if (guess === entry.answer) {
    const statuses = guess.split('').map(() => 'green');
    updateLetterStatus(guess.split(''), statuses);
    recordGuess(idx, guess, statuses);
    state.solved.add(idx);
    state.justSolvedEntry = idx;
    setTimeout(() => {
      state.justSolvedEntry = null;
    }, cascadeDuration(cells.length));
    const isLastEntry = state.puzzle.entries.every((_, i) => state.solved.has(i));
    if (isLastEntry) playComplete();
    else playCorrect();
    render();
    checkBonusUnlock();
    checkAllSolved();
    // Solving an entry that neither unlocks the bonus nor finishes the
    // puzzle previously fell through without ever calling saveProgress() —
    // that entry's solved state (and now its guess history) would vanish
    // on reload even though it was genuinely solved.
    saveProgress();
    const remaining = nonBonusEntries().filter((i) => !state.solved.has(i));
    const next = remaining[0] ?? (state.bonusUnlocked ? bonusEntryIndex() : null);
    if (next !== null && next !== undefined) setActiveEntry(next);
    return;
  }

  // Wrong guess: show Wordle-style per-letter feedback, then clear the
  // cells this entry actually controls (not ones a solved crossing entry
  // already locked in) so the player can try again — unless this was the
  // last of the shared attempt pool, in which case the puzzle fails
  // instead of clearing for a retry.
  const statuses = computeWordleFeedback(guess, entry.answer);
  updateLetterStatus(guess.split(''), statuses);
  recordGuess(idx, guess, statuses);
  const feedbackCells = {};
  cells.forEach(({ r, c }, i) => {
    feedbackCells[`${r},${c}`] = statuses[i];
  });
  state.feedback = { entryIndex: idx, cells: feedbackCells };
  state.submitting = true;
  state.attemptsUsed += 1;
  playWrong();
  render();
  flashShake();
  saveProgress();

  // Give the reveal cascade time to actually play out — a 10-letter word's
  // last tile doesn't even start flipping until (length-1) * REVEAL_STAGGER_MS
  // in — plus a beat afterward so the fully-revealed colors are actually
  // readable before the entry clears for another attempt.
  setTimeout(() => {
    state.feedback = null;
    state.submitting = false;
    if (state.attemptsUsed >= state.maxAttempts) {
      triggerFail();
      return;
    }
    for (const { r, c } of cells) {
      if (!isCellLocked(r, c)) delete state.letters[`${r},${c}`];
    }
    state.cursor = 0;
    render();
    saveProgress();
  }, cascadeDuration(cells.length) + 700);
}

// The whole puzzle's shared attempt pool (5, not per-entry) is exhausted
// without every entry solved: reveal every unsolved entry's correct answer
// (reusing the same staggered flip-reveal used for a correct guess, just
// with the fail color) and lock all input for the rest of this puzzle.
function triggerFail() {
  state.failed = true;
  const unsolved = state.puzzle.entries.map((_, i) => i).filter((i) => !state.solved.has(i));
  state.justFailedEntries = new Set(unsolved);
  const maxLen = Math.max(0, ...unsolved.map((i) => state.puzzle.entries[i].answer.length));
  playFail();
  render();
  showFailPanel();
  saveProgress();
  setTimeout(() => {
    state.justFailedEntries = null;
    render();
  }, cascadeDuration(maxLen) + 200);
}

// The correct letter at a cell, independent of whether it's been typed —
// used only once a puzzle has failed, to reveal answers for entries the
// player never solved. Crossing entries always agree on a shared cell's
// letter, so any one of them is a valid source.
function correctLetterAt(cellInfo) {
  const { entryIndex, posInEntry } = cellInfo.entries[0];
  return state.puzzle.entries[entryIndex].answer[posInEntry];
}

// A cell is "locked" once some OTHER, already-solved entry owns its
// correct letter — those stay put across a failed retry since they're
// not this entry's mistake to begin with.
function isCellLocked(r, c) {
  const cellInfo = state.cellMap.get(`${r},${c}`);
  return cellInfo.entries.some((e) => e.entryIndex !== state.activeEntry && state.solved.has(e.entryIndex));
}

function flashShake() {
  const grid = document.getElementById('grid');
  grid.classList.remove('entry-shake');
  // eslint-disable-next-line no-unused-expressions
  void grid.offsetWidth; // restart the animation if it's still mid-shake
  grid.classList.add('entry-shake');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1600);
}

function render() {
  renderGrid();
  renderActiveClue();
  renderGuessHistory();
  renderClueList();
  renderKeyboard();
  renderAttempts();
  syncKbdHeight();
}

// Small remaining-attempts indicator — one dot per attempt in the shared
// pool, filled in as they're used up. Hidden once the puzzle is solved or
// failed, same as the badge it sits next to has nothing more to say then.
function renderAttempts() {
  const el = document.getElementById('attempts-indicator');
  if (!el) return;
  const isDone = state.puzzle.entries.every((_, i) => state.solved.has(i));
  el.classList.toggle('show', !isDone && !state.failed);
  el.innerHTML = '';
  for (let i = 0; i < state.maxAttempts; i++) {
    const dot = document.createElement('span');
    dot.className = 'attempt-dot' + (i < state.attemptsUsed ? ' used' : '');
    el.appendChild(dot);
  }
}

// The fixed keyboard pane now includes the active clue bar, whose height
// varies with clue length (it can wrap to two or three lines) — the
// scrollable area above needs to reserve exactly that much space so its
// own content never ends up hidden underneath the pane. Measuring the
// real rendered height beats guessing a constant.
function syncKbdHeight() {
  const kbd = document.getElementById('keyboard');
  const height = kbd.style.display === 'none' ? 0 : kbd.offsetHeight;
  document.documentElement.style.setProperty('--kbd-height', `${height}px`);
}

function renderGrid() {
  const grid = document.getElementById('grid');
  grid.style.gridTemplateColumns = `repeat(${state.cols}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${state.rows}, 1fr)`;
  grid.innerHTML = '';

  const activeEntryObj = state.puzzle.entries[state.activeEntry];
  const activeCells = entryCells(activeEntryObj);
  const activeCellKeys = new Set(activeCells.map(({ r, c }) => `${r},${c}`));
  const cursorCell = activeCells[Math.min(state.cursor, activeCells.length - 1)];
  const cursorKey = cursorCell ? `${cursorCell.r},${cursorCell.c}` : null;
  const bonusIdx = bonusEntryIndex();

  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const key = `${r},${c}`;
      const cellInfo = state.cellMap.get(key);
      const div = document.createElement('div');
      div.className = 'cell';
      if (!cellInfo) {
        div.classList.add('black');
        grid.appendChild(div);
        continue;
      }

      const belongsToBonus = bonusIdx !== -1 && cellInfo.entries.some((e) => e.entryIndex === bonusIdx);
      const belongsToSolvedNonBonus = cellInfo.entries.some(
        (e) => e.entryIndex !== bonusIdx && state.solved.has(e.entryIndex)
      );
      const anySolved = cellInfo.entries.some((e) => state.solved.has(e.entryIndex));

      div.classList.add('fillable');
      if (belongsToBonus) div.classList.add('bonus');
      const showingFeedback = state.feedback && key in state.feedback.cells;
      if (activeCellKeys.has(key) && !isEntrySolved(state.activeEntry) && !showingFeedback && !state.failed) {
        div.classList.add('active-entry');
      }
      if (key === cursorKey && !isEntrySolved(state.activeEntry) && !showingFeedback && !state.failed) {
        div.classList.add('active-cell');
      }
      // A cell mid-reveal skips the flat .solved background — the .reveal
      // animation below owns showing color for it instead, staggered to
      // this cell's position in the word, so the flip cascades left to
      // right instead of every letter changing color at once.
      const justSolvedMatch =
        state.justSolvedEntry !== null
          ? cellInfo.entries.find((e) => e.entryIndex === state.justSolvedEntry)
          : undefined;
      if (anySolved && !justSolvedMatch) div.classList.add('solved');
      if (justSolvedMatch) {
        div.classList.add('reveal');
        div.style.setProperty('--reveal-bg', belongsToBonus ? 'var(--bonus-bg)' : 'var(--solved-bg)');
        div.style.setProperty('--reveal-text', belongsToBonus ? 'var(--bonus-text)' : 'var(--solved-text)');
        div.style.animationDelay = `${justSolvedMatch.posInEntry * REVEAL_STAGGER_MS}ms`;
      }

      const feedbackStatus = state.feedback && state.feedback.cells[key];
      if (feedbackStatus) {
        div.classList.add('reveal');
        div.style.setProperty('--reveal-bg', `var(--wordle-${feedbackStatus})`);
        div.style.setProperty('--reveal-text', 'var(--wordle-tile-text)');
        const feedbackMatch = cellInfo.entries.find((e) => e.entryIndex === state.feedback.entryIndex);
        if (feedbackMatch) div.style.animationDelay = `${feedbackMatch.posInEntry * REVEAL_STAGGER_MS}ms`;
      }

      // Same staggered-flip mechanism as a correct solve, but for revealing
      // the answer to an entry the player never solved once the shared
      // attempt pool runs out — a cell only needs this if no entry through
      // it is already solved (a solved crossing entry already shows the
      // right letter in green, no separate fail styling needed there).
      const failedReveal = state.failed && !anySolved;
      const justFailedMatch =
        failedReveal && state.justFailedEntries
          ? cellInfo.entries.find((e) => state.justFailedEntries.has(e.entryIndex))
          : undefined;
      if (failedReveal && !justFailedMatch) div.classList.add('failed');
      if (justFailedMatch) {
        div.classList.add('reveal');
        div.style.setProperty('--reveal-bg', 'var(--fail-bg)');
        div.style.setProperty('--reveal-text', 'var(--fail-text)');
        div.style.animationDelay = `${justFailedMatch.posInEntry * REVEAL_STAGGER_MS}ms`;
      }

      if (cellInfo.number) {
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = cellInfo.number;
        div.appendChild(num);
      }

      const letter = failedReveal ? correctLetterAt(cellInfo) : state.letters[key];
      const bonusHiddenCell = belongsToBonus && !state.bonusUnlocked && !belongsToSolvedNonBonus && !state.failed;
      if (bonusHiddenCell) {
        div.classList.add('locked-hint');
        div.append(document.createTextNode(letter ? letter : '•'));
      } else if (letter) {
        div.append(document.createTextNode(letter));
      }

      div.addEventListener('click', () => onCellClick(cellInfo));
      grid.appendChild(div);
    }
  }
}

function onCellClick(cellInfo) {
  const candidates = cellInfo.entries.map((e) => e.entryIndex);
  let targetEntry;
  if (candidates.includes(state.activeEntry) && candidates.length > 1) {
    targetEntry = candidates.find((i) => i !== state.activeEntry);
  } else {
    targetEntry = candidates[0];
  }
  if (targetEntry === bonusEntryIndex() && !state.bonusUnlocked) return;
  state.activeEntry = targetEntry;
  const match = cellInfo.entries.find((e) => e.entryIndex === targetEntry);
  state.cursor = match.posInEntry;
  render();
}

function renderActiveClue() {
  const entry = state.puzzle.entries[state.activeEntry];
  const tag = document.getElementById('active-clue-tag');
  const text = document.getElementById('active-clue-text');
  const label = `${entry.number} ${entry.direction.toUpperCase()}${entry.bonus ? ' · BONUS' : ''} · (${entry.answer.length})`;
  tag.textContent = label;
  text.textContent = entry.clue.replace(/\s*\(\d+\)\s*$/, '');
}

function renderGuessHistory() {
  const container = document.getElementById('guess-history');
  const history = state.guessHistory[state.activeEntry] || [];
  container.classList.toggle('show', history.length > 0);
  container.innerHTML = '';
  for (const { letters, statuses } of history) {
    const row = document.createElement('div');
    row.className = 'history-row';
    for (let i = 0; i < letters.length; i++) {
      const tile = document.createElement('span');
      tile.className = `history-tile ${statuses[i]}`;
      tile.textContent = letters[i];
      row.appendChild(tile);
    }
    container.appendChild(row);
  }
  container.scrollTop = container.scrollHeight;
}

function renderClueList() {
  const list = document.getElementById('clue-list');
  list.innerHTML = '';
  const across = state.puzzle.entries.map((e, i) => i).filter((i) => state.puzzle.entries[i].direction === 'across');
  const down = state.puzzle.entries.map((e, i) => i).filter((i) => state.puzzle.entries[i].direction === 'down');

  const addHeading = (label) => {
    const li = document.createElement('li');
    li.className = 'clue-heading';
    li.textContent = label;
    list.appendChild(li);
  };
  const addEntry = (idx) => {
    const entry = state.puzzle.entries[idx];
    const li = document.createElement('li');
    // Once the puzzle has failed, every answer is already revealed on the
    // grid itself (see renderGrid's failedReveal) — hiding the bonus
    // clue's text behind the lock message at that point serves no purpose,
    // it would just be withholding the one piece of the failed puzzle the
    // player could still actually read.
    const isLocked = entry.bonus && !state.bonusUnlocked && !state.failed;
    if (idx === state.activeEntry && !isLocked) li.classList.add('active');
    if (state.solved.has(idx)) li.classList.add('solved');
    if (isLocked) li.classList.add('locked');

    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = entry.number;
    const txt = document.createElement('span');
    txt.className = 'txt';
    txt.textContent = isLocked
      ? '🔒 solve the other five to reveal'
      : `${entry.clue}`;
    li.append(num, txt);
    if (!isLocked) li.addEventListener('click', () => setActiveEntry(idx));
    list.appendChild(li);
  };

  addHeading('ACROSS');
  across.forEach(addEntry);
  addHeading('DOWN');
  down.forEach(addEntry);
}

function renderKeyboard() {
  document.querySelectorAll('.kbd-key[data-key]').forEach((btn) => {
    const key = btn.dataset.key;
    if (key.length !== 1) return;
    const status = state.letterStatus[key.toUpperCase()];
    btn.classList.remove('green', 'yellow', 'gray');
    if (status) btn.classList.add(status);
  });

  // Crossing letters from other solved entries can fill in most (or all)
  // of an entry before the player has typed anything themselves — so a
  // fully-filled word can sit there looking "done" when it's actually just
  // waiting on Enter. Light up Enter to make that explicit instead of
  // leaving it to be discovered.
  const entry = state.puzzle.entries[state.activeEntry];
  const cells = entryCells(entry);
  const isFull = !state.submitting && cells.every(({ r, c }) => state.letters[`${r},${c}`]);
  const readyToSubmit = isFull && !isEntrySolved(state.activeEntry);
  document.querySelector('.kbd-key[data-key="Enter"]')?.classList.toggle('ready', readyToSubmit);
}

function showSolvedPanel() {
  document.getElementById('solved-panel').classList.add('show');
  document.getElementById('keyboard').style.display = 'none';
  syncKbdHeight();
  const elapsed = Math.max(0, Math.round((state.finishTime - state.startTime) / 1000));
  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');
  document.getElementById('solved-time').textContent = `${mm}:${ss} · no reveals`;
  const bonusEntry = state.puzzle.entries[bonusEntryIndex()];
  document.getElementById('solved-bonus-line').textContent = bonusEntry
    ? `✦ bonus word found: ${bonusEntry.answer}`
    : '';

  const shareRow = document.getElementById('share-row');
  shareRow.innerHTML = '';
  state.puzzle.entries.forEach((entry) => {
    const sq = document.createElement('div');
    sq.className = 'share-sq g' + (entry.bonus ? ' bonus-sq' : '');
    shareRow.appendChild(sq);
  });

  const nextBtn = document.getElementById('next-puzzle-btn');
  nextBtn.textContent = state.puzzle._total > 1 ? 'Next puzzle →' : 'No more puzzles yet';
  nextBtn.disabled = state.puzzle._total <= 1;
}

function showFailPanel() {
  document.getElementById('fail-panel').classList.add('show');
  document.getElementById('keyboard').style.display = 'none';
  syncKbdHeight();
  const solvedCount = state.puzzle.entries.filter((_, i) => state.solved.has(i)).length;
  document.getElementById('fail-line').textContent =
    `${solvedCount} of ${state.puzzle.entries.length} solved · out of attempts`;

  const nextBtn = document.getElementById('fail-next-puzzle-btn');
  nextBtn.textContent = state.puzzle._total > 1 ? 'Next puzzle →' : 'No more puzzles yet';
  nextBtn.disabled = state.puzzle._total <= 1;
}

function shareResult() {
  const bonusEntry = state.puzzle.entries[bonusEntryIndex()];
  const squares = state.puzzle.entries.map((e) => (e.bonus ? '🟨' : '🟩')).join('');
  const text = `QUYPTICK ${state.puzzle._id}\n${squares}\nBonus word: ${bonusEntry ? bonusEntry.answer : ''}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied result to clipboard'));
  } else {
    showToast(text);
  }
}

function progressKey() {
  return `quyptick-progress-${state.puzzle._id}`;
}

// A puzzle's id (e.g. "puzzle-002") can end up pointing at different answers
// over time if that puzzle file is ever regenerated or replaced — the id is
// stable but the content isn't. Saved progress keyed only by id would then
// get replayed onto a grid it doesn't match (stale letters from the old
// answers landing on the new one). This fingerprint ties saved progress to
// the actual answers it was solved against, so a content change invalidates
// old progress instead of silently corrupting the new grid.
function puzzleFingerprint(puzzle) {
  return puzzle.entries.map((e) => e.answer).join(',');
}

function saveProgress() {
  localStorage.setItem(
    progressKey(),
    JSON.stringify({
      fingerprint: puzzleFingerprint(state.puzzle),
      letters: state.letters,
      solved: [...state.solved],
      bonusUnlocked: state.bonusUnlocked,
      startTime: state.startTime,
      letterStatus: state.letterStatus,
      guessHistory: state.guessHistory,
      attemptsUsed: state.attemptsUsed,
      failed: state.failed,
    })
  );
}

function loadProgress() {
  const raw = localStorage.getItem(progressKey());
  if (!raw) {
    state.startTime = Date.now();
    return;
  }
  try {
    const saved = JSON.parse(raw);
    if (saved.fingerprint !== puzzleFingerprint(state.puzzle)) {
      // Stale save from a since-replaced version of this puzzle id — discard
      // it rather than filling the current grid with answers from a
      // different puzzle.
      localStorage.removeItem(progressKey());
      state.startTime = Date.now();
      return;
    }
    state.letters = saved.letters || {};
    state.solved = new Set(saved.solved || []);
    state.bonusUnlocked = !!saved.bonusUnlocked;
    state.startTime = saved.startTime || Date.now();
    state.letterStatus = saved.letterStatus || {};
    state.guessHistory = saved.guessHistory || {};
    state.attemptsUsed = saved.attemptsUsed || 0;
    state.failed = !!saved.failed;
  } catch {
    state.startTime = Date.now();
  }
}

// Streak counts distinct puzzles completed, in whatever order they were
// played — there's no calendar-day adjacency check while puzzles are
// picked from a manifest list rather than published one per real day.
function saveStreak() {
  const raw = localStorage.getItem('quyptick-streak');
  let streak = { count: 0, completedIds: [] };
  try {
    if (raw) streak = JSON.parse(raw);
  } catch {
    /* ignore corrupt streak data */
  }
  const id = state.puzzle._id;
  if (streak.completedIds.includes(id)) return; // already counted
  streak.completedIds.push(id);
  streak.count = streak.completedIds.length;
  localStorage.setItem('quyptick-streak', JSON.stringify(streak));
  renderStreak();
}

function renderStreak() {
  const raw = localStorage.getItem('quyptick-streak');
  let streak = { count: 0 };
  try {
    if (raw) streak = JSON.parse(raw);
  } catch {
    /* ignore corrupt streak data */
  }
  document.getElementById('streak').textContent = streak.count ? `🔥 ${streak.count}` : '';
}

function setupTheme() {
  const stored = localStorage.getItem('quyptick-theme');
  if (stored) document.documentElement.setAttribute('data-theme', stored);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : current === 'light' ? null : 'dark';
    if (next) {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('quyptick-theme', next);
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('quyptick-theme');
    }
  });
}

function setupSound() {
  const stored = localStorage.getItem('quyptick-sound');
  state.soundOn = stored !== 'off';
  const btn = document.getElementById('sound-toggle');
  btn.textContent = state.soundOn ? '♪' : '✕';
  btn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    localStorage.setItem('quyptick-sound', state.soundOn ? 'on' : 'off');
    btn.textContent = state.soundOn ? '♪' : '✕';
    if (state.soundOn) playTick();
  });
}

function completedPuzzleIds() {
  const raw = localStorage.getItem('quyptick-streak');
  try {
    return new Set(raw ? JSON.parse(raw).completedIds || [] : []);
  } catch {
    return new Set();
  }
}

function renderMenuPuzzleList() {
  const list = document.getElementById('menu-puzzle-list');
  list.innerHTML = '';
  const done = completedPuzzleIds();
  state.puzzle._manifest.forEach((id, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(index + 1);
    if (index === state.puzzle._index) btn.classList.add('current');
    if (done.has(id)) btn.classList.add('done');
    btn.addEventListener('click', () => goToPuzzle(index));
    list.appendChild(btn);
  });
}

function setupMenu() {
  const overlay = document.getElementById('menu-overlay');
  const open = () => {
    renderMenuPuzzleList();
    overlay.classList.add('show');
  };
  const close = () => overlay.classList.remove('show');
  document.getElementById('menu-toggle').addEventListener('click', open);
  document.getElementById('menu-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
}

function setupInput() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)) {
      typeLetter(e.key);
    } else if (e.key === 'Backspace') {
      backspace();
    } else if (e.key === 'Enter') {
      submitEntry();
    }
  });
  document.getElementById('keyboard').addEventListener('click', (e) => {
    const btn = e.target.closest('.kbd-key');
    if (!btn) return;
    const key = btn.dataset.key;
    if (key === 'Backspace') backspace();
    else if (key === 'Enter') submitEntry();
    else if (key.length === 1) typeLetter(key);
  });
  document.getElementById('share-btn').addEventListener('click', shareResult);
  document
    .getElementById('fail-next-puzzle-btn')
    .addEventListener('click', () => goToPuzzle(state.puzzle._index + 1));
}

async function main() {
  setupTheme();
  setupSound();
  renderStreak();
  const puzzle = await loadPuzzle();
  state.puzzle = puzzle;
  const { map, rows, cols } = buildCellMap(puzzle.entries);
  state.cellMap = map;
  state.rows = rows;
  state.cols = cols;

  loadProgress();

  document.getElementById('format-tag').textContent = puzzle.format || '';
  document.getElementById('date-label').textContent = `${puzzle._index + 1} / ${puzzle._total}`;
  document.getElementById('prev-puzzle').disabled = puzzle._total <= 1;
  document.getElementById('next-puzzle').disabled = puzzle._total <= 1;

  const firstUnsolved = nonBonusEntries().find((i) => !state.solved.has(i));
  state.activeEntry = firstUnsolved !== undefined ? firstUnsolved : bonusEntryIndex();
  state.cursor = 0;
  if (state.bonusUnlocked) document.getElementById('bonus-badge').classList.add('show');

  setupInput();
  setupMenu();
  document.getElementById('prev-puzzle').addEventListener('click', () => goToPuzzle(puzzle._index - 1));
  document.getElementById('next-puzzle').addEventListener('click', () => goToPuzzle(puzzle._index + 1));
  document.getElementById('next-puzzle-btn').addEventListener('click', () => goToPuzzle(puzzle._index + 1));
  render();

  if (puzzle.entries.every((_, i) => state.solved.has(i))) {
    state.finishTime = Date.now();
    showSolvedPanel();
  } else if (state.failed) {
    // Reloading a failed puzzle — the reveal already rendered flat (no
    // justFailedEntries survives a reload), just restore the panel and lock.
    showFailPanel();
  }
}

main();
