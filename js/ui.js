/* ==========================================================================
   THE DECEIVERS — Rendering
   Builds DOM for each screen from the current state. Never mutates game
   state directly — main.js calls engine functions, then calls a render
   function here. Every render function is pure w.r.t. its inputs.
   ========================================================================== */

const UI = {};

/* ---------- Small helpers ---------- */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function initials(name) {
  const trimmed = String(name).trim();
  if (!trimmed) return '?';
  const parts = trimmed.split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function iconUse(id, cls) {
  return `<svg class="${cls || 'icon'}" aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function cardStatic(symbolId, extraClass) {
  return `<div class="card ${extraClass || ''}"><svg viewBox="0 0 200 280" style="width:100%;height:100%;display:block;border-radius:14px;"><use href="#${symbolId}"></use></svg></div>`;
}

function cardFlip(backSymbol, frontSymbol, extraClass, cardId) {
  return `<div class="card ${extraClass || ''}" ${cardId ? `id="${cardId}"` : ''}>
    <div class="card-inner">
      <div class="card-face card-back-face"><svg viewBox="0 0 200 280"><use href="#${backSymbol}"></use></svg></div>
      <div class="card-face card-front-face"><svg viewBox="0 0 200 280"><use href="#${frontSymbol}"></use></svg></div>
    </div>
  </div>`;
}

function screen(name) {
  return document.getElementById(`screen-${name}`);
}

function triggerFlip(cardId) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      const el = document.getElementById(cardId);
      if (el) el.classList.add('flipped');
    }, 60);
  });
}

function meaningBlock(text) {
  return `<div class="pass-overlay-eyebrow" style="margin-top:2px;">What This Means</div>
    <p class="reveal-body" style="font-size:13px;">${text}</p>`;
}

function passPrompt({ icon, name, instruction, action, btnLabel, btnClass }) {
  return `
    <div class="reveal-stage fade-in">
      ${iconUse(icon, 'icon icon-lg')}
      <div class="pass-overlay-eyebrow">Pass the phone to</div>
      <div class="pass-overlay-name">${escapeHtml(name)}</div>
      <p class="pass-overlay-instruction">${instruction}</p>
      <button class="btn ${btnClass || 'btn-primary'}" data-action="${action}">${btnLabel}</button>
    </div>`;
}

/* ---------- Header ---------- */

UI.updateHeader = function updateHeader(state) {
  const roundLabel = document.getElementById('roundLabel');
  const phaseLabel = document.getElementById('phaseLabel');
  if (state.phase === PHASES.TITLE || state.phase === PHASES.SETUP) {
    roundLabel.textContent = 'The Deceivers';
    phaseLabel.textContent = '';
  } else if (state.phase === PHASES.RESULTS) {
    roundLabel.textContent = 'The Circle Closes';
    phaseLabel.textContent = '';
  } else {
    roundLabel.textContent = `Round ${state.round}`;
    phaseLabel.textContent = PHASE_LABELS[state.phase] || '';
  }
};

/* ---------- 1. Title ---------- */

UI.renderTitle = function renderTitle(hasSaved) {
  screen('title').innerHTML = `
    <div class="title-hero fade-in">
      <svg class="title-emblem-svg" viewBox="0 0 360 170" aria-hidden="true"><use href="#title-treatment"></use></svg>
      <div class="title-actions">
        ${hasSaved ? '<button class="btn btn-primary btn-block" data-action="continue-game">Continue Game</button>' : ''}
        <button class="btn ${hasSaved ? 'btn-ghost' : 'btn-primary'} btn-block" data-action="new-game">New Game</button>
        <button class="btn btn-ghost btn-block" data-action="open-help">How To Play</button>
      </div>
    </div>`;
};

/* ---------- 2. Setup ---------- */

UI.renderSetup = function renderSetup(names, seriesLength, isComputer) {
  const allValid = names.every((n) => n.trim().length > 0);
  const deceivers = deceiverCountForPlayers(names.length);
  const computerCount = isComputer.filter(Boolean).length;
  screen('setup').innerHTML = `
    <div class="screen-title-row">Gather the Circle</div>
    <div class="screen-subtitle">Enter each player's name. One shared phone, ${CONFIG.minPlayers}–${CONFIG.maxPlayers} players. Mark a seat Computer to have it play itself with simple random logic.</div>
    <div class="setup-list">
      ${names.map((n, i) => `
        <div class="setup-player-block">
          <div class="setup-row">
            <span class="seat-index">${i + 1}</span>
            <input class="name-input" type="text" data-index="${i}" maxlength="18" placeholder="Player ${i + 1} name" value="${escapeHtml(n)}" autocomplete="off">
            ${names.length > CONFIG.minPlayers ? `<button class="remove-player-btn" data-action="remove-player" data-index="${i}" aria-label="Remove player">&times;</button>` : ''}
          </div>
          <div class="seat-mode-row">
            <button type="button" class="seat-mode-btn ${!isComputer[i] ? 'active' : ''}" data-action="set-seat-mode" data-index="${i}" data-mode="human">${iconUse(ICONS.hoodedFigure, 'icon-sm')} Human</button>
            <button type="button" class="seat-mode-btn ${isComputer[i] ? 'active' : ''}" data-action="set-seat-mode" data-index="${i}" data-mode="computer">${iconUse(ICONS.settings, 'icon-sm')} Computer</button>
          </div>
        </div>`).join('')}
    </div>
    ${computerCount ? `<p class="setup-hint">${computerCount} computer seat${computerCount > 1 ? 's' : ''} — the phone skips straight past ${computerCount > 1 ? 'them' : 'it'} on ${computerCount > 1 ? 'their' : 'its'} turn.</p>` : ''}
    ${names.length < CONFIG.maxPlayers ? `<button class="add-player-btn" data-action="add-player">${iconUse(ICONS.hoodedFigure, 'icon-sm')} Add Player</button>` : ''}
    <p class="setup-hint">${names.length} players — ${deceivers} Deceiver${deceivers > 1 ? 's' : ''} will be chosen in secret.</p>
    <div class="panel" style="margin-top:6px;">
      <div class="panel-title">How Many Games?</div>
      <div style="display:flex; align-items:center; justify-content:center; gap:20px;">
        <button class="icon-btn" data-action="dec-series-length" aria-label="Fewer games" style="border:1.5px solid var(--gold-700); font-size:22px; color:var(--gold-400); line-height:1;">−</button>
        <div style="text-align:center;">
          <div class="prize-pot-value" style="font-size:26px;">${seriesLength}</div>
          <div class="prize-pot-label">${seriesLength > 1 ? 'games in the series' : 'game'}</div>
        </div>
        <button class="icon-btn" data-action="inc-series-length" aria-label="More games" style="border:1.5px solid var(--gold-700); font-size:22px; color:var(--gold-400); line-height:1;">+</button>
      </div>
      ${seriesLength > 1 ? '<p class="small-note" style="margin-top:8px;">Points carry across every game — the Prize Pot is paid out to the winning side each game.</p>' : ''}
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary btn-block" data-action="start-game" ${allValid ? '' : 'disabled'}>Seal The Roles &amp; Begin</button>`;
};

/* ---------- Computer seat auto-turn ----------
   One shared screen for every queue-based phase (Reveal/Draw/Murder/Vote)
   when the current seat is a computer. Content depends only on the player's
   name — never on their secret role or on what the bot decided — so it
   looks identical for the acting Deceiver's computer turn as for any other
   computer seat's turn, matching the human decoy-screen pattern. */
UI.renderComputerTurn = function renderComputerTurn(state, player) {
  screen(state.phase).innerHTML = `
    <div class="reveal-stage fade-in">
      ${iconUse(ICONS.settings, 'icon icon-lg')}
      <div class="pass-overlay-eyebrow">Computer Seat</div>
      <div class="pass-overlay-name">${escapeHtml(player.name)}</div>
      <p class="reveal-body">Taking its turn — no phone needed.</p>
    </div>`;
};

/* ---------- 3. Private Role Reveal ---------- */

UI.renderReveal = function renderReveal(state, tapped) {
  const player = currentQueuePlayer(state);
  if (!player) return;
  const role = player.role === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
  const fellows = role === ROLES.DECEIVER ? fellowDeceivers(state, player.id) : [];
  const fellowText = fellows.length
    ? `<br><br>Your fellow Deceiver${fellows.length > 1 ? 's' : ''}: <strong>${fellows.map(escapeHtml).join(', ')}</strong>`
    : '';

  if (!tapped) {
    screen('reveal').innerHTML = passPrompt({
      icon: ICONS.hoodedFigure,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now and look away — no one else should see this screen. Once it's in their hands, they tap below.`,
      action: 'tap-reveal',
      btnLabel: 'Reveal My Role',
    });
    return;
  }

  screen('reveal').innerHTML = `
    <div class="reveal-stage">
      ${cardFlip(CARD_FRAMES.back, role.symbol, 'card-lg', 'revealCard')}
      <h2 class="reveal-headline">${role.label}</h2>
      ${meaningBlock(`${role.description}${fellowText}`)}
      <button class="btn btn-confirm btn-block" data-action="confirm-reveal">Hide My Role &amp; Pass The Phone</button>
    </div>`;
  triggerFlip('revealCard');
};

/* ---------- 4. Main hub ---------- */

UI.renderMain = function renderMain(state) {
  const living = livingPlayers(state);
  const seriesNote = state.seriesLength > 1 ? `Game ${state.seriesGame} of ${state.seriesLength} — ` : '';
  screen('main').innerHTML = `
    <div class="screen-title-row">Round ${state.round}</div>
    <div class="screen-subtitle">${seriesNote}${living.length} remain in the circle.</div>
    <div class="prize-pot-panel">
      ${iconUse(ICONS.coin, 'icon icon-lg')}
      <div><div class="prize-pot-value">${state.prizePot}</div><div class="prize-pot-label">Prize Pot</div></div>
      ${iconUse(ICONS.coin, 'icon icon-lg')}
    </div>
    <div class="player-list">
      ${state.players.map((p) => `
        <div class="player-row ${p.alive ? '' : 'eliminated'}">
          <div class="player-avatar">${initials(p.name)}</div>
          <div class="player-name">${escapeHtml(p.name)}${p.isComputer ? ' <span class="small-note">(Computer)</span>' : ''}</div>
          <div class="player-meta">${p.alive ? (p.hand.length ? `${p.hand.length} card${p.hand.length > 1 ? 's' : ''}` : '') : 'Out'}</div>
          ${!p.alive ? iconUse(ICONS.skull, 'player-badge') : ''}
        </div>`).join('')}
    </div>
    <div class="spacer"></div>
    ${state.finalBanishmentActive ? `
      <div class="panel">
        <div class="panel-title">The Final Banishment Looms</div>
        <p class="small-note" style="text-align:left;">Few enough remain that this round's Banishment Vote will decide the game.</p>
      </div>` : ''}
    <button class="btn btn-primary btn-block" data-action="begin-draw" style="margin-top:14px;">Begin Draw Phase</button>`;
};

/* ---------- 5. Card Draw ---------- */

UI.renderDraw = function renderDraw(state, tapped) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('draw').innerHTML = passPrompt({
      icon: ICONS.hourglass,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now, then they tap below to draw their card for this round.`,
      action: 'tap-draw',
      btnLabel: 'Draw A Card',
    });
    return;
  }

  const result = state.lastDrawResult;
  const def = result.def;
  screen('draw').innerHTML = `
    <div class="reveal-stage">
      ${cardFlip(CARD_FRAMES.back, def.symbol, 'card-lg', 'drawCard')}
      <p class="reveal-body">${result.wentToPot
        ? `<strong>${escapeHtml(player.name)}</strong> drew ${def.name} — <strong>${def.value} gold</strong> added to the Prize Pot!`
        : `<strong>${escapeHtml(player.name)}</strong> drew ${def.name} and keeps it.`}</p>
      ${result.wentToPot ? '' : meaningBlock(def.description)}
      <button class="btn btn-confirm btn-block" data-action="confirm-draw">Continue To My Hand</button>
    </div>`;
  triggerFlip('drawCard');
};

/* ---------- 6. Hand Selection ---------- */

UI.renderHand = function renderHand(state) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  screen('hand').innerHTML = `
    <div class="screen-title-row">${escapeHtml(player.name)}'s Hand</div>
    <div class="screen-subtitle">Your held cards — what each one means:</div>
    <div class="hand-scroll">
      ${player.hand.length === 0 ? '<div class="hand-empty">No cards held.</div>' : player.hand.map((cardId) => {
        const def = cardDefById(cardId);
        return `<div class="hand-card-wrap">
          ${cardStatic(def.symbol)}
          <span class="hand-card-name">${def.name}</span>
          <span class="hand-card-desc">${def.description}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn btn-primary btn-block" data-action="continue-from-hand">Done — Pass The Phone</button>`;
};

/* ---------- 7. Night ---------- */

UI.renderNight = function renderNight() {
  screen('night').innerHTML = `
    <div class="reveal-stage fade-in">
      ${iconUse(ICONS.candle, 'icon icon-lg flicker')}
      <div class="pass-overlay-eyebrow">Night Falls</div>
      <h2 class="reveal-headline">The phone will now pass to every player</h2>
      <p class="reveal-body">One at a time, in turn. Almost everyone will see an empty screen with nothing to do — that's normal, so it never gives anything away. Stay silent and don't react either way.</p>
      <button class="btn btn-danger btn-block" data-action="proceed-to-murder">Begin</button>
    </div>`;
};

/* ---------- 8. Murder Selection (every player takes a turn) ---------- */

UI.renderMurder = function renderMurder(state, tapped, selectedId, useChoice) {
  const player = currentQueuePlayer(state);
  if (!player) return;

  if (!tapped) {
    screen('murder').innerHTML = passPrompt({
      icon: ICONS.candle,
      name: player.name,
      instruction: `Hand the phone to <strong>${escapeHtml(player.name)}</strong> now. No talking. Once ready, they tap below.`,
      action: 'tap-murder-turn',
      btnLabel: 'My Turn',
      btnClass: 'btn-danger',
    });
    return;
  }

  if (!isActingDeceiverTurn(state)) {
    screen('murder').innerHTML = `
      <div class="reveal-stage">
        ${iconUse(ICONS.candle, 'icon icon-lg flicker')}
        <h2 class="reveal-headline">Nothing To Do</h2>
        <p class="reveal-body">There's no task for you this turn. Hide the screen and pass the phone to the next player.</p>
        <button class="btn btn-confirm btn-block" data-action="confirm-murder-turn">Continue</button>
      </div>`;
    return;
  }

  const targets = eligibleMurderTargets(state);
  const canUseChoice = actingDeceiverHoldsChoiceCard(state);
  screen('murder').innerHTML = `
    <div class="screen-title-row">Choose A Victim</div>
    <div class="screen-subtitle">Deceivers, select tonight's target in silence.</div>
    <div class="target-grid">
      ${targets.map((p) => `
        <button class="target-card ${selectedId === p.id ? 'selected' : ''}" data-action="select-murder-target" data-id="${p.id}">
          <div class="player-avatar">${initials(p.name)}</div>
          <span>${escapeHtml(p.name)}</span>
        </button>`).join('')}
    </div>
    ${canUseChoice ? `
      <label class="rule-row" style="margin-top:16px;">
        <input type="checkbox" id="dcToggle" ${useChoice ? 'checked' : ''}>
        <span>Play Deceiver's Choice — cancel a Shield in play</span>
      </label>` : ''}
    <p class="small-note" style="margin-top:14px;">Once confirmed, hide the screen and pass the phone to the next player like everyone else.</p>
    <div class="spacer"></div>
    <button class="btn btn-danger btn-block" data-action="confirm-murder-turn" ${selectedId ? '' : 'disabled'}>Confirm Target</button>`;

  if (canUseChoice) {
    document.getElementById('dcToggle').addEventListener('change', (e) => {
      main_onToggleDeceiversChoice(e.target.checked);
    });
  }
};

/* ---------- 9. Banishment Vote / Final Banishment ---------- */

UI.renderVote = function renderVote(state, tapped, selectedId, useDagger) {
  const isFinal = state.finalBanishmentActive;
  const voter = currentQueuePlayer(state);
  if (!voter) return;
  const container = isFinal ? screen('finalBanishment') : screen('vote');

  if (!tapped) {
    container.innerHTML = passPrompt({
      icon: ICONS.vote,
      name: voter.name,
      instruction: `Hand the phone to <strong>${escapeHtml(voter.name)}</strong> now and look away — votes are private. ${isFinal ? 'This is the final vote; once ready, they tap below.' : 'Once ready, they tap below to vote.'}`,
      action: 'tap-vote',
      btnLabel: "I'm Ready To Vote",
      btnClass: isFinal ? 'btn-danger' : 'btn-primary',
    });
    return;
  }

  const targets = eligibleVoteTargets(state, voter.id);
  const hasDagger = voter.hand.includes('dagger');
  container.innerHTML = `
    <div class="screen-title-row">${isFinal ? 'The Final Banishment' : 'Banishment Vote'}</div>
    <div class="screen-subtitle">${escapeHtml(voter.name)}, choose who to banish.</div>
    <div class="target-grid">
      ${targets.map((p) => `
        <button class="target-card ${selectedId === p.id ? 'selected' : ''}" data-action="select-vote-target" data-id="${p.id}">
          <div class="player-avatar">${initials(p.name)}</div>
          <span>${escapeHtml(p.name)}</span>
        </button>`).join('')}
    </div>
    ${hasDagger ? `
      <label class="rule-row" style="margin-top:16px;">
        <input type="checkbox" id="daggerToggle" ${useDagger ? 'checked' : ''}>
        <span>Play Dagger — +1 vote weight</span>
      </label>` : ''}
    <p class="small-note" style="margin-top:14px;">After casting, hide your choice and pass the phone to the next voter.</p>
    <div class="spacer"></div>
    <button class="btn ${isFinal ? 'btn-danger' : 'btn-confirm'} btn-block" data-action="confirm-vote" ${selectedId ? '' : 'disabled'}>Cast Vote</button>`;

  if (hasDagger) {
    document.getElementById('daggerToggle').addEventListener('change', (e) => {
      main_onToggleDagger(e.target.checked);
    });
  }
};

/* ---------- 10. Elimination Reveal ---------- */

UI.renderElimination = function renderElimination(state, revealed) {
  const context = state.eliminationContext;

  // Stage 1: an unmissable, unambiguous "everyone needs to see this" beat —
  // distinct from every private per-player turn that came before it — before
  // the actual outcome is shown.
  if (!revealed) {
    const eventLabel = context === 'quiet' ? 'the night' : context === 'night' ? 'the night' : 'the vote';
    screen('elimination').innerHTML = `
      <div class="reveal-stage fade-in">
        ${iconUse(ICONS.compass, 'icon icon-lg')}
        <div class="pass-overlay-eyebrow">Gather Everyone</div>
        <h2 class="reveal-headline">The Circle Must See This</h2>
        <p class="reveal-body">Bring the phone to the middle of the table. Everyone should be watching — no side conversations, no looking away — before ${eventLabel}'s outcome is shown.</p>
        <button class="btn btn-confirm btn-block" data-action="reveal-elimination">Reveal What Happened</button>
      </div>`;
    return;
  }

  let body = '';

  if (context === 'quiet') {
    body = `
      <div class="reveal-stage">
        ${iconUse(ICONS.candle, 'icon icon-lg flicker')}
        <h2 class="reveal-headline">A Quiet Night</h2>
        <p class="reveal-body">No blade was drawn. The circle wakes unharmed.</p>
        <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
      </div>`;
  } else if (context === 'night') {
    const r = state.nightResult;
    if (r.protected) {
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.shield, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(r.name)} Was Targeted</h2>
          <p class="reveal-body">A Shield protected them. They survive the night.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    } else {
      const victim = findPlayer(state, r.targetId);
      const role = victim.role === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.skull, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(r.name)} Was Murdered</h2>
          ${cardFlip(CARD_FRAMES.back, role.symbol, '', 'elimCard')}
          <p class="reveal-body">They were... <strong>${role.label}</strong>.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    }
  } else {
    const v = state.voteResult;
    if (v.tie || !v.banishedId) {
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.vote, 'icon icon-lg')}
          <h2 class="reveal-headline">The Vote Is Tied</h2>
          <p class="reveal-body">No one is banished this round.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    } else {
      const banished = findPlayer(state, v.banishedId);
      const role = banished.role === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
      body = `
        <div class="reveal-stage">
          ${iconUse(ICONS.vote, 'icon icon-lg')}
          <h2 class="reveal-headline">${escapeHtml(banished.name)} Is Banished</h2>
          ${cardFlip(CARD_FRAMES.back, role.symbol, '', 'elimCard')}
          <p class="reveal-body">They were... <strong>${role.label}</strong>.</p>
          <button class="btn btn-confirm btn-block" data-action="continue-elimination">Continue</button>
        </div>`;
    }
  }

  screen('elimination').innerHTML = body;
  triggerFlip('elimCard');
};

/* ---------- 12. Results ---------- */

UI.renderResults = function renderResults(state) {
  const winnerRole = state.winner === ROLES.DECEIVER.id ? ROLES.DECEIVER : ROLES.LOYAL;
  const payout = state.gamePayout || { pot: 0, share: 0, recipients: [] };
  const isLastGame = state.seriesGame >= state.seriesLength;
  const seriesActive = state.seriesLength > 1;

  const payoutLine = payout.recipients.length
    ? `<strong>${payout.recipients.map(escapeHtml).join(', ')}</strong> ${payout.recipients.length > 1 ? 'each get' : 'gets'} <strong>${payout.share} gold</strong>${winnerRole === ROLES.LOYAL ? ' — their share of the pot.' : ' — the whole pot, Deceivers take all.'}`
    : 'No one survived to claim the pot.';

  const leaderboard = Object.entries(state.seriesScores).sort((a, b) => b[1] - a[1]);

  screen('results').innerHTML = `
    <div class="winner-banner scale-in">
      <h2>${winnerRole === ROLES.DECEIVER ? 'The Deceivers Win' : 'The Loyal Prevail'}</h2>
      <p class="small-note">${winnerRole === ROLES.DECEIVER
        ? 'The Deceivers now equal or outnumber the Loyal. The circle is theirs.'
        : 'Every Deceiver has been cast out. The circle is safe.'}</p>
    </div>
    <div class="prize-pot-panel">
      ${iconUse(ICONS.coin, 'icon icon-lg')}
      <div><div class="prize-pot-value">${payout.pot}</div><div class="prize-pot-label">This Game's Prize Pot</div></div>
      ${iconUse(ICONS.coin, 'icon icon-lg')}
    </div>
    <p class="small-note" style="margin-top:10px;">${payoutLine}</p>
    <div class="panel-title" style="margin-top:16px;">Every Role Revealed</div>
    <div class="role-reveal-list">
      ${state.players.map((p) => `
        <div class="role-reveal-row ${p.role}">
          <div class="player-avatar">${initials(p.name)}</div>
          <div style="flex:1;">
            <div>${escapeHtml(p.name)} ${p.isComputer ? '<span class="small-note">(Computer)</span>' : ''} ${!p.alive ? '<span class="small-note">(eliminated)</span>' : ''}</div>
            <div class="player-meta">${p.role === ROLES.DECEIVER.id ? ROLES.DECEIVER.label : ROLES.LOYAL.label}</div>
          </div>
        </div>`).join('')}
    </div>
    ${seriesActive ? `
      <div class="panel-title" style="margin-top:16px;">Series Standings — Game ${state.seriesGame} of ${state.seriesLength}</div>
      <div class="role-reveal-list">
        ${leaderboard.map(([name, score], i) => `
          <div class="role-reveal-row" style="border-left-color:${i === 0 ? 'var(--gold-400)' : 'var(--gold-700)'};">
            <div class="player-avatar">${initials(name)}</div>
            <div style="flex:1;">${escapeHtml(name)}</div>
            <strong style="color:var(--gold-300);">${score}</strong>
          </div>`).join('')}
      </div>` : ''}
    <div class="spacer"></div>
    ${isLastGame
      ? `${seriesActive ? '<p class="small-note" style="margin-bottom:10px;">The series is complete.</p>' : ''}<button class="btn btn-primary btn-block" data-action="play-again">${seriesActive ? 'New Series' : 'Play Again'}</button>`
      : `<button class="btn btn-primary btn-block" data-action="next-game-in-series">Next Game (${state.seriesGame + 1} of ${state.seriesLength})</button>`}`;
};

/* ---------- Modal (Help / Settings) ---------- */

UI.showModal = function showModal(title, bodyHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalOverlay').classList.remove('hidden');
};

UI.hideModal = function hideModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
};

