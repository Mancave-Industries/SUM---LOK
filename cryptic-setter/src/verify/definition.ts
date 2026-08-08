// Deterministic check that a proposed definition genuinely means the same
// thing as the answer: exact membership in a WordNet synonym set for the
// answer. That's the cryptic-crossword convention itself — a definition is
// a synonym of the answer — applied mechanically rather than trusted from
// the LLM. A definition that isn't an exact match isn't rejected outright
// (natural-language paraphrase can't be judged with certainty by code) —
// it's routed to human review instead, the same way Tier 3 devices are.

import { getSynonymSets } from '../definitions/wordnet.js';

export interface DefinitionCheckResult {
  reviewRequired: boolean;
  log: string[];
}

function normalize(word: string): string {
  return word.toLowerCase().replace(/_/g, ' ').trim();
}

export async function verifyDefinitionMeaning(
  answer: string,
  definition: string
): Promise<DefinitionCheckResult> {
  const log: string[] = [];
  const senses = await getSynonymSets(answer);

  if (senses.length === 0) {
    log.push(
      `… "${answer}" has no WordNet entry — definition can't be auto-verified, routing to review`
    );
    return { reviewRequired: true, log };
  }

  const normalizedDefinition = normalize(definition);
  for (const synonyms of senses) {
    if (synonyms.some((synonym) => normalize(synonym) === normalizedDefinition)) {
      log.push(`✓ "${definition}" is a WordNet-listed synonym of "${answer}"`);
      return { reviewRequired: false, log };
    }
  }

  log.push(`… "${definition}" is not an exact WordNet synonym of "${answer}" — routing to review`);
  return { reviewRequired: true, log };
}
