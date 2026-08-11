// Tier 2 device: container. One part is inserted inside another — remove
// the inner part's letters from the answer and what's left (the outer
// part, rejoined) must itself resolve to a real word or abbreviation, same
// as the inner part. Unlike charade, position/order in the surface doesn't
// matter — the indicator word ("in", "holding", "around", ...) carries
// that meaning instead.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { findDisplayCandidates, resolveDisplayWord } from './wordResolution.js';
import { pickRandom } from './random.js';
import { preferCommon } from './commonWords.js';

interface ContainerSplit {
  outerDisplay: string;
  innerDisplay: string;
}

// As with charade: prefer splits where both the outer and inner parts have
// a recognizable-word option, only falling back to obscure dictionary
// words when no split offers a common-word choice on both sides.
function findContainerSplit(answer: string): ContainerSplit | null {
  const target = answer.toUpperCase();
  const goodOptions: ContainerSplit[] = [];
  const fallbackOptions: ContainerSplit[] = [];

  for (let i = 1; i < target.length; i++) {
    for (let j = i + 1; j < target.length; j++) {
      const outerLetters = target.slice(0, i) + target.slice(j);
      const innerLetters = target.slice(i, j);
      if (outerLetters.length < 2) continue;

      const outerCandidates = findDisplayCandidates(outerLetters);
      if (outerCandidates.length === 0) continue;
      const innerCandidates = findDisplayCandidates(innerLetters);
      if (innerCandidates.length === 0) continue;

      const commonOuter = preferCommon(outerCandidates);
      const commonInner = preferCommon(innerCandidates);
      const isGood = commonOuter.length < outerCandidates.length && commonInner.length < innerCandidates.length;
      const pool = isGood ? goodOptions : fallbackOptions;
      pool.push({
        outerDisplay: pickRandom(isGood ? commonOuter : outerCandidates),
        innerDisplay: pickRandom(isGood ? commonInner : innerCandidates),
      });
    }
  }

  const options = goodOptions.length > 0 ? goodOptions : fallbackOptions;
  if (options.length === 0) return null;
  return pickRandom(options);
}

export const containerDevice: DeviceModule = {
  type: 'container',
  tier: 2,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;
    const split = findContainerSplit(answer);
    if (!split) return null;

    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      components: [split.outerDisplay, split.innerDisplay],
      operation: `container(${answer.toUpperCase()}, outer=${split.outerDisplay}, inner=${split.innerDisplay})`,
    };
    return { device: 'container', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { components, indicator } = wordplay;

    if (!components || components.length !== 2) {
      return { passed: false, log: ['✗ container device requires exactly two parts'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for container device'] };
    }

    const [outerDisplay, innerDisplay] = components;
    const outerResolutions = resolveDisplayWord(outerDisplay);
    const innerResolutions = resolveDisplayWord(innerDisplay);

    if (outerResolutions.length === 0) {
      log.push(`✗ "${outerDisplay}" is not a real word or a known abbreviation clue word`);
      return { passed: false, log };
    }
    if (innerResolutions.length === 0) {
      log.push(`✗ "${innerDisplay}" is not a real word or a known abbreviation clue word`);
      return { passed: false, log };
    }
    log.push(`✓ "${outerDisplay}" resolves to letters: ${outerResolutions.join(', ')}`);
    log.push(`✓ "${innerDisplay}" resolves to letters: ${innerResolutions.join(', ')}`);

    const target = answer.toUpperCase();
    let found = false;
    for (let i = 1; i < target.length && !found; i++) {
      for (let j = i + 1; j < target.length && !found; j++) {
        const outerPart = target.slice(0, i) + target.slice(j);
        const innerPart = target.slice(i, j);
        if (outerResolutions.includes(outerPart) && innerResolutions.includes(innerPart)) {
          found = true;
        }
      }
    }

    if (!found) {
      log.push(
        `✗ no way to insert "${innerDisplay}" into "${outerDisplay}" reproduces the answer "${answer}"`
      );
      return { passed: false, log };
    }
    log.push(`✓ inserting "${innerDisplay}" into "${outerDisplay}" reproduces the answer "${answer}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the container indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in container indicator bank`);

    return { passed: true, log };
  },

  verifySurface(_answer, wordplay, wordplayText): VerificationResult {
    const [outerDisplay, innerDisplay] = wordplay.components ?? [];
    if (!outerDisplay || !innerDisplay) {
      return { passed: false, log: ['✗ container requires two components to check presence'] };
    }

    const lower = wordplayText.toLowerCase();
    const outerPresent = lower.includes(outerDisplay.toLowerCase());
    const innerPresent = lower.includes(innerDisplay.toLowerCase());

    if (!outerPresent || !innerPresent) {
      return {
        passed: false,
        log: [
          `✗ could not find both container parts ("${outerDisplay}", "${innerDisplay}") in the wordplay text`,
        ],
      };
    }

    return {
      passed: true,
      log: [`✓ both "${outerDisplay}" and "${innerDisplay}" are present in the wordplay text`],
    };
  },
};
