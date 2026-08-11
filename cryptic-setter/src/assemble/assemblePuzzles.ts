#!/usr/bin/env node
// Assembles new 3A2Dle puzzles from the clue bank: solves a valid 6-word
// interlocking grid, reuses an existing bank clue for each answer where
// one exists, generates a fresh one (real LLM call, verified same as
// everything else) where it doesn't, and writes app/puzzles/<id>.json +
// updates the manifest. Run with: npx tsx src/assemble/assemblePuzzles.ts [count]

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { solveHashGrid } from './solveGrid.js';
import { generateClue } from '../pipeline/generateClue.js';
import { appendToBank } from '../bank/clueBank.js';
import { getDevice } from '../devices/index.js';
import anagramIndicators from '../data/indicators/anagram.json' with { type: 'json' };
import hiddenIndicators from '../data/indicators/hidden.json' with { type: 'json' };
import reversalIndicators from '../data/indicators/reversal.json' with { type: 'json' };
import alternatesIndicators from '../data/indicators/alternates.json' with { type: 'json' };
import charadeIndicators from '../data/indicators/charade.json' with { type: 'json' };
import containerIndicators from '../data/indicators/container.json' with { type: 'json' };
import deletionIndicatorData from '../data/indicators/deletion.json' with { type: 'json' };
import wordlist from '../data/wordlist.8plus.json' with { type: 'json' };
import type { Clue, DeviceType } from '../types.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const PUZZLES_DIR = join(process.cwd(), '..', 'app', 'puzzles');
const MANIFEST_PATH = join(PUZZLES_DIR, 'manifest.json');

const indicatorBanks: Partial<Record<DeviceType, string[]>> = {
  anagram: anagramIndicators as string[],
  hidden: hiddenIndicators as string[],
  reversal: reversalIndicators as string[],
  alternates: alternatesIndicators as string[],
  charade: charadeIndicators as string[],
  container: containerIndicators as string[],
  deletion: (deletionIndicatorData as Array<{ word: string }>).map((e) => e.word),
};
// Kept in sync with cli.ts's AUTO_DEVICE_ORDER: deletion is excluded here
// too. For behead/curtail the fodder is only one letter longer than the
// answer, so the surface ends up spelling the whole answer out as a
// literal substring (almost always the answer's own plural), which makes
// the clue solvable by pattern-matching rather than working out wordplay.
// charade/container start deviceUsage with a handicap (see cli.ts for the
// full rationale): their two-labelled-parts-plus-indicator wordplay is
// structurally harder to fold into fluent English than hidden/anagram's
// single flowing description, so they fail the fluency check more often.
const DEVICE_HANDICAP: Partial<Record<DeviceType, number>> = { charade: 2, container: 2 };
const DEVICE_ORDER: DeviceType[] = [
  'charade',
  'container',
  'hidden',
  'anagram',
  'reversal',
  'alternates',
];

interface PuzzleEntry {
  number: number;
  direction: 'across' | 'down';
  row: number;
  col: number;
  answer: string;
  clue: string;
  device: string;
  bonus: boolean;
}

