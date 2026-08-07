import { describe, expect, it } from 'vitest';
import { alternatesDevice } from '../../src/devices/alternates.js';

const indicatorBank = ['regularly', 'alternately', 'evenly'];

describe('alternatesDevice.verifyMechanics', () => {
  it('passes when every other letter of the fodder spells the answer', () => {
    // APPLE -> A(0) P(2) E(4) = APE
    const result = alternatesDevice.verifyMechanics(
      'APE',
      { fodder: 'APPLE', indicator: 'regularly', operation: 'alternates(APE, fodder=APPLE)' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the fodder is the wrong length', () => {
    const result = alternatesDevice.verifyMechanics(
      'APE',
      { fodder: 'APP', indicator: 'regularly', operation: 'alternates(APE, fodder=APP)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the extracted letters do not match the answer', () => {
    const result = alternatesDevice.verifyMechanics(
      'APE',
      { fodder: 'GRAPE', indicator: 'regularly', operation: 'alternates(APE, fodder=GRAPE)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = alternatesDevice.verifyMechanics(
      'APE',
      { fodder: 'APPLE', indicator: 'nonsense', operation: 'alternates(APE, fodder=APPLE)' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('alternatesDevice.construct', () => {
  it('returns null when the indicator bank is empty', () => {
    const construction = alternatesDevice.construct('APE', []);
    expect(construction).toBeNull();
  });

  it('when a construction is found, it passes verifyMechanics', () => {
    const construction = alternatesDevice.construct('APE', indicatorBank);
    if (construction) {
      const result = alternatesDevice.verifyMechanics('APE', construction.wordplay, indicatorBank);
      expect(result.passed).toBe(true);
    }
    // A single real 5-letter word matching this exact periodic pattern is
    // rare — a legal skip (construction === null) is an acceptable outcome
    // for this device, not a test failure.
  });
});
