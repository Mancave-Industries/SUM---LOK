#!/usr/bin/env node
// One-off helper for the interactive human review session: apply a single
// pass/fail verdict to a review-queue clue by id. Not part of the
// permanent CLI surface — just a thin wrapper over clueBank.ts's existing
// approve/reject functions so each verdict can be applied with one command
// instead of a bespoke eval per clue.
// Run with: npx tsx scripts/reviewAction.ts <approve|reject> <clueId>

import { approveFromReviewQueue, rejectFromReviewQueue } from '../src/bank/clueBank.js';

const [, , verdict, id] = process.argv;

if (verdict !== 'approve' && verdict !== 'reject') {
  console.error('Usage: npx tsx scripts/reviewAction.ts <approve|reject> <clueId>');
  process.exit(1);
}

const result = verdict === 'approve' ? approveFromReviewQueue(id) : rejectFromReviewQueue(id);

if (!result) {
  console.error(`No review-queue clue found with id ${id}`);
  process.exit(1);
}

console.log(`${verdict === 'approve' ? '✓ approved' : '✗ rejected'}: ${result.answer} — "${result.surface}"`);