function loadManifest(): { puzzles: string[] } {
  if (!existsSync(MANIFEST_PATH)) return { puzzles: [] };
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function loadUsedAnswers(): Set<string> {
  const used = new Set<string>();
  if (!existsSync(PUZZLES_DIR)) return used;
  for (const file of readdirSync(PUZZLES_DIR)) {
    if (!file.endsWith('.json') || file === 'manifest.json') continue;
    const puzzle = JSON.parse(readFileSync(join(PUZZLES_DIR, file), 'utf8'));
    for (const entry of puzzle.entries ?? []) used.add(entry.answer.toUpperCase());
  }
  return used;
}

function loadBankClue(answer: string): Clue | null {
  for (const file of ['clues.json', 'review-queue.json']) {
    const path = join(process.cwd(), 'src', 'data', 'bank', file);
    if (!existsSync(path)) continue;
    const list: Clue[] = JSON.parse(readFileSync(path, 'utf8'));
    const match = list.find((c) => c.answer.toUpperCase() === answer.toUpperCase());
    if (match) return match;
  }
  return null;
}

async function getOrGenerateClue(
  answer: string,
  deviceUsage: Partial<Record<DeviceType, number>>
): Promise<{ clue: string; device: string } | null> {
  const existing = loadBankClue(answer);
  if (existing) {
    console.log(`  ${answer}: reusing bank clue (${existing.device})`);
    return { clue: existing.surface, device: existing.device };
  }

  const constructible = DEVICE_ORDER.filter((d) => {
    const bank = indicatorBanks[d];
    return bank && getDevice(d).construct(answer, bank);
  });
  if (constructible.length === 0) {
    console.log(`  ${answer}: ✗ no device could construct this at all`);
    return null;
  }
  constructible.sort((a, b) => (deviceUsage[a] ?? 0) - (deviceUsage[b] ?? 0));
  const device = constructible[0];
  deviceUsage[device] = (deviceUsage[device] ?? 0) + 1;

  console.log(`  ${answer}: generating fresh (${device})...`);
  try {
    const result = await generateClue({ answer, device, indicatorBank: indicatorBanks[device]! });
    if (!result.clue) {
      console.log(`  ${answer}: ✗ generation failed`);
      return null;
    }
    appendToBank(result.clue);
    return { clue: result.clue.surface, device: result.clue.device };
  } catch (err) {
    // A malformed model response or transient API error shouldn't crash
    // the whole assembly run — treat it the same as any other failed
    // generation and let the caller pick a different grid instead.
    console.log(`  ${answer}: ✗ generation threw (${(err as Error).message})`);
    return null;
  }
}

type AssembleResult = { id: string } | { failedAnswer: string } | { noGridFound: true };

async function assembleOne(puzzleNumber: number, exclude: Set<string>): Promise<AssembleResult> {
  const solution = solveHashGrid(wordlist as string[], exclude);
  if (!solution) {
    console.log('No more valid grids can be assembled from the current word pool.');
    return { noGridFound: true };
  }
  const { across, down } = solution;
  console.log(`\nGrid ${puzzleNumber}: across=${across.join(',')} down=${down.join(',')}`);

  const deviceUsage: Partial<Record<DeviceType, number>> = { ...DEVICE_HANDICAP };
  const clueFor: Record<string, { clue: string; device: string }> = {};
  for (const answer of [...across, ...down]) {
    const result = await getOrGenerateClue(answer, deviceUsage);
    if (!result) return { failedAnswer: answer }; // caller blacklists this word and retries
    clueFor[answer] = result;
  }

  // Alternate 3A2D / 2A3D by puzzle number, matching the format the whole
  // concept is named after: 3-across day withholds a down clue as bonus,
  // 2-across day withholds an across clue instead.
  const format = puzzleNumber % 2 === 1 ? '3A2D' : '2A3D';
  const bonusIsDown = format === '3A2D';

  const entries: PuzzleEntry[] = [
    { number: 1, direction: 'across', row: 0, col: 0, answer: across[0], ...clueFor[across[0]], bonus: false },
    { number: 4, direction: 'across', row: 3, col: 0, answer: across[1], ...clueFor[across[1]], bonus: false },
    { number: 5, direction: 'across', row: 7, col: 0, answer: across[2], ...clueFor[across[2]], bonus: !bonusIsDown },
    { number: 1, direction: 'down', row: 0, col: 0, answer: down[0], ...clueFor[down[0]], bonus: false },
    { number: 2, direction: 'down', row: 0, col: 3, answer: down[1], ...clueFor[down[1]], bonus: false },
    { number: 3, direction: 'down', row: 0, col: 7, answer: down[2], ...clueFor[down[2]], bonus: bonusIsDown },
  ];

  const id = `puzzle-${String(puzzleNumber).padStart(3, '0')}`;
  const puzzle = { id, format, entries };
  writeFileSync(join(PUZZLES_DIR, `${id}.json`), JSON.stringify(puzzle, null, 2) + '\n');
  console.log(`Wrote ${id}.json (${format}, bonus=${entries.find((e) => e.bonus)?.answer})`);

  for (const answer of [...across, ...down]) exclude.add(answer.toUpperCase());
  return { id };
}

async function main() {
  const count = Number(process.argv[2] ?? '3');
  const manifest = loadManifest();
  const exclude = loadUsedAnswers();

  let nextNumber = manifest.puzzles.length + 1;
  let built = 0;
  const maxAttemptsPerSlot = 5;

  while (built < count) {
    let result: AssembleResult | null = null;
    for (let attempt = 0; attempt < maxAttemptsPerSlot; attempt++) {
      result = await assembleOne(nextNumber, exclude);
      if ('id' in result) break;
      if ('noGridFound' in result) break; // pool exhausted, no point retrying
      // A specific word failed generation — blacklist it so future grid
      // solves (this attempt and any later puzzle) skip it, then retry
      // this slot with a fresh grid rather than aborting the whole run.
      console.log(`  blacklisting "${result.failedAnswer}" and retrying this slot`);
      exclude.add(result.failedAnswer.toUpperCase());
    }
    if (!result || !('id' in result)) {
      console.log(`Giving up on puzzle ${nextNumber} after ${maxAttemptsPerSlot} attempts.`);
      break;
    }
    manifest.puzzles.push(result.id);
    // Save after every successful puzzle, not just at the end — a crash or
    // interrupted run should never lose already-completed work.
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    nextNumber++;
    built++;
  }

  console.log(`\nManifest now has ${manifest.puzzles.length} puzzles (${built} built this run).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
