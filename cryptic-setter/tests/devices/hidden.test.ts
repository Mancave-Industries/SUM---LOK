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
  // A 3-4 letter answer can't satisfy the minimum-2-letters-per-side balance
  // requirement below (2+2=4 already exceeds a 3-letter answer's own
  // length), so this uses a 6-letter answer — matching the game's actual
  // 6-10 letter answer range, where a genuinely balanced split is possible.
  it('finds a legal host pair for a common answer and it passes verifyMechanics', () => {
    const construction = hiddenDevice.construct('GARDEN', indicatorBank);
    expect(construction).not.toBeNull();
    if (!construction) return;

    const result = hiddenDevice.verifyMechanics('GARDEN', construction.wordplay, indicatorBank);
    expect(result.passed).toBe(true);
  });

  it('returns null when the indicator bank is empty', () => {
    const construction = hiddenDevice.construct('EAR', []);
    expect(construction).toBeNull();
  });

  // Regression test: a split where nearly the whole answer already sits
  // inside one host word (e.g. SEARCHES as "SEARCH" from RESEARCH + "ES"
  // from espana) barely hides anything — RESEARCH already visibly ends in
  // a near-complete run of the answer. Every construct() call must split
  // the answer so each host word supplies a real share of it, not just a
  // token letter or two tacked onto an already-obvious chunk.
  it('never splits the answer so lopsidedly that one host supplies nearly all of it', () => {
    const answers = ['SEARCHES', 'RESEARCH', 'STATION', 'ANIMALS', 'GARDENS', 'PICTURE', 'MACHINE', 'JOURNEY'];
    let attempts = 0;
    for (const answer of answers) {
      for (let trial = 0; trial < 5; trial++) {
        const construction = hiddenDevice.construct(answer, indicatorBank);
        if (!construction) continue;
        attempts++;
        const [before, after] = construction.wordplay.components!;
        const joined = (before + after).toUpperCase();
        const idx = joined.indexOf(answer.toUpperCase());
        const charsFromBefore = Math.max(0, before.length - idx);
        const charsFromAfter = answer.length - charsFromBefore;
        const minSide = Math.max(2, Math.ceil(answer.length * 0.3));
        expect(charsFromBefore).toBeGreaterThanOrEqual(minSide);
        expect(charsFromAfter).toBeGreaterThanOrEqual(minSide);
      }
    }
    expect(attempts).toBeGreaterThan(0); // sanity: construct() actually succeeded at least once
  }, 20000);
});

describe('hiddenDevice.verifySurface', () => {
  const dummyWordplay = { components: ['BEA', 'RDX'], indicator: 'found in', operation: '' };

  it('passes when the answer spans a real word boundary in the text', () => {
    const result = hiddenDevice.verifySurface!('EARD', dummyWordplay, 'the bea rdx sat quietly');
    expect(result.passed).toBe(true);
  });

  it('fails when the answer only appears inside a single word', () => {
    const result = hiddenDevice.verifySurface!('BEA', dummyWordplay, 'the beard was long');
    expect(result.passed).toBe(false);
  });

  it('fails when the answer does not appear at all', () => {
    const result = hiddenDevice.verifySurface!('ZZZZ', dummyWordplay, 'the beard was long');
    expect(result.passed).toBe(false);
  });
});
