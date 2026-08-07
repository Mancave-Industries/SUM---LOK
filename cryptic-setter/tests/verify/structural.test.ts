import { describe, expect, it } from 'vitest';
import {
  combineSurfaceParts,
  verifyDefinitionAtEnd,
  verifyEnumeration,
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
