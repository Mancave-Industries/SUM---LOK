# Exporting The Deceivers to CodePen

The prototype is plain HTML/CSS/vanilla JS with no build step, so it maps
directly onto CodePen's three panels. CodePen doesn't serve a `/assets`
folder or multiple `/js` files the way a local checkout does, so the trick
is consolidating everything into the three panels below.

## HTML panel

Paste the **entire contents of `index.html`** *except* the outer
`<!DOCTYPE html>`, `<html>`, `<head>`, and `<body>` tags — CodePen supplies
those itself. Concretely, paste everything from:

```
<div class="app" id="app">
```

down through:

```
</div>
```

(the closing tag of `<div class="app" id="app">`). This includes the
`<svg class="sprite-defs">` block with all 41 `<symbol>` definitions, the
header, all 12 `<section class="screen">` containers, the modal markup, and
the toast — the sprite sheet is inline SVG, so nothing outside the HTML
panel is needed to see icons or card art.

Do **not** paste the `<link rel="stylesheet" href="css/style.css">` or the
five `<script src="js/...">` tags — CodePen's own panels replace those.

## CSS panel

Paste the entire contents of `css/style.css` as-is. It has no imports,
no external fonts, and no url() references to local files — every visual
asset it needs is the inline SVG sprite already sitting in the HTML panel,
so nothing else needs to be attached in CodePen's Asset panel.

## JS panel

Paste the contents of these five files **in this exact order**, one after
another in the single JS panel (a blank line between each is fine):

1. `js/data.js`
2. `js/state.js`
3. `js/engine.js`
4. `js/sound.js`
5. `js/ui.js`
6. `js/main.js`

Order matters: each file defines plain global functions/constants that the
next file calls directly (no modules, no bundler, no `import`/`export`).
`main.js` calls `render()` at the very end of the file, which boots the app,
so nothing else needs to run manually.

In CodePen's JS settings, no external libraries or "Babel" preprocessing are
required — this is vanilla ES2017-ish JS (template literals, arrow
functions, destructuring, `Array.prototype.flat`-free) that runs unmodified
in current browsers.

## Verifying the export

After pasting all three panels:

1. The Title screen should render immediately with the gold compass emblem
   and "NEW GAME" / "HOW TO PLAY" buttons.
2. Open the browser console — there should be no errors (a 404 for
   `/favicon.ico` from CodePen's own preview frame is normal and unrelated).
3. Play through Setup → Reveal → a full round to confirm the SVG sprite
   (icons and card art) rendered — if icons are missing, double check the
   `<svg class="sprite-defs">` block was pasted completely and no
   `<symbol>` tags were truncated by the paste.
4. Set CodePen's preview viewport to ~390px wide (or use browser dev tools'
   device toolbar at 390×844) to preview it the way it's meant to be played
   — the layout is mobile-first and centers itself on wider screens.

## localStorage note

CodePen preview frames run on a sandboxed origin (`*.cdpn.io`), so
`localStorage` (used for Continue/save) works the same as any other origin
— saves persist across reloads of that same Pen, but won't carry over if
you fork the Pen to a new URL (a fresh Pen is a fresh origin).
