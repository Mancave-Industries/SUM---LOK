// Tier 2 device: deletion. A real dictionary source word, one letter (or
// more) longer than the answer, has letters dropped according to a
// specific type — behead (drop first letter), curtail (drop last), or gut
// (drop everything except the first and last letter) — leaving the
// answer. The indicator word itself carries which type applies; it isn't
// stored separately, it's re-derived by looking the indicator up in the
// typed indicator bank, the same way every other device re-derives its
// claims from scratch.

import type { DeviceModule, VerificationResult, Wordplay } from '../types.js';
import { getAllWords, isDictionaryWord } from './dictionary.js';
import { pickRandom } from './random.js';
import deletionIndicatorData from '../data/indicators/deletion.json' with { type: 'json' };

type DeletionType = 'behead' | 'curtail' | 'gut';

interface DeletionIndicatorEntry {
  word: string;
  type: DeletionType;
}

const deletionIndicators = deletionIndicatorData as DeletionIndicatorEntry[];

function applyDeletion(source: string, type: DeletionType): string {
  switch (type) {
    case 'behead':
      return source.slice(1);
    case 'curtail':
      return source.slice(0, -1);
    case 'gut':
      return source[0] + source[source.length - 1];
  }
}

interface DeletionCandidate {
  source: string;
  type: DeletionType;
}

function findDeletionSource(answer: string): DeletionCandidate | null {
  const target = answer.toUpperCase();
  const words = getAllWords();
  const candidates: DeletionCandidate[] = [];

  for (const word of words) {
    const upper = word.toUpperCase();
    if (upper.length === target.length + 1) {
      if (upper.endsWith(target)) candidates.push({ source: upper, type: 'behead' });
      if (upper.startsWith(target)) candidates.push({ source: upper, type: 'curtail' });
    }
    if (target.length === 2 && upper.length >= 3) {
      if (upper[0] === target[0] && upper[upper.length - 1] === target[1]) {
        candidates.push({ source: upper, type: 'gut' });
      }
    }
  }

  if (candidates.length === 0) return null;
  return pickRandom(candidates);
}

export const deletionDevice: DeviceModule = {
  type: 'deletion',
  tier: 2,

  construct(answer, indicatorBank) {
    if (indicatorBank.length === 0) return null;
    const candidate = findDeletionSource(answer);
    if (!candidate) return null;

    // Only offer indicators that are both the right type for this
    // candidate AND actually present in the bank the caller supplied —
    // the full deletion-indicators file is a superset used for type
    // lookup, not an implicit override of what construct() may pick from.
    const allowed = new Set(indicatorBank.map((word) => word.toLowerCase()));
    const matchingIndicators = deletionIndicators.filter(
      (entry) => entry.type === candidate.type && allowed.has(entry.word.toLowerCase())
    );
    if (matchingIndicators.length === 0) return null;
    const indicator = pickRandom(matchingIndicators).word;

    const wordplay: Wordplay = {
      indicator,
      fodder: candidate.source,
      operation: `deletion(${answer.toUpperCase()}, type=${candidate.type}, source=${candidate.source})`,
    };
    return { device: 'deletion', wordplay };
  },

  verifyMechanics(answer, wordplay, indicatorBank): VerificationResult {
    const log: string[] = [];
    const { fodder: source, indicator } = wordplay;

    if (!source) {
      return { passed: false, log: ['✗ no source word provided for deletion device'] };
    }
    if (!indicator) {
      return { passed: false, log: ['✗ no indicator provided for deletion device'] };
    }

    const sourceUpper = source.toUpperCase();
    if (!isDictionaryWord(sourceUpper)) {
      log.push(`✗ "${source}" is not a real dictionary word`);
      return { passed: false, log };
    }
    log.push(`✓ "${source}" is a real dictionary word`);

    const indicatorEntry = deletionIndicators.find(
      (entry) => entry.word.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorEntry) {
      log.push(`✗ indicator "${indicator}" is not a recognized deletion indicator`);
      return { passed: false, log };
    }
    log.push(`✓ indicator "${indicator}" identifies deletion type "${indicatorEntry.type}"`);

    if (
      (indicatorEntry.type === 'behead' || indicatorEntry.type === 'curtail') &&
      sourceUpper.length < 2
    ) {
      log.push(`✗ source "${source}" is too short to ${indicatorEntry.type}`);
      return { passed: false, log };
    }
    if (indicatorEntry.type === 'gut' && sourceUpper.length < 3) {
      log.push(`✗ source "${source}" is too short to gut`);
      return { passed: false, log };
    }

    const derived = applyDeletion(sourceUpper, indicatorEntry.type);
    const answerUpper = answer.toUpperCase();
    if (derived !== answerUpper) {
      log.push(
        `✗ ${indicatorEntry.type}-ing "${source}" gives "${derived}", not the answer "${answer}"`
      );
      return { passed: false, log };
    }
    log.push(`✓ ${indicatorEntry.type}-ing "${source}" gives the answer "${answer}"`);

    const indicatorMatch = indicatorBank.some(
      (candidate) => candidate.toLowerCase() === indicator.toLowerCase()
    );
    if (!indicatorMatch) {
      log.push(`✗ indicator "${indicator}" is not in the deletion indicator bank`);
      return { passed: false, log };
    }

    return { passed: true, log };
  },
};
