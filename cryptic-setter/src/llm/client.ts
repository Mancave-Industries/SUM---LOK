import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key, or export it in your shell.'
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// The model is only ever asked to write a surface reading (or, later,
// propose a candidate definition for human review) — never to confirm
// correctness. Configurable so it can be swapped without touching code.
export const SURFACE_WRITER_MODEL = process.env.CRYPTIC_SETTER_MODEL ?? 'claude-sonnet-5';
