// A dedicated fluency gate. Nothing else in the pipeline ever checks
// whether the surface actually reads as real English — the structural
// checks only verify that the required words are present in the required
// positions, which a grammatically broken sentence can satisfy just as
// easily as a good one ("was housed by yesterday lightning storms before
// dawn sunlight" passes every structural rule and is still nonsense). This
// is a second, independent model call whose only job is to judge fluency;
// it never sees or reasons about the wordplay, so it can't rationalize a
// broken sentence just because the mechanism behind it is clever.

import { getAnthropicClient, SURFACE_WRITER_MODEL } from './client.js';

const FLUENCY_TOOL = {
  name: 'judge_fluency',
  description:
    'Judge whether a sentence reads as natural, grammatically correct English — nothing else.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fluent: {
        type: 'boolean' as const,
        description:
          'true only if this is a single, grammatically complete, natural-sounding sentence a fluent English speaker could plausibly write or say out loud. false if it is a run-on, missing a subject or verb, word salad, or just an awkward string of phrases stapled together.',
      },
      reason: {
        type: 'string' as const,
        description: 'One brief sentence explaining the verdict, especially if fluent is false.',
      },
    },
    required: ['fluent', 'reason'],
  },
};

export interface FluencyVerdict {
  fluent: boolean;
  reason: string;
}

export async function judgeFluency(sentence: string): Promise<FluencyVerdict> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: SURFACE_WRITER_MODEL,
    max_tokens: 256,
    tools: [FLUENCY_TOOL],
    tool_choice: { type: 'tool', name: 'judge_fluency' },
    messages: [
      {
        role: 'user',
        content: `Judge ONLY the grammar and fluency of this sentence — ignore whether it's clever, witty, or makes complete logical sense as a scene; a slightly surreal or odd sentence can still be fluent. Reject it only if it's actually ungrammatical: a run-on, missing a subject or verb, or clauses stapled together with no real syntactic connection between them.

Sentence: "${sentence}"

Call judge_fluency with your verdict.`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a judge_fluency tool call');
  }

  const input = toolUse.input as { fluent?: unknown; reason?: unknown };
  if (typeof input.fluent !== 'boolean' || typeof input.reason !== 'string') {
    throw new Error('Model returned a malformed fluency verdict');
  }

  return { fluent: input.fluent, reason: input.reason };
}
