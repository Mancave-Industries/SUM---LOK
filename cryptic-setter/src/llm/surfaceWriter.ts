// The model's only job in this file: turn an already-verified mechanical
// wordplay into a natural-sounding surface sentence, split into two
// labelled halves so the structural verifier can check definition
// placement without having to parse English (see verify/structural.ts).
// This module never judges correctness — every claim it returns gets
// re-checked deterministically by the caller.

import { getAnthropicClient, SURFACE_WRITER_MODEL } from './client.js';
import type { SurfaceParts, Wordplay } from '../types.js';

export interface SurfaceRequest {
  answer: string;
  definition: string;
  device: string;
  wordplay: Wordplay;
  enumeration: string;
}

const SURFACE_TOOL = {
  name: 'write_surface',
  description:
    'Return the two labelled halves of a single natural English cryptic-crossword clue sentence.',
  input_schema: {
    type: 'object' as const,
    properties: {
      definitionText: {
        type: 'string' as const,
        description:
          'The words that stand in for the plain dictionary definition of the answer. Must read naturally as its own phrase.',
      },
      wordplayText: {
        type: 'string' as const,
        description:
          'The words that carry the wordplay mechanism (indicator + fodder), reading naturally.',
      },
      order: {
        type: 'string' as const,
        enum: ['definition-first', 'wordplay-first'],
        description:
          'Whether definitionText or wordplayText comes first when the clue is read left to right.',
      },
    },
    required: ['definitionText', 'wordplayText', 'order'],
  },
};

// Fodder-based devices (anagram, reversal, alternates) hand the LLM a
// single fixed string that must survive into the wordplay text near-
// verbatim. Components-based devices (hidden, initials) describe a
// structural property of the rendered text instead — the exact words are
// negotiable as long as the property holds, because that property (not the
// seed words) is what verifySurface actually checks.
// Devices store their fodder/component words in uppercase internally (it's
// the canonical form the case-insensitive verifiers compare against), but
// showing that literal casing to the model in the prompt reads as an
// instruction to keep it — producing garbled ALL-CAPS or mixed-case output
// mid-sentence. Display words in ordinary lowercase instead; capitalization
// (sentence-initial, proper nouns, etc.) is the model's call to make.
function toDisplayCase(word: string): string {
  return word.toLowerCase();
}

function describeWordplayRequirement(request: SurfaceRequest): string {
  const { answer, device, wordplay } = request;
  const indicator = wordplay.indicator;

  if (wordplay.fodder) {
    const fodder = toDisplayCase(wordplay.fodder);
    return `Wordplay fodder: "${fodder}"

The fodder "${fodder}" and the indicator "${indicator}" must both appear in the wordplay part, close to verbatim (minor grammatical inflection like plural or tense is fine, and you may capitalize it however normal sentence casing requires) so the mechanical parse still holds.`;
  }

  if (wordplay.components && device === 'hidden') {
    const before = toDisplayCase(wordplay.components[0]);
    const after = toDisplayCase(wordplay.components[1]);
    return `Somewhere in the wordplay part, place the words "${before}" and "${after}" immediately next to each other — only a single space between them, nothing else in between, and no inflection (no added letters, no plural/tense changes). Capitalize them however normal sentence casing requires. The letters of "${answer}" run across the join between them. The indicator "${indicator}" must also appear in the wordplay part.`;
  }

  if (wordplay.components && device === 'initials') {
    const words = wordplay.components.map(toDisplayCase).join(', ');
    return `The wordplay part must contain a run of ${wordplay.components.length} consecutive words whose first letters, in order, spell "${answer}". You may use these exact words as a starting point: ${words} — or substitute your own real words with the same starting letters, as long as they stay consecutive and in this order. Capitalize them however normal sentence casing requires. The indicator "${indicator}" must also appear in the wordplay part.`;
  }

  if (wordplay.components && device === 'charade') {
    const part1 = toDisplayCase(wordplay.components[0]);
    const part2 = toDisplayCase(wordplay.components[1]);
    return `The wordplay part must contain the words "${part1}" and "${part2}", with "${part1}" appearing before "${part2}" — they read naturally as two parts placed one after another, like a charade. Both must appear close to verbatim (minor grammatical inflection is fine). The indicator "${indicator}" should also appear, connecting them naturally (e.g. "${part1} ${indicator} ${part2}").`;
  }

  if (wordplay.components && device === 'container') {
    const outer = toDisplayCase(wordplay.components[0]);
    const inner = toDisplayCase(wordplay.components[1]);
    return `The wordplay part must contain both "${outer}" and "${inner}" somewhere (in either order, close to verbatim, minor grammatical inflection is fine), along with the indicator "${indicator}" signalling that one sits inside the other — e.g. "${inner} ${indicator} ${outer}" or "${outer} ${indicator} ${inner}".`;
  }

  throw new Error(`Don't know how to describe wordplay for device "${device}"`);
}

function buildPrompt(request: SurfaceRequest): string {
  const { answer, definition, device, enumeration } = request;
  return `You are writing ONE cryptic crossword clue for the answer "${answer}" ${enumeration}.

Definition to use (must be preserved, not paraphrased away): "${definition}"
Device: ${device}

${describeWordplayRequirement(request)}

Rules:
- The clue reads as a single natural, misleading English sentence (or short phrase) with no hint that it's a puzzle.
- The definition must sit at the very start or the very end of the sentence — never in the middle.
- Do not use the answer "${answer}" itself anywhere in the clue.
- Call write_surface with the two labelled halves exactly as they will appear in the final sentence, so that joining them with a single space in the given order reproduces the full clue sentence.`;
}

export async function writeSurface(request: SurfaceRequest): Promise<SurfaceParts> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: SURFACE_WRITER_MODEL,
    max_tokens: 512,
    tools: [SURFACE_TOOL],
    tool_choice: { type: 'tool', name: 'write_surface' },
    messages: [{ role: 'user', content: buildPrompt(request) }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a write_surface tool call');
  }

  const input = toolUse.input as Partial<SurfaceParts>;
  if (
    typeof input.definitionText !== 'string' ||
    typeof input.wordplayText !== 'string' ||
    (input.order !== 'definition-first' && input.order !== 'wordplay-first')
  ) {
    throw new Error('Model returned malformed surface parts');
  }

  return {
    definitionText: input.definitionText,
    wordplayText: input.wordplayText,
    order: input.order,
  };
}
