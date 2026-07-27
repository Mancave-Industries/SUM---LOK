/* ==========================================================================
   THE DECEIVERS — Game Data
   Pure constants. No DOM access, no state mutation, no rendering.
   ========================================================================== */

const CONFIG = {
  storageKey: 'deceivers_state_v1',
  minPlayers: 3,
  maxPlayers: 8,
  // Living players at/below this count trigger Final Banishment instead of a normal vote.
  finalBanishmentThreshold: 3,
};

const ICONS = {
  coin: 'icon-coin',
  dagger: 'icon-dagger',
  shield: 'icon-shield',
  raven: 'icon-raven',
  candle: 'icon-candle',
  skull: 'icon-skull',
  vote: 'icon-vote',
  hourglass: 'icon-hourglass',
  hoodedFigure: 'icon-hooded-figure',
  compass: 'icon-compass-emblem',
  sound: 'icon-sound',
  menu: 'icon-menu',
  settings: 'icon-settings',
  help: 'icon-help',
};

const CARD_FRAMES = {
  generic: 'frame-generic',
  gold: 'frame-gold',
  action: 'frame-action',
  protection: 'frame-protection',
  event: 'frame-event',
  role: 'frame-role',
  back: 'card-back',
};

const ROLES = {
  DECEIVER: {
    id: 'deceiver',
    label: 'Deceiver',
    symbol: 'role-deceiver',
    icon: ICONS.hoodedFigure,
    description: 'You are a Deceiver. Blend in, mislead the vote, and help your fellow Deceivers survive until you equal or outnumber the Loyal.',
  },
  LOYAL: {
    id: 'loyal',
    label: 'Loyal',
    symbol: 'role-loyal',
    icon: ICONS.shield,
    description: 'You are Loyal. Watch, question, and vote to banish every Deceiver before they take the circle.',
  },
};

/**
 * Deceiver count scales with living-at-start player count.
 */
function deceiverCountForPlayers(playerCount) {
  if (playerCount <= 4) return 1;
  if (playerCount <= 6) return 2;
  return 3;
}

/* Fortune Deck — drawn one per living player each Draw Phase.
   Gold cards resolve immediately into the pot; action cards go to hand. */
const FORTUNE_DECK_DEF = [
  { id: 'gold-one', name: 'One Gold', deck: 'fortune', type: 'gold', value: 1, symbol: 'card-gold-one', frame: CARD_FRAMES.gold, icon: ICONS.coin, count: 6, description: 'Adds 1 gold to the Prize Pot.' },
  { id: 'gold-three', name: 'Three Gold', deck: 'fortune', type: 'gold', value: 3, symbol: 'card-gold-three', frame: CARD_FRAMES.gold, icon: ICONS.coin, count: 4, description: 'Adds 3 gold to the Prize Pot.' },
  { id: 'gold-five', name: 'Five Gold', deck: 'fortune', type: 'gold', value: 5, symbol: 'card-gold-five', frame: CARD_FRAMES.gold, icon: ICONS.coin, count: 2, description: 'Adds 5 gold to the Prize Pot.' },
  { id: 'dagger', name: 'Dagger', deck: 'fortune', type: 'action', symbol: 'card-dagger', frame: CARD_FRAMES.action, icon: ICONS.dagger, count: 4, effect: 'vote-weight', description: 'Play during Banishment to add +1 weight to your vote.' },
  { id: 'shield', name: 'Shield', deck: 'fortune', type: 'action', symbol: 'card-shield', frame: CARD_FRAMES.protection, icon: ICONS.shield, count: 4, effect: 'protect', description: 'Play before Night to protect yourself from Murder this round.' },
  { id: 'deceivers-choice', name: "Deceiver's Choice", deck: 'fortune', type: 'action', symbol: 'card-deceivers-choice', frame: CARD_FRAMES.role, icon: ICONS.hoodedFigure, count: 2, effect: 'counter-shield', description: 'Deceivers only: play at Night to cancel one Shield in effect.' },
];

/* Fate Deck — one card drawn per round; determines the round's shape. */
const FATE_DECK_DEF = [
  { id: 'quiet-night', name: 'Quiet Night', deck: 'fate', type: 'event', symbol: 'card-quiet-night', frame: CARD_FRAMES.event, icon: ICONS.candle, count: 3, effect: 'no-murder', description: 'No murder this round. Proceed to Banishment.' },
  { id: 'murder', name: 'Murder', deck: 'fate', type: 'event', symbol: 'card-murder', frame: CARD_FRAMES.event, icon: ICONS.skull, count: 5, effect: 'murder-night', description: 'The Deceivers choose a victim tonight.' },
  { id: 'banishment', name: 'Banishment', deck: 'fate', type: 'event', symbol: 'card-banishment', frame: CARD_FRAMES.event, icon: ICONS.vote, count: 4, effect: 'vote-only', description: 'Skip the night. Go straight to the Banishment Vote.' },
];

/* Forced endgame card — not shuffled into the Fate deck; the engine triggers
   it directly once living players reach CONFIG.finalBanishmentThreshold. */
const FINAL_BANISHMENT_DEF = {
  id: 'final-banishment', name: 'Final Banishment', deck: 'fate', type: 'event',
  symbol: 'card-final-banishment', frame: CARD_FRAMES.event, icon: ICONS.vote,
  effect: 'final-vote', description: 'The last vote. Whoever it names decides the game.',
};

const ALL_CARD_DEFS = [...FORTUNE_DECK_DEF, ...FATE_DECK_DEF, FINAL_BANISHMENT_DEF];

function cardDefById(id) {
  return ALL_CARD_DEFS.find((c) => c.id === id) || null;
}

const PHASES = {
  TITLE: 'title',
  SETUP: 'setup',
  REVEAL: 'reveal',
  MAIN: 'main',
  DRAW: 'draw',
  HAND: 'hand',
  NIGHT: 'night',
  MURDER: 'murder',
  VOTE: 'vote',
  ELIMINATION: 'elimination',
  FINAL_BANISHMENT: 'finalBanishment',
  RESULTS: 'results',
};

const PHASE_LABELS = {
  [PHASES.TITLE]: 'The Deceivers',
  [PHASES.SETUP]: 'Gather the Circle',
  [PHASES.REVEAL]: 'Private Reveal',
  [PHASES.MAIN]: 'The Circle',
  [PHASES.DRAW]: 'Draw Phase',
  [PHASES.HAND]: 'Your Hand',
  [PHASES.NIGHT]: 'Night Falls',
  [PHASES.MURDER]: 'The Deceivers Choose',
  [PHASES.VOTE]: 'Banishment Vote',
  [PHASES.ELIMINATION]: 'The Reveal',
  [PHASES.FINAL_BANISHMENT]: 'Final Banishment',
  [PHASES.RESULTS]: 'Results',
};
