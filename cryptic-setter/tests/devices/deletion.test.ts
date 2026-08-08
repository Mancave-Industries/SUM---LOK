import { describe, expect, it } from 'vitest';
import { deletionDevice } from '../../src/devices/deletion.js';

const indicatorBank = ['beheaded', 'curtailed', 'gutted'];

describe('deletionDevice.verifyMechanics', () => {
  it('passes a genuine behead (drop first letter)', () => {
    // STARS behead -> TARS
    const result = deletionDevice.verifyMechanics(
      'TARS',
      { fodder: 'STARS', indicator: 'beheaded', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('passes a genuine curtail (drop last letter)', () => {
    // PARTY curtail -> PART
    const result = deletionDevice.verifyMechanics(
      'PART',
      { fodder: 'PARTY', indicator: 'curtailed', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('passes a genuine gut (keep first and last letter only)', () => {
    // OVEN gutted -> ON
    const result = deletionDevice.verifyMechanics(
      'ON',
      { fodder: 'OVEN', indicator: 'gutted', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the source is not a real dictionary word', () => {
    const result = deletionDevice.verifyMechanics(
      'TARS',
      { fodder: 'ZZQXVS', indicator: 'beheaded', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the deletion type does not produce the answer', () => {
    // STARS curtailed (drop last letter) -> STAR, not TARS
    const result = deletionDevice.verifyMechanics(
      'TARS',
      { fodder: 'STARS', indicator: 'curtailed', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not a recognized deletion indicator', () => {
    const result = deletionDevice.verifyMechanics(
      'TARS',
      { fodder: 'STARS', indicator: 'nonsense', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('deletionDevice.construct', () => {
  it('finds a source for TARS and it passes verifyMechanics', () => {
    const construction = deletionDevice.construct('TARS', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;
    const result = deletionDevice.verifyMechanics('TARS', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = deletionDevice.construct('TARS', []);
    expect(construction).toBeNull();
  });
});
