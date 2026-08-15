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

      // Two entries may only ever touch through one shared cell (a real
      // crossing). If a run of filled cells doesn't exactly match some
      // slot's own span, two unrelated entries are sitting next to each
      // other with no black square between them — the rendered grid would
      // show what looks like one continuous word that isn't actually one
      // entry. Regression test for a bug found in every one of the 4
      // hand-authored templates: an entry's end cell landed directly next
      // to an unrelated entry's cell instead of crossing it.
      it('has no orphan adjacency — every filled run matches an actual slot span', () => {
        const filled = new Map<string, string[]>();
        for (const slot of template.slots) {
          for (let i = 0; i < slot.length; i++) {
            const row = slot.direction === 'down' ? slot.row + i : slot.row;
            const col = slot.direction === 'across' ? slot.col + i : slot.col;
            const key = `${row},${col}`;
            if (!filled.has(key)) filled.set(key, []);
            filled.get(key)!.push(slot.id);
          }
        }
        const acrossSpan = new Map(
          template.slots.filter((s) => s.direction === 'across').map((s) => [`${s.row},${s.col}`, s.length])
        );
        const downSpan = new Map(
          template.slots.filter((s) => s.direction === 'down').map((s) => [`${s.row},${s.col}`, s.length])
        );

        for (let r = 0; r < template.rows; r++) {
          let c = 0;
          while (c < template.cols) {
            if (!filled.has(`${r},${c}`)) { c++; continue; }
            const start = c;
            while (c < template.cols && filled.has(`${r},${c}`)) c++;
            const runLength = c - start;
            if (runLength >= 2) expect(acrossSpan.get(`${r},${start}`)).toBe(runLength);
          }
        }
        for (let c = 0; c < template.cols; c++) {
          let r = 0;
          while (r < template.rows) {
            if (!filled.has(`${r},${c}`)) { r++; continue; }
            const start = r;
            while (r < template.rows && filled.has(`${r},${c}`)) r++;
            const runLength = r - start;
            if (runLength >= 2) expect(downSpan.get(`${start},${c}`)).toBe(runLength);
          }
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

  it('rejects a template where an entry ends flush against an unrelated entry (no crossing, no gap)', () => {
    // A3 (row 7, cols 0-8) and D3 (col 9, rows 0-7) both end at (7,8)/(7,9) —
    // adjacent cells, no shared cell, no black square between them. This is
    // the exact shape of the bug found in the shipped zigzag-10 template.
    expect(() =>
      buildTemplate('bad-orphan-adjacency', 10, 10, [
        { id: 'A1', direction: 'across', row: 0, col: 0, length: 10 },
        { id: 'A2', direction: 'across', row: 3, col: 2, length: 8 },
        { id: 'A3', direction: 'across', row: 7, col: 0, length: 9 },
        { id: 'D1', direction: 'down', row: 0, col: 0, length: 8 },
        { id: 'D2', direction: 'down', row: 0, col: 5, length: 10 },
        { id: 'D3', direction: 'down', row: 0, col: 9, length: 8 },
      ])
    ).toThrow(/orphan adjacency/i);
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
