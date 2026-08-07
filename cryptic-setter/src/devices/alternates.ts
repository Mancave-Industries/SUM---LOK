// Tier 1 device: alternate letters. Fodder is a single real dictionary word
// of length 2n-1 whose letters at every other position (0, 2, 4, ...) spell
// the n-letter answer. A single real word matching this exact periodic
// pattern is rare, so this device legitimately skips more often than the
// others — that's a fair, logged skip, not a bug.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { getAllWords } from './dictionary.js';
import { pickRandom } from './random.js';

function extractAlternating(word: string): string {
  return word
    .toUpperCase()
    .split('')
    .filter((_, i) => i % 2 === 0)
    .join('');
}

function findAlternatingHost(answer: string): string | null {
  const target = answer.toUpperCase();
  const expectedLength = target.length * 2 - 1;
  const candidates = getAllWords().filter((w) => w.length === expectedLength);

  for (const word of candidates) {
    if (extractAlternating(word) === target) {
      return word.toUpperCase();
    }
  }
  return null;
}

export const alternatesDevice: DeviceModule = {
  type: 'alternates',
  tier: 1,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;
    const fodder = findAlternatingHost(answer);
    if (!fodder) return null;

    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      fodder,
      operation: `alternates(${answer.toUpperCase()}, fodder=${fodder})`,
    };
    return { device: 'alternates', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { fodder, indicator } = wordplay;

    if (!fodder) {
      return { passed: false, log: ['✗ no fodder provided for alternates device'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for alternates device'] };
    }

    const answerUpper = answer.toUpperCase();
    const fodderUpper = fodder.toUpperCase();
    const expectedLength = answerUpper.length * 2 - 1;

    if (fodderUpper.length !== expectedLength) {
      log.push(
        `✗ fodder "${fodder}" is ${fodderUpper.length} letters, expected ${expectedLength} (2×${answerUpper.length}-1) for alternate letters`
      );
      return { passed: false, log };
    }

    const extracted = extractAlternating(fodderUpper);
    if (extracted !== answerUpper) {
      log.push(
        `✗ every other letter of "${fodder}" spells "${extracted}", not the answer "${answer}"`
      );
      return { passed: false, log };
    }
    log.push(`✓ every other letter of "${fodder}" spells the answer "${answer}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the alternates indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in alternates indicator bank`);

    return { passed: true, log };
  },
};
