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

// Charade/container parts are drawn from the answer's own letters, so a
// split can accidentally hand back the answer's own singular/tense/etc as
// one "part" (e.g. SOLDIER + S for SOLDIERS) — mechanically valid, but it
// gives the answer away outright rather than requiring any real wordplay.
// This checks whether `component` is nothing more than `answer` with a
// common English inflectional suffix added or removed.
const TRIVIAL_SUFFIXES = ['s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly'];

export function isTrivialInflectionOfAnswer(component: string, answer: string): boolean {
  const c = component.toLowerCase();
  const a = answer.toLowerCase();
  if (c === a) return true;
  return TRIVIAL_SUFFIXES.some((suffix) => c + suffix === a || a + suffix === c);
}

// A plain `text.includes(word)` treats "dom" as present inside "dominates"
// — real bug found in production: a charade clue for KINGDOM ("King then
// dominates a whole realm") let the LLM bury the DOM part inside an
// ordinary word instead of writing it as its own token, which reads as
// solvable by pattern-matching rather than working out the wordplay (the
// exact complaint that got the hidden-word device's balance rule added
// earlier). Word-boundary matching is what verifySurface for charade and
// container should have been doing from the start.
export function findWholeWordIndex(text: string, word: string): number {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(text);
  return match ? match.index : -1;
}
