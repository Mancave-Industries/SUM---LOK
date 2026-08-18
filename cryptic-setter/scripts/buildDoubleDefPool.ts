#!/usr/bin/env node
// One-time offline generator for the doubleDefinition device's pool. Run
// with: npx tsx scripts/buildDoubleDefPool.ts
// Re-run only if wordlistsByLength.json changes.
//
// A double-definition clue gives two genuinely distinct meanings of the
// same answer word, back to back, with no wordplay indicator at all — e.g.
// "Fair game for the carnival" for FAIR (fair=reasonable, fair=carnival).
// Both halves have to be real: defA becomes the clue's actual `definition`
// field (so it must be a genuine WordNet synonym of the answer, the same
// convention verify/definition.ts already enforces for every other
// device), and defB is the fodder shown in the wordplay half — a synonym
// from a DIFFERENT, non-overlapping WordNet sense, so it isn't just a
// restatement of defA.
//
// Answers are restricted to wordlistsByLength.json (the grid solver's own
// pool), matching buildDevicePools.ts's precedent.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSynonymSets } from '../src/definitions/wordnet.js';
import wordlistsByLength from '../src/data/wordlistsByLength.json' with { type: 'json' };

const pools = wordlistsByLength as Record<string, string[]>;
const LENGTHS = Object.keys(pools);

interface DoubleDefPair {
  answer: string;
  defA: string;
  defB: string;
}

function normalize(word: string): string {
  return word.toLowerCase().replace(/_/g, ' ').trim();
}

// A displayable synonym from a sense: excludes the answer word itself and
// any multi-word phrase (kept single-token, same simplicity tradeoff as
// the homophone pool — a literal verbatim substring match is what both
// generateClue.ts's fodder check and verifyDefinitionAtEnd's containment
// check actually need).
function firstUsableSynonym(sense: string[], answerLower: string): string | null {
  for (const synonym of sense) {
    if (synonym.includes('_')) continue;
    const lower = synonym.toLowerCase();
    if (lower === answerLower) continue;
    return lower;
  }
  return null;
}

async function buildDoubleDefPool(): Promise<Record<string, DoubleDefPair[]>> {
  const result: Record<string, DoubleDefPair[]> = {};

  for (const length of LENGTHS) {
    const pairs: DoubleDefPair[] = [];
    for (const word of pools[length]) {
      const answerLower = word.toLowerCase();
      const senses = await getSynonymSets(answerLower);
      if (senses.length < 2) continue;

      outer: for (let i = 0; i < senses.length; i++) {
        for (let j = i + 1; j < senses.length; j++) {
          const setI = new Set(senses[i].map(normalize));
          const setJ = new Set(senses[j].map(normalize));
          const overlaps = [...setI].some((s) => setJ.has(s));
          if (overlaps) continue; // too closely related to read as genuinely distinct meanings

          const defA = firstUsableSynonym(senses[i], answerLower);
          const defB = firstUsableSynonym(senses[j], answerLower);
          if (!defA || !defB || defA === defB) continue;

          pairs.push({ answer: word.toUpperCase(), defA, defB });
          break outer; // one pair per answer is enough
        }
      }
    }
    result[length] = pairs;
  }
  return result;
}

async function main() {
  console.log('Scanning WordNet for double-definition pairs...');
  const pool = await buildDoubleDefPool();
  for (const length of LENGTHS) {
    console.log(`  length ${length}: ${pool[length].length} pairs`);
  }
  const dataDir = join(process.cwd(), 'src', 'data');
  writeFileSync(join(dataDir, 'double-def-pool.json'), JSON.stringify(pool, null, 2) + '\n');
  console.log('\nDone. Spot-check src/data/double-def-pool.json before generating any clues from it — WordNet gloss/sense quality varies.');
}

main();
