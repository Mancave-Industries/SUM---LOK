import { describe, expect, it } from 'vitest';
import { verifyDefinitionMeaning } from '../../src/verify/definition.js';

describe('verifyDefinitionMeaning', () => {
  it('clears a genuine WordNet synonym without review', async () => {
    // "listen" has a sense with synonyms [listen, hear, take_heed]
    const result = await verifyDefinitionMeaning('LISTEN', 'hear');
    expect(result.reviewRequired).toBe(false);
  });

  it('is case-insensitive and tolerant of surrounding whitespace', async () => {
    const result = await verifyDefinitionMeaning('listen', '  Hear  ');
    expect(result.reviewRequired).toBe(false);
  });

  it('treats WordNet underscores as spaces for multi-word synonyms', async () => {
    // "dog" has a sense with synonym "domestic_dog"
    const result = await verifyDefinitionMeaning('DOG', 'domestic dog');
    expect(result.reviewRequired).toBe(false);
  });

  it('routes an unrelated definition to review rather than rejecting it', async () => {
    const result = await verifyDefinitionMeaning('DOG', 'a shade of blue');
    expect(result.reviewRequired).toBe(true);
  });

  it('routes a word with no WordNet entry to review', async () => {
    const result = await verifyDefinitionMeaning('ZZQXVPLK', 'nonsense');
    expect(result.reviewRequired).toBe(true);
  });
});
