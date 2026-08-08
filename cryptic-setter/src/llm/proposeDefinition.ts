// The model's second allowed creative role (§7 of the brief): propose ONE
// candidate definition for an answer. Never trusted to confirm it's
// correct — every proposal is checked against WordNet by
// verify/definition.ts, and anything that isn't an exact synonym match is
// flagged reviewRequired rather than silently accepted.

import { getAnthropicClient, SURFACE_WRITER_MODEL } from './client.js';

const DEFINITION_TOOL = {
  name: 'propose_definition',
  description:
    'Propose a single short definition (a synonym or brief phrase) for a crossword answer.',
  input_schema: {
    type: 'object' as const,
    properties: {
      definition: {
        type: 'string' as const,
        description:
          'A word or short phrase that means the same thing as the answer and could substitute for it in a sentence. Prefer a single word or 2-3 words.',
      },
    },
    required: ['definition'],
  },
};

export async function proposeDefinition(answer: string): Promise<string> {
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: SURFACE_WRITER_MODEL,
    max_tokens: 256,
    tools: [DEFINITION_TOOL],
    tool_choice: { type: 'tool', name: 'propose_definition' },
    messages: [
      {
        role: 'user',
        content: `Propose a single short crossword definition for the answer "${answer}". It must mean the same thing as "${answer}" and be substitutable for it in a sentence. Do not use the word "${answer}" itself. Call propose_definition with your answer.`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Model did not return a propose_definition tool call');
  }

  const input = toolUse.input as { definition?: unknown };
  if (typeof input.definition !== 'string' || input.definition.trim().length === 0) {
    throw new Error('Model returned an empty or malformed definition');
  }

  return input.definition.trim();
}
