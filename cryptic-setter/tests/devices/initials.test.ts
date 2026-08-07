import { describe, expect, it } from 'vitest';
import { initialsDevice } from '../../src/devices/initials.js';

const indicatorBank = ['initially', 'at first', 'to start'];

describe('initialsDevice.verifyMechanics', () => {
  it('passes when the seed word initials spell the answer', () => {
    const result = initialsDevice.verifyMechanics(
      'CAT',
      {
        components: ['Cold', 'Angry', 'Tired'],
        indicator: 'initially',
        operation: 'initials(CAT, words=[Cold, Angry, Tired])',
      },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the initials do not spell the answer', () => {
    const result = initialsDevice.verifyMechanics(
      'CAT',
      {
        components: ['Cold', 'Bright', 'Tired'],
        indicator: 'initially',
        operation: 'initials(CAT, words=[Cold, Bright, Tired])',
      },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the number of seed words does not match the answer length', () => {
    const result = initialsDevice.verifyMechanics(
      'CAT',
      { components: ['Cold', 'Angry'], indicator: 'initially', operation: 'initials(CAT, words=[Cold, Angry])' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = initialsDevice.verifyMechanics(
      'CAT',
      {
        components: ['Cold', 'Angry', 'Tired'],
        indicator: 'nonsense',
        operation: 'initials(CAT, words=[Cold, Angry, Tired])',
      },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('initialsDevice.construct', () => {
  it('finds seed words for a common answer and it passes verifyMechanics', () => {
    const construction = initialsDevice.construct('CAT', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = initialsDevice.verifyMechanics('CAT', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = initialsDevice.construct('CAT', []);
    expect(construction).toBeNull();
  });
});

describe('initialsDevice.verifySurface', () => {
  it('passes when a consecutive run of words has matching initials', () => {
    const result = initialsDevice.verifySurface!('CAT', 'the cold angry tired dog barked');
    expect(result.passed).toBe(true);
  });

  it('fails when no consecutive run matches', () => {
    const result = initialsDevice.verifySurface!('CAT', 'the tired angry cold dog barked');
    expect(result.passed).toBe(false);
  });
});
