#!/usr/bin/env node
// One-time offline generator for the homophone device's pool. Run with:
// npx tsx scripts/buildHomophonePairs.ts
// Re-run only if wordlistsByLength.json or the CMU dictionary version changes.
//
// A real homophone clue never spells out the word that actually sounds like
// the answer ("phoneticSource") — it gives a synonym of it instead (e.g.
// "Bloom, they say, needed for bread (5)" -> FLOUR, where "bloom" is a
// synonym of "flower", which sounds like "flour"). That means a fair,
// mechanically-checkable pair needs TWO independently verifiable facts:
//   1. phoneticSource sounds like answer (checked here via the CMU
//      Pronouncing Dictionary's ARPAbet transcriptions, stress markers
//      stripped since stress doesn't affect whether two words are
//      homophones).
//   2. fodder (the word actually shown in the clue) is a genuine WordNet
//      synonym of phoneticSource (reuses src/definitions/wordnet.ts).
//
// Both restrictions mirror buildDevicePools.ts's precedent: the ANSWER side
// is restricted to wordlistsByLength.json (the pool the grid solver actually
// draws from), the phoneticSource side to isDictionaryWord (real words only
// — cmudict includes plenty of proper nouns and informal spellings that
// isDictionaryWord filters out).
//
// Expect this pool to be thin — homophone pairs are already rare (CMU-dict
// coverage of true homophones is a small slice of the language), and
// requiring a WordNet synonym on top of that is a second independent
// rarity filter, similar in spirit to why reversal/alternates only
// surfaced 17 usable pairs total. Treat the output as a draft needing a
// manual spot-check pass before any clue is generated from it.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dictionary } from 'cmu-pronouncing-dictionary';
import { isDictionaryWord } from '../src/devices/dictionary.js';
import { getSynonymSets } from '../src/definitions/wordnet.js';
import wordlistsByLength from '../src/data/wordlistsByLength.json' with { type: 'json' };

const pools = wordlistsByLength as Record<string, string[]>;
const LENGTHS = Object.keys(pools);

interface HomophonePair {
  answer: string;
  phoneticSource: string;
  fodder: string;
}

// Strip ARPAbet stress digits (0/1/2 suffixed to vowel phonemes) so two
// words that differ only in stress placement still group together — stress
// doesn't change whether they're homophones.
function phoneticSignature(pronunciation: string): string {
  return pronunciation.replace(/\d/g, '');
}

function buildSignatureGroups(): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [word, pronunciation] of Object.entries(dictionary)) {
    if (!/^[a-z]+$/.test(word)) continue; // skip apostrophes/multi-word entries
    const signature = phoneticSignature(pronunciation as string);
    const list = groups.get(signature);
    if (list) list.push(word);
    else groups.set(signature, [word]);
  }
  return groups;
}

// A synonym drawn from WordNet can be a multi-word phrase joined with
// underscores ("take_heed") — kept as a display-ready phrase (spaces, not
// underscores) but only single-word synonyms are used as fodder here, to
// keep the surface-writer prompt and verifySurface check simple (a literal
// verbatim substring match, same as every other fodder-based device).
function candidateSynonyms(synonymSets: string[][], exclude: Set<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const set of synonymSets) {
    for (const synonym of set) {
      if (synonym.includes('_')) continue; // multi-word — skip for now
      const lower = synonym.toLowerCase();
      if (exclude.has(lower) || seen.has(lower)) continue;
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

async function buildHomophonePool(): Promise<Record<string, HomophonePair[]>> {
  const groups = buildSignatureGroups();
  const result: Record<string, HomophonePair[]> = {};

  for (const length of LENGTHS) {
    const pairs: HomophonePair[] = [];
    for (const word of pools[length]) {
      const answer = word.toLowerCase();
      const pronunciation = dictionary[answer];
      if (!pronunciation) continue;

      const signature = phoneticSignature(pronunciation);
      const spellings = groups.get(signature) ?? [];
      const candidates = spellings.filter((s) => s !== answer && isDictionaryWord(s));

      for (const candidate of candidates) {
        const synonymSets = await getSynonymSets(candidate);
        const exclude = new Set([answer, candidate]);
        const synonyms = candidateSynonyms(synonymSets, exclude);
        if (synonyms.length === 0) continue;

        pairs.push({
          answer: answer.toUpperCase(),
          phoneticSource: candidate.toUpperCase(),
          fodder: synonyms[0],
        });
      }
    }
    result[length] = pairs;
  }
  return result;
}

async function main() {
  console.log('Scanning CMU dictionary + WordNet for homophone pairs...');
  const pool = await buildHomophonePool();
  for (const length of LENGTHS) {
    console.log(`  length ${length}: ${pool[length].length} pairs`);
  }
  const dataDir = join(process.cwd(), 'src', 'data');
  writeFileSync(join(dataDir, 'homophone-pool.json'), JSON.stringify(pool, null, 2) + '\n');
  console.log('\nDone. Spot-check src/data/homophone-pool.json before generating any clues from it.');
}

main();
