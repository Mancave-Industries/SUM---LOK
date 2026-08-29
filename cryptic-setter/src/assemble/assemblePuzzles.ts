#!/usr/bin/env node
// Assembles new 3A2Dle puzzles from the clue bank: solves a valid 6-word
// interlocking grid, reuses an existing bank clue for each answer where
// one exists, generates a fresh one (real LLM call, verified same as
// everything else) where it doesn't, and writes app/puzzles/<id>.json +
// updates the manifest. Run with:
//   npx tsx src/assemble/assemblePuzzles.ts [count] [standard|hard]
// tier defaults to "standard" if omitted.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fillTemplate } from './fillTemplate.js';
import { GRID_TEMPLATES, type GridTemplate } from './gridTemplates.js';
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
import homophoneIndicators from '../data/indicators/homophone.json' with { type: 'json' };
import wordlistsByLength from '../data/wordlistsByLength.json' with { type: 'json' };
import reversalPairs from '../data/reversal-pairs.json' with { type: 'json' };
import alternatesPool from '../data/alternates-pool.json' with { type: 'json' };
import homophonePool from '../data/homophone-pool.json' with { type: 'json' };
import doubleDefPool from '../data/double-def-pool.json' with { type: 'json' };
import type { Clue, DeviceType } from '../types.js';

type Tier = 'standard' | 'hard';

// Every grid used to be 8 letters, hardcoded, all 6 answers sharing that
// one length. Now a puzzle's shape is picked from a fixed set of 10x10
// templates — round-robin by puzzle number so a run gets real variety —
// each with its own mix of slot lengths, with the other templates as
// fallback if the assigned one can't produce a solvable grid from the
// current (post-exclusion) pool.
function templateOrderFor(puzzleNumber: number): GridTemplate[] {
  const primaryIndex = (puzzleNumber - 1) % GRID_TEMPLATES.length;
  return [GRID_TEMPLATES[primaryIndex], ...GRID_TEMPLATES.filter((_, i) => i !== primaryIndex)];
}

if (existsSync('.env')) process.loadEnvFile('.env');

const PUZZLES_DIR = join(process.cwd(), '..', 'app', 'puzzles');
const MANIFEST_PATH = join(PUZZLES_DIR, 'manifest.json');
const DAILY_PATH = join(PUZZLES_DIR, 'daily.json');

interface DailyManifest {
  days: Record<string, Partial<Record<Tier, string>>>;
}

function loadDaily(): DailyManifest {
  if (!existsSync(DAILY_PATH)) return { days: {} };
  return JSON.parse(readFileSync(DAILY_PATH, 'utf8'));
}

