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

// The reverse redundancy: the model sometimes drops the definition phrase
// into the wordplay half too, as incidental scene-setting — e.g. TURNPIKE's
// "...lost on the toll road toll road", where "toll road" is both the
// definition and, independently, flavor text earlier in the sentence. The
// two halves are correct in isolation but read as a stutter once joined.
export function verifyWordplayDoesNotRepeatDefinition(
  wordplayText: string,
  seedDefinition: string
): VerificationResult {
  const normWordplay = normalize(wordplayText);
  const normSeed = normalize(seedDefinition);
  if (normSeed.length > 0 && normWordplay.includes(normSeed)) {
    return {
      passed: false,
      log: [
        `✗ wordplay text "${wordplayText}" repeats the definition phrase "${seedDefinition}" — redundant`,
      ],
    };
  }
  return { passed: true, log: ['✓ wordplay text does not repeat the definition phrase'] };
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

// Every word in a cryptic clue has to be doing a job. A real clue is built
// from four kinds of word and nothing else: the definition, the fodder or
// component words the device operates on, the indicator naming the
// operation, and a small set of link words that join the two halves into
// grammatical English. Anything outside those four is filler — scene-
// setting the solver reads past without it ever mattering ("at the barman",
// "the festival menu will", "leaving investors"), which makes the clue
// longer without making it harder, fairer, or better.
//
// This is the economy rule, and it is checked here rather than asked for in
// the prompt because asking did not work: the surface prompt tells the model
// to fold the required words into a real scene, and left unchecked it pads
// that scene out to two or three times the necessary length.

// Words allowed to appear without doing definition, fodder or indicator
// duty. Deliberately restricted to function words — articles, prepositions,
// conjunctions, pronouns, and the handful of light verbs that conventionally
// link wordplay to definition in published cryptics ("gives", "makes",
// "leaves"). No noun, adjective or adverb belongs here: a content word that
// isn't doing a job IS the filler this check exists to catch.
const LINK_WORDS = new Set([
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  'my', 'our', 'your', 'his', 'her', 'its', 'their',
  'of', 'in', 'on', 'at', 'to', 'for', 'from', 'with', 'by', 'into', 'onto',
  'over', 'under', 'after', 'before', 'around', 'about', 'up', 'down', 'out',
  'off', 'through', 'within', 'inside', 'outside', 'as', 'and', 'or', 'but',
  'when', 'while', 'then', 'so', 'not', 'no',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'has', 'have', 'had', 'does', 'do', 'did', 'will', 'would', 'can', 'could',
  'get', 'gets', 'give', 'gives', 'make', 'makes', 'made',
  'become', 'becomes', 'leave', 'leaves', 'leaving', 'bring', 'brings',
  'it', 'one', 'you', 'we', 'they', 'he', 'she', 'him', 'them', 'us',
]);

// Tokenizing for this check differs from normalize(): possessives are
// stripped so "casino's" matches "casino", and hyphens split so a
// hyphenated compound is judged word by word rather than as one unknown.
function economyTokens(text: string): string[] {
  return stripEnumeration(text)
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
}

// Devices permit "minor grammatical inflection" of their fodder, so a
// required word may legitimately surface as a longer form ("care" as
// "caring", "region" as "regions"). Treat a token as covered when it shares
// a stem of at least four characters with a required word — short enough to
// allow real inflection, long enough that two unrelated words don't collide.
function isCoveredBy(required: string[], token: string): boolean {
  return required.some((word) => {
    if (word === token) return true;
    const [shorter, longer] = word.length <= token.length ? [word, token] : [token, word];
    return shorter.length >= 4 && longer.startsWith(shorter);
  });
}

// initials clues are the one case where the required words aren't known in
// advance: the prompt explicitly invites the model to substitute its own
// words as long as the first letters still spell the answer. So instead of
// matching against seed words, locate the run that does the spelling and
// treat exactly those positions as accounted for.
function initialsRunPositions(tokens: string[], answer: string): Set<number> {
  const letters = answer.toLowerCase().replace(/[^a-z]/g, '');
  for (let start = 0; start + letters.length <= tokens.length; start++) {
    let matches = true;
    for (let offset = 0; offset < letters.length; offset++) {
      if (tokens[start + offset][0] !== letters[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return new Set(Array.from({ length: letters.length }, (_, offset) => start + offset));
    }
  }
  return new Set();
}

export interface EconomyInput {
  answer: string;
  device: string;
  seedDefinition: string;
  wordplay: { fodder?: string; components?: string[]; indicator?: string };
}

export function verifySurfaceEconomy(fullSurface: string, input: EconomyInput): VerificationResult {
  const tokens = economyTokens(fullSurface);
  const required = [
    ...economyTokens(input.seedDefinition),
    ...(input.wordplay.indicator ? economyTokens(input.wordplay.indicator) : []),
    ...(input.wordplay.fodder ? economyTokens(input.wordplay.fodder) : []),
    ...(input.wordplay.components ?? []).flatMap(economyTokens),
  ];

  const spelledPositions =
    input.device === 'initials' ? initialsRunPositions(tokens, input.answer) : new Set<number>();

  const filler = tokens.filter(
    (token, index) =>
      !spelledPositions.has(index) && !LINK_WORDS.has(token) && !isCoveredBy(required, token)
  );

  if (filler.length > 0) {
    return {
      passed: false,
      log: [
        `✗ ${filler.length} filler word(s) carrying no definition, fodder or indicator duty: ${filler
          .map((w) => `"${w}"`)
          .join(', ')} — every word must do a job`,
      ],
    };
  }

  return {
    passed: true,
    log: [`✓ all ${tokens.length} words do definition, wordplay, indicator or link duty — no filler`],
  };
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
