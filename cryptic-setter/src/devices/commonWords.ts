// A word being "in the dictionary" only means it's spellable — the
// word-list package includes plenty of real but obscure vocabulary
// ("nival", "ianthine") that produces technically-fair but unreadable
// surfaces. This is a frequency-ranked list of the 10,000 most common
// English words, used to bias device construction toward recognizable
// vocabulary without hand-curating word lists per device.
import commonWordsList from '../data/commonWords.json' with { type: 'json' };

const commonWords = new Set(commonWordsList as string[]);

export function isCommonWord(word: string): boolean {
  return commonWords.has(word.toUpperCase());
}

// Filters to the common-word subset if any exist, otherwise returns the
// original list unchanged — so this never turns a valid candidate set
// empty, it only narrows it when a better option is available.
export function preferCommon(candidates: string[]): string[] {
  const common = candidates.filter(isCommonWord);
  return common.length > 0 ? common : candidates;
}
