#!/usr/bin/env node
// CLI: run the generate -> verify loop over the seed word list and print
// every verified clue with its full mechanical parse and verification log.
// Definitions are proposed by the LLM and checked against WordNet by the
// pipeline itself (Phase 3) — no seeded definition map needed. As of
// Phase 4, every verified clue is persisted into the clue bank or the
// Tier 3 / unreviewed-definition review queue (see bank/clueBank.ts);
// --no-bank skips persistence for a dry-run preview. --approve <id> moves
// one queued clue into the live bank instead of running generation.

import { existsSync, readFileSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import wordlist from './data/wordlist.seed.json' with { type: 'json' };
import anagramIndicators from './data/indicators/anagram.json' with { type: 'json' };
import hiddenIndicators from './data/indicators/hidden.json' with { type: 'json' };
import reversalIndicators from './data/indicators/reversal.json' with { type: 'json' };
import alternatesIndicators from './data/indicators/alternates.json' with { type: 'json' };
import initialsIndicators from './data/indicators/initials.json' with { type: 'json' };
import charadeIndicators from './data/indicators/charade.json' with { type: 'json' };
import containerIndicators from './data/indicators/container.json' with { type: 'json' };
import deletionIndicators from './data/indicators/deletion.json' with { type: 'json' };
import { generateClue } from './pipeline/generateClue.js';
import { appendToBank, approveFromReviewQueue } from './bank/clueBank.js';
import { getDevice } from './devices/index.js';
import type { Clue, DeviceType } from './types.js';

// Devices worth trying automatically, best surface quality first. Initials
// is deliberately last — spelling an 8+ letter answer from consecutive
// word-initials rarely produces a natural surface, so it's a fallback
// rather than a first choice.
const AUTO_DEVICE_ORDER: DeviceType[] = [
  'charade',
  'container',
  'hidden',
  'anagram',
  'reversal',
  'alternates',
  'deletion',
  'initials',
];

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const { values } = parseArgs({
  options: {
    count: { type: 'string', default: '10' },
    device: { type: 'string', default: 'anagram' },
    words: { type: 'string' },
    offset: { type: 'string', default: '0' },
    'auto-device': { type: 'boolean', default: false },
    out: { type: 'string' },
    'no-bank': { type: 'boolean', default: false },
    approve: { type: 'string' },
  },
});

if (values.approve) {
  const approved = approveFromReviewQueue(values.approve);
  if (!approved) {
    console.error(`No queued clue found with id "${values.approve}"`);
    process.exit(1);
  }
  console.log(`Approved "${approved.answer}" — moved from review queue into the live bank.`);
  console.log(`Surface: ${approved.surface}`);
  process.exit(0);
}

const count = Number(values.count);
const offset = Number(values.offset);
const device = values.device as DeviceType;
const autoDevice = values['auto-device'] as boolean;

const indicatorBanks: Partial<Record<DeviceType, string[]>> = {
  anagram: anagramIndicators as string[],
  hidden: hiddenIndicators as string[],
  reversal: reversalIndicators as string[],
  alternates: alternatesIndicators as string[],
  initials: initialsIndicators as string[],
  charade: charadeIndicators as string[],
  container: containerIndicators as string[],
  deletion: (deletionIndicators as Array<{ word: string }>).map((entry) => entry.word),
};

// Try each device in AUTO_DEVICE_ORDER until one can mechanically construct
// the answer at all (a local, zero-cost check) — the LLM is only ever
// called for the device that actually wins.
function pickAutoDevice(answer: string): DeviceType | null {
  for (const candidate of AUTO_DEVICE_ORDER) {
    const bank = indicatorBanks[candidate];
    if (!bank) continue;
    if (getDevice(candidate).construct(answer, bank)) return candidate;
  }
  return null;
}

async function main() {
  if (!autoDevice && !indicatorBanks[device]) {
    console.error(`No indicator bank registered for device "${device}"`);
    process.exit(1);
  }

  const sourceWordlist: string[] = values.words
    ? (JSON.parse(readFileSync(values.words, 'utf8')) as string[])
    : (wordlist as string[]);
  const answers = sourceWordlist.slice(offset, offset + count);
  const verified: Clue[] = [];
  let skipped = 0;

  for (const answer of answers) {
    console.log(`\n=== ${answer.toUpperCase()} ===`);

    const chosenDevice = autoDevice ? pickAutoDevice(answer) : device;
    if (!chosenDevice) {
      console.log('✗ no device could construct this answer at all — discarded');
      skipped++;
      continue;
    }
    const indicatorBank = indicatorBanks[chosenDevice]!;
    if (autoDevice) console.log(`Device (auto): ${chosenDevice}`);

    const result = await generateClue({ answer, device: chosenDevice, indicatorBank });

    if (result.clue) {
      console.log(`Surface:        ${result.clue.surface}`);
      console.log(`Definition:     "${result.clue.definition}" (${result.clue.definitionPosition})`);
      console.log(`Wordplay:       ${result.clue.wordplay.operation}`);
      console.log(`Indicator:      "${result.clue.wordplay.indicator}"`);
      console.log(`Verified:       ${result.clue.verified}`);
      console.log(`ReviewRequired: ${result.clue.reviewRequired}`);
      console.log(`Id:             ${result.clue.id}`);
      console.log('Log:');
      for (const line of result.clue.verificationLog) console.log(`  ${line}`);
      verified.push(result.clue);

      if (!values['no-bank']) {
        const appendResult = appendToBank(result.clue);
        console.log(
          `Persisted to ${appendResult.destination} (${appendResult.totalInDestination} total there)`
        );
      }
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
