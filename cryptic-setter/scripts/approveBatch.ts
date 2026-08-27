#!/usr/bin/env node
// One-off helper: approve every id in a JSON array file in one pass.
// Run with: npx tsx scripts/approveBatch.ts <idsFile.json>
import { readFileSync } from 'node:fs';
import { approveFromReviewQueue } from '../src/bank/clueBank.js';

const [, , idsFile] = process.argv;
const ids: string[] = JSON.parse(readFileSync(idsFile, 'utf8'));

let approved = 0;
for (const id of ids) {
  const result = approveFromReviewQueue(id);
  if (result) {
    approved++;
    console.log(`✓ ${result.answer} — "${result.surface}"`);
  } else {
    console.log(`✗ not found: ${id}`);
  }
}
console.log(`\n${approved}/${ids.length} approved.`);
