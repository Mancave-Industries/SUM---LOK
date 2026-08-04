/* ==========================================================================
   THE DECEIVERS — Bootstrap, router, event wiring
   ========================================================================== */

/* Always boot to the Title screen; a saved in-progress game is only resumed
   when the player explicitly taps Continue (see 'continue-game' action). */
let state = createInitialState();

/* Ephemeral UI-only sequencing (pass-device ceremony, in-progress selections).
   None of this is game data — it resets on each screen visit and is never
   persisted to localStorage. */
const uiStage = {
  revealTapped: false,
  drawTapped: false,
  murderTapped: false,
  murderTarget: null,
  useChoice: false,
  voteTapped: false,
  voteSelected: null,
  useDagger: false,
  eliminationRevealed: false,
};

Sound.setEnabled(state.settings.sound);

let setupNames = Array(CONFIG.minPlayers).fill('');
let setupIsComputer = Array(CONFIG.minPlayers).fill(false);
let seriesLength = 1;

/* Computer seats never wait for a tap: this pauses briefly, then resolves
   their turn with the same bot logic no matter which seat holds the secret
   Deceiver role, and re-renders. Guarded so a phase change mid-render can't
   schedule a second overlapping timer for the same turn. */
const COMPUTER_TURN_DELAY_MS = 700;
let computerTurnTimer = null;

const QUEUE_PHASES = [PHASES.REVEAL, PHASES.DRAW, PHASES.MURDER, PHASES.VOTE, PHASES.FINAL_BANISHMENT];

function cancelComputerTurnTimer() {
  if (computerTurnTimer !== null) {
    clearTimeout(computerTurnTimer);
    computerTurnTimer = null;
  }
}

function autoAdvanceComputerTurns() {
  if (!QUEUE_PHASES.includes(state.phase)) return false;
  const player = currentQueuePlayer(state);
  if (!player || !player.isComputer) return false;

  UI.renderComputerTurn(state, player);
  if (computerTurnTimer !== null) return true;
  computerTurnTimer = setTimeout(() => {
    computerTurnTimer = null;
    resolveComputerTurn();
    persist();
    render();
  }, COMPUTER_TURN_DELAY_MS);
  return true;
}

function resolveComputerTurn() {
  switch (state.phase) {
    case PHASES.REVEAL:
      confirmRevealCurrent(state);
      break;
    case PHASES.DRAW: {
      const player = currentQueuePlayer(state);
      drawFortuneCard(state, player.id);
      const done = finishDrawForCurrent(state);
      if (done) {
        routeAfterDraw(state);
        uiStage.eliminationRevealed = false;
        if (state.phase === PHASES.NIGHT) Sound.play('nightFalls');
        else if (state.phase === PHASES.ELIMINATION) Sound.play('quietNight');
      }
      break;
    }
    case PHASES.MURDER: {
      // Same two calls regardless of role — recordMurderChoice only runs on
      // the acting Deceiver's own turn, exactly like confirm-murder-turn.
      if (isActingDeceiverTurn(state)) {
        const targetId = botPickMurderTarget(state);
        const useChoice = botShouldUseDeceiversChoice(state);
        if (targetId) recordMurderChoice(state, targetId, useChoice);
      }
      advanceMurderQueue(state);
      uiStage.eliminationRevealed = false;
      break;
    }
    case PHASES.VOTE:
    case PHASES.FINAL_BANISHMENT: {
      const voter = currentQueuePlayer(state);
      const targetId = botPickVoteTarget(state, voter.id);
      const useDagger = botShouldUseDagger(state, voter.id);
      const done = castVote(state, voter.id, targetId, useDagger);
      if (done) {
        resolveBanishment(state);
        uiStage.eliminationRevealed = false;
      }
      break;
    }
    default:
      break;
  }
}

function showScreen(phaseName) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(`screen-${phaseName}`);
  if (target) target.classList.add('active');
}

