#!/usr/bin/env node
// Applies a batch of review verdicts, from either review surface.
//
// From the interactive page (app/review.html), pass its copied payload:
//   npx tsx scripts/applyVerdicts.ts '{"approve":["<id>"],"reject":["<id>"]}'
//
// From the printed sheet (app/review-print.html), pass just the numbers
// ticked as rejections — everything else on the sheet is approved:
//   npx tsx scripts/applyVerdicts.ts --reject 12,45,60
//
// Approving moves a clue into the live bank; rejecting drops it from the
// queue permanently. Both go through clueBank.ts rather than touching the
// JSON directly, so the "nothing reaches the live bank except through
// approveFromReviewQueue" invariant still holds.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { approveFromReviewQueue, rejectFromReviewQueue } from '../src/bank/clueBank.js';

interface ReviewRow {
  n: number;
  id: string;
  answer: string;
}

// The numbered export the print sheet was rendered from — the only thing
// that can turn "number 47" back into a clue id, which is why the number
// is assigned at export time and not recomputed here.
function loadExport(): ReviewRow[] {
  const path = join(process.cwd(), '..', 'app', 'review-data.json');
  if (!existsSync(path)) {
    console.error('app/review-data.json not found — run scripts/exportForReview.ts first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, 'utf8')).clues as ReviewRow[];
}

const args = process.argv.slice(2);
let approve: string[] = [];
let reject: string[] = [];

if (args[0] === '--reject') {
  // Sheet mode: the ticked numbers are the rejections, everything else on
  // the sheet is an approval. Marking only failures is far less writing on
  // paper, and it means an unmarked sheet is unambiguous rather than
  // indistinguishable from an unreviewed one.
  const numbers = new Set(
    (args[1] ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number)
  );
  if (numbers.size === 0 && (args[1] ?? '').trim() !== '') {
    console.error('Could not parse any numbers from the --reject list.');
    process.exit(1);
  }
  const rows = loadExport();
  const unknown = [...numbers].filter((n) => !rows.some((r) => r.n === n));
  if (unknown.length) {
    console.error(`No clue numbered ${unknown.join(', ')} in the current export — is the sheet stale?`);
    process.exit(1);
  }
  for (const row of rows) {
    if (numbers.has(row.n)) reject.push(row.id);
    else approve.push(row.id);
  }
  console.log(`Sheet mode: ${reject.length} marked for rejection, ${approve.length} approved.\n`);
} else {
  const arg = args[0];
  if (!arg) {
    console.error("Usage: npx tsx scripts/applyVerdicts.ts '<json>' | <file.json> | --reject 1,2,3");
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
  approve = payload.approve ?? [];
  reject = payload.reject ?? [];
}

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
