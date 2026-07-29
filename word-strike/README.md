# WORD STRIKE

A mobile-first, tactical word-deduction game. Four hidden words are
concealed on an 8×8 targeting grid; find every letter before your strikes
run out.

Pure HTML/CSS/vanilla JavaScript (ES modules). No frameworks, no build
step, no external dependencies, no network requests after the page loads.

## Running it

**Recommended — local server (required for ES modules in most browsers):**

```bash
cd word-strike
python3 -m http.server 8000
# then open http://localhost:8000/
```

Any static file server works (`npx serve`, `php -S localhost:8000`, VS
Code's Live Server extension, etc.) — the app has zero server-side logic.

**Opening `index.html` directly:** works in some browsers, but Chrome and
several others block `type="module"` script loading over the bare `file://`
protocol (a CORS restriction on ES modules, not specific to this game). If
double-clicking `index.html` shows a blank page with a console error about
modules/CORS, use the local-server method above instead.

**Debug mode:** append `?debug=true` to the URL for a developer panel
(seed, word placements, a board regenerate button) and `?debug=true&seed=123`
to reproduce a specific board deterministically. Debug mode never appears
for normal play.

## Running the tests

```bash
cd word-strike
node tests/gameplay.test.js              # ~35 assertions over shot resolution, scoring, win/loss
node tests/board-generation.test.js       # generates 10,000 boards by default; validates spacing rules
node tests/board-generation.test.js 500   # optional: pass a smaller count for a quick check
```

Neither test touches the DOM — both run directly under Node against the
plain-data game modules. They are development tools, not part of the
runtime; nothing in `index.html` loads them.

## Project structure

```
word-strike/
├── index.html          Screens (start / game), overlays, structural markup only
├── styles.css           All visual design — dark tactical-console theme, responsive layout, animation
├── js/
│   ├── words.js          Word bank (40+ per length: 4/5/6/7 letters) + category-aware selection
│   ├── board.js           Grid creation, word placement + spacing validation, adjacency, coordinates, seeded RNG
│   ├── game.js            Game state, shot resolution, strikes, scoring, statistics, win/loss rules
│   ├── ui.js               Rendering + DOM interaction only — never mutates game state directly
│   ├── audio.js            WebAudio-synthesised sound effects (no audio files)
│   ├── storage.js          localStorage: save/resume, persistent stats, preferences
│   └── main.js             Bootstrap, screen routing, event wiring, debug hooks
├── tests/
│   ├── gameplay.test.js              Shot-resolution / scoring / win-loss logic checks
│   └── board-generation.test.js      Bulk board-validity stress test
└── package.json          `{"type":"module"}` only — enables the tests to run under Node; no dependencies
```

**Why this split:** `board.js` and `game.js` never touch the DOM, so the
rules can be tested headlessly (see `tests/`). `ui.js` never mutates game
state — it only reads it and calls into `game.js`. `main.js` is the only
file that wires the two together and touches `window`/`document` outside
of `ui.js`'s own rendering calls.

## Core rules recap

- 8×8 grid, four hidden words (lengths 7, 6, 5, 4), placed horizontally or
  vertically, never touching — not even diagonally.
- Select a square, then fire a letter from the on-screen A–Z panel.
- **EXACT** (right square, right letter) and **LIVE** (right square, wrong
  letter) never cost a strike — a live square can be retried with a
  different letter, but a previously-eliminated letter is blocked.
- **HOT** (empty square, adjacent to a word) and **DEAD** (empty, nothing
  adjacent in any of the 8 directions) each cost one strike.
- Win by revealing every letter of all four words; lose if strikes hit
  zero first. A final exact strike always wins, even if strikes already
  read zero.
- **Letter radar** (RADAR button): every letter you fire — hit or miss,
  anywhere on the board — is checked against all four words. If it appears
  in a word, it lights up on that word's ring (outermost = 7 letters,
  innermost = 4), independent of whether the specific square you fired at
  was actually part of that word.

Difficulty modes (Standard/Recruit/Veteran/Blackout) vary the starting
strike count; Recruit briefly highlights the four word regions at the
start of the game, and Standard is the fully-specified baseline the others
build on without altering its rules.

## Browser support notes

Built against modern evergreen browsers (recent Chrome/Edge/Firefox/Safari,
including iOS/Android). Uses `<dialog>`-free overlay markup, CSS Grid,
`aspect-ratio`, and the Web Audio API — all widely supported. Reduced-motion
and screen-reader labelling are respected throughout; sound is optional and
off doesn't block understanding what happened on any shot.
