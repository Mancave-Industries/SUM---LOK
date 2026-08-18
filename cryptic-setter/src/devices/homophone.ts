// Tier 3 device: homophone. The answer sounds like some other word
// (phoneticSource) when spoken; the clue never spells phoneticSource out —
// it gives a genuine synonym of it instead (fodder), plus a "sounds like"
// indicator. Both facts (the sound-alike relationship and the synonym
// relationship) are precomputed offline into homophone-pool.json — see
// scripts/buildHomophonePairs.ts — since construct()/verifyMechanics() must
// stay synchronous but building the pool needs CMU-dictionary and WordNet
// lookups. A judgement device (tier 3): never auto-shipped, always routed
// to the review queue before it can reach a real puzzle.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { pickRandom } from './random.js';

const here = dirname(fileURLToPath(import.meta.url));

interface HomophonePair {
  answer: string;
  phoneticSource: string;
  fodder: string;
}

let cachedPool: Record<string, HomophonePair[]> | null = null;
function loadPool(): Record<string, HomophonePair[]> {
  if (!cachedPool) {
    const path = join(here, '..', 'data', 'homophone-pool.json');
    cachedPool = JSON.parse(readFileSync(path, 'utf8'));
  }
  return cachedPool!;
}

function pairsFor(answer: string): HomophonePair[] {
  const pool = loadPool();
  const byLength = pool[String(answer.length)] ?? [];
  return byLength.filter((p) => p.answer === answer.toUpperCase());
}

export const homophoneDevice: DeviceModule = {
  type: 'homophone',
  tier: 3,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;
    const candidates = pairsFor(answer);
    if (candidates.length === 0) return null;

    const { phoneticSource, fodder } = pickRandom(candidates);
    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      fodder: fodder.toUpperCase(),
      phoneticSource: phoneticSource.toUpperCase(),
      operation: `homophone(${answer.toUpperCase()}, soundsLike=${phoneticSource.toUpperCase()}, cluedAs=${fodder.toUpperCase()})`,
    };
    return { device: 'homophone', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { fodder, phoneticSource, indicator } = wordplay;

    if (!fodder || !phoneticSource) {
      return { passed: false, log: ['✗ homophone device requires both fodder and phoneticSource'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for homophone device'] };
    }

    const registered = pairsFor(answer).some(
      (p) =>
        p.phoneticSource.toUpperCase() === phoneticSource.toUpperCase() &&
        p.fodder.toUpperCase() === fodder.toUpperCase()
    );
    if (!registered) {
      log.push(
        `✗ ("${phoneticSource}" sounds like "${answer}", clued as "${fodder}") is not a registered pair in the homophone pool`
      );
      return { passed: false, log };
    }
    log.push(`✓ "${phoneticSource}" is a registered homophone of "${answer}", cluable as "${fodder}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the homophone indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in homophone indicator bank`);

    return { passed: true, log };
  },

  // The generic fodder check in generateClue.ts already confirms `fodder`
  // appears verbatim. What's specific to homophone is the negative claim:
  // phoneticSource (the word that actually sounds like the answer) must
  // NOT appear anywhere in the wordplay text, or the clue gives itself away
  // directly instead of relying on the sound-alike misdirection.
  verifySurface(answer, wordplay, wordplayText) {
    const { phoneticSource } = wordplay;
    if (!phoneticSource) {
      return { passed: false, log: ['✗ no phoneticSource on wordplay to check against the surface'] };
    }
    const textUpper = wordplayText.toUpperCase();
    const sourceUpper = phoneticSource.toUpperCase();
    const pattern = new RegExp(`\\b${sourceUpper}\\b`);
    if (pattern.test(textUpper)) {
      return {
        passed: false,
        log: [`✗ "${phoneticSource}" (the actual homophone) appears verbatim in the wordplay text — gives the answer away`],
      };
    }
    return {
      passed: true,
      log: [`✓ "${phoneticSource}" does not appear in the wordplay text — only its synonym does`],
    };
  },
};