function render() {
  showScreen(state.phase);
  UI.updateHeader(state);

  if (autoAdvanceComputerTurns()) return;

  switch (state.phase) {
    case PHASES.TITLE:
      UI.renderTitle(hasSavedGame());
      break;
    case PHASES.SETUP:
      UI.renderSetup(setupNames, seriesLength, setupIsComputer);
      break;
    case PHASES.REVEAL:
      UI.renderReveal(state, uiStage.revealTapped);
      break;
    case PHASES.MAIN:
      if (!state.currentFateCard) startRound(state);
      UI.renderMain(state);
      break;
    case PHASES.DRAW:
      UI.renderDraw(state, uiStage.drawTapped);
      break;
    case PHASES.HAND:
      UI.renderHand(state);
      break;
    case PHASES.NIGHT:
      UI.renderNight();
      break;
    case PHASES.MURDER:
      UI.renderMurder(state, uiStage.murderTapped, uiStage.murderTarget, uiStage.useChoice);
      break;
    case PHASES.VOTE:
    case PHASES.FINAL_BANISHMENT:
      UI.renderVote(state, uiStage.voteTapped, uiStage.voteSelected, uiStage.useDagger);
      break;
    case PHASES.ELIMINATION:
      UI.renderElimination(state, uiStage.eliminationRevealed);
      break;
    case PHASES.RESULTS:
      UI.renderResults(state);
      break;
    default:
      break;
  }
}

function persist() {
  saveState(state);
}

/* Called from ui.js checkbox listeners (kept as plain globals — no module system). */
function main_onToggleDeceiversChoice(checked) {
  uiStage.useChoice = checked;
}
function main_onToggleDagger(checked) {
  uiStage.useDagger = checked;
}

/* ---------- Action handlers ---------- */

