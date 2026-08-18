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
import homophoneIndicators from './data/indicators/homophone.json' with { type: 'json' };
import { generateClue } from './pipeline/generateClue.js';
import { appendToBank, approveFromReviewQueue } from './bank/clueBank.js';
import { getDevice } from './devices/index.js';
import type { Clue, DeviceType } from './types.js';

// Devices worth trying automatically. Initials and deletion are both
// excluded outright, not just deprioritized. Initials strings an 8+ letter
// answer together from 8 short filler words by their first letters, which
// reads as word salad ("Ibis, tau, ikat, noh, erf..."). Deletion has a
// quieter version of the same problem: for behead/curtail, the fodder word
// is only ever one letter longer than the answer, so the surface has to
// spell the whole answer out as a literal, readable substring (almost
// always the answer's own plural — "vacations" -> "vacation") and the clue
// can be solved by pattern-matching alone without working out the
// wordplay. Both stay real, selectable devices via --device where they're
// still fair (e.g. short answers); neither is a good default here.
const AUTO_DEVICE_ORDER: DeviceType[] = [
  'charade',
  'container',
  'hidden',
  'anagram',
  'reversal',
  'alternates',
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
  homophone: homophoneIndicators as string[],
  // doubleDefinition uses no linking indicator at all (see
  // devices/doubleDefinition.ts) — an empty-but-present array keeps
  // `indicatorBanks[device]` truthy for the --device validation check
  // below without implying a real indicator bank.
  doubleDefinition: [],
};

// Picks the LEAST-used device (so far this run) among whichever can
// mechanically construct this particular answer — a local, zero-cost
// check, since the LLM is only ever called for the device that wins.
// A fixed try-in-order preference (charade, then container, then...)
// looks reasonable per-word but skews the whole run hard toward whichever
// device happens to construct most often for long words — in practice
// charade, since splitting an 8+ letter word into two abbreviation-
// resolvable parts succeeds far more often than e.g. reversal needing the
// reversed letters to themselves be a real word. Balancing by running
// count instead spreads real batches across the device range instead of
// mostly generating one device with everything else as backfill.
//
// charade/container start with a handicap rather than an even 0: their
// wordplay is two separately-labelled parts an indicator has to visibly
// glue together, which is structurally harder to fold into one fluent
// sentence than hidden/anagram's single flowing description with the
// fodder embedded in it — in practice they fail the fluency check far
// more often. The handicap fades once hidden/anagram have been used a
// couple more times than they have, so charade/container still get used
// when hidden/anagram genuinely can't construct a given word.
const DEVICE_HANDICAP: Partial<Record<DeviceType, number>> = { charade: 2, container: 2 };
const deviceUsageCount: Partial<Record<DeviceType, number>> = {};
for (const d of AUTO_DEVICE_ORDER) deviceUsageCount[d] = DEVICE_HANDICAP[d] ?? 0;

function pickAutoDevice(answer: string): DeviceType | null {
  const constructible = AUTO_DEVICE_ORDER.filter((candidate) => {
    const bank = indicatorBanks[candidate];
    return bank && getDevice(candidate).construct(answer, bank);
  });
  if (constructible.length === 0) return null;
  constructible.sort((a, b) => deviceUsageCount[a]! - deviceUsageCount[b]!);
  const chosen = constructible[0];
  deviceUsageCount[chosen]!++;
  return chosen;
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
