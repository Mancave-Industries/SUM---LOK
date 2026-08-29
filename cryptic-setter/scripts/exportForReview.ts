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
import { readReviewQueue } from '../src/bank/clueBank.js';
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

function main() {
  const queue = readReviewQueue();
  const rows = queue.map((clue) => ({
    id: clue.id,
    answer: clue.answer,
    device: clue.device,
    surface: clue.surface,
    definition: clue.definition,
    wordplay: explainWordplay(clue),
    blocking: BLOCKING_DEVICES.includes(clue.device),
  }));

  const out = join(process.cwd(), '..', 'app', 'review-data.json');
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), clues: rows }, null, 2) + '\n');

  const blocking = rows.filter((r) => r.blocking).length;
  console.log(`Exported ${rows.length} pending clues to app/review-data.json`);
  console.log(`  ${blocking} blocking (tier-3, can't reach a puzzle until approved)`);
  console.log(`  ${rows.length - blocking} advisory (already usable in assembly)`);
}

main();
