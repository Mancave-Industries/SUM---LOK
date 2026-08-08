#!/usr/bin/env node
// CLI: run the generate -> verify loop over the seed word list and print
// every verified clue with its full mechanical parse and verification log.
// Optionally writes the verified clues to a JSON file with --out (a
// stand-in for the real bank, which lands in Phase 4). As of Phase 3,
// definitions are proposed by the LLM and checked against WordNet by the
// pipeline itself — no seeded definition map needed.

import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import wordlist from './data/wordlist.seed.json' with { type: 'json' };
import anagramIndicators from './data/indicators/anagram.json' with { type: 'json' };
import hiddenIndicators from './data/indicators/hidden.json' with { type: 'json' };
import reversalIndicators from './data/indicators/reversal.json' with { type: 'json' };
import alternatesIndicators from './data/indicators/alternates.json' with { type: 'json' };
import initialsIndicators from './data/indicators/initials.json' with { type: 'json' };
import { generateClue } from './pipeline/generateClue.js';
import type { Clue, DeviceType } from './types.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '10' },
    device: { type: 'string', default: 'anagram' },
    out: { type: 'string' },
  },
});

const count = Number(values.count);
const device = values.device as DeviceType;

const indicatorBanks: Partial<Record<DeviceType, string[]>> = {
  anagram: anagramIndicators as string[],
  hidden: hiddenIndicators as string[],
  reversal: reversalIndicators as string[],
  alternates: alternatesIndicators as string[],
  initials: initialsIndicators as string[],
};

async function main() {
  const indicatorBank = indicatorBanks[device];
  if (!indicatorBank) {
    console.error(`No indicator bank registered for device "${device}"`);
    process.exit(1);
  }

  const answers = (wordlist as string[]).slice(0, count);
  const verified: Clue[] = [];
  let skipped = 0;

  for (const answer of answers) {
    console.log(`\n=== ${answer.toUpperCase()} ===`);

    const result = await generateClue({ answer, device, indicatorBank });

    if (result.clue) {
      console.log(`Surface:        ${result.clue.surface}`);
      console.log(`Definition:     "${result.clue.definition}" (${result.clue.definitionPosition})`);
      console.log(`Wordplay:       ${result.clue.wordplay.operation}`);
      console.log(`Indicator:      "${result.clue.wordplay.indicator}"`);
      console.log(`Verified:       ${result.clue.verified}`);
      console.log(`ReviewRequired: ${result.clue.reviewRequired}`);
      console.log('Log:');
      for (const line of result.clue.verificationLog) console.log(`  ${line}`);
      verified.push(result.clue);
    } else {
      console.log('✗ not verified — discarded');
      console.log('Log:');
      for (const line of result.log) console.log(`  ${line}`);
      skipped++;
    }
  }

  console.log(`\n${verified.length} verified, ${skipped} skipped, out of ${answers.length} attempted.`);

  if (values.out) {
    writeFileSync(values.out, JSON.stringify(verified, null, 2));
    console.log(`Wrote ${verified.length} clues to ${values.out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
