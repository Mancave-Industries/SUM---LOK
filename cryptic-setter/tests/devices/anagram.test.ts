import { describe, expect, it } from 'vitest';
import { anagramDevice } from '../../src/devices/anagram.js';

const indicatorBank = ['confused', 'scrambled', 'wild'];

describe('anagramDevice.verifyMechanics', () => {
  it('passes a genuine anagram with a valid indicator', () => {
    const result = anagramDevice.verifyMechanics(
      'LISTEN',
      { fodder: 'SILENT', indicator: 'confused', operation: 'anagram(LISTEN, fodder=SILENT)' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when fodder letters do not match the answer', () => {
    const result = anagramDevice.verifyMechanics(
      'LISTEN',
      { fodder: 'SILENTS', indicator: 'confused', operation: 'anagram(LISTEN, fodder=SILENTS)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
    expect(result.log.some((line) => line.startsWith('✗'))).toBe(true);
  });

  it('fails when fodder is identical to the answer', () => {
    const result = anagramDevice.verifyMechanics(
      'LISTEN',
      { fodder: 'LISTEN', indicator: 'confused', operation: 'anagram(LISTEN, fodder=LISTEN)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = anagramDevice.verifyMechanics(
      'LISTEN',
      { fodder: 'SILENT', indicator: 'not-an-indicator', operation: 'anagram(LISTEN, fodder=SILENT)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when fodder or indicator is missing', () => {
    const result = anagramDevice.verifyMechanics(
      'LISTEN',
      { operation: 'anagram(LISTEN)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('anagramDevice.construct', () => {
  it('finds a real dictionary anagram for LISTEN and it passes verifyMechanics', () => {
    const construction = anagramDevice.construct('LISTEN', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = anagramDevice.verifyMechanics(
      'LISTEN',
      construction.wordplay,
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = anagramDevice.construct('LISTEN', []);
    expect(construction).toBeNull();
  });

  it('returns null for a word with no dictionary anagram', () => {
    // "XYLOPHONE" or similar with no valid rearrangement in the dictionary
    const construction = anagramDevice.construct('ZZQXV', indicatorBank);
    expect(construction).toBeNull();
  });
});
