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
});
