import { describe, expect, it } from 'vitest';
import { homophoneDevice } from '../../src/devices/homophone.js';
import homophonePool from '../../src/data/homophone-pool.json' with { type: 'json' };

const indicatorBank = ['we hear', 'reportedly', 'aloud'];

// BAND is a genuine homophone of BANNED per the CMU Pronouncing Dictionary,
// registered in the precomputed pool (src/data/homophone-pool.json) with
// some genuine WordNet synonym of "band" as fodder — read live from the
// pool rather than hardcoded, since which synonym buildHomophonePairs.ts
// picks first isn't guaranteed to stay the same across rebuilds (WordNet
// sense ordering isn't a stable contract), only that a legal registered
// pair exists at all.
const bannedPair = (homophonePool as Record<string, { answer: string; phoneticSource: string; fodder: string }[]>)[
  '6'
].find((p) => p.answer === 'BANNED')!;

describe('homophoneDevice.verifyMechanics', () => {
  it('passes a genuine registered homophone pair with a valid indicator', () => {
    const result = homophoneDevice.verifyMechanics(
      'BANNED',
      { fodder: bannedPair.fodder, phoneticSource: bannedPair.phoneticSource, indicator: 'we hear', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when the (phoneticSource, fodder) pair is not registered for this answer', () => {
    const result = homophoneDevice.verifyMechanics(
      'BANNED',
      { fodder: 'ZZQXV', phoneticSource: 'NONSENSE', indicator: 'we hear', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = homophoneDevice.verifyMechanics(
      'BANNED',
      { fodder: bannedPair.fodder, phoneticSource: bannedPair.phoneticSource, indicator: 'nonsense', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when fodder or phoneticSource is missing', () => {
    const result = homophoneDevice.verifyMechanics(
      'BANNED',
      { indicator: 'we hear', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('homophoneDevice.construct', () => {
  it('finds a legal pair for an answer with pool coverage and it passes verifyMechanics', () => {
    const construction = homophoneDevice.construct('BANNED', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = homophoneDevice.verifyMechanics('BANNED', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = homophoneDevice.construct('BANNED', []);
    expect(construction).toBeNull();
  });

  it('returns null for an answer with no pool coverage', () => {
    const construction = homophoneDevice.construct('ZZQXVWXYZ', indicatorBank);
    expect(construction).toBeNull();
  });
});

describe('homophoneDevice.verifySurface', () => {
  const wordplay = { fodder: 'RING', phoneticSource: 'BAND', indicator: 'we hear', operation: '' };

  it('passes when only the fodder synonym appears, not the actual homophone', () => {
    const result = homophoneDevice.verifySurface!('BANNED', wordplay, 'a ring, we hear, went missing');
    expect(result.passed).toBe(true);
  });

  it('fails when the actual homophone word appears in the text, giving the answer away', () => {
    const result = homophoneDevice.verifySurface!('BANNED', wordplay, 'the band, we hear, went missing');
    expect(result.passed).toBe(false);
  });
});
