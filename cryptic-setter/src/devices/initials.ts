// Tier 1 device: initial letters. The first letter of each of several
// consecutive words in the wordplay text, read in order, spells the
// answer. construct() picks one short seed word per letter as raw material
// for the LLM; verifySurface checks the actual rendered wordplay text for
// any run of consecutive words whose initials spell the answer — the LLM
// is free to substitute its own words as long as that pattern holds.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { getAllWords } from './dictionary.js';
import { pickRandom } from './random.js';

function findSeedWordStartingWith(letter: string): string | null {
  const candidates = getAllWords().filter(
    (w) => w.length >= 3 && w.length <= 7 && w[0].toUpperCase() === letter
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.length - b.length);
  const shortlist = candidates.slice(0, Math.min(50, candidates.length));
  return pickRandom(shortlist).toUpperCase();
}

function verifyInitialsInSurface(answer: string, text: string): VerificationResult {
  const words = text.match(/[A-Za-z]+/g) ?? [];
  const initials = words.map((w) => w[0].toUpperCase());
  const target = answer.toUpperCase();

  for (let start = 0; start + target.length <= initials.length; start++) {
    const slice = initials.slice(start, start + target.length).join('');
    if (slice === target) {
      return {
        passed: true,
        log: [
          `✓ "${answer}" found as the initials of ${target.length} consecutive words in the wordplay text`,
        ],
      };
    }
  }

  return {
    passed: false,
    log: [
      `✗ no run of ${target.length} consecutive words in the wordplay text has initials spelling "${answer}"`,
    ],
  };
}

export const initialsDevice: DeviceModule = {
  type: 'initials',
  tier: 1,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;

    const components: string[] = [];
    for (const letter of answer.toUpperCase()) {
      const word = findSeedWordStartingWith(letter);
      if (!word) return null;
      components.push(word);
    }

    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      components,
      operation: `initials(${answer.toUpperCase()}, words=[${components.join(', ')}])`,
    };
    return { device: 'initials', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { components, indicator } = wordplay;

    if (!components || components.length !== answer.length) {
      return {
        passed: false,
        log: [`✗ initials device requires exactly ${answer.length} seed words`],
      };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for initials device'] };
    }

    const answerUpper = answer.toUpperCase();
    const initials = components.map((w) => w[0].toUpperCase()).join('');
    if (initials !== answerUpper) {
      log.push(`✗ seed word initials "${initials}" do not spell the answer "${answer}"`);
      return { passed: false, log };
    }
    log.push(`✓ seed word initials spell the answer "${answer}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the initials indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in initials indicator bank`);

    return { passed: true, log };
  },

  verifySurface(answer, wordplayText) {
    return verifyInitialsInSurface(answer, wordplayText);
  },
};
