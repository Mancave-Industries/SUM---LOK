import { describe, expect, it } from 'vitest';
import { fillTemplate } from '../../src/assemble/fillTemplate.js';
import { GRID_TEMPLATES } from '../../src/assemble/gridTemplates.js';
import wordlistsByLength from '../../src/data/wordlistsByLength.json' with { type: 'json' };

const pools = wordlistsByLength as Record<string, string[]>;

describe('fillTemplate', () => {
  for (const template of GRID_TEMPLATES) {
    it(`finds a real solution for template "${template.id}" from the live word pool`, () => {
      const solution = fillTemplate(template, pools, new Set());
      expect(solution).not.toBeNull();
      if (!solution) return;

      for (const c of template.crossings) {
        const acrossWord = solution.bySlotId[c.acrossId];
        const downWord = solution.bySlotId[c.downId];
        expect(acrossWord[c.acrossIndex]).toBe(downWord[c.downIndex]);
      }

      const words = Object.values(solution.bySlotId);
      expect(new Set(words).size).toBe(words.length);

      for (const slot of template.slots) {
        expect(solution.bySlotId[slot.id]).toHaveLength(slot.length);
      }
    });
  }

  it('returns null when the pool has no words at all', () => {
    const solution = fillTemplate(GRID_TEMPLATES[0], {}, new Set());
    expect(solution).toBeNull();
  });

  it('respects the exclude set', () => {
    const template = GRID_TEMPLATES[0];
    const first = fillTemplate(template, pools, new Set());
    expect(first).not.toBeNull();
    if (!first) return;

    const exclude = new Set(Object.values(first.bySlotId));
    const second = fillTemplate(template, pools, exclude);
    if (second) {
      for (const word of Object.values(second.bySlotId)) {
        expect(exclude.has(word)).toBe(false);
      }
    }
  });

  it('honors slotPools to restrict a specific slot to a custom candidate list', () => {
    const template = GRID_TEMPLATES[0];
    const forcedSlot = template.slots[0];
    const forcedWord = (pools[String(forcedSlot.length)] ?? [])[0]?.toUpperCase();
    expect(forcedWord).toBeTruthy();

    const solution = fillTemplate(template, pools, new Set(), new Set(), {
      [forcedSlot.id]: [forcedWord],
    });
    expect(solution).not.toBeNull();
    if (!solution) return;
    expect(solution.bySlotId[forcedSlot.id]).toBe(forcedWord);
  });

  it('returns null when a slot\'s custom pool cannot satisfy its crossings', () => {
    const template = GRID_TEMPLATES[0];
    const forcedSlot = template.slots[0];
    // A word of the right length but guaranteed to be gibberish relative
    // to any real crossing partner.
    const fakeWord = 'Z'.repeat(forcedSlot.length);
    const solution = fillTemplate(template, pools, new Set(), new Set(), {
      [forcedSlot.id]: [fakeWord],
    });
    expect(solution).toBeNull();
  });

  it('prefers a word from the preferred set when one is available', () => {
    const template = GRID_TEMPLATES[0];
    const first = fillTemplate(template, pools, new Set());
    expect(first).not.toBeNull();
    if (!first) return;

    const preferred = new Set(Object.values(first.bySlotId));
    const solution = fillTemplate(template, pools, new Set(), preferred);
    expect(solution).not.toBeNull();
    if (!solution) return;

    const used = Object.values(solution.bySlotId);
    expect(used.some((w) => preferred.has(w))).toBe(true);
  });
});
