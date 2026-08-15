// Tier 2 device: charade. The answer splits into exactly two contiguous
// parts placed end to end (CAR+PET = CARPET); each part must independently
// be a real word or a known abbreviation clue word. Order matters — the
// parts must appear in the surface in the same order they concatenate in.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { findDisplayCandidates, isTrivialInflectionOfAnswer, resolveDisplayWord } from './wordResolution.js';
import { pickRandom } from './random.js';
import { isCommonWord, preferCommon } from './commonWords.js';

interface CharadeSplit {
  part1Display: string;
  part2Display: string;
}

// Only splits where BOTH parts are common, recognizable words are used — a
// "CAR + PET" style pairing. A one-common-side fallback used to exist here,
// but that's exactly what let "CARDI + GAN" through for CARDIGAN ("cardi"
// isn't common, but the split was accepted anyway) and "CAR + NIVAL" for
// CARNIVAL ("nival" isn't a word anyone uses in a sentence — the LLM simply
// cannot write it into fluent English, no matter how it's asked). Better to
// let the word fail this device and try another than force a required
// verbatim word nobody would ever say.
function findCharadeSplit(answer: string): CharadeSplit | null {
  const target = answer.toUpperCase();
  const bothCommon: CharadeSplit[] = [];

  for (let k = 1; k < target.length; k++) {
    const candidates1 = findDisplayCandidates(target.slice(0, k)).filter(
      (w) => !isTrivialInflectionOfAnswer(w, target)
    );
    if (candidates1.length === 0) continue;
    const candidates2 = findDisplayCandidates(target.slice(k)).filter(
      (w) => !isTrivialInflectionOfAnswer(w, target)
    );
    if (candidates2.length === 0) continue;

    if (!candidates1.some(isCommonWord) || !candidates2.some(isCommonWord)) continue;
    bothCommon.push({
      part1Display: pickRandom(preferCommon(candidates1)),
      part2Display: pickRandom(preferCommon(candidates2)),
    });
  }

  if (bothCommon.length === 0) return null;
  return pickRandom(bothCommon);
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
