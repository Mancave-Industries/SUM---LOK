import { describe, expect, it } from 'vitest';
import { hiddenDevice } from '../../src/devices/hidden.js';

const indicatorBank = ['some of', 'found in', 'hidden in'];

describe('hiddenDevice.verifyMechanics', () => {
  it('passes when the answer spans the join of the two host words', () => {
    // "beard" spans BEA|RD -> BEA + RDX (need answer inside combined string, boundary-spanning)
    const result = hiddenDevice.verifyMechanics(
      'EARD',
      { components: ['BEA', 'RDX'], indicator: 'found in', operation: 'hidden(EARD, in="BEA RDX")' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the answer is fully inside a single host word', () => {
    const result = hiddenDevice.verifyMechanics(
      'BEA',
      { components: ['BEARD', 'STONE'], indicator: 'found in', operation: 'hidden(BEA, in="BEARD STONE")' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the answer does not appear at all', () => {
    const result = hiddenDevice.verifyMechanics(
      'ZZZZ',
      { components: ['BEA', 'RDX'], indicator: 'found in', operation: 'hidden(ZZZZ, in="BEA RDX")' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = hiddenDevice.verifyMechanics(
      'EARD',
      { components: ['BEA', 'RDX'], indicator: 'nonsense', operation: 'hidden(EARD, in="BEA RDX")' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('hiddenDevice.construct', () => {
  it('finds a legal host pair for a common answer and it passes verifyMechanics', () => {
    const construction = hiddenDevice.construct('EAR', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = hiddenDevice.verifyMechanics('EAR', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = hiddenDevice.construct('EAR', []);
    expect(construction).toBeNull();
  });
});

describe('hiddenDevice.verifySurface', () => {
  it('passes when the answer spans a real word boundary in the text', () => {
    const result = hiddenDevice.verifySurface!('EARD', 'the bea rdx sat quietly');
    expect(result.passed).toBe(true);
  });

  it('fails when the answer only appears inside a single word', () => {
    const result = hiddenDevice.verifySurface!('BEA', 'the beard was long');
    expect(result.passed).toBe(false);
  });

  it('fails when the answer does not appear at all', () => {
    const result = hiddenDevice.verifySurface!('ZZZZ', 'the beard was long');
    expect(result.passed).toBe(false);
  });
});
