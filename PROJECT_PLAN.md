# The Deceivers — Project Plan

A mobile-first, pass-the-phone social deduction card game. Pure HTML/CSS/vanilla
JS, no build tools, no external libraries, no copyrighted artwork. Designed to
run by opening `index.html` directly, and to be paste-portable into CodePen
(see `CODEPEN_EXPORT.md`).

## 1. Architecture

Single-page app. One `index.html` shell holds all 12 screens as hidden/visible
`<section>` elements plus a single inline SVG `<defs>` sprite sheet (icons +
card frames as `<symbol>`), so the whole game works offline with zero network
requests and zero `fetch()` calls (opening via `file://` blocks `fetch` of
local files in most browsers — inline `<symbol>` + `<use>` sidesteps this).

Standalone `.svg` files also exist under `/assets/` as the deliverable asset
library and as a source-of-truth if assets are ever needed individually (e.g.
dropped into CodePen's Asset panel) — the inline sprite in `index.html` is
generated from the same shapes.

**Strict separation of data / state / logic / rendering:**

| File | Responsibility |
|---|---|
| `index.html` | Markup shell for all 12 screens, SVG sprite defs, script/style includes |
| `css/style.css` | Design tokens, textures, components, layout, animation — no logic |
| `js/data.js` | Static game data: roles, card definitions, deck composition, config, icon/frame ID tables. Pure constants, no DOM, no state mutation |
| `js/state.js` | Game state shape, mutators, localStorage save/load/reset. No DOM access |
| `js/engine.js` | Game rules: dealing, night resolution, vote resolution, elimination, win checks, round progression. Operates only on the state object; returns result objects. No DOM access |
| `js/ui.js` | Rendering only: builds DOM for each screen from current state. Never mutates game state directly (calls engine functions, then re-renders) |
| `js/main.js` | Bootstrap, screen router, event wiring, "pass the device" overlay, sound/settings/help modal wiring |

This means: to change a game rule, edit `engine.js`. To restyle, edit
`style.css`. To change wording/copy or add a card, edit `data.js`. Rendering
never contains rule logic, and rule logic never touches `document`.

## 2. Folder Structure

```
index.html
css/
  style.css
js/
  data.js
  state.js
  engine.js
  ui.js
  main.js
assets/
  icons/        coin, dagger, shield, raven, candle, skull, vote, hourglass,
                 hooded-figure, compass-emblem, sound, menu, settings, help
  cards/        card-back, frame-generic, frame-gold, frame-action,
                 frame-protection, frame-event, frame-role
  roles/        role-deceiver, role-loyal
  gamecards/    gold-one, gold-three, gold-five, dagger, shield, quiet-night,
                 murder, banishment, final-banishment, deceivers-choice
  ui/           button-primary, button-danger, button-confirm, modal-panel,
                 player-row, prize-pot-panel, hand-panel, title-treatment
PROJECT_PLAN.md
TEST_REPORT.md
CODEPEN_EXPORT.md
legacy/         (previous, unrelated prototype — preserved, not part of this game)
```

## 3. Visual Design System

Dark ceremonial aesthetic, entirely original (no Traitors branding/marks/copy):

- **Palette**: charcoal black (`#0c0b0e`, `#161319`), antique gold
  (`#c9a24b`, `#e6c877`), dark crimson (`#5c1420`, `#7d1f2b`), midnight blue
  (`#141c30`, `#1f2a44`), aged parchment (`#e9dcc0`, `#d8c9a3`).
- **Type**: system serif stack for ceremonial headings (Georgia/"Iowan Old
  Style"/Times New Roman fallback — no paid webfonts), system sans for UI
  body text/buttons for legibility at small sizes.
- **Texture**: CSS-only — radial vignettes, subtle noise via layered
  `repeating-conic-gradient`, hairline gold borders, soft inner shadows to
  suggest aged parchment/leather without any raster images.
- **Motion**: restrained — fades, gentle scale-ins, a candle flicker
  keyframe, card flip on reveal. No bouncy/gamey easing.
- **Icons/cards**: all inline SVG, single/double color (gold line art on
  transparent, or gold-on-crimson/midnight fills for frames), so they inherit
  `currentColor` and scale crisply at any size.

## 4. Game Design Assumptions

The brief specifies required screens and required card types but not exact
rules. Documenting the interpretation used, per the instruction to record
assumptions rather than pause for questions:

### Roles
- 3–8 players (local pass-and-play, one shared phone).
- Deceiver count scales with player count: 3–4 players → 1 Deceiver; 5–6 → 2;
  7–8 → 3. Remaining players are Loyal.
- During private role reveal, a Deceiver also privately sees who their fellow
  Deceivers are (if more than one); Loyal players see only their own role.

### Decks
Two separate decks, both reshuffled from discard when exhausted:
- **Fortune Deck** (drawn by each living player once per Draw Phase): One
  Gold, Three Gold, Five Gold, Dagger, Shield, Deceiver's Choice. Gold cards
  are resolved immediately into the shared Prize Pot; Dagger/Shield/
  Deceiver's Choice are kept in the drawing player's hand for later use.
- **Fate Deck** (one card drawn per round, determines that round's shape):
  Quiet Night, Murder, Banishment. Final Banishment is not shuffled into this
  deck — it is force-triggered by the engine once living players drop to a
  configured threshold (default: 3), replacing the normal vote with a
  decisive, higher-stakes version, per the "Final Banishment" screen's
  purpose as an endgame climax rather than a random event.

### Round Flow
1. **Draw Phase** — each living player (turn order) draws one Fortune card.
2. **Fate card revealed** for the round: Quiet Night (skip night entirely),
   Murder (proceed to Night → Murder Selection), or Banishment (skip night,
   go straight to the vote).
3. **Night Phase** (Murder rounds only) — ceremonial "pass the phone, close
   your eyes" transition, then Deceivers privately choose one living,
   non-Deceiver target via Murder Selection. A Shield card played by the
   target that round cancels the murder; a Deceiver's Choice card played by
   the Deceivers cancels one Shield in effect.
4. **Elimination Reveal** — shows the night's outcome (murdered / protected /
   quiet night) and the victim's role if applicable.
5. **Banishment Vote** — every living player privately casts one vote (pass
   device between voters) for who to banish. A held Dagger card can be played
   to add +1 weight to that vote. Most votes banished; ties banish no one.
6. **Elimination Reveal** — banishment outcome and role reveal.
7. **Win check**: Loyal wins if all Deceivers are banished/murdered out;
   Deceivers win if remaining Deceivers ≥ remaining Loyal. Otherwise the
   round counter increments and play loops to step 1, substituting Final
   Banishment for the normal vote once the living-player threshold is hit.
8. **Results Screen** — winning side, full role reveal of every player, final
   Prize Pot total, Play Again (full reset).

### Why this shape
It gives every required card a real mechanical purpose (gold → pot; dagger →
vote weight; shield → protection; quiet night/murder/banishment → round
branching; final banishment → forced endgame climax; deceiver's choice →
shield counter), touches all 12 required screens in a natural sequence, and
is simple enough to implement correctly and test end-to-end in this
prototype pass.

## 5. Persistence

`localStorage` key `deceivers_state_v1` holds the full serializable game
state (players, roles, decks, hands, pot, phase, round, history). On load,
`main.js` checks for a saved in-progress game and offers **Continue** vs
**New Game** from the Title screen. State is cleared on Results → Play Again
or via Settings → "Reset Game".

## 6. Milestones

1. PROJECT_PLAN.md (this file) + folder structure
2. SVG asset library (icons, card frames, role cards, game cards, UI art)
3. CSS design system
4. Data / state / engine (game logic, no DOM)
5. UI rendering + main.js router wiring all 12 screens into a playable loop
6. Manual + scripted (headless Chromium, 390×844) test pass across the full
   game loop; fixes logged
7. TEST_REPORT.md
8. CODEPEN_EXPORT.md

## 7. Out of scope for this prototype

- Networked/multi-device play (explicitly a shared-phone prototype per brief)
- Accounts, server sync, anti-cheat for private-reveal honesty (trust-based,
  as physical card games are)
- Audio assets beyond a mute/unmute icon toggle (no copyrighted audio; a
  restrained WebAudio "tone" is used for feedback, togglable, defaulting to
  off to avoid surprising sound on shared devices)
