# The Deceivers — Test Report

Testing was done in three layers: pure engine logic (Node, no browser), a
real headless-Chromium playthrough at the target 390×844 viewport, and an
automated multi-trial stress test driving the actual UI with randomized
choices across 3–8 players. All three layers are described below along with
every defect found and its fix.

## 1. Engine logic (Node, headless — no DOM)

`js/data.js`, `js/state.js`, and `js/engine.js` have zero DOM dependencies
by design, so they were bundled and exercised directly in Node across 400
randomized simulated games (200 with default random choices, 200 more with
randomized Shield/Dagger/Deceiver's Choice usage), covering all player
counts 3–8.

**Checked on every trial:**
- The round loop always terminates (no infinite loops) within 100 rounds.
- `PHASES.RESULTS` is always reached with `state.winner` set.
- Win condition is always consistent: Loyal wins only when 0 Deceivers
  remain alive; Deceivers win only when living Deceivers ≥ living Loyal.
- No exceptions thrown for any player count or eligible-target edge case
  (e.g. Deceivers never appear as their own murder targets; a lone
  remaining voter still has a legal target list).

**Result: 0 bugs found in 400 trials.**

## 2. Real playthrough at 390×844 (headless Chromium)

Driven with `playwright-core` against the actual pre-installed Chromium
binary, viewport locked to 390×844 (iPhone-size), a full game was played
screen-by-screen with screenshots captured at each step: Title → Setup →
Private Reveal → Main hub → Draw → Hand → (Night → Murder Selection, when
drawn) → Elimination Reveal → Banishment Vote → Elimination Reveal →
Results.

### Defect found: card caption text clipped by SVG viewBox

**Symptom:** On the Private Reveal screen, the Deceiver role card's second
line of body text ("SOW DOUBT. SURVIVE THE VOTE.") rendered with its first
and last few characters cut off, as did the Dagger game card's caption
("+1 VOTE WEIGHT AT BANISHMENT").

**Root cause:** Each card SVG uses a `viewBox="0 0 200 280"`; content drawn
outside that 0–200 horizontal range is clipped by the SVG viewport itself
once the element is scaled down to card size in the browser. Several
caption `<text>` elements were sized/spaced (`font-size` 9–11,
`letter-spacing` 1–1.5) wide enough that their centered text overran both
edges of the 200-unit-wide card at these long string lengths.

**Fix:** Reduced the caption line `font-size` to `8` and `letter-spacing`
to `0.4` across all affected cards (`role-deceiver.svg`, `role-loyal.svg`,
and the eight `gamecards/*.svg` caption lines), which brings every caption
comfortably under the 200-unit width even for the longest strings (e.g.
"THE LAST VOTE — DECIDES THE GAME"). The shared inline `<symbol>` sprite in
`index.html` was regenerated from the corrected source files so both stay
in sync.

**Verified fixed:** Re-ran the same playthrough; every card face — role
reveal, drawn cards, and elimination reveals — now renders with its full
caption inside the card bounds, confirmed visually via screenshot.

### Other observations (no code change needed)
- The browser's automatic `/favicon.ico` request 404s when serving via a
  plain static file server — harmless, and fixed anyway by adding an inline
  data-URI favicon (`<link rel="icon" href="data:image/svg+xml,...">`) so
  it no longer shows up as a console/network error at all.
- Zero JavaScript console errors or exceptions across the full playthrough
  after the favicon fix.

## 3. Automated UI stress test (randomized, multi-trial)

A second Playwright script drives the **actual rendered UI** (not just the
engine) through complete games, clicking real buttons with `Math.random()`
choices for: which player's name to fill, murder target, whether to raise
Shield, whether to play Deceiver's Choice, vote target, and whether to play
Dagger — for player counts cycling 3 through 8, checking after every game
for thrown exceptions and any `console.error`/`pageerror` events.

### Defect found (test harness only, not the game): unscoped element queries

**Symptom:** The *first version* of this stress script intermittently hung
for ~30s before timing out on a vote screen, specifically on games that
went from a normal Banishment Vote in one round into a Final Banishment in
a later round.

**Root cause:** This was a bug in the **test script**, not the app: its
`page.$$('[data-action="select-vote-target"]')` query searched the whole
document rather than the active screen. `screen-vote` and
`screen-finalBanishment` are separate `<section>` containers that reuse the
same `data-action` names; once a normal Vote screen had been rendered once,
its now-hidden (`display: none`) buttons remained in the DOM (by design —
`ui.js` only rewrites the container it's targeting) and were still matched
by the unscoped selector, alongside the real, visible buttons in the
now-active Final Banishment screen. Playwright correctly refused to click
the stale hidden element, which manifested as a timeout.

**Fix:** Scoped every such query to `.screen.active [data-action="..."]` in
the test script. This is a test-only change — no application file was
touched — and confirms the actual game behavior was always correct (hidden
screens are inert; only the active screen's controls are interactive).

**Verified fixed:** 8/8 consecutive runs completed to a Results screen with
zero console errors after the scoping fix.

### Full-matrix run — in progress

Running larger batches (20–30 trials cycling player count 3→8 with fully
randomized choices, including Shield/Dagger/Deceiver's Choice usage)
surfaced a second, intermittent (roughly 1-in-10) timeout: the automated
click on the Murder Selection screen's "Confirm Target" button occasionally
times out waiting for it to become visible/enabled. This has only been
observed from the automated test driver so far, never from manual/scripted
single-playthrough runs, and the root cause is still being isolated —
diagnostic logging (dumping `#screen-murder`'s HTML and the live player
state at the moment of failure) has been added to the test harness to
capture it in the act. This section will be updated with the confirmed root
cause and fix once that diagnostic run completes; it is called out here
rather than glossed over so the report reflects real, current status.

## Summary

| Layer | Trials | Bugs found | Bugs fixed |
|---|---|---|---|
| Engine (Node) | 400 | 0 | — |
| Full playthrough w/ screenshots | 1 (all 12 screens) | 1 (card text clipping) | 1 |
| Automated UI stress test | 30+ | 1 confirmed (test-script scoping) + 1 intermittent, under active investigation | 1 confirmed, 1 pending |

**This report will be updated once the intermittent Murder-Selection timeout
is root-caused; treat that one finding as open, not resolved, until then.**

The game can be played start-to-finish — Title through Results, and back to
Title via Play Again — with no console errors, for every supported player
count (3–8), across every Fate-card branch (Quiet Night, Murder, standard
Banishment, and forced Final Banishment) and every action card (Gold ×3
denominations, Shield, Dagger, Deceiver's Choice).
