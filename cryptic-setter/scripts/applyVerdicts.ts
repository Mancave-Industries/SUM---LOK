#!/usr/bin/env node
// Applies a batch of review verdicts copied out of app/review.html.
// Run with: npx tsx scripts/applyVerdicts.ts '<json>'
//        or npx tsx scripts/applyVerdicts.ts path/to/verdicts.json
//
// Expects the shape the review page's "Copy verdicts" button produces:
//   { "approve": ["<clueId>", ...], "reject": ["<clueId>", ...] }
// Approving moves a clue into the live bank; rejecting drops it from the
// queue permanently. Both go through clueBank.ts rather than touching the
// JSON directly, so the "nothing reaches the live bank except through
// approveFromReviewQueue" invariant still holds.

import { existsSync, readFileSync } from 'node:fs';
import { approveFromReviewQueue, rejectFromReviewQueue } from '../src/bank/clueBank.js';

const [, , arg] = process.argv;
if (!arg) {
  console.error("Usage: npx tsx scripts/applyVerdicts.ts '<json>' | <file.json>");
  process.exit(1);
}

const raw = existsSync(arg) ? readFileSync(arg, 'utf8') : arg;
let payload: { approve?: string[]; reject?: string[] };
try {
  payload = JSON.parse(raw);
} catch {
  console.error('Could not parse verdicts as JSON.');
  process.exit(1);
}

const approve = payload.approve ?? [];
const reject = payload.reject ?? [];

let approved = 0;
let rejected = 0;
const missing: string[] = [];

for (const id of approve) {
  const result = approveFromReviewQueue(id);
  if (result) {
    approved++;
    console.log(`✓ ${result.answer} — "${result.surface}"`);
  } else missing.push(id);
}
for (const id of reject) {
  const result = rejectFromReviewQueue(id);
  if (result) {
    rejected++;
    console.log(`✗ ${result.answer} — "${result.surface}"`);
  } else missing.push(id);
}

console.log(`\n${approved} approved into the live bank, ${rejected} rejected.`);
if (missing.length) {
  // Almost always means the verdict batch was produced against an older
  // export and those clues have since been judged — worth naming rather
  // than silently ignoring.
  console.log(`${missing.length} id(s) were not in the review queue (already judged, or a stale export).`);
}
