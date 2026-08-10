// Tier 1 device: reversal. Fodder is a real dictionary word which, spelt
// backwards, gives the answer exactly.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { isDictionaryWord } from './dictionary.js';
import { pickRandom } from './random.js';

function reverse(word: string): string {
  return word.toUpperCase().split('').reverse().join('');
}

export const reversalDevice: DeviceModule = {
  type: 'reversal',
  tier: 1,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;

    const reversed = reverse(answer);
    if (reversed === answer.toUpperCase()) return null; // palindrome — not a fair reversal
    if (!isDictionaryWord(reversed)) return null;

    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      fodder: reversed,
      operation: `reversal(${answer.toUpperCase()}, fodder=${reversed})`,
    };
    return { device: 'reversal', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { fodder, indicator } = wordplay;

    if (!fodder) {
      return { passed: false, log: ['✗ no fodder provided for reversal device'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for reversal device'] };
    }

    const answerUpper = answer.toUpperCase();
    const fodderUpper = fodder.toUpperCase();

    if (fodderUpper === answerUpper) {
      log.push(`✗ fodder "${fodder}" is identical to the answer "${answer}"`);
      return { passed: false, log };
    }
    log.push(`✓ fodder "${fodder}" is a different word from the answer`);

    const reversedFodder = reverse(fodder);
    if (reversedFodder !== answerUpper) {
      log.push(`✗ fodder "${fodder}" reversed is "${reversedFodder}", not the answer "${answer}"`);
      return { passed: false, log };
    }
    log.push(`✓ fodder "${fodder}" reversed spells the answer "${answer}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the reversal indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in reversal indicator bank`);

    return { passed: true, log };
  },
};
