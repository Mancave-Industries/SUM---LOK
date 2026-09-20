import { describe, expect, it } from 'vitest';
import {
  combineSurfaceParts,
  verifyDefinitionAtEnd,
  verifyEnumeration,
  verifySurfaceEconomy,
} from '../../src/verify/structural.js';
import type { SurfaceParts } from '../../src/types.js';

describe('verifyDefinitionAtEnd', () => {
  it('passes when the definition is a genuine suffix and contains the seed definition', () => {
    const parts: SurfaceParts = {
      wordplayText: 'Confused, silent',
      definitionText: 'means to hear',
      order: 'wordplay-first',
    };
    const surface = `${combineSurfaceParts(parts)} (6)`;
    const result = verifyDefinitionAtEnd(surface, parts, 'hear');
    expect(result.passed).toBe(true);
  });

  it('passes when the definition is a genuine prefix', () => {
    const parts: SurfaceParts = {
      definitionText: 'Hear',
      wordplayText: 'confused, silent sounds',
      order: 'definition-first',
    };
    const surface = `${combineSurfaceParts(parts)} (6)`;
    const result = verifyDefinitionAtEnd(surface, parts, 'hear');
    expect(result.passed).toBe(true);
  });

  it('fails when the displayed surface does not match the glued parts (definition sandwiched)', () => {
    const parts: SurfaceParts = {
      wordplayText: 'Confused, silent',
      definitionText: 'means to hear',
      order: 'wordplay-first',
    };
    // Extra words inserted between the two parts, breaking the reconstruction.
    const tamperedSurface = 'Confused, silent, apparently, means to hear (6)';
    const result = verifyDefinitionAtEnd(tamperedSurface, parts, 'hear');
    expect(result.passed).toBe(false);
  });

  it('fails when the definition part does not contain the seeded definition', () => {
    const parts: SurfaceParts = {
      wordplayText: 'Confused, silent',
      definitionText: 'the opposite of talk',
      order: 'wordplay-first',
    };
    const surface = `${combineSurfaceParts(parts)} (6)`;
    const result = verifyDefinitionAtEnd(surface, parts, 'hear');
    expect(result.passed).toBe(false);
  });

  it('fails when order says definition-first but definition is not the prefix', () => {
    const parts: SurfaceParts = {
      definitionText: 'hear',
      wordplayText: 'confused, silent',
      order: 'definition-first',
    };
    // Surface deliberately built in the wrong order relative to the claim.
    const surface = 'confused, silent hear (6)';
    const result = verifyDefinitionAtEnd(surface, parts, 'hear');
    expect(result.passed).toBe(false);
  });
});

describe('verifyEnumeration', () => {
  it('passes when enumeration matches the answer length', () => {
    const result = verifyEnumeration('LISTEN', '(6)');
    expect(result.passed).toBe(true);
  });

  it('fails when enumeration is short', () => {
    const result = verifyEnumeration('LISTEN', '(5)');
    expect(result.passed).toBe(false);
  });

  it('fails on malformed enumeration', () => {
    const result = verifyEnumeration('LISTEN', '6');
    expect(result.passed).toBe(false);
  });

  it('sums multi-word enumerations', () => {
    const result = verifyEnumeration('ICECREAM', '(3,5)');
    expect(result.passed).toBe(true);
  });
});

describe('verifySurfaceEconomy', () => {
  // The real ASSAULT clue the user flagged: mechanically sound, but eight of
  // its words are scene-setting that never pays off.
  it('rejects the padded scene-setting that prompted this rule', () => {
    const result = verifySurfaceEconomy(
      'Anglers say the oquassa ultimately survives within a cold lake, but poachers still plan an attack (7)',
      {
        answer: 'ASSAULT',
        device: 'hidden',
        seedDefinition: 'attack',
        wordplay: { components: ['OQUASSA', 'ULTIMATELY'], indicator: 'within' },
      }
    );
    expect(result.passed).toBe(false);
    expect(result.log[0]).toContain('anglers');
    expect(result.log[0]).toContain('poachers');
  });

  it('accepts the same mechanism written without filler', () => {
    const result = verifySurfaceEconomy('Oquassa ultimately conceals an attack (7)', {
      answer: 'ASSAULT',
      device: 'hidden',
      seedDefinition: 'attack',
      wordplay: { components: ['OQUASSA', 'ULTIMATELY'], indicator: 'conceals' },
    });
    expect(result.passed).toBe(true);
  });

  it('accepts a real clue from the bank that was already clean', () => {
    const result = verifySurfaceEconomy('Disordered seasides bring illnesses (8)', {
      answer: 'DISEASES',
      device: 'anagram',
      seedDefinition: 'illnesses',
      wordplay: { fodder: 'SEASIDES', indicator: 'disordered' },
    });
    expect(result.passed).toBe(true);
  });

  // Padding hides in the definition half too: verifyDefinitionAtEnd only
  // requires the definition part to CONTAIN the seeded definition, so
  // "show off regional cuisine" passes it while carrying two dead words.
  it('catches a definition part padded out beyond the seeded definition', () => {
    const result = verifySurfaceEconomy('Bhindi catering within will show off regional cuisine (8)', {
      answer: 'INDICATE',
      device: 'hidden',
      seedDefinition: 'show',
      wordplay: { components: ['BHINDI', 'CATERING'], indicator: 'within' },
    });
    expect(result.passed).toBe(false);
    expect(result.log[0]).toContain('regional');
    expect(result.log[0]).toContain('cuisine');
  });

  it('allows minor inflection of a required word', () => {
    const result = verifySurfaceEconomy('Regions disordered give a signer (6)', {
      answer: 'SIGNER',
      device: 'anagram',
      seedDefinition: 'signer',
      wordplay: { fodder: 'REGION', indicator: 'disordered' },
    });
    expect(result.passed).toBe(true);
  });

  // initials is the one device where the surface words aren't known ahead of
  // time — the prompt invites the model to substitute its own words provided
  // the first letters still spell the answer, so the run is located instead.
  it('accounts for an initials run the device never specified', () => {
    const result = verifySurfaceEconomy('Regularly cooks apple pies initially (4)', {
      answer: 'CAPI',
      device: 'initials',
      seedDefinition: 'regularly',
      wordplay: { components: ['COOKS', 'APPLE', 'PIES'], indicator: 'initially' },
    });
    expect(result.passed).toBe(true);
  });
});
