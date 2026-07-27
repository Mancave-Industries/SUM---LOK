/* ==========================================================================
   THE DECEIVERS — Game Engine
   Rules and round progression. Operates only on the state object (state.js
   shape) and data.js constants. No DOM access — returns plain result objects
   for ui.js to render.
   ========================================================================== */

function log(state, text) {
  state.history.push({ round: state.round, text });
}

/* ---------- Setup ---------- */

function setupNewGame(state, playerNames) {
  state.players = playerNames.map((name, i) => createPlayer(`p${i + 1}_${Date.now()}_${i}`, name.trim()));
  playerNames.forEach((name) => {
    const key = name.trim();
    if (!(key in state.seriesScores)) state.seriesScores[key] = 0;
  });

  const deceiverCount = deceiverCountForPlayers(state.players.length);
  const shuffledIndexes = shuffle(state.players.map((_, i) => i)).slice(0, deceiverCount);
  state.players.forEach((p, i) => {
    p.role = shuffledIndexes.includes(i) ? ROLES.DECEIVER.id : ROLES.LOYAL.id;
  });

  state.fortuneDeck = buildDeck(FORTUNE_DECK_DEF);
  state.fortuneDiscard = [];
  state.fateDeck = buildDeck(FATE_DECK_DEF);
  state.fateDiscard = [];
  state.prizePot = 0;
  state.round = 1;
  state.winner = null;
  state.currentFateCard = null;
  state.nightResult = null;
  state.voteResult = null;
  state.finalBanishmentActive = false;
  state.history = [];

  state.pendingQueue = state.players.map((p) => p.id);
  state.phase = PHASES.REVEAL;
  log(state, 'The circle gathers. Roles are sealed.');
  return state;
}

/* ---------- Series (several games back to back, points carried across) ---------- */

function startNewSeries(state, playerNames, seriesLength) {
  state.seriesLength = Math.max(1, Math.min(20, seriesLength | 0));
  state.seriesGame = 1;
  state.seriesScores = {};
  state.rosterNames = playerNames.map((n) => n.trim());
  setupNewGame(state, state.rosterNames);
}

function startNextGameInSeries(state) {
  state.seriesGame += 1;
  setupNewGame(state, state.rosterNames);
}

function fellowDeceivers(state, playerId) {
  return state.players.filter((p) => p.id !== playerId && p.role === ROLES.DECEIVER.id).map((p) => p.name);
}

function currentQueuePlayer(state) {
  if (!state.pendingQueue.length) return null;
  return findPlayer(state, state.pendingQueue[0]);
}

function advanceQueue(state) {
  return state.pendingQueue.shift();
}

/* ---------- Private Role Reveal ---------- */

function confirmRevealCurrent(state) {
  const player = currentQueuePlayer(state);
  if (!player) return { done: true };
  player.revealed = true;
  advanceQueue(state);
  if (!state.pendingQueue.length) {
    state.phase = PHASES.MAIN;
    return { done: true };
  }
  return { done: false };
}

/* ---------- Deck helper ---------- */

function drawFrom(state, deckKey, discardKey, fallbackDefs) {
  if (!state[deckKey].length) {
    if (state[discardKey].length) {
      state[deckKey] = shuffle(state[discardKey]);
      state[discardKey] = [];
      log(state, 'The deck is spent and reshuffled.');
    } else {
      state[deckKey] = buildDeck(fallbackDefs);
    }
  }
  return state[deckKey].pop();
}

/* ---------- Round start: reveal this round's Fate card ---------- */

function startRound(state) {
  state.nightResult = null;
  state.voteResult = null;
  state.players.forEach((p) => {
    p.drawnThisRound = false;
  });

  const living = livingPlayers(state);
  if (living.length <= CONFIG.finalBanishmentThreshold) {
    state.finalBanishmentActive = true;
    state.currentFateCard = FINAL_BANISHMENT_DEF.id;
  } else {
    state.finalBanishmentActive = false;
    state.currentFateCard = drawFrom(state, 'fateDeck', 'fateDiscard', FATE_DECK_DEF);
  }
  state.phase = PHASES.MAIN;
  return cardDefById(state.currentFateCard);
}

/* ---------- Draw Phase (Fortune deck) ---------- */

function beginDrawPhase(state) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.phase = PHASES.DRAW;
}

function drawFortuneCard(state, playerId) {
  const player = findPlayer(state, playerId);
  const cardId = drawFrom(state, 'fortuneDeck', 'fortuneDiscard', FORTUNE_DECK_DEF);
  const def = cardDefById(cardId);
  player.drawnThisRound = true;

  if (def.type === 'gold') {
    state.prizePot += def.value;
    state.fortuneDiscard.push(cardId);
    log(state, `${player.name} drew ${def.name} — the Prize Pot grows.`);
    return { cardId, def, wentToPot: true };
  }
  player.hand.push(cardId);
  log(state, `${player.name} drew ${def.name} and kept it.`);
  return { cardId, def, wentToPot: false };
}

