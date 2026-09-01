#!/usr/bin/env node
// Rebuilds app/puzzles/daily.json — the date -> puzzle mapping the game's
// daily mode reads — from whatever puzzle files exist on disk.
// Run with: npx tsx scripts/scheduleDaily.ts [hardEveryNDays] [startDate]
//
// Kept separate from assemblePuzzles.ts on purpose: making a puzzle and
// deciding which day it lands on are different jobs, and rescheduling
// shouldn't mean regenerating. assemblePuzzles.ts appends each new puzzle
// to the next open slot for its own tier, which pairs a hard puzzle with a
// standard one on every single day; this lays them out deliberately
// instead, spacing the hard ones through the run so most days are an
// ordinary puzzle and a harder one turns up periodically.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PUZZLES_DIR = join(process.cwd(), '..', 'app', 'puzzles');
const DAILY_PATH = join(PUZZLES_DIR, 'daily.json');

const HARD_EVERY_N_DAYS = Number(process.argv[2] ?? '4');
const START = process.argv[3] ?? new Date().toISOString().slice(0, 10);

function puzzleIds(prefix: RegExp): string[] {
  if (!existsSync(PUZZLES_DIR)) return [];
  return readdirSync(PUZZLES_DIR)
    .filter((f) => prefix.test(f))
    .map((f) => f.replace(/\.json$/, ''))
    // Numeric order, not lexicographic, so puzzle-9 precedes puzzle-10.
    .sort((a, b) => Number(a.match(/(\d+)$/)![1]) - Number(b.match(/(\d+)$/)![1]));
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function main() {
  const standard = puzzleIds(/^puzzle-\d+\.json$/);
  const hard = puzzleIds(/^puzzle-h-\d+\.json$/);

  if (standard.length === 0) {
    console.error('No standard puzzles found — nothing to schedule.');
    process.exit(1);
  }

  // One puzzle per day. Standard fills the run; every Nth day swaps in a
  // hard one instead, so the harder puzzles are spread through rather than
  // clustered at the start or doubled up alongside every standard day.
  const days: Record<string, { standard?: string; hard?: string }> = {};
  let s = 0;
  let h = 0;
  let day = 0;

  while (s < standard.length || h < hard.length) {
    const date = addDays(START, day);
    const wantHard = (day + 1) % HARD_EVERY_N_DAYS === 0;

    if (wantHard && h < hard.length) days[date] = { hard: hard[h++] };
    else if (s < standard.length) days[date] = { standard: standard[s++] };
    else if (h < hard.length) days[date] = { hard: hard[h++] };

    day++;
    if (day > 3650) throw new Error('Refusing to schedule more than 10 years out');
  }

  writeFileSync(DAILY_PATH, JSON.stringify({ days }, null, 2) + '\n');

  const dates = Object.keys(days).sort();
  const hardDates = dates.filter((d) => days[d].hard);
  console.log(`Scheduled ${dates.length} days: ${dates[0]} -> ${dates[dates.length - 1]}`);
  console.log(`  ${standard.length} standard, ${hard.length} hard (a hard one every ${HARD_EVERY_N_DAYS} days)`);
  console.log(`  hard days: ${hardDates.join(', ')}`);
}

main();