const actions = {
  'new-game': () => {
    Sound.play('tap');
    cancelComputerTurnTimer();
    state = createInitialState();
    setupNames = Array(CONFIG.minPlayers).fill('');
    setupIsComputer = Array(CONFIG.minPlayers).fill(false);
    seriesLength = 1;
    state.phase = PHASES.SETUP;
    render();
  },
  'continue-game': () => {
    Sound.play('tap');
    cancelComputerTurnTimer();
    const saved = loadState();
    if (saved) {
      state = saved;
      Sound.setEnabled(state.settings.sound);
      document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
    }
    render();
  },
  'open-help': () => {
    Sound.play('modalOpen');
    UI.showModal('How To Play', UI.helpContent());
  },
  'add-player': () => {
    Sound.play('tap');
    if (setupNames.length < CONFIG.maxPlayers) {
      setupNames.push('');
      setupIsComputer.push(false);
    }
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'remove-player': (btn) => {
    Sound.play('tap');
    const i = Number(btn.dataset.index);
    setupNames.splice(i, 1);
    setupIsComputer.splice(i, 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'set-seat-mode': (btn) => {
    Sound.play('tap');
    const i = Number(btn.dataset.index);
    setupIsComputer[i] = btn.dataset.mode === 'computer';
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'inc-series-length': () => {
    Sound.play('tap');
    seriesLength = Math.min(20, seriesLength + 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'dec-series-length': () => {
    Sound.play('tap');
    seriesLength = Math.max(1, seriesLength - 1);
    UI.renderSetup(setupNames, seriesLength, setupIsComputer);
  },
  'start-game': () => {
    if (!setupNames.every((n) => n.trim().length > 0)) return;
    Sound.play('gather');
    startNewSeries(state, setupNames, seriesLength, setupIsComputer);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'tap-reveal': () => {
    uiStage.revealTapped = true;
    Sound.play('reveal');
    render();
  },
  'confirm-reveal': () => {
    Sound.play('hide');
    confirmRevealCurrent(state);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'begin-draw': () => {
    Sound.play('tap');
    beginDrawPhase(state);
    uiStage.drawTapped = false;
    persist();
    render();
  },
  'tap-draw': () => {
    const player = currentQueuePlayer(state);
    const result = drawFortuneCard(state, player.id);
    state.lastDrawResult = result;
    uiStage.drawTapped = true;
    Sound.play(result.wentToPot ? 'gold' : 'draw');
    persist();
    render();
    if (result.wentToPot) UI.showToast(`+${result.def.value} gold to the Prize Pot`);
  },
  'confirm-draw': () => {
    Sound.play('tap');
    state.phase = PHASES.HAND;
    render();
  },
  'continue-from-hand': () => {
    Sound.play('tap');
    state.phase = PHASES.DRAW;
    uiStage.drawTapped = false;
    const done = finishDrawForCurrent(state);
    if (done) {
      routeAfterDraw(state);
      uiStage.eliminationRevealed = false;
      if (state.phase === PHASES.NIGHT) Sound.play('nightFalls');
      else if (state.phase === PHASES.ELIMINATION) Sound.play('quietNight');
    }
    persist();
    render();
  },
  'proceed-to-murder': () => {
    Sound.play('tap');
    beginMurderPhase(state);
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.useChoice = false;
    render();
  },
  'tap-murder-turn': () => {
    // Same sound every turn regardless of role — see sound.js header note.
    uiStage.murderTapped = true;
    Sound.play('tap');
    render();
  },
  'select-murder-target': (btn) => {
    Sound.play('tap');
    uiStage.murderTarget = btn.dataset.id;
    render();
  },
  'confirm-murder-turn': () => {
    if (isActingDeceiverTurn(state)) {
      if (!uiStage.murderTarget) return;
      recordMurderChoice(state, uiStage.murderTarget, uiStage.useChoice);
    }
    // Same sound every turn regardless of role — see sound.js header note.
    Sound.play('tap');
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.useChoice = false;
    advanceMurderQueue(state);
    uiStage.eliminationRevealed = false;
    persist();
    render();
  },
  'reveal-elimination': () => {
    uiStage.eliminationRevealed = true;
    Sound.play('gather');
    const context = state.eliminationContext;
    if (context === 'quiet') {
      Sound.play('quietNight', 0.5);
    } else if (context === 'night') {
      Sound.play(state.nightResult.protected ? 'shieldSaved' : 'murdered', 0.5);
    } else {
      const tied = state.voteResult.tie || !state.voteResult.banishedId;
      Sound.play(tied ? 'tie' : 'banished', 0.5);
    }
    render();
  },
  'continue-elimination': () => {
    Sound.play('tap');
    continueAfterElimination(state);
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    uiStage.eliminationRevealed = false;
    if (state.phase === PHASES.RESULTS) {
      Sound.play(state.winner === ROLES.DECEIVER.id ? 'deceiverWin' : 'loyalWin', 0.3);
    }
    persist();
    render();
  },
  'tap-vote': () => {
    uiStage.voteTapped = true;
    Sound.play('tap');
    render();
  },
  'select-vote-target': (btn) => {
    Sound.play('tap');
    uiStage.voteSelected = btn.dataset.id;
    render();
  },
  'confirm-vote': () => {
    if (!uiStage.voteSelected) return;
    Sound.play('tap');
    const voter = currentQueuePlayer(state);
    const done = castVote(state, voter.id, uiStage.voteSelected, uiStage.useDagger);
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    if (done) {
      resolveBanishment(state);
      uiStage.eliminationRevealed = false;
    }
    persist();
    render();
  },
  'next-game-in-series': () => {
    Sound.play('gather');
    startNextGameInSeries(state);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'play-again': () => {
    Sound.play('tap');
    cancelComputerTurnTimer();
    clearState();
    state = createInitialState();
    render();
  },
  'reset-game': () => {
    Sound.play('tap');
    UI.hideModal();
    if (!window.confirm('Reset the current game? This cannot be undone.')) return;
    cancelComputerTurnTimer();
    clearState();
    state = createInitialState();
    render();
  },
};

/* ---------- Global event delegation ---------- */

document.addEventListener('click', (e) => {
  const modalClose = e.target.closest('[data-close-modal]');
  if (modalClose) {
    Sound.play('modalClose');
    UI.hideModal();
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = actions[btn.dataset.action];
  if (action) action(btn);
});

document.addEventListener('input', (e) => {
  if (!e.target.classList.contains('name-input')) return;
  const i = Number(e.target.dataset.index);
  setupNames[i] = e.target.value;
  const startBtn = document.querySelector('[data-action="start-game"]');
  if (startBtn) startBtn.disabled = !setupNames.every((n) => n.trim().length > 0);
});

document.getElementById('menuBtn').addEventListener('click', () => {
  Sound.play('modalOpen');
  UI.showModal('Settings', UI.settingsContent(state));
  const toggle = document.getElementById('soundToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      state.settings.sound = e.target.checked;
      Sound.setEnabled(state.settings.sound);
      if (state.settings.sound) Sound.play('tap');
      persist();
    });
  }
});

document.getElementById('helpBtn').addEventListener('click', () => {
  Sound.play('modalOpen');
  UI.showModal('How To Play', UI.helpContent());
});

document.getElementById('soundBtn').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  Sound.setEnabled(state.settings.sound);
  document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
  if (state.settings.sound) Sound.play('tap');
  persist();
});

/* ---------- Boot ---------- */

document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
render();
