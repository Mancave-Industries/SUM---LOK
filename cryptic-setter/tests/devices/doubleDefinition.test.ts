import { describe, expect, it } from 'vitest';
import { doubleDefinitionDevice } from '../../src/devices/doubleDefinition.js';

// ACCEPT/take/consent is a real entry in the precomputed pool
// (src/data/double-def-pool.json) — "take" and "consent" are two
// genuinely distinct, non-overlapping WordNet senses of "accept".
describe('doubleDefinitionDevice.verifyMechanics', () => {
  it('passes a genuine registered double-definition pair', () => {
    const result = doubleDefinitionDevice.verifyMechanics(
      'ACCEPT',
      { fodder: 'CONSENT', suggestedDefinition: 'take', operation: '' },
      []
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the (defA, defB) pair is not registered for this answer', () => {
    const result = doubleDefinitionDevice.verifyMechanics(
      'ACCEPT',
      { fodder: 'ZZQXV', suggestedDefinition: 'nonsense', operation: '' },
      []
    );
    expect(result.passed).toBe(false);
  });

  it('fails when fodder or suggestedDefinition is missing', () => {
    const result = doubleDefinitionDevice.verifyMechanics('ACCEPT', { operation: '' }, []);
    expect(result.passed).toBe(false);
  });
});

describe('doubleDefinitionDevice.construct', () => {
  it('finds a legal pair for an answer with pool coverage and it passes verifyMechanics', () => {
    const construction = doubleDefinitionDevice.construct('ACCEPT', []);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = doubleDefinitionDevice.verifyMechanics('ACCEPT', construction.wordplay, []);
    expect(result.passed).toBe(true);
  });

  // Deliberately deviates from every other device: no linking indicator is
  // used in a classic double-definition clue, so an empty indicator bank
  // must NOT prevent construction the way it would for every other device.
  it('constructs successfully even with an empty indicator bank', () => {
    const construction = doubleDefinitionDevice.construct('ACCEPT', []);
    expect(construction).not.toBeNull();
  });

  it('returns null for an answer with no pool coverage', () => {
    const construction = doubleDefinitionDevice.construct('ZZQXVWXYZ', []);
    expect(construction).toBeNull();
  });
});