function playShieldNow(state, playerId) {
  const player = findPlayer(state, playerId);
  const idx = player.hand.indexOf('shield');
  if (idx === -1) return false;
  player.hand.splice(idx, 1);
  player.shieldedThisRound = true;
  state.fortuneDiscard.push('shield');
  log(state, `${player.name} raises a Shield for the night ahead.`);
  return true;
}

function finishDrawForCurrent(state) {
  advanceQueue(state);
  return state.pendingQueue.length === 0;
}

/* ---------- Fate branch routing (after Draw Phase completes) ---------- */

function routeAfterDraw(state) {
  const def = cardDefById(state.currentFateCard);
  if (state.finalBanishmentActive) {
    beginVotePhase(state, true);
    return PHASES.FINAL_BANISHMENT;
  }
  if (def.effect === 'murder-night') {
    state.phase = PHASES.NIGHT;
    return PHASES.NIGHT;
  }
  if (def.effect === 'no-murder') {
    state.fateDiscard.push(state.currentFateCard);
    state.nightResult = { quiet: true };
    state.eliminationContext = 'quiet';
    log(state, 'A quiet night. No blade is drawn.');
    state.phase = PHASES.ELIMINATION;
    return PHASES.ELIMINATION;
  }
  // vote-only
  state.fateDiscard.push(state.currentFateCard);
  beginVotePhase(state, false);
  return PHASES.VOTE;
}

/* ---------- Night Phase / Murder Selection ----------
   Every living player takes a turn with the phone during Murder — not just
   the Deceivers — so who holds the phone never gives away who they are.
   Exactly one living Deceiver (the "acting" Deceiver, fixed for the whole
   game once chosen) sees the real target-selection screen on their turn;
   everyone else — Loyal and non-acting Deceivers alike — sees an identical,
   content-free "nothing to do" screen. */

function eligibleMurderTargets(state) {
  return livingPlayers(state).filter((p) => p.role !== ROLES.DECEIVER.id);
}

function beginMurderPhase(state) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  if (!state.actingDeceiverId || !findPlayer(state, state.actingDeceiverId)?.alive) {
    const deceiver = livingPlayers(state).find((p) => p.role === ROLES.DECEIVER.id);
    state.actingDeceiverId = deceiver ? deceiver.id : null;
  }
  state.pendingMurderChoice = null;
  state.phase = PHASES.MURDER;
}

function isActingDeceiverTurn(state) {
  const player = currentQueuePlayer(state);
  return !!player && player.id === state.actingDeceiverId;
}

function actingDeceiverHoldsChoiceCard(state) {
  const actor = findPlayer(state, state.actingDeceiverId);
  return !!actor && actor.hand.includes('deceivers-choice');
}

function recordMurderChoice(state, targetId, useDeceiversChoice) {
  state.pendingMurderChoice = { targetId, useDeceiversChoice: !!useDeceiversChoice };
}

/** Advances the per-player murder queue. Returns true once everyone has had
 *  a turn and the murder has been resolved; false if more turns remain. */
function advanceMurderQueue(state) {
  advanceQueue(state);
  if (state.pendingQueue.length) return false;
  const choice = state.pendingMurderChoice;
  if (choice && choice.targetId) {
    resolveMurder(state, choice.targetId, choice.useDeceiversChoice);
  } else {
    // Safety fallback: no valid pick was recorded (should not happen —
    // the acting Deceiver's confirm button is disabled without a target).
    state.nightResult = { quiet: true };
    state.eliminationContext = 'quiet';
    state.fateDiscard.push(state.currentFateCard);
    state.phase = PHASES.ELIMINATION;
  }
  return true;
}

function resolveMurder(state, targetId, useDeceiversChoice) {
  const target = findPlayer(state, targetId);

  if (useDeceiversChoice) {
    const holder = findPlayer(state, state.actingDeceiverId);
    if (holder && holder.hand.includes('deceivers-choice')) {
      holder.hand.splice(holder.hand.indexOf('deceivers-choice'), 1);
      state.fortuneDiscard.push('deceivers-choice');
    }
  }

  const wasShielded = target.shieldedThisRound && !useDeceiversChoice;
  if (!wasShielded) target.alive = false;

  state.fateDiscard.push(state.currentFateCard);
  state.nightResult = {
    quiet: false,
    targetId,
    name: target.name,
    murdered: !wasShielded,
    protected: wasShielded,
    deceiversChoicePlayed: !!useDeceiversChoice,
  };
  log(state, wasShielded
    ? `${target.name} was marked for murder but a Shield saved them.`
    : `${target.name} was murdered in the night.`);
  state.eliminationContext = 'night';
  state.phase = PHASES.ELIMINATION;
  return state.nightResult;
}

