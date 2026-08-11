// Tier 2 device: charade. The answer splits into exactly two contiguous
// parts placed end to end (CAR+PET = CARPET); each part must independently
// be a real word or a known abbreviation clue word. Order matters — the
// parts must appear in the surface in the same order they concatenate in.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { findDisplayCandidates, resolveDisplayWord } from './wordResolution.js';
import { pickRandom } from './random.js';
import { isCommonWord, preferCommon } from './commonWords.js';

interface CharadeSplit {
  part1Display: string;
  part2Display: string;
}

// Splits where both parts are recognizable words are best (a "CAR + PET"
// style pairing); a split with only one common side is a fallback; a split
// where NEITHER side is common enough to recognize is rejected outright —
// that's the case that let "CARDI + GAN" through for CARDIGAN, where
// "cardi" is itself just an informal synonym of the answer. Better to let
// the word fail this device and try another than accept a pairing nobody
// would read as two real, separate words.
function findCharadeSplit(answer: string): CharadeSplit | null {
  const target = answer.toUpperCase();
  const bothCommon: CharadeSplit[] = [];
  const oneCommon: CharadeSplit[] = [];

  for (let k = 1; k < target.length; k++) {
    const candidates1 = findDisplayCandidates(target.slice(0, k));
    if (candidates1.length === 0) continue;
    const candidates2 = findDisplayCandidates(target.slice(k));
    if (candidates2.length === 0) continue;

    const common1 = candidates1.some(isCommonWord);
    const common2 = candidates2.some(isCommonWord);
    if (!common1 && !common2) continue;
    const split = {
      part1Display: pickRandom(preferCommon(candidates1)),
      part2Display: pickRandom(preferCommon(candidates2)),
    };
    if (common1 && common2) bothCommon.push(split);
    else oneCommon.push(split);
  }

  if (bothCommon.length > 0) return pickRandom(bothCommon);
  if (oneCommon.length > 0) return pickRandom(oneCommon);
  return null;
}

export const charadeDevice: DeviceModule = {
  type: 'charade',
  tier: 2,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;
    const split = findCharadeSplit(answer);
    if (!split) return null;

    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      components: [split.part1Display, split.part2Display],
      operation: `charade(${answer.toUpperCase()}, parts=[${split.part1Display}, ${split.part2Display}])`,
    };
    return { device: 'charade', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { components, indicator } = wordplay;

    if (!components || components.length !== 2) {
      return { passed: false, log: ['✗ charade device requires exactly two parts'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for charade device'] };
    }

    const [display1, display2] = components;
    const resolutions1 = resolveDisplayWord(display1);
    const resolutions2 = resolveDisplayWord(display2);

    if (resolutions1.length === 0) {
      log.push(`✗ "${display1}" is not a real word or a known abbreviation clue word`);
      return { passed: false, log };
    }
    log.push(`✓ "${display1}" resolves to letters: ${resolutions1.join(', ')}`);

    if (resolutions2.length === 0) {
      log.push(`✗ "${display2}" is not a real word or a known abbreviation clue word`);
      return { passed: false, log };
    }
    log.push(`✓ "${display2}" resolves to letters: ${resolutions2.join(', ')}`);

    const answerUpper = answer.toUpperCase();
    const match = resolutions1.some((a) => resolutions2.some((b) => a + b === answerUpper));
    if (!match) {
      log.push(
        `✗ no combination of "${display1}" + "${display2}" resolutions concatenates to "${answer}"`
      );
      return { passed: false, log };
    }
    log.push(`✓ "${display1}" + "${display2}" concatenates to the answer "${answer}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the charade indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in charade indicator bank`);

    return { passed: true, log };
  },

  verifySurface(_answer, wordplay, wordplayText): VerificationResult {
    const [display1, display2] = wordplay.components ?? [];
    if (!display1 || !display2) {
      return { passed: false, log: ['✗ charade requires two components to check ordering'] };
    }

    const lower = wordplayText.toLowerCase();
    const idx1 = lower.indexOf(display1.toLowerCase());
    const idx2 = lower.indexOf(display2.toLowerCase());

    if (idx1 === -1 || idx2 === -1) {
      return {
        passed: false,
        log: [
          `✗ could not find both charade parts ("${display1}", "${display2}") in the wordplay text`,
        ],
      };
    }
    if (idx1 > idx2) {
      return {
        passed: false,
        log: [
          `✗ "${display1}" appears after "${display2}" in the wordplay text — charade order must be "${display1}" then "${display2}"`,
        ],
      };
    }

    return {
      passed: true,
      log: [`✓ "${display1}" appears before "${display2}" in the wordplay text, matching charade order`],
    };
  },
};
