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

function buildPrompt(request: SurfaceRequest): string {
  const { answer, definition, device, wordplay, enumeration } = request;
  return `You are writing ONE cryptic crossword clue for the answer "${answer}" ${enumeration}.

Definition to use (must be preserved, not paraphrased away): "${definition}"
Device: ${device}
Wordplay indicator: "${wordplay.indicator}"
Wordplay fodder: "${wordplay.fodder}"

Rules:
- The clue reads as a single natural, misleading English sentence (or short phrase) with no hint that it's a puzzle.
- The definition must sit at the very start or the very end of the sentence — never in the middle.
- The fodder "${wordplay.fodder}" and the indicator "${wordplay.indicator}" must both appear in the wordplay part, close to verbatim (minor grammatical inflection like plural or tense is fine) so the mechanical parse still holds.
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
