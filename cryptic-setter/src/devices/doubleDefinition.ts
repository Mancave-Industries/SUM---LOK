// Tier 3 device: double definition. Two genuinely distinct WordNet senses
// of the same answer word, given back to back with no linking indicator at
// all — that's the classic form ("Fair game for the carnival" for FAIR).
// Both senses are precomputed offline into double-def-pool.json (see
// scripts/buildDoubleDefPool.ts) since picking two non-overlapping senses
// needs an async WordNet lookup but construct() must stay synchronous. A
// judgement device (tier 3): never auto-shipped, always routed to the
// review queue before it can reach a real puzzle.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { pickRandom } from './random.js';

const here = dirname(fileURLToPath(import.meta.url));

interface DoubleDefPair {
  answer: string;
  defA: string;
  defB: string;
}

let cachedPool: Record<string, DoubleDefPair[]> | null = null;
function loadPool(): Record<string, DoubleDefPair[]> {
  if (!cachedPool) {
    const path = join(here, '..', 'data', 'double-def-pool.json');
    cachedPool = JSON.parse(readFileSync(path, 'utf8'));
  }
  return cachedPool!;
}

function pairsFor(answer: string): DoubleDefPair[] {
  const pool = loadPool();
  const byLength = pool[String(answer.length)] ?? [];
  return byLength.filter((p) => p.answer === answer.toUpperCase());
}

export const doubleDefinitionDevice: DeviceModule = {
  type: 'doubleDefinition',
  tier: 3,

  // Deliberately does NOT early-return on an empty indicatorBank, unlike
  // every other device — classic double-definition clues use no linking
  // indicator between the two halves at all.
  construct(answer, _indicatorBank) {
    const candidates = pairsFor(answer);
    if (candidates.length === 0) return null;

    const { defA, defB } = pickRandom(candidates);
    const wordplay: Wordplay = {
      fodder: defB.toUpperCase(),
      suggestedDefinition: defA,
      operation: `doubleDefinition(${answer.toUpperCase()}, defA="${defA}", defB="${defB}")`,
    };
    return { device: 'doubleDefinition', wordplay };
  },

  verifyMechanics(answer, wordplay, _indicatorBank): VerificationResult {
    const log: string[] = [];
    const { fodder, suggestedDefinition } = wordplay;

    if (!fodder || !suggestedDefinition) {
      return { passed: false, log: ['✗ doubleDefinition device requires both fodder (defB) and suggestedDefinition (defA)'] };
    }

    const registered = pairsFor(answer).some(
      (p) =>
        p.defA.toUpperCase() === suggestedDefinition.toUpperCase() &&
        p.defB.toUpperCase() === fodder.toUpperCase()
    );
    if (!registered) {
      log.push(
        `✗ ("${suggestedDefinition}", "${fodder}") is not a registered double-definition pair for "${answer}"`
      );
      return { passed: false, log };
    }
    log.push(
      `✓ "${suggestedDefinition}" and "${fodder}" are registered as two distinct senses of "${answer}"`
    );

    return { passed: true, log };
  },
};
