// Append-only persistence for the clue bank (§9 Phase 4). This is the
// enforcement point for the brief's core invariant: a verified clue with a
// clean definition lands in the live bank; anything reviewRequired (Tier 3
// devices, or a definition that didn't clear WordNet) lands in the review
// queue instead. Nothing reaches the live bank except through
// approveFromReviewQueue — never automatically.
//
// JSON files today; the Clue shape (flat fields, primitive types, no
// nested objects beyond `wordplay`) is already what a Supabase table row
// would look like, so swapping the storage layer later is a matter of
// changing these four functions' bodies, not the schema.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Clue } from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const BANK_PATH = join(here, '..', 'data', 'bank', 'clues.json');
const REVIEW_QUEUE_PATH = join(here, '..', 'data', 'bank', 'review-queue.json');

function readClues(path: string): Clue[] {
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8').trim();
  if (!raw) return [];
  return JSON.parse(raw) as Clue[];
}

function writeClues(path: string, clues: Clue[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(clues, null, 2) + '\n');
}

export interface AppendResult {
  destination: 'bank' | 'review-queue';
  path: string;
  totalInDestination: number;
}

export function appendToBank(clue: Clue): AppendResult {
  if (!clue.verified) {
    throw new Error(`Refusing to persist an unverified clue for "${clue.answer}"`);
  }

  const path = clue.reviewRequired ? REVIEW_QUEUE_PATH : BANK_PATH;
  const clues = readClues(path);
  clues.push(clue);
  writeClues(path, clues);

  return {
    destination: clue.reviewRequired ? 'review-queue' : 'bank',
    path,
    totalInDestination: clues.length,
  };
}

export function readBank(): Clue[] {
  return readClues(BANK_PATH);
}

export function readReviewQueue(): Clue[] {
  return readClues(REVIEW_QUEUE_PATH);
}

// A human clearing a queued clue: move it from the review queue into the
// live bank by id. The only path a reviewRequired clue can take to reach
// the live bank.
export function approveFromReviewQueue(id: string): Clue | null {
  const queue = readReviewQueue();
  const index = queue.findIndex((clue) => clue.id === id);
  if (index === -1) return null;

  const [clue] = queue.splice(index, 1);
  writeClues(REVIEW_QUEUE_PATH, queue);

  const bank = readBank();
  const approved: Clue = { ...clue, reviewRequired: false };
  bank.push(approved);
  writeClues(BANK_PATH, bank);

  return approved;
}

// A human rejecting a queued clue: removed permanently, never reaches the
// live bank. The already-assembled puzzle(s) using this clue's surface
// text are untouched — rejection only stops it from being reused from the
// bank for a future puzzle, same asymmetry approveFromReviewQueue has with
// clues that are already live.
export function rejectFromReviewQueue(id: string): Clue | null {
  const queue = readReviewQueue();
  const index = queue.findIndex((clue) => clue.id === id);
  if (index === -1) return null;

  const [clue] = queue.splice(index, 1);
  writeClues(REVIEW_QUEUE_PATH, queue);
  return clue;
}
