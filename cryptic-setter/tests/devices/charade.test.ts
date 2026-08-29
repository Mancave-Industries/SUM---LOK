import { describe, expect, it } from 'vitest';
import { charadeDevice } from '../../src/devices/charade.js';

const indicatorBank = ['then', 'and', 'plus'];

describe('charadeDevice.verifyMechanics', () => {
  it('passes when two literal words concatenate to the answer', () => {
    const result = charadeDevice.verifyMechanics(
      'CARPET',
      { components: ['CAR', 'PET'], indicator: 'then', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('passes when a part resolves via a known abbreviation', () => {
    // KING -> R (abbreviation), OLD -> O (abbreviation): R + O = RO
    const result = charadeDevice.verifyMechanics(
      'RO',
      { components: ['KING', 'OLD'], indicator: 'then', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when a part is neither a real word nor a known abbreviation', () => {
    const result = charadeDevice.verifyMechanics(
      'CARPET',
      { components: ['ZZQXV', 'PET'], indicator: 'then', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the parts do not concatenate to the answer', () => {
    const result = charadeDevice.verifyMechanics(
      'CARPET',
      { components: ['CAR', 'DOG'], indicator: 'then', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = charadeDevice.verifyMechanics(
      'CARPET',
      { components: ['CAR', 'PET'], indicator: 'nonsense', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('charadeDevice.construct', () => {
  it('finds a split for CARPET and it passes verifyMechanics', () => {
    const construction = charadeDevice.construct('CARPET', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;
    const result = charadeDevice.verifyMechanics('CARPET', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = charadeDevice.construct('CARPET', []);
    expect(construction).toBeNull();
  });

  it('never splits a plural answer into its own singular plus "s"', () => {
    // SOLDIER + S mechanically concatenates to SOLDIERS, but "soldier" is
    // just the answer's singular — using it as a wordplay part gives the
    // answer away outright rather than requiring any real wordplay.
    for (let i = 0; i < 50; i++) {
      const construction = charadeDevice.construct('SOLDIERS', indicatorBank);
      if (!construction) continue;
      const [part1, part2] = construction.wordplay.components ?? [];
      expect(part1.toLowerCase()).not.toBe('soldier');
      expect(part2.toLowerCase()).not.toBe('soldier');
    }
  });
});

describe('charadeDevice.verifySurface', () => {
  const wordplay = { components: ['car', 'pet'], indicator: 'then', operation: '' };

  it('passes when the first part appears before the second', () => {
    const result = charadeDevice.verifySurface!('CARPET', wordplay, 'the car then a pet trotted by');
    expect(result.passed).toBe(true);
  });

  it('fails when the parts are in the wrong order', () => {
    const result = charadeDevice.verifySurface!('CARPET', wordplay, 'the pet then a car trotted by');
    expect(result.passed).toBe(false);
  });

  it('fails when a part is missing', () => {
    const result = charadeDevice.verifySurface!('CARPET', wordplay, 'the dog trotted by');
    expect(result.passed).toBe(false);
  });

  // Real bug found in production: a KINGDOM clue ("King then dominates a
  // whole realm") let the DOM part be satisfied by "dominates" — a plain
  // substring match, not a real occurrence of the word "dom" on its own.
  // That's solvable by pattern-matching the visible letters rather than
  // working out the wordplay, the exact thing hidden.ts's balance rule
  // was already added to prevent for a different device.
  it('fails when a part only appears buried inside a longer word', () => {
    const kingdomWordplay = { components: ['king', 'dom'], indicator: 'then', operation: '' };
    const result = charadeDevice.verifySurface!(
      'KINGDOM',
      kingdomWordplay,
      'King then dominates a whole realm'
    );
    expect(result.passed).toBe(false);
  });
});
