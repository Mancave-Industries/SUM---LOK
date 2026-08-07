import { describe, expect, it } from 'vitest';
import { reversalDevice } from '../../src/devices/reversal.js';

const indicatorBank = ['returning', 'back', 'reversed'];

describe('reversalDevice.verifyMechanics', () => {
  it('passes when the fodder reversed spells the answer', () => {
    // STAR reversed is RATS
    const result = reversalDevice.verifyMechanics(
      'RATS',
      { fodder: 'STAR', indicator: 'returning', operation: 'reversal(RATS, fodder=STAR)' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the fodder reversed does not spell the answer', () => {
    const result = reversalDevice.verifyMechanics(
      'RATS',
      { fodder: 'STOP', indicator: 'returning', operation: 'reversal(RATS, fodder=STOP)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when fodder equals the answer', () => {
    const result = reversalDevice.verifyMechanics(
      'RATS',
      { fodder: 'RATS', indicator: 'returning', operation: 'reversal(RATS, fodder=RATS)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = reversalDevice.verifyMechanics(
      'RATS',
      { fodder: 'STAR', indicator: 'nonsense', operation: 'reversal(RATS, fodder=STAR)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('reversalDevice.construct', () => {
  it('finds a dictionary reversal for RATS and it passes verifyMechanics', () => {
    const construction = reversalDevice.construct('RATS', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = reversalDevice.verifyMechanics('RATS', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
    expect(construction.wordplay.fodder).toBe('STAR');
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = reversalDevice.construct('RATS', []);
    expect(construction).toBeNull();
  });

  it('returns null when no dictionary reversal exists', () => {
    const construction = reversalDevice.construct('ZZQXV', indicatorBank);
    expect(construction).toBeNull();
  });
});
