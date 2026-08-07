#!/usr/bin/env node
// Phase 1 CLI: run the generate -> verify loop over the seed word list and
// print every verified clue with its full mechanical parse and
// verification log. Optionally writes the verified clues to a JSON file
// with --out (a stand-in for the real bank, which lands in Phase 4).

import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import wordlist from './data/wordlist.seed.json' with { type: 'json' };
import definitions from './data/definitions.seed.json' with { type: 'json' };
import anagramIndicators from './data/indicators/anagram.json' with { type: 'json' };
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
    const definition = (definitions as Record<string, string>)[answer.toUpperCase()];

    console.log(`\n=== ${answer.toUpperCase()} ===`);

    if (!definition) {
      console.log('✗ skipped — no seeded definition for this answer');
      skipped++;
      continue;
    }

    const result = await generateClue({ answer, device, definition, indicatorBank });

    if (result.clue) {
      console.log(`Surface:     ${result.clue.surface}`);
      console.log(`Definition:  "${result.clue.definition}" (${result.clue.definitionPosition})`);
      console.log(`Wordplay:    ${result.clue.wordplay.operation}`);
      console.log(`Indicator:   "${result.clue.wordplay.indicator}"`);
      console.log(`Verified:    ${result.clue.verified}`);
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
