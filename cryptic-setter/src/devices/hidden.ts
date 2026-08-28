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

// A split where nearly the whole answer already sits inside one host word
// (leaving the other host to supply just a letter or two) barely hides
// anything — e.g. SEARCHES split as "SEARCH" + "ES" inside RESEARCH/espana
// reads as almost-plaintext, since RESEARCH already visibly ends in a
// near-complete run of the answer. Requiring each side to supply a real
// share of the answer forces a genuine cross-boundary join instead of a
// token letter or two tacked onto an already-obvious chunk.
const MIN_SPLIT_SHARE = 0.3;
function minSplitLength(answerLength: number): number {
  return Math.max(2, Math.ceil(answerLength * MIN_SPLIT_SHARE));
}

// Scans every split point and ranks what it finds — both hosts common is
// best, one host common is a fallback, neither common is discarded rather
// than used, since that's how "METAPHYSIC IANTHINE"-style unreadable
// surfaces got through before. Scanning the whole answer (not stopping at
// the first split point with any legal host pair) also means a later split
// with better hosts isn't skipped just because an earlier, worse one
// happened to come first.
function findHiddenHost(answer: string): { before: string; after: string } | null {
  const target = answer.toUpperCase();
  const words = getAllWords();
  const bothCommon: { before: string; after: string }[] = [];
  const oneCommon: { before: string; after: string }[] = [];
  const minSide = minSplitLength(target.length);

  for (let split = 1; split < target.length; split++) {
    const left = target.slice(0, split);
    const right = target.slice(split);
    if (left.length < minSide || right.length < minSide) continue;

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
    const host = { before: preferShort(befores), after: preferShort(afters) };
    if (hasCommonBefore && hasCommonAfter) bothCommon.push(host);
    else if (hasCommonBefore || hasCommonAfter) oneCommon.push(host);
  }

  if (bothCommon.length > 0) return pickRandom(bothCommon);
  if (oneCommon.length > 0) return pickRandom(oneCommon);
  return null;
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
