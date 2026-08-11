// Structural checks that apply to every device: the definition sits at one
// end of the clue (§2), never the middle, and the enumeration matches the
// answer. These run on top of each device's own mechanical check.

import type { SurfaceParts, VerificationResult } from '../types.js';

function stripEnumeration(text: string): string {
  return text.replace(/\s*\(\d+(?:,\d+)*\)\s*$/, '');
}

function normalize(text: string): string {
  return stripEnumeration(text)
    .toLowerCase()
    .replace(/[.,!?;:'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A charade/container split of a genuine compound word (MUD+SLIDE for
// MUDSLIDE) is mechanically fair but nearly worthless as a clue if the
// definition then also spells out one of those same parts ("landslide of
// mud") — the solver reads "mud" in the definition, "mud" in the
// wordplay, and never has to do anything except notice the repeat. This
// checks the definition text for a literal whole-word echo of any
// wordplay component or fodder word, regardless of device.
export function verifyDefinitionDoesNotEchoWordplay(
  definitionText: string,
  wordplay: { fodder?: string; components?: string[] }
): VerificationResult {
  const wordplayWords = [...(wordplay.components ?? []), ...(wordplay.fodder ? [wordplay.fodder] : [])].map(
    (w) => w.toLowerCase()
  );
  const defTokens = normalize(definitionText)
    .split(' ')
    .filter(Boolean);

  const echoed = wordplayWords.find((w) => defTokens.includes(w));
  if (echoed) {
    return {
      passed: false,
      log: [`✗ definition "${definitionText}" echoes wordplay word "${echoed}" verbatim — too easy`],
    };
  }
  return { passed: true, log: ['✓ definition does not echo any wordplay word verbatim'] };
}

// Glue the LLM's labelled parts into the sentence the solver actually reads.
export function combineSurfaceParts(parts: SurfaceParts): string {
  return parts.order === 'definition-first'
    ? `${parts.definitionText} ${parts.wordplayText}`
    : `${parts.wordplayText} ${parts.definitionText}`;
}

// The core rule from §2: the definition sits at the very start or the very
// end of the clue, never in the middle. Checked mechanically, in three
// steps: (1) the displayed surface has to be exactly the two labelled parts
// glued together in the stated order — nothing extra slipped in between;
// (2) the definition part therefore lands at the correct end by
// construction, which we re-confirm directly; (3) the definition part has
// to actually carry the seeded definition, not something else entirely.
export function verifyDefinitionAtEnd(
  fullSurface: string,
  parts: SurfaceParts,
  seedDefinition: string
): VerificationResult {
  const log: string[] = [];
  const normalizedSurface = normalize(fullSurface);
  const normalizedDefPart = normalize(parts.definitionText);
  const normalizedWordplayPart = normalize(parts.wordplayText);
  const expectedSentence = normalize(combineSurfaceParts(parts));

  if (normalizedSurface !== expectedSentence) {
    log.push(
      `✗ displayed surface does not equal definitionText+wordplayText glued in order "${parts.order}" — definition may be sandwiched mid-sentence or the model altered the join`
    );
    return { passed: false, log };
  }
  log.push('✓ displayed surface reconstructs exactly from the two labelled parts');

  const atStart = normalizedSurface.startsWith(normalizedDefPart);
  const atEnd = normalizedSurface.endsWith(normalizedDefPart);

  if (parts.order === 'definition-first' && !atStart) {
    log.push('✗ order is "definition-first" but definition text is not a prefix of the surface');
    return { passed: false, log };
  }
  if (parts.order === 'wordplay-first' && !atEnd) {
    log.push('✗ order is "wordplay-first" but definition text is not a suffix of the surface');
    return { passed: false, log };
  }
  log.push(
    `✓ definition ("${parts.definitionText}") sits at the ${
      parts.order === 'definition-first' ? 'start' : 'end'
    } of the clue, per §2`
  );

  const normalizedSeed = normalize(seedDefinition);
  if (!normalizedDefPart.includes(normalizedSeed)) {
    log.push(
      `✗ definition part "${parts.definitionText}" does not contain the seeded definition "${seedDefinition}"`
    );
    return { passed: false, log };
  }
  log.push(`✓ definition part contains the seeded definition "${seedDefinition}"`);

  if (normalizedWordplayPart.length === 0) {
    log.push('✗ wordplay part is empty');
    return { passed: false, log };
  }

  return { passed: true, log };
}

// Phase 1 answers are single words, so enumeration must be exactly the
// letter count in parentheses, e.g. "(6)".
export function verifyEnumeration(answer: string, enumeration: string): VerificationResult {
  const log: string[] = [];
  const match = enumeration.match(/^\((\d+(?:,\d+)*)\)$/);
  if (!match) {
    log.push(`✗ enumeration "${enumeration}" is not in the form "(n)" or "(n,n)"`);
    return { passed: false, log };
  }

  const total = match[1].split(',').reduce((sum, n) => sum + Number(n), 0);
  const answerLetters = answer.replace(/[^A-Za-z]/g, '').length;

  if (total !== answerLetters) {
    log.push(
      `✗ enumeration "${enumeration}" totals ${total} letters but answer "${answer}" has ${answerLetters}`
    );
    return { passed: false, log };
  }

  log.push(`✓ enumeration "${enumeration}" matches answer letter count (${answerLetters})`);
  return { passed: true, log };
}
