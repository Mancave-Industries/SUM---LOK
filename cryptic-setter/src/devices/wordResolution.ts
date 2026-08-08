// Shared letter<->word resolution used by Tier 2 devices (charade,
// container). A charade/container "part" is fair if it's either a real
// dictionary word or a known abbreviation clue word — this module answers
// both directions of that question, re-derivable from scratch each time
// rather than trusted from stored metadata.

import { isDictionaryWord } from './dictionary.js';
import abbreviations from '../data/abbreviations.json' with { type: 'json' };

interface AbbreviationEntry {
  clueWord: string;
  abbr: string;
}

const table = abbreviations as AbbreviationEntry[];

// Every display word that could stand in for this exact letter sequence:
// the letters themselves (if they're a real word) plus any abbreviation
// clue words whose code matches.
export function findDisplayCandidates(letters: string): string[] {
  const upper = letters.toUpperCase();
  const candidates: string[] = [];
  if (isDictionaryWord(upper)) candidates.push(upper);
  for (const entry of table) {
    if (entry.abbr.toUpperCase() === upper) candidates.push(entry.clueWord.toUpperCase());
  }
  return candidates;
}

// Every letter sequence a given display word could resolve to: itself (if
// it's a real word) plus its abbreviation code(s), if it's a known
// abbreviation clue word.
export function resolveDisplayWord(display: string): string[] {
  const upper = display.toUpperCase();
  const resolutions: string[] = [];
  if (isDictionaryWord(upper)) resolutions.push(upper);
  for (const entry of table) {
    if (entry.clueWord.toUpperCase() === upper) resolutions.push(entry.abbr.toUpperCase());
  }
  return resolutions;
}
