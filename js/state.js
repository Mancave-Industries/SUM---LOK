/* ==========================================================================
   THE DECEIVERS — State
   Game state shape, mutators, and localStorage persistence.
   No DOM access here — engine.js and ui.js read/write this shape.
   ========================================================================== */

const STATE_VERSION = 1;

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(defs) {
  const ids = [];
  defs.forEach((def) => {
    for (let i = 0; i < def.count; i++) ids.push(def.id);
  });
  return shuffle(ids);
}

function createInitialState() {
  return {
    version: STATE_VERSION,
    phase: PHASES.TITLE,
    round: 1,
    players: [],
    currentPlayerIndex: 0,
    pendingQueue: [],
    fortuneDeck: [],
    fortuneDiscard: [],
    fateDeck: [],
    fateDiscard: [],
    prizePot: 0,
    currentFateCard: null,
    nightResult: null,
    voteResult: null,
    eliminationContext: null,
    finalBanishmentActive: false,
    history: [],
    winner: null,
    settings: { sound: false },
  };
}

function createPlayer(id, name) {
  return {
    id,
    name,
    role: null,
    alive: true,
    hand: [],
    shieldedThisRound: false,
    revealed: false,
    drawnThisRound: false,
  };
}

function livingPlayers(state) {
  return state.players.filter((p) => p.alive);
}

function findPlayer(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

function saveState(state) {
  try {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  } catch (e) {
    /* localStorage unavailable (private mode / quota) — game still playable this session */
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(CONFIG.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== STATE_VERSION) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function clearState() {
  try {
    localStorage.removeItem(CONFIG.storageKey);
  } catch (e) {
    /* ignore */
  }
}

function hasSavedGame() {
  const s = loadState();
  return !!(s && s.phase && s.phase !== PHASES.TITLE && s.phase !== PHASES.RESULTS);
}
