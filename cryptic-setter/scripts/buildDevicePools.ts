#!/usr/bin/env node
// One-time offline generator for two device-specific word pools. Run with:
// npx tsx scripts/buildDevicePools.ts
// Re-run only if the underlying dictionary/common-word list changes.
//
// reversal and alternates can mechanically construct for well under 1% of
// words in the general pool (measured: 0.8% and 0.5% respectively at
// length 6) — real words whose reverse (or every-other-letter) is ALSO a
// real word are just rare. Scanning the full ~275k-word dictionary once
// and precomputing every such pair/match, rather than searching live on
// every construct() call, is both much faster and lets the grid-filling
// step deliberately seed a slot with one of these words instead of
// discovering after the fact that none of a puzzle's 6 words support the
// device.
//
// Both pools restrict the ANSWER side to words already in
// wordlistsByLength.json — the pool the grid solver actually draws
// from — since a pair whose answer isn't solver-reachable is useless here,
// just noise.
//
// The fodder side is intentionally left at the device's existing fairness
// bar (isDictionaryWord only, same as today's live reversal.ts/alternates.ts)
// rather than also requiring isCommonWord. Measured directly: every one of
// the 10 length-6 reversal pairs and all 6 length-6 alternates matches has
// an uncommon fodder (DRAWER itself isn't in the 10k-word common list) —
// requiring both sides to be "common" produces literally zero pairs at any
// length, which would defeat the entire point of this pool. The
// generateClue pipeline's existing fluency gate + retry-with-feedback is
// what actually protects surface quality (same as it does for every other
// device); this script's job is only to make the mechanically-fair-but-rare
// cases findable in one pass instead of searched live on every construct().

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAllWords, isDictionaryWord } from '../src/devices/dictionary.js';
import wordlistsByLength from '../src/data/wordlistsByLength.json' with { type: 'json' };

const pools = wordlistsByLength as Record<string, string[]>;
const LENGTHS = Object.keys(pools);

function reverse(word: string): string {
  return word.split('').reverse().join('');
}

function buildReversalPairs(): Record<string, [string, string][]> {
  const result: Record<string, [string, string][]> = {};
  for (const length of LENGTHS) {
    const pairs: [string, string][] = [];
    for (const word of pools[length]) {
      const answer = word.toUpperCase();
      const fodder = reverse(answer);
      if (fodder === answer) continue; // palindrome, not a fair reversal
      if (!isDictionaryWord(fodder)) continue;
      pairs.push([answer, fodder]);
    }
    result[length] = pairs;
  }
  return result;
}

function extractAlternating(word: string): string {
  return word
    .split('')
    .filter((_, i) => i % 2 === 0)
    .join('');
}

function buildAlternatesPool(): Record<string, Record<string, string[]>> {
  const result: Record<string, Record<string, string[]>> = {};
  const allWords = getAllWords().map((w) => w.toUpperCase());

  for (const length of LENGTHS) {
    const n = Number(length);
    const expectedFodderLength = n * 2 - 1;
    const answerSet = new Set(pools[length].map((w) => w.toUpperCase()));
    const byAnswer: Record<string, string[]> = {};

    for (const fodder of allWords) {
      if (fodder.length !== expectedFodderLength) continue;
      const answer = extractAlternating(fodder);
      if (!answerSet.has(answer)) continue;
      if (!byAnswer[answer]) byAnswer[answer] = [];
      byAnswer[answer].push(fodder);
    }

    result[length] = byAnswer;
  }
  return result;
}

function main() {
  const dataDir = join(process.cwd(), 'src', 'data');

  console.log('Scanning dictionary for reversal pairs...');
  const reversalPairs = buildReversalPairs();
  for (const length of LENGTHS) {
    console.log(`  length ${length}: ${reversalPairs[length].length} pairs`);
  }
  writeFileSync(join(dataDir, 'reversal-pairs.json'), JSON.stringify(reversalPairs, null, 2) + '\n');

  console.log('\nScanning dictionary for alternating-letter matches...');
  const alternatesPool = buildAlternatesPool();
  for (const length of LENGTHS) {
    const count = Object.keys(alternatesPool[length]).length;
    console.log(`  length ${length}: ${count} answers with at least one fodder`);
  }
  writeFileSync(join(dataDir, 'alternates-pool.json'), JSON.stringify(alternatesPool, null, 2) + '\n');

  console.log('\nDone.');
}

main();
