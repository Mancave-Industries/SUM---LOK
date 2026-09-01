#!/usr/bin/env node
// Dumps the review queue into a slim JSON file the review page reads.
// Run with: npx tsx scripts/exportForReview.ts
//
// The review page lives in app/ (deployed with the game to GitHub Pages)
// rather than reading the bank directly, because the bank is a Node-side
// file the browser can't reach — and because a slimmed export keeps the
// page's payload to what a reviewer actually needs to judge a clue, not
// the full verification log every clue carries.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readBank, readReviewQueue } from '../src/bank/clueBank.js';
import type { Clue } from '../src/types.js';

// Tier-3 devices can't reach a real puzzle until a human approves them
// (see assemblePuzzles.ts's TIER3_GATED_DEVICES). Everything else in the
// queue is already usable in assembly — it's flagged only because its
// definition didn't exactly match WordNet — so reviewing those improves
// quality but isn't blocking. The page surfaces that difference so a
// reviewer can spend their attention on what's actually gating puzzles.
const BLOCKING_DEVICES = ['homophone', 'doubleDefinition'];

// A human-readable account of what the wordplay actually does, so a clue
// can be judged for fairness without reading the machine parse.
function explainWordplay(clue: Clue): string {
  const { device, wordplay } = clue;
  const parts = wordplay.components ?? [];
  switch (device) {
    case 'doubleDefinition':
      return `two meanings: "${wordplay.suggestedDefinition}" + "${wordplay.fodder?.toLowerCase()}"`;
    case 'homophone':
      return `"${wordplay.fodder?.toLowerCase()}" is a synonym of "${wordplay.phoneticSource?.toLowerCase()}", which sounds like the answer`;
    case 'hidden':
      return `answer spans the join of "${parts[0]?.toLowerCase()}" + "${parts[1]?.toLowerCase()}"`;
    case 'charade':
      return `"${parts[0]?.toLowerCase()}" then "${parts[1]?.toLowerCase()}" spells the answer`;
    case 'container':
      return `"${parts[1]?.toLowerCase()}" goes inside "${parts[0]?.toLowerCase()}"`;
    case 'anagram':
      return `anagram of "${wordplay.fodder?.toLowerCase()}"`;
    case 'reversal':
      return `"${wordplay.fodder?.toLowerCase()}" reversed`;
    case 'alternates':
      return `alternate letters of "${wordplay.fodder?.toLowerCase()}"`;
    default:
      return wordplay.operation;
  }
}

function toRow(clue: Clue, status: 'queued' | 'approved') {
  return {
    id: clue.id,
    answer: clue.answer,
    device: clue.device,
    surface: clue.surface,
    definition: clue.definition,
    wordplay: explainWordplay(clue),
    blocking: status === 'queued' && BLOCKING_DEVICES.includes(clue.device),
    status,
  };
}

function main() {
  // Every clue that exists, not just the pending queue: an already-approved
  // clue is live in real puzzles, so it's exactly the kind a reviewer most
  // wants a second look at. Rejecting one drops it from the live bank so it
  // is never reused, though puzzles already built with it keep their text
  // until regenerated.
  const rows = [
    ...readReviewQueue().map((c) => toRow(c, 'queued')),
    ...readBank().map((c) => toRow(c, 'approved')),
  ]
    // Grouped by device, then alphabetical, then numbered 1..n — the order
    // the printable sheet renders in. The number is assigned here rather
    // than derived at render time so the paper sheet, the on-screen page
    // and applyVerdicts.ts all agree on what "number 47" refers to: a
    // reviewer marking a printout can just report the numbers back.
    .sort((a, b) => a.device.localeCompare(b.device) || a.answer.localeCompare(b.answer))
    .map((row, i) => ({ n: i + 1, ...row }));

  const out = join(process.cwd(), '..', 'app', 'review-data.json');
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), clues: rows }, null, 2) + '\n');

  const queued = rows.filter((r) => r.status === 'queued').length;
  const blocking = rows.filter((r) => r.blocking).length;
  console.log(`Exported ${rows.length} clues to app/review-data.json`);
  console.log(`  ${queued} awaiting review (${blocking} of them blocking puzzle assembly)`);
  console.log(`  ${rows.length - queued} already approved and live in the bank`);
}

main();
