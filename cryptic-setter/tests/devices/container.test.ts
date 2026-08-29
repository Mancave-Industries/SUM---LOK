import { describe, expect, it } from 'vitest';
import { containerDevice } from '../../src/devices/container.js';

const indicatorBank = ['in', 'holding', 'around'];

describe('containerDevice.verifyMechanics', () => {
  it('passes when inserting the inner part into the outer part reproduces the answer', () => {
    // BEAD with R (via "king") inserted before the last letter -> BEARD
    const result = containerDevice.verifyMechanics(
      'BEARD',
      { components: ['BEAD', 'KING'], indicator: 'holding', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(true);
  });

  it('fails when neither part resolves', () => {
    const result = containerDevice.verifyMechanics(
      'BEARD',
      { components: ['ZZQXV', 'KING'], indicator: 'holding', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when no insertion reproduces the answer', () => {
    const result = containerDevice.verifyMechanics(
      'BEARD',
      { components: ['BEAD', 'DOG'], indicator: 'holding', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });

  it('fails when the indicator is not in the bank', () => {
    const result = containerDevice.verifyMechanics(
      'BEARD',
      { components: ['BEAD', 'KING'], indicator: 'nonsense', operation: '' },
      indicatorBank
    );
    expect(result.passed).toBe(false);
  });
});

describe('containerDevice.construct', () => {
  it('returns null when the indicator bank is empty', () => {
    const construction = containerDevice.construct('BEARD', []);
    expect(construction).toBeNull();
  });

  it('when a construction is found, it passes verifyMechanics', () => {
    const construction = containerDevice.construct('BEARD', indicatorBank);
    if (construction) {
      const result = containerDevice.verifyMechanics('BEARD', construction.wordplay, indicatorBank);
      expect(result.passed).toBe(true);
    }
  });
});

describe('containerDevice.verifySurface', () => {
  const wordplay = { components: ['bead', 'king'], indicator: 'holding', operation: '' };

  it('passes when both parts appear anywhere in the text', () => {
    const result = containerDevice.verifySurface!('BEARD', wordplay, 'a bead holding a king motif');
    expect(result.passed).toBe(true);
  });

  it('fails when a part is missing', () => {
    const result = containerDevice.verifySurface!('BEARD', wordplay, 'a bead holding a crown motif');
    expect(result.passed).toBe(false);
  });

  // Same bug class found in charade.ts's verifySurface: a plain substring
  // match lets "king" be satisfied by "kingdom" even though "king" never
  // actually appears as its own word — solvable by spotting the visible
  // letters, not by working out the wordplay.
  it('fails when a part only appears buried inside a longer word', () => {
    const result = containerDevice.verifySurface!('BEARD', wordplay, 'a bead holding a kingdom motif');
    expect(result.passed).toBe(false);
  });
});