// Finds the earliest calendar day (starting from today, UTC) that doesn't
// yet have an entry for this tier, and fills it — matching the append-only,
// run-when-you-run-it model the rest of this script already uses for
// manifest.json. Walking forward from today (rather than always appending
// "whatever's after the last filled day") means a run that only builds one
// tier still fills any earlier gap a standard-only or hard-only run before
// it left behind, instead of never catching up.
function nextDailySlot(daily: DailyManifest, tier: Tier): string {
  const cursor = new Date();
  for (let i = 0; i < 3650; i++) { // 10-year safety cap, never realistically hit
    const key = cursor.toISOString().slice(0, 10);
    if (!daily.days[key]?.[tier]) return key;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  throw new Error('Could not find an open daily slot within 10 years — something is very wrong');
}

function writeDailyEntry(tier: Tier, id: string): void {
  const daily = loadDaily();
  const key = nextDailySlot(daily, tier);
  daily.days[key] = { ...daily.days[key], [tier]: id };
  writeFileSync(DAILY_PATH, JSON.stringify(daily, null, 2) + '\n');
}

const indicatorBanks: Partial<Record<DeviceType, string[]>> = {
  anagram: anagramIndicators as string[],
  hidden: hiddenIndicators as string[],
  reversal: reversalIndicators as string[],
  alternates: alternatesIndicators as string[],
  charade: charadeIndicators as string[],
  container: containerIndicators as string[],
  deletion: (deletionIndicatorData as Array<{ word: string }>).map((e) => e.word),
  homophone: homophoneIndicators as string[],
  // doubleDefinition uses no linking indicator at all (see devices/doubleDefinition.ts) —
  // an empty-but-present array keeps it truthy for the `indicatorBanks[d]`
  // constructibility check below without implying any real indicator bank.
  doubleDefinition: [],
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
//
// Hard tier reuses the exact same device set as its base, plus the two
// tier-3 judgement devices — homophone and doubleDefinition are never
// offered to a standard-tier puzzle at all, matching the user's intent
// that multi-device/general-knowledge clues are what makes the hard tier
// actually harder. Hard tier also handicaps hidden/anagram heavily (well
// past charade/container's +2) — those two are the easiest devices to
// construct for almost any word, so without a strong handicap they'd
// crowd out the harder devices in every hard puzzle exactly the way
// hidden alone had to be capped per-puzzle for the standard tier.
const DEVICE_HANDICAP: Record<Tier, Partial<Record<DeviceType, number>>> = {
  standard: { charade: 2, container: 2 },
  hard: { charade: 2, container: 2, hidden: 6, anagram: 6 },
};
const DEVICE_ORDER: DeviceType[] = [
  'charade',
  'container',
  'hidden',
  'anagram',
  'reversal',
  'alternates',
];
const HARD_DEVICE_ORDER: DeviceType[] = [...DEVICE_ORDER, 'homophone', 'doubleDefinition'];

function deviceOrderFor(tier: Tier): DeviceType[] {
  return tier === 'hard' ? HARD_DEVICE_ORDER : DEVICE_ORDER;
}

// Per-puzzle device caps. Measured constructibility across the solver's
// own word pool is wildly uneven — hidden works for ~87% of words and
// anagram ~49%, while charade/container manage ~18%/~15% and the rest are
// rarer still. Left uncapped, those top two simply fill most of a puzzle
// by default (they're always available, so the least-used-device tiebreak
// keeps landing on them), which is exactly the "every clue is a hidden
// word" complaint that prompted the original hidden cap.
//
// Capped per puzzle rather than per batch so no single puzzle over-relies
// on one device regardless of what the bank happens to hold for these
// particular 6 words. Only the over-available devices need an entry —
// anything absent is uncapped, since its own scarcity already limits it
// and capping it further would just cause needless generation failures.
// Hard tier caps hidden tighter still, on top of its handicap, since a
// hard puzzle leaning on the single easiest device defeats the point.
const DEVICE_CAPS: Record<Tier, Partial<Record<DeviceType, number>>> = {
  standard: { hidden: 2, anagram: 2 },
  hard: { hidden: 1, anagram: 2, doubleDefinition: 2 },
};

// Every device that has already hit its per-puzzle cap for this puzzle.
function cappedDevices(
  puzzleDeviceUsage: Partial<Record<DeviceType, number>>,
  tier: Tier
): DeviceType[] {
  const caps = DEVICE_CAPS[tier];
  return (Object.keys(caps) as DeviceType[]).filter(
    (device) => (puzzleDeviceUsage[device] ?? 0) >= caps[device]!
  );
}

// homophone/doubleDefinition clues always land in review-queue.json first
// (they're tier 3 — see devices/index.ts) and need an explicit human
// approval step (clueBank.ts's approveFromReviewQueue) before a real puzzle
// can use them. Every other device's review-queue entries (a definition
// that didn't clear WordNet) stay reusable as before — this restriction is
// specifically about gating the two judgement devices, not review status
// in general.
const TIER3_GATED_DEVICES: DeviceType[] = ['homophone', 'doubleDefinition'];

// Reversal/alternates can mechanically construct for well under 1% of
// words (measured: 0.8%/0.5% at length 6) — real words whose reverse (or
// every-other-letter) is ALSO a real word are just rare, and these
// precomputed pools (scripts/buildDevicePools.ts) are correspondingly
// thin: 17 total usable answers across every supported length combined,
// covering only lengths 6-7. A puzzle can't be relied on to include one —
// this only makes it possible to deliberately try, instead of never
// happening at all.
const reversalAnswersByLength: Record<string, string[]> = Object.fromEntries(
  Object.entries(reversalPairs as unknown as Record<string, [string, string][]>).map(([len, pairs]) => [
    len,
    pairs.map(([answer]) => answer),
  ])
);
const alternatesAnswersByLength: Record<string, string[]> = Object.fromEntries(
  Object.entries(alternatesPool as Record<string, Record<string, string[]>>).map(([len, byAnswer]) => [
    len,
    Object.keys(byAnswer),
  ])
);
// homophone/doubleDefinition pools (scripts/buildHomophonePairs.ts,
// buildDoubleDefPool.ts) are likely even thinner than reversal/alternates —
// two independent rarity filters stacked (CMU-dict coverage + a WordNet
// synonym, or two non-overlapping WordNet senses). Same seeding mechanism
// as reversal/alternates is what actually gives them a real chance to
// appear in a hard-tier puzzle at all.
const homophoneAnswersByLength: Record<string, string[]> = Object.fromEntries(
  Object.entries(homophonePool as Record<string, { answer: string }[]>).map(([len, pairs]) => [
    len,
    pairs.map((p) => p.answer),
  ])
);
const doubleDefAnswersByLength: Record<string, string[]> = Object.fromEntries(
  Object.entries(doubleDefPool as Record<string, { answer: string }[]>).map(([len, pairs]) => [
    len,
    pairs.map((p) => p.answer),
  ])
);
const SEEDABLE_DEVICES = ['reversal', 'alternates'] as const;
const HARD_SEEDABLE_DEVICES = ['reversal', 'alternates', 'homophone', 'doubleDefinition'] as const;
type SeedableDevice = (typeof HARD_SEEDABLE_DEVICES)[number];

function seedableDevicesFor(tier: Tier): readonly SeedableDevice[] {
  return tier === 'hard' ? HARD_SEEDABLE_DEVICES : SEEDABLE_DEVICES;
}

function answerPoolFor(device: SeedableDevice): Record<string, string[]> {
  switch (device) {
    case 'reversal':
      return reversalAnswersByLength;
    case 'alternates':
      return alternatesAnswersByLength;
    case 'homophone':
      return homophoneAnswersByLength;
    case 'doubleDefinition':
      return doubleDefAnswersByLength;
  }
}

// Whenever the batch's persistent device counter shows a seedable device
// sitting at (or below) every other device's usage, worth trying to seed
// one slot of the current template with a word only that device can clue —
// this is what actually gives them a chance to appear, instead of
// assembling a normal 6-word grid and discovering after the fact that none
// of the 6 happen to support any of them.
function pickSeedTarget(deviceUsage: Partial<Record<DeviceType, number>>, tier: Tier): SeedableDevice | null {
  const minOverall = Math.min(...deviceOrderFor(tier).map((d) => deviceUsage[d] ?? 0));
  for (const device of seedableDevicesFor(tier)) {
    if ((deviceUsage[device] ?? 0) === minOverall) return device;
  }
  return null;
}

// Finds the first slot in this template whose length has at least one
// still-available word in the target device's pool, and restricts that
// slot's candidates to just those words. Returns null if no slot in this
// template has any eligible word left (common, given how thin these pools
// are) — the caller falls back to a normal, unrestricted fill in that case.
function buildSeedSlotPools(
  template: GridTemplate,
  device: SeedableDevice,
  exclude: Set<string>
): Partial<Record<string, string[]>> | null {
  const answersByLength = answerPoolFor(device);
  for (const slot of template.slots) {
    const candidates = (answersByLength[String(slot.length)] ?? []).filter((w) => !exclude.has(w));
    if (candidates.length > 0) return { [slot.id]: candidates };
  }
  return null;
}

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

// manifest.puzzles.length is NOT the next free puzzle number — a run that
// skips failed slots (see the main loop below) leaves gaps, so the
// manifest can have 10 entries while the highest actual id on disk is
// puzzle-015. Starting from length+1 collides with and silently overwrites
// an existing file. Scan the real filenames instead.
//
// Hard-tier puzzles live in their own "puzzle-h-NNN" namespace, numbered
// independently from standard "puzzle-NNN" — the anchored regex below
// means the standard pattern never matches a hard-tier filename (the "h-"
// isn't a digit) or vice versa.
function idPrefixFor(tier: Tier): string {
  return tier === 'hard' ? 'puzzle-h-' : 'puzzle-';
}

function nextPuzzleNumber(tier: Tier): number {
  if (!existsSync(PUZZLES_DIR)) return 1;
  const pattern = new RegExp(`^${idPrefixFor(tier)}(\\d+)\\.json$`);
  let max = 0;
  for (const file of readdirSync(PUZZLES_DIR)) {
    const match = file.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

// Matches an actual puzzle file only (puzzle-NNN.json or puzzle-h-NNN.json)
// — an allowlist rather than blacklisting manifest.json by name, so any
// future non-puzzle file dropped into this directory (daily.json in Part 3
// of the daily-tier plan, for instance) is automatically skipped too
// without this function needing to change again.
const PUZZLE_FILE_PATTERN = /^puzzle-(h-)?\d+\.json$/;

// Shared across both tiers deliberately: an answer used in a standard
// puzzle can never reappear in a hard one either, and vice versa — this is
// what actually enforces that shared exclusion pool, without either tier
// needing its own separate bookkeeping.
function loadUsedAnswers(): Set<string> {
  const used = new Set<string>();
  if (!existsSync(PUZZLES_DIR)) return used;
  for (const file of readdirSync(PUZZLES_DIR)) {
    if (!PUZZLE_FILE_PATTERN.test(file)) continue;
    const puzzle = JSON.parse(readFileSync(join(PUZZLES_DIR, file), 'utf8'));
    for (const entry of puzzle.entries ?? []) used.add(entry.answer.toUpperCase());
  }
  return used;
}

// Every answer that already has a verified, banked clue — passed to
// solveHashGrid as a search preference so grid attempts try to reuse
// already-proven words first, rather than each attempt being an
// independent gamble on 6 fresh words all succeeding at once. Read fresh
// on every call since the bank grows as this run's own attempts succeed.
function loadBankAnswers(): Set<string> {
  const answers = new Set<string>();
  for (const file of ['clues.json', 'review-queue.json']) {
    const path = join(process.cwd(), 'src', 'data', 'bank', file);
    if (!existsSync(path)) continue;
    const list: Clue[] = JSON.parse(readFileSync(path, 'utf8'));
    for (const clue of list) {
      if (file === 'review-queue.json' && TIER3_GATED_DEVICES.includes(clue.device)) continue;
      answers.add(clue.answer.toUpperCase());
    }
  }
  return answers;
}

// Scans every banked clue for this answer (not just the first match) and
// prefers one whose device isn't in avoidDevices — this is what lets a
// puzzle-capped word fall back to an already-banked alternate-device clue
// for free, instead of either breaking the per-puzzle cap or re-generating
// (and re-spending credit on) an alternate every single time it comes up.
// Falls back to an avoided-device match rather than null if that's truly
// the only clue on hand — the caller decides whether to accept it or try
// generating a fresh one first.
function loadBankClue(answer: string, avoidDevices: DeviceType[] = []): Clue | null {
  let fallback: Clue | null = null;
  for (const file of ['clues.json', 'review-queue.json']) {
    const path = join(process.cwd(), 'src', 'data', 'bank', file);
    if (!existsSync(path)) continue;
    const list: Clue[] = JSON.parse(readFileSync(path, 'utf8'));
    for (const clue of list) {
      if (clue.answer.toUpperCase() !== answer.toUpperCase()) continue;
      if (file === 'review-queue.json' && TIER3_GATED_DEVICES.includes(clue.device)) continue;
      if (!avoidDevices.includes(clue.device as DeviceType)) return clue;
      if (!fallback) fallback = clue;
    }
  }
  return fallback;
}

function recordDeviceUse(
  device: string,
  deviceUsage: Partial<Record<DeviceType, number>>,
  puzzleDeviceUsage: Partial<Record<DeviceType, number>>
): void {
  deviceUsage[device as DeviceType] = (deviceUsage[device as DeviceType] ?? 0) + 1;
  puzzleDeviceUsage[device as DeviceType] = (puzzleDeviceUsage[device as DeviceType] ?? 0) + 1;
}

async function getOrGenerateClue(
  answer: string,
  deviceUsage: Partial<Record<DeviceType, number>>,
  puzzleDeviceUsage: Partial<Record<DeviceType, number>>,
  tier: Tier
): Promise<{ clue: string; device: string } | null> {
  const deviceOrder = deviceOrderFor(tier);
  const avoidDevices = cappedDevices(puzzleDeviceUsage, tier);

  // A bank clue whose device isn't offered at this tier at all (a
  // homophone/doubleDefinition clue reused for a standard puzzle, or vice
  // versa — though the two devices are hard-only so that direction can't
  // happen) is not a soft avoid-if-possible like the caps below; it's
  // a hard exclusion, so it's filtered out before even being considered as
  // a fallback.
  const rawExisting = loadBankClue(answer, avoidDevices);
  const existing = rawExisting && deviceOrder.includes(rawExisting.device as DeviceType) ? rawExisting : null;
  if (existing && !avoidDevices.includes(existing.device as DeviceType)) {
    console.log(`  ${answer}: reusing bank clue (${existing.device})`);
    // A cache hit still counts toward this batch's actual device
    // distribution — leaving it uncounted would let the balancer's view of
    // "usage so far" drift further from reality the more word-reuse kicks
    // in, exactly when it most needs to be accurate.
    recordDeviceUse(existing.device, deviceUsage, puzzleDeviceUsage);
    return { clue: existing.surface, device: existing.device };
  }

  let constructible = deviceOrder.filter((d) => {
    const bank = indicatorBanks[d];
    return bank && getDevice(d).construct(answer, bank);
  });
  constructible = constructible.filter((d) => !avoidDevices.includes(d));

  if (constructible.length === 0) {
    // Every device that could clue this word is capped out for this puzzle
    // — using a capped bank clue anyway (if one exists) is better than
    // permanently blacklisting a perfectly good word over a
    // per-puzzle-only constraint; it's a rare soft-cap violation rather
    // than a hard failure.
    if (existing) {
      console.log(`  ${answer}: reusing bank clue (${existing.device}) — cap hit, no alternative device works`);
      recordDeviceUse(existing.device, deviceUsage, puzzleDeviceUsage);
      return { clue: existing.surface, device: existing.device };
    }
    console.log(`  ${answer}: ✗ no device could construct this at all`);
    return null;
  }
  constructible.sort((a, b) => (deviceUsage[a] ?? 0) - (deviceUsage[b] ?? 0));
  const device = constructible[0];
  recordDeviceUse(device, deviceUsage, puzzleDeviceUsage);

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

async function assembleOne(
  puzzleNumber: number,
  exclude: Set<string>,
  deviceUsage: Partial<Record<DeviceType, number>>,
  tier: Tier
): Promise<AssembleResult> {
  const id = `${idPrefixFor(tier)}${String(puzzleNumber).padStart(3, '0')}`;
  // Defense in depth against a nextPuzzleNumber() regression: check before
  // any LLM calls happen, not after — never silently clobber an existing
  // puzzle file, and never waste real generation work discovering that.
  if (existsSync(join(PUZZLES_DIR, `${id}.json`))) {
    throw new Error(`Refusing to overwrite existing puzzle file ${id}.json`);
  }

  const preferred = loadBankAnswers();
  const pools = wordlistsByLength as Record<string, string[]>;
  const seedTarget = pickSeedTarget(deviceUsage, tier);

  let solution = null;
  let template: GridTemplate | null = null;
  for (const candidate of templateOrderFor(puzzleNumber)) {
    // Try seeding a reversal/alternates/homophone/doubleDefinition word
    // into this template first; fall back to a normal unrestricted fill of
    // the SAME template before moving on to the next one, rather than
    // sacrificing the whole template attempt just because seeding didn't
    // pan out this time.
    if (seedTarget) {
      const slotPools = buildSeedSlotPools(candidate, seedTarget, exclude);
      if (slotPools) {
        const seeded = fillTemplate(candidate, pools, exclude, preferred, slotPools);
        if (seeded) {
          solution = seeded;
          template = candidate;
          break;
        }
      }
    }
    const attempt = fillTemplate(candidate, pools, exclude, preferred);
    if (attempt) {
      solution = attempt;
      template = candidate;
      break;
    }
  }
  if (!solution || !template) {
    console.log('No more valid grids can be assembled from the current word pool with any template.');
    return { noGridFound: true };
  }
  const words = template.slots.map((slot) => solution!.bySlotId[slot.id]);
  console.log(
    `\nGrid ${puzzleNumber} (template ${template.id}): ${template.slots
      .map((slot) => `${slot.id}=${solution!.bySlotId[slot.id]}(${slot.length})`)
      .join(', ')}`
  );

  const clueFor: Record<string, { clue: string; device: string }> = {};
  // Fresh per puzzle (unlike deviceUsage, which persists across the whole
  // batch) — this is what the DEVICE_CAPS limits are measured
  // against, so it has to reset for every new grid, not accumulate.
  const puzzleDeviceUsage: Partial<Record<DeviceType, number>> = {};
  for (const answer of words) {
    const result = await getOrGenerateClue(answer, deviceUsage, puzzleDeviceUsage, tier);
    if (!result) return { failedAnswer: answer }; // caller blacklists this word and retries
    clueFor[answer] = result;
  }

  // Alternate 3A2D / 2A3D by puzzle number, matching the format the whole
  // concept is named after: 3-across day withholds a down clue as bonus,
  // 2-across day withholds an across clue instead.
  const format = puzzleNumber % 2 === 1 ? '3A2D' : '2A3D';
  const bonusIsDown = format === '3A2D';

  // Bonus eligibility follows the slot id, not any row/col math — 'A3'/'D3'
  // are the third across/down slot in every template, matching the
  // original across[2]/down[2] convention.
  const entries: PuzzleEntry[] = template.slots.map((slot) => {
    const answer = solution!.bySlotId[slot.id];
    const isBonusEligible = slot.id === 'A3' || slot.id === 'D3';
    const bonus = isBonusEligible && (slot.direction === 'down' ? bonusIsDown : !bonusIsDown);
    return {
      number: slot.number,
      direction: slot.direction,
      row: slot.row,
      col: slot.col,
      answer,
      ...clueFor[answer],
      bonus,
    };
  });

  const puzzle = { id, tier, format, entries };
  writeFileSync(join(PUZZLES_DIR, `${id}.json`), JSON.stringify(puzzle, null, 2) + '\n');
  console.log(`Wrote ${id}.json (${tier}, ${format}, bonus=${entries.find((e) => e.bonus)?.answer})`);

  for (const answer of words) exclude.add(answer.toUpperCase());
  return { id };
}

async function main() {
  const count = Number(process.argv[2] ?? '3');
  const tierArg = process.argv[3] ?? 'standard';
  if (tierArg !== 'standard' && tierArg !== 'hard') {
    throw new Error(`Unknown tier "${tierArg}" — expected "standard" or "hard"`);
  }
  const tier: Tier = tierArg;

  const manifest = loadManifest();
  const exclude = loadUsedAnswers();

  let nextNumber = nextPuzzleNumber(tier);
  let built = 0;
  // Seeded once and mutated in place for the whole run — previously this
  // was reset fresh inside assembleOne() on every single puzzle, so it
  // never accumulated enough history to actually balance anything across a
  // multi-puzzle batch.
  const deviceUsage: Partial<Record<DeviceType, number>> = { ...DEVICE_HANDICAP[tier] };
  // Each attempt that fails still grows the bank with whichever words in
  // it succeeded before the one that didn't — and solveHashGrid now biases
  // toward reusing those, so later attempts should complete much faster
  // than earlier ones. 25 gives that convergence room to actually happen
  // instead of giving up while the bank is still thin.
  const maxAttemptsPerSlot = 25;

  // A slot that exhausts its attempts isn't a sign the run is stuck — the
  // bank only grows from here (every attempt, successful or not, banks
  // whichever words in it succeeded before the one that didn't), and
  // solveHashGrid biases toward reusing banked words, so a later slot can
  // very plausibly succeed even after an earlier one gave up. Skip and
  // move on instead of aborting the whole run; the numbering gap this
  // leaves (e.g. puzzle-002 missing) is cosmetic. slotsAttempted caps the
  // total work so an exhausted word pool still terminates instead of
  // spinning forever.
  let slotsAttempted = 0;
  const maxSlotsAttempted = count * 4;

  while (built < count && slotsAttempted < maxSlotsAttempted) {
    slotsAttempted++;
    let result: AssembleResult | null = null;
    for (let attempt = 0; attempt < maxAttemptsPerSlot; attempt++) {
      result = await assembleOne(nextNumber, exclude, deviceUsage, tier);
      if ('id' in result) break;
      if ('noGridFound' in result) break; // pool exhausted, no point retrying
      // A specific word failed generation — blacklist it so future grid
      // solves (this attempt and any later puzzle) skip it, then retry
      // this slot with a fresh grid rather than aborting the whole run.
      console.log(`  blacklisting "${result.failedAnswer}" and retrying this slot`);
      exclude.add(result.failedAnswer.toUpperCase());
    }
    if (result && 'noGridFound' in result) {
      console.log('Word pool exhausted — stopping.');
      break;
    }
    if (!result || !('id' in result)) {
      console.log(`Giving up on puzzle ${nextNumber} after ${maxAttemptsPerSlot} attempts, moving on.`);
      nextNumber++;
      continue;
    }
    if (manifest.puzzles.includes(result.id)) {
      throw new Error(`Refusing to add duplicate manifest entry for ${result.id}`);
    }
    manifest.puzzles.push(result.id);
    // Save after every successful puzzle, not just at the end — a crash or
    // interrupted run should never lose already-completed work.
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
    // manifest.json stays the full archive/back-play list (every puzzle
    // ever built, either tier); daily.json is the separate date -> id
    // mapping the app's daily mode actually reads.
    writeDailyEntry(tier, result.id);
    nextNumber++;
    built++;
  }

  console.log(`\nManifest now has ${manifest.puzzles.length} puzzles (${built} ${tier} puzzle(s) built this run).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
