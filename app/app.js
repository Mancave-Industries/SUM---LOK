// 3A2Dle game engine. Loads a puzzle definition (grid entries with real,
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
};

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

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

async function loadPuzzle() {
  const date = todayISO();
  let res = await fetch(`puzzles/${date}.json`).catch(() => null);
  let usedDate = date;
  if (!res || !res.ok) {
    // No puzzle published for today yet — fall back to the manifest's
    // most recent entry so the app is never just blank.
    const manifestRes = await fetch('puzzles/manifest.json').catch(() => null);
    if (manifestRes && manifestRes.ok) {
      const manifest = await manifestRes.json();
      const latest = manifest.dates[manifest.dates.length - 1];
      usedDate = latest;
      res = await fetch(`puzzles/${latest}.json`);
    }
  }
  const puzzle = await res.json();
  puzzle._loadedDate = usedDate;
  puzzle._isToday = usedDate === date;
  return puzzle;
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
// exact lockstep, which matters for maybeCheckEntry below.
function typeLetter(letter) {
  const entry = state.puzzle.entries[state.activeEntry];
  if (isEntrySolved(state.activeEntry)) return;
  const cells = entryCells(entry);
  if (state.cursor >= cells.length) return;
  const { r, c } = cells[state.cursor];
  state.letters[`${r},${c}`] = letter.toUpperCase();
  const wasLastCell = state.cursor === cells.length - 1;
  state.cursor = Math.min(state.cursor + 1, cells.length - 1);
  render();
  // Only validate once the cursor has traversed the whole entry — checking
  // "are all cells full" after every keystroke fires early whenever enough
  // crossing letters are already in place, which steals trailing keystrokes
  // meant for this entry and sends them to whatever entry auto-advance
  // switches to next.
  if (wasLastCell) maybeCheckEntry(state.activeEntry);
  saveProgress();
}

function backspace() {
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

function maybeCheckEntry(idx) {
  const entry = state.puzzle.entries[idx];
  const cells = entryCells(entry);
  const full = cells.every(({ r, c }) => state.letters[`${r},${c}`]);
  if (!full) {
    showToast('Keep going — not all cells are filled yet');
    return;
  }
  const word = cells.map(({ r, c }) => state.letters[`${r},${c}`]).join('');
  if (word === entry.answer) {
    state.solved.add(idx);
    render();
    checkBonusUnlock();
    checkAllSolved();
    const remaining = nonBonusEntries().filter((i) => !state.solved.has(i));
    const next = remaining[0] ?? (state.bonusUnlocked ? bonusEntryIndex() : null);
    if (next !== null && next !== undefined) setActiveEntry(next);
  } else {
    showToast("That doesn't fit — check the crossings");
  }
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
  renderClueList();
  renderKeyboard();
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
      if (activeCellKeys.has(key) && !isEntrySolved(state.activeEntry)) div.classList.add('active-entry');
      if (key === cursorKey && !isEntrySolved(state.activeEntry)) div.classList.add('active-cell');
      if (anySolved) div.classList.add('solved');

      if (cellInfo.number) {
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = cellInfo.number;
        div.appendChild(num);
      }

      const letter = state.letters[key];
      const bonusHiddenCell = belongsToBonus && !state.bonusUnlocked && !belongsToSolvedNonBonus;
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
    const isLocked = entry.bonus && !state.bonusUnlocked;
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
  const entry = state.puzzle.entries[state.activeEntry];
  const usedLetters = new Set();
  entryCells(entry).forEach(({ r, c }) => {
    const l = state.letters[`${r},${c}`];
    if (l) usedLetters.add(l.toLowerCase());
  });
  document.querySelectorAll('.kbd-key[data-key]').forEach((btn) => {
    const key = btn.dataset.key;
    if (key.length === 1) btn.classList.toggle('used', usedLetters.has(key));
  });
}

function showSolvedPanel() {
  document.getElementById('solved-panel').classList.add('show');
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

  document.getElementById('next-in').textContent = nextPuzzleCountdown();
}

function nextPuzzleCountdown() {
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const ms = nextMidnightUTC - now;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `Next puzzle in ${h}h ${m}m`;
}

function shareResult() {
  const bonusEntry = state.puzzle.entries[bonusEntryIndex()];
  const squares = state.puzzle.entries.map((e) => (e.bonus ? '🟨' : '🟩')).join('');
  const text = `3A2Dle ${state.puzzle._loadedDate}\n${squares}\nBonus word: ${bonusEntry ? bonusEntry.answer : ''}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied result to clipboard'));
  } else {
    showToast(text);
  }
}

function progressKey() {
  return `3a2dle-progress-${state.puzzle._loadedDate}`;
}

function saveProgress() {
  localStorage.setItem(
    progressKey(),
    JSON.stringify({
      letters: state.letters,
      solved: [...state.solved],
      bonusUnlocked: state.bonusUnlocked,
      startTime: state.startTime,
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
    state.letters = saved.letters || {};
    state.solved = new Set(saved.solved || []);
    state.bonusUnlocked = !!saved.bonusUnlocked;
    state.startTime = saved.startTime || Date.now();
  } catch {
    state.startTime = Date.now();
  }
}

function saveStreak() {
  const raw = localStorage.getItem('3a2dle-streak');
  let streak = { count: 0, lastDate: null };
  try {
    if (raw) streak = JSON.parse(raw);
  } catch {
    /* ignore corrupt streak data */
  }
  const today = state.puzzle._loadedDate;
  if (streak.lastDate === today) return; // already counted
  const y = new Date(today);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  streak.count = streak.lastDate === yesterday ? streak.count + 1 : 1;
  streak.lastDate = today;
  localStorage.setItem('3a2dle-streak', JSON.stringify(streak));
  renderStreak();
}

function renderStreak() {
  const raw = localStorage.getItem('3a2dle-streak');
  let streak = { count: 0 };
  try {
    if (raw) streak = JSON.parse(raw);
  } catch {
    /* ignore corrupt streak data */
  }
  document.getElementById('streak').textContent = streak.count ? `🔥 ${streak.count}` : '';
}

function setupTheme() {
  const stored = localStorage.getItem('3a2dle-theme');
  if (stored) document.documentElement.setAttribute('data-theme', stored);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : current === 'light' ? null : 'dark';
    if (next) {
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('3a2dle-theme', next);
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.removeItem('3a2dle-theme');
    }
  });
}

function setupInput() {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[a-zA-Z]$/.test(e.key)) {
      typeLetter(e.key);
    } else if (e.key === 'Backspace') {
      backspace();
    }
  });
  document.getElementById('keyboard').addEventListener('click', (e) => {
    const btn = e.target.closest('.kbd-key');
    if (!btn) return;
    const key = btn.dataset.key;
    if (key === 'Backspace') backspace();
    else if (key.length === 1) typeLetter(key);
  });
  document.getElementById('share-btn').addEventListener('click', shareResult);
}

async function main() {
  setupTheme();
  renderStreak();
  const puzzle = await loadPuzzle();
  state.puzzle = puzzle;
  const { map, rows, cols } = buildCellMap(puzzle.entries);
  state.cellMap = map;
  state.rows = rows;
  state.cols = cols;

  loadProgress();

  document.getElementById('format-tag').textContent = puzzle.format || '';
  document.getElementById('date-label').textContent = puzzle._loadedDate;

  const firstUnsolved = nonBonusEntries().find((i) => !state.solved.has(i));
  state.activeEntry = firstUnsolved !== undefined ? firstUnsolved : bonusEntryIndex();
  state.cursor = 0;
  if (state.bonusUnlocked) document.getElementById('bonus-badge').classList.add('show');

  setupInput();
  render();

  if (puzzle.entries.every((_, i) => state.solved.has(i))) {
    state.finishTime = Date.now();
    showSolvedPanel();
  }
}

main();
