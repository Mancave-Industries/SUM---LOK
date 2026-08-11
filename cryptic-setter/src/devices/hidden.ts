// Tier 1 device: hidden word. The answer is buried across the join of two
// real words, spanning the boundary between them — never fully inside one
// word. construct() finds a legal host pair as raw material for the LLM;
// the real fairness check (verifySurface) runs against whatever surface the
// LLM actually wrote, since that's what a solver would really be reading.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { getAllWords } from './dictionary.js';
import { pickRandom } from './random.js';
import { isCommonWord, preferCommon } from './commonWords.js';

// Among all legal candidates, prefer real common words first (real
// word-frequency data, not just "in the dictionary" — the word-list
// package includes plenty of real but obscure vocabulary like "arthrodeses"
// that's technically fair but unreadable). Within whichever pool that
// leaves, shorter is still a reasonable secondary proxy for "ordinary".
function preferShort(words: string[], shortlistSize = 30): string {
  const pool = preferCommon(words);
  const sorted = [...pool].sort((a, b) => a.length - b.length);
  const shortlist = sorted.slice(0, Math.min(shortlistSize, sorted.length));
  return pickRandom(shortlist).toUpperCase();
}

// Scans every split point rather than stopping at the first one with any
// legal host pair — otherwise a split whose only hosts are obscure
// ("METAPHYSIC IANTHINE") wins by default over a later split point that
// would have had common-word hosts available, just because it happened to
// come first.
function findHiddenHost(answer: string): { before: string; after: string } | null {
  const target = answer.toUpperCase();
  const words = getAllWords();
  let fallback: { before: string; after: string } | null = null;

  for (let split = 1; split < target.length; split++) {
    const left = target.slice(0, split);
    const right = target.slice(split);

    const befores = words.filter(
      (w) => w.length > left.length && w.toUpperCase().endsWith(left)
    );
    if (befores.length === 0) continue;

    const afters = words.filter(
      (w) => w.length > right.length && w.toUpperCase().startsWith(right)
    );
    if (afters.length === 0) continue;

    const hasCommonBefore = befores.some(isCommonWord);
    const hasCommonAfter = afters.some(isCommonWord);
    if (hasCommonBefore && hasCommonAfter) {
      return { before: preferShort(befores), after: preferShort(afters) };
    }
    if (!fallback) fallback = { before: preferShort(befores), after: preferShort(afters) };
  }

  return fallback;
}

// Splits the surface text into words, then checks whether the answer
// appears as a contiguous run of letters (ignoring spaces/punctuation) that
// crosses at least one real word boundary — the actual solver-facing rule.
function verifyHiddenInSurface(answer: string, text: string): VerificationResult {
  const words = text.toUpperCase().match(/[A-Z]+/g) ?? [];
  const concatenated = words.join('');

  const boundaries: number[] = [];
  let offset = 0;
  for (const word of words) {
    offset += word.length;
    boundaries.push(offset);
  }
  const internalBoundaries = boundaries.slice(0, -1);

  const target = answer.toUpperCase();
  let idx = concatenated.indexOf(target);
  while (idx !== -1) {
    const end = idx + target.length;
    if (internalBoundaries.some((b) => b > idx && b < end)) {
      return {
        passed: true,
        log: [`✓ "${answer}" appears spanning a real word boundary in the wordplay text`],
      };
    }
    idx = concatenated.indexOf(target, idx + 1);
  }

  return {
    passed: false,
    log: [
      `✗ "${answer}" does not appear spanning a word boundary anywhere in the wordplay text`,
    ],
  };
}

export const hiddenDevice: DeviceModule = {
  type: 'hidden',
  tier: 1,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;
    const host = findHiddenHost(answer);
    if (!host) return null;

    const indicator = pickRandom(indicatorBank);
    const wordplay: Wordplay = {
      indicator,
      components: [host.before, host.after],
      operation: `hidden(${answer.toUpperCase()}, in="${host.before} ${host.after}")`,
    };
    return { device: 'hidden', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { components, indicator } = wordplay;

    if (!components || components.length !== 2) {
      return { passed: false, log: ['✗ hidden device requires exactly two host words'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for hidden device'] };
    }

    const [before, after] = components;
    const answerUpper = answer.toUpperCase();

    if (before.toUpperCase().includes(answerUpper) || after.toUpperCase().includes(answerUpper)) {
      log.push(
        `✗ "${answer}" is fully contained inside a single host word — must span the boundary`
      );
      return { passed: false, log };
    }

    const joined = (before + after).toUpperCase();
    if (!joined.includes(answerUpper)) {
      log.push(`✗ "${answer}" does not appear in "${before}${after}" at all`);
      return { passed: false, log };
    }
    log.push(`✓ "${answer}" spans the join between "${before}" and "${after}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the hidden-word indicator bank`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" found in hidden-word indicator bank`);

    return { passed: true, log };
  },

  verifySurface(answer, _wordplay, wordplayText) {
    return verifyHiddenInSurface(answer, wordplayText);
  },
};
