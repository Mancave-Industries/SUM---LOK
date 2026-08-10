// Thin promise wrapper around `natural`'s WordNet interface, plus a
// synonym-set accessor used by the deterministic definition verifier
// (verify/definition.ts). WordNet data is bundled locally — no network
// call, no LLM involved.

import natural from 'natural';

const wordnet = new natural.WordNet();

interface WordNetSense {
  synonyms: string[];
  gloss: string;
  pos: string;
}

function lookup(word: string): Promise<WordNetSense[]> {
  return new Promise((resolve) => {
    wordnet.lookup(word, (results: WordNetSense[]) => resolve(results));
  });
}

// One array of synonyms per WordNet sense ("synset") of the word — e.g.
// "listen" -> [["heed","mind","listen"], ["listen","hear","take_heed"], ...]
export async function getSynonymSets(word: string): Promise<string[][]> {
  const senses = await lookup(word.toLowerCase());
  return senses.map((sense) => sense.synonyms);
}
