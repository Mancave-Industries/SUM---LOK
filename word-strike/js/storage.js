// storage.js — localStorage persistence: save/resume, stats, preferences.
// All access is wrapped defensively; corrupt or incompatible data is
// discarded rather than allowed to crash the game.

const SAVE_KEY = "wordstrike_save_v1";
const STATS_KEY = "wordstrike_stats_v1";
const PREFS_KEY = "wordstrike_prefs_v1";

const DEFAULT_STATS = {
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  bestStreak: 0,
  bestRemainingStrikes: 0,
  totalRemainingStrikesInWins: 0,
  fastestVictorySeconds: null,
  totalExactStrikes: 0,
  totalDeadSquares: 0,
};

const DEFAULT_PREFS = {
  soundEnabled: true,
  ambientHumEnabled: false,
  tutorialSeen: false,
  reducedMotion: false,
};

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function isValidGameShape(game) {
  return (
    game &&
    Array.isArray(game.grid) &&
    game.grid.length > 0 &&
    Array.isArray(game.words) &&
    game.words.length === 4 &&
    typeof game.strikesRemaining === "number" &&
    typeof game.gameOver === "boolean"
  );
}

export function saveGame(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, game }));
  } catch (err) {
    // Storage unavailable (private mode, quota, etc.) — fail silently.
  }
}

export function loadGame() {
  try {
    const data = safeParse(localStorage.getItem(SAVE_KEY));
    if (!data || data.version !== 1 || !isValidGameShape(data.game)) {
      return null;
    }
    return data.game;
  } catch (err) {
    return null;
  }
}

export function clearSavedGame() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    // ignore
  }
}

export function getStats() {
  try {
    const data = safeParse(localStorage.getItem(STATS_KEY));
    if (!data || typeof data !== "object") return { ...DEFAULT_STATS };
    return { ...DEFAULT_STATS, ...data };
  } catch (err) {
    return { ...DEFAULT_STATS };
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (err) {
    // ignore
  }
}

/**
 * Folds one finished game into the persistent statistics record.
 * summary: { won, remainingStrikes, elapsedSeconds, exactStrikes, deadSquares }
 */
export function recordGameResult(summary) {
  const stats = getStats();
  stats.gamesPlayed += 1;
  stats.totalExactStrikes += summary.exactStrikes || 0;
  stats.totalDeadSquares += summary.deadSquares || 0;

  if (summary.won) {
    stats.gamesWon += 1;
    stats.currentStreak += 1;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    stats.bestRemainingStrikes = Math.max(
      stats.bestRemainingStrikes,
      summary.remainingStrikes || 0
    );
    stats.totalRemainingStrikesInWins += summary.remainingStrikes || 0;
    if (
      stats.fastestVictorySeconds === null ||
      summary.elapsedSeconds < stats.fastestVictorySeconds
    ) {
      stats.fastestVictorySeconds = summary.elapsedSeconds;
    }
  } else {
    stats.currentStreak = 0;
  }

  saveStats(stats);
  return stats;
}

export function deriveStatsView(stats) {
  const winPct = stats.gamesPlayed
    ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
    : 0;
  const avgRemaining = stats.gamesWon
    ? Math.round((stats.totalRemainingStrikesInWins / stats.gamesWon) * 10) / 10
    : 0;
  return { ...stats, winPercentage: winPct, averageRemainingInWins: avgRemaining };
}

export function getPrefs() {
  try {
    const data = safeParse(localStorage.getItem(PREFS_KEY));
    if (!data || typeof data !== "object") return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...data };
  } catch (err) {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(partial) {
  const prefs = { ...getPrefs(), ...partial };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    // ignore
  }
  return prefs;
}