UI.helpContent = function helpContent() {
  return `
    <div class="rule-row">${iconUse(ICONS.coin, 'icon')}<span>Gold cards fill the shared Prize Pot.</span></div>
    <div class="rule-row">${iconUse(ICONS.shield, 'icon')}<span>A held Shield protects you automatically if targeted — no action needed — then it's spent.</span></div>
    <div class="rule-row">${iconUse(ICONS.dagger, 'icon')}<span>Dagger adds +1 weight to your Banishment vote.</span></div>
    <div class="rule-row">${iconUse(ICONS.hoodedFigure, 'icon')}<span>Deceiver's Choice cancels a Shield at Night.</span></div>
    <div class="rule-row">${iconUse(ICONS.skull, 'icon')}<span>On a Murder round, the Deceivers pick a victim in secret.</span></div>
    <div class="rule-row">${iconUse(ICONS.vote, 'icon')}<span>Every living player votes to banish a suspect.</span></div>
    <p>The Loyal win when every Deceiver is gone. The Deceivers win once they equal or outnumber the Loyal.</p>
    <p>Whoever wins splits that game's Prize Pot among themselves — if the Loyal win, the surviving Loyal split it; if the Deceivers win, the surviving Deceivers take the whole thing. Anyone already eliminated gets nothing.</p>
    <p>Play a series of several games back to back and points carry across every game — set how many on the setup screen.</p>
    <p>Pass the phone honestly and don't peek — the ceremony depends on trust.</p>`;
};

UI.settingsContent = function settingsContent(state) {
  return `
    <div class="rule-row">
      <label style="display:flex;align-items:center;gap:10px;width:100%;">
        <input type="checkbox" id="soundToggle" ${state.settings.sound ? 'checked' : ''}>
        <span>Sound effects</span>
      </label>
    </div>
    <button class="btn btn-danger btn-block" data-action="reset-game" style="margin-top:14px;">Reset Game</button>`;
};

/* ---------- Toast ---------- */

UI.showToast = function showToast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.remove('hidden');
  void el.offsetWidth;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  setTimeout(() => el.classList.add('hidden'), 2200);
};
