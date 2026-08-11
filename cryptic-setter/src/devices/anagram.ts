// Tier 1 device: anagram. Fodder is a real dictionary word whose letters
// rearrange exactly into the answer; an indicator from the curated bank
// signals the rearrangement to the solver.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { findAnagramCandidates } from './dictionary.js';
import { pickRandom } from './random.js';
import { preferCommon } from './commonWords.js';

function sortedLetters(word: string): string {
  return word.toUpperCase().replace(/[^A-Z]/g, '').split('').sort().join('');
}

export const anagramDevice: DeviceModule = {
  type: 'anagram',
  tier: 1,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;

    const candidates = findAnagramCandidates(answer);
    if (candidates.length === 0) return null;

    // Prefer a fodder word a solver would actually recognize ("radwaste")
    // over an obscure-but-valid one ("dumaists") whenever a common option
    // exists among this answer's anagrams.
    const fodder = pickRandom(preferCommon(candidates));
    const indicator = pickRandom(indicatorBank);

    const wordplay: Wordplay = {
      indicator,
      fodder,
      operation: `anagram(${answer.toUpperCase()}, fodder=${fodder})`,
    };

    return { device: 'anagram', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { fodder, indicator } = wordplay;

    if (!fodder) {
      return { passed: false, log: ['✗ no fodder provided for anagram device'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for anagram device'] };
    }

    const answerUpper = answer.toUpperCase();
    const fodderUpper = fodder.toUpperCase();

    if (fodderUpper === answerUpper) {
      log.push(`✗ fodder "${fodder}" is identical to the answer "${answer}"`);
      return { passed: false, log };
    }
    log.push(`✓ fodder "${fodder}" is a different word from the answer`);

    const fodderSorted = sortedLetters(fodder);
    const answerSorted = sortedLetters(answer);
    if (fodderSorted !== answerSorted) {
      log.push(
        `✗ fodder letters (${fodderSorted}) do not match answer letters (${answerSorted}) when sorted`
      );
      return { passed: false, log };
    }
    log.push(
      `✓ fodder letters (${fodderSorted}) match answer letters (${answerSorted}) when sorted`
    );

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the anagram indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in anagram indicator bank`);

    return { passed: true, log };
  },
};
