import { describe, expect, it } from 'vitest';
import { buildTemplate, GRID_TEMPLATES } from '../../src/assemble/gridTemplates.js';

describe('GRID_TEMPLATES', () => {
  it('includes at least 4 templates', () => {
    expect(GRID_TEMPLATES.length).toBeGreaterThanOrEqual(4);
  });

  for (const template of GRID_TEMPLATES) {
    describe(`template "${template.id}"`, () => {
      it('has exactly 3 across and 3 down slots', () => {
        expect(template.slots.filter((s) => s.direction === 'across')).toHaveLength(3);
        expect(template.slots.filter((s) => s.direction === 'down')).toHaveLength(3);
      });

      it('has a square footprint', () => {
        expect(template.rows).toBe(template.cols);
      });

      it('actually fills its declared footprint', () => {
        let maxRow = -1;
        let maxCol = -1;
        for (const slot of template.slots) {
          for (let i = 0; i < slot.length; i++) {
            const row = slot.direction === 'down' ? slot.row + i : slot.row;
            const col = slot.direction === 'across' ? slot.col + i : slot.col;
            maxRow = Math.max(maxRow, row);
            maxCol = Math.max(maxCol, col);
          }
        }
        expect(maxRow + 1).toBe(template.rows);
        expect(maxCol + 1).toBe(template.cols);
      });

      it('assigns every slot a positive number', () => {
        for (const slot of template.slots) {
          expect(slot.number).toBeGreaterThan(0);
        }
      });

      it('has at least one crossing per slot (no isolated slots)', () => {
        const touched = new Set<string>();
        for (const c of template.crossings) {
          touched.add(c.acrossId);
          touched.add(c.downId);
        }
        for (const slot of template.slots) {
          expect(touched.has(slot.id)).toBe(true);
        }
      });

      it('has mixed slot lengths, not all equal', () => {
        const lengths = new Set(template.slots.map((s) => s.length));
        expect(lengths.size).toBeGreaterThan(1);
      });

      it('every crossing lands within both slots\' declared ranges', () => {
        const byId = new Map(template.slots.map((s) => [s.id, s]));
        for (const c of template.crossings) {
          const across = byId.get(c.acrossId)!;
          const down = byId.get(c.downId)!;
          expect(c.acrossIndex).toBeGreaterThanOrEqual(0);
          expect(c.acrossIndex).toBeLessThan(across.length);
          expect(c.downIndex).toBeGreaterThanOrEqual(0);
          expect(c.downIndex).toBeLessThan(down.length);
        }
      });
    });
  }

  it('rejects a template whose slots do not reach the declared footprint', () => {
    expect(() =>
      buildTemplate('bad-footprint', 10, 10, [
        { id: 'A1', direction: 'across', row: 0, col: 0, length: 6 },
        { id: 'A2', direction: 'across', row: 3, col: 0, length: 6 },
        { id: 'A3', direction: 'across', row: 6, col: 0, length: 6 },
        { id: 'D1', direction: 'down', row: 0, col: 0, length: 6 },
        { id: 'D2', direction: 'down', row: 0, col: 3, length: 6 },
        { id: 'D3', direction: 'down', row: 0, col: 5, length: 6 },
      ])
    ).toThrow();
  });

  it('rejects a template with a disconnected slot', () => {
    expect(() =>
      buildTemplate('bad-disconnected', 10, 10, [
        { id: 'A1', direction: 'across', row: 0, col: 0, length: 10 },
        { id: 'A2', direction: 'across', row: 9, col: 0, length: 10 },
        { id: 'A3', direction: 'across', row: 5, col: 2, length: 3 }, // isolated
        { id: 'D1', direction: 'down', row: 0, col: 0, length: 10 },
        { id: 'D2', direction: 'down', row: 0, col: 9, length: 10 },
        { id: 'D3', direction: 'down', row: 0, col: 6, length: 3 },
      ])
    ).toThrow();
  });

  it('rejects a template with two same-direction slots colliding', () => {
    expect(() =>
      buildTemplate('bad-collision', 10, 10, [
        { id: 'A1', direction: 'across', row: 0, col: 0, length: 10 },
        { id: 'A2', direction: 'across', row: 0, col: 2, length: 6 }, // same row as A1, overlapping
        { id: 'A3', direction: 'across', row: 9, col: 0, length: 10 },
        { id: 'D1', direction: 'down', row: 0, col: 0, length: 10 },
        { id: 'D2', direction: 'down', row: 0, col: 5, length: 10 },
        { id: 'D3', direction: 'down', row: 0, col: 9, length: 10 },
      ])
    ).toThrow();
  });

  it('rejects a template without exactly 3 across and 3 down slots', () => {
    expect(() =>
      buildTemplate('bad-count', 10, 10, [
        { id: 'A1', direction: 'across', row: 0, col: 0, length: 10 },
        { id: 'D1', direction: 'down', row: 0, col: 0, length: 10 },
      ])
    ).toThrow();
  });
});
