// Shared dictionary lookups used by devices that need to know whether a
// string of letters is a real English word (anagram fodder, hidden-word
// checks, etc). Backed by the `word-list` package — a plain list of ~275k
// valid English words, loaded once and cached.

import { readFileSync } from 'node:fs';
// word-list's default export is the filesystem path to a newline-separated
// word list.
import wordListPath from 'word-list';

let cachedWords: string[] | null = null;

function loadWords(): string[] {
  if (!cachedWords) {
    cachedWords = readFileSync(wordListPath, 'utf8').split('\n').filter(Boolean);
  }
  return cachedWords;
}

function sortedLetters(word: string): string {
  return word.toUpperCase().split('').sort().join('');
}

// Every dictionary word that is a genuine rearrangement of `answer`'s
// letters: same length, same letters, not the answer itself.
export function findAnagramCandidates(answer: string): string[] {
  const target = sortedLetters(answer);
  const answerUpper = answer.toUpperCase();
  const candidates: string[] = [];

  for (const word of loadWords()) {
    if (word.length !== answer.length) continue;
    if (!/^[a-z]+$/.test(word)) continue;
    const upper = word.toUpperCase();
    if (upper === answerUpper) continue;
    if (sortedLetters(word) === target) candidates.push(upper);
  }

  return candidates;
}
