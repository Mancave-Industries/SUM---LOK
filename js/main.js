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

let audioCtx = null;
function playTone(freq, dur) {
  if (!state.settings.sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur + 0.02);
  } catch (e) { /* WebAudio unsupported — silently skip */ }
}

let setupNames = Array(CONFIG.minPlayers).fill('');
let seriesLength = 1;

function showScreen(phaseName) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const target = document.getElementById(`screen-${phaseName}`);
  if (target) target.classList.add('active');
}

function render() {
  showScreen(state.phase);
  UI.updateHeader(state);

  switch (state.phase) {
    case PHASES.TITLE:
      UI.renderTitle(hasSavedGame());
      break;
    case PHASES.SETUP:
      UI.renderSetup(setupNames, seriesLength);
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
    state = createInitialState();
    setupNames = Array(CONFIG.minPlayers).fill('');
    seriesLength = 1;
    state.phase = PHASES.SETUP;
    render();
  },
  'continue-game': () => {
    const saved = loadState();
    if (saved) state = saved;
    render();
  },
  'open-help': () => UI.showModal('How To Play', UI.helpContent()),
  'add-player': () => {
    if (setupNames.length < CONFIG.maxPlayers) setupNames.push('');
    UI.renderSetup(setupNames, seriesLength);
  },
  'remove-player': (btn) => {
    const i = Number(btn.dataset.index);
    setupNames.splice(i, 1);
    UI.renderSetup(setupNames, seriesLength);
  },
  'inc-series-length': () => {
    seriesLength = Math.min(20, seriesLength + 1);
    UI.renderSetup(setupNames, seriesLength);
  },
  'dec-series-length': () => {
    seriesLength = Math.max(1, seriesLength - 1);
    UI.renderSetup(setupNames, seriesLength);
  },
  'start-game': () => {
    if (!setupNames.every((n) => n.trim().length > 0)) return;
    startNewSeries(state, setupNames, seriesLength);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'tap-reveal': () => {
    uiStage.revealTapped = true;
    playTone(520, 0.1);
    render();
  },
  'confirm-reveal': () => {
    confirmRevealCurrent(state);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'begin-draw': () => {
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
    playTone(480, 0.1);
    persist();
    render();
    if (result.wentToPot) UI.showToast(`+${result.def.value} gold to the Prize Pot`);
  },
  'confirm-draw': () => {
    state.phase = PHASES.HAND;
    render();
  },
  'continue-from-hand': () => {
    state.phase = PHASES.DRAW;
    uiStage.drawTapped = false;
    const done = finishDrawForCurrent(state);
    if (done) {
      routeAfterDraw(state);
      uiStage.eliminationRevealed = false;
    }
    persist();
    render();
  },
  'proceed-to-murder': () => {
    beginMurderPhase(state);
    uiStage.murderTapped = false;
    uiStage.murderTarget = null;
    uiStage.useChoice = false;
    render();
  },
  'tap-murder-turn': () => {
    uiStage.murderTapped = true;
    render();
  },
  'select-murder-target': (btn) => {
    uiStage.murderTarget = btn.dataset.id;
    render();
  },
  'confirm-murder-turn': () => {
    if (isActingDeceiverTurn(state)) {
      if (!uiStage.murderTarget) return;
      recordMurderChoice(state, uiStage.murderTarget, uiStage.useChoice);
      playTone(220, 0.16);
    }
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
    render();
  },
  'continue-elimination': () => {
    continueAfterElimination(state);
    uiStage.voteTapped = false;
    uiStage.voteSelected = null;
    uiStage.useDagger = false;
    uiStage.eliminationRevealed = false;
    persist();
    render();
  },
  'tap-vote': () => {
    uiStage.voteTapped = true;
    render();
  },
  'select-vote-target': (btn) => {
    uiStage.voteSelected = btn.dataset.id;
    render();
  },
  'confirm-vote': () => {
    if (!uiStage.voteSelected) return;
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
    startNextGameInSeries(state);
    uiStage.revealTapped = false;
    persist();
    render();
  },
  'play-again': () => {
    clearState();
    state = createInitialState();
    render();
  },
  'reset-game': () => {
    UI.hideModal();
    if (!window.confirm('Reset the current game? This cannot be undone.')) return;
    clearState();
    state = createInitialState();
    render();
  },
};

/* ---------- Global event delegation ---------- */

document.addEventListener('click', (e) => {
  const modalClose = e.target.closest('[data-close-modal]');
  if (modalClose) {
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
  UI.showModal('Settings', UI.settingsContent(state));
  const toggle = document.getElementById('soundToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      state.settings.sound = e.target.checked;
      persist();
    });
  }
});

document.getElementById('helpBtn').addEventListener('click', () => {
  UI.showModal('How To Play', UI.helpContent());
});

document.getElementById('soundBtn').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
  persist();
});

/* ---------- Boot ---------- */

document.getElementById('soundBtn').classList.toggle('muted', !state.settings.sound);
render();