/* ---------- Banishment Vote ---------- */

function beginVotePhase(state, isFinal) {
  state.pendingQueue = livingPlayers(state).map((p) => p.id);
  state.voteResult = { tally: {}, banishedId: null, tie: false, votes: [] };
  state.finalBanishmentActive = !!isFinal;
  state.phase = isFinal ? PHASES.FINAL_BANISHMENT : PHASES.VOTE;
}

function eligibleVoteTargets(state, voterId) {
  return livingPlayers(state).filter((p) => p.id !== voterId);
}

function castVote(state, voterId, targetId, useDagger) {
  const voter = findPlayer(state, voterId);
  let weight = 1;
  if (useDagger) {
    const idx = voter.hand.indexOf('dagger');
    if (idx !== -1) {
      voter.hand.splice(idx, 1);
      state.fortuneDiscard.push('dagger');
      weight = 2;
    }
  }
  const tally = state.voteResult.tally;
  tally[targetId] = (tally[targetId] || 0) + weight;
  state.voteResult.votes.push({ voterId, targetId, weight });
  advanceQueue(state);
  return state.pendingQueue.length === 0;
}

function resolveBanishment(state) {
  const tally = state.voteResult.tally;
  const entries = Object.entries(tally);
  state.voteResult.banishedId = null;
  state.voteResult.tie = false;

  if (entries.length) {
    entries.sort((a, b) => b[1] - a[1]);
    const topWeight = entries[0][1];
    const topTied = entries.filter(([, w]) => w === topWeight);
    if (topTied.length === 1) {
      const banishedId = topTied[0][0];
      const banished = findPlayer(state, banishedId);
      banished.alive = false;
      state.voteResult.banishedId = banishedId;
      log(state, `${banished.name} was banished by the circle.`);
    } else {
      state.voteResult.tie = true;
      log(state, 'The vote is tied. No one is banished.');
    }
  } else {
    state.voteResult.tie = true;
  }
  state.eliminationContext = state.finalBanishmentActive ? 'final' : 'banishment';
  state.phase = PHASES.ELIMINATION;
  return state.voteResult;
}

/* ---------- Continuation after an Elimination Reveal ----------
   Centralizes "what happens after the ceremony" so ui.js only needs to call
   this once the player taps Continue; it never has to know the round shape. */

function continueAfterElimination(state) {
  const context = state.eliminationContext;

  if (context === 'night' || context === 'quiet') {
    const winner = checkWinCondition(state);
    if (winner) {
      finalizeGame(state, winner);
      return PHASES.RESULTS;
    }
    beginVotePhase(state, false);
    return PHASES.VOTE;
  }

  // context is 'banishment' or 'final'
  const ended = advanceRoundOrEnd(state);
  return ended ? PHASES.RESULTS : PHASES.MAIN;
}

/* ---------- Win condition ---------- */

function checkWinCondition(state) {
  const living = livingPlayers(state);
  const livingDeceivers = living.filter((p) => p.role === ROLES.DECEIVER.id).length;
  const livingLoyal = living.length - livingDeceivers;
  if (livingDeceivers === 0) return ROLES.LOYAL.id;
  if (livingDeceivers >= livingLoyal) return ROLES.DECEIVER.id;
  return null;
}

/* Loyal winners split the pot among whoever is still standing; Deceiver
   winners take the whole pot among whichever Deceivers are still standing.
   Either way it's divided only among survivors on the winning side — no one
   who was banished or murdered earlier shares in it. The pot is spent once
   paid out and starts rebuilding from zero next game. */
function payoutPrizePot(state, winner) {
  const pot = state.prizePot;
  const survivors = livingPlayers(state).filter((p) => p.role === winner);
  const share = survivors.length ? Math.floor(pot / survivors.length) : 0;
  survivors.forEach((p) => {
    state.seriesScores[p.name] = (state.seriesScores[p.name] || 0) + share;
  });
  state.prizePot = 0;
  return { winner, pot, share, recipients: survivors.map((p) => p.name) };
}

function finalizeGame(state, winner) {
  state.winner = winner;
  state.gamePayout = payoutPrizePot(state, winner);
  state.phase = PHASES.RESULTS;
  log(state, winner === ROLES.LOYAL.id ? 'Every Deceiver has fallen. The Loyal prevail.' : 'The Deceivers now rule the circle.');
}

function advanceRoundOrEnd(state) {
  const winner = checkWinCondition(state);
  if (winner) {
    finalizeGame(state, winner);
    return true;
  }
  state.round += 1;
  state.players.forEach((p) => {
    p.shieldedThisRound = false;
  });
  state.currentFateCard = null;
  state.phase = PHASES.MAIN;
  return false;
}
