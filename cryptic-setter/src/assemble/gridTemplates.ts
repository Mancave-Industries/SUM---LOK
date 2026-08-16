// A grid template is pure geometry: where each of the puzzle format's 6
// slots (3 across, 3 down) sits and how long it is. Word content is filled
// in later by fillTemplate.ts. Every template is fixed at the same overall
// size (10x10) so the game's visual footprint never changes puzzle to
// puzzle, but individual slot lengths within that footprint can differ
// from each other — unlike the original hash-grid, which forced all 6
// answers in a puzzle to share one length.
//
// Crossings and clue numbering are DERIVED from slot positions, not
// hand-authored, so a template can't declare an inconsistent crossing by
// mistake: buildTemplate() throws at import time (dev-time, never during
// generation) if a template's geometry doesn't check out.

export type Direction = 'across' | 'down';

export interface SlotSpec {
  // 'A1' | 'A2' | 'A3' | 'D1' | 'D2' | 'D3' — id ending in '3' is the
  // bonus-eligible slot, matching the existing across[2]/down[2] convention.
  id: string;
  direction: Direction;
  row: number;
  col: number;
  length: number;
}

export interface Crossing {
  acrossId: string;
  downId: string;
  acrossIndex: number; // letter position within the across slot
  downIndex: number; // letter position within the down slot
}

export interface NumberedSlot extends SlotSpec {
  number: number;
}

export interface GridTemplate {
  id: string;
  rows: number;
  cols: number;
  slots: NumberedSlot[];
  crossings: Crossing[];
}

function cellsOf(slot: SlotSpec): Array<{ row: number; col: number; index: number }> {
  const cells = [];
  for (let i = 0; i < slot.length; i++) {
    cells.push({
      row: slot.direction === 'down' ? slot.row + i : slot.row,
      col: slot.direction === 'across' ? slot.col + i : slot.col,
      index: i,
    });
  }
  return cells;
}

// Two slots cross iff the down slot's fixed column falls within the
// across slot's column span AND the across slot's fixed row falls within
// the down slot's row span — the single cell where both true.
function computeCrossings(slots: SlotSpec[]): Crossing[] {
  const across = slots.filter((s) => s.direction === 'across');
  const down = slots.filter((s) => s.direction === 'down');
  const crossings: Crossing[] = [];
  for (const a of across) {
    for (const d of down) {
      const colInRange = d.col >= a.col && d.col < a.col + a.length;
      const rowInRange = a.row >= d.row && a.row < d.row + d.length;
      if (colInRange && rowInRange) {
        crossings.push({
          acrossId: a.id,
          downId: d.id,
          acrossIndex: d.col - a.col,
          downIndex: a.row - d.row,
        });
      }
    }
  }
  return crossings;
}

// Standard crossword numbering: scan cells top-left to bottom-right,
// assign the next number to any cell that starts a slot. A cell that
// starts both an across and a down slot (the common case here) gets one
// shared number, same as the original hash-grid's 1-across/1-down corner.
function computeNumbering(slots: SlotSpec[]): Map<string, number> {
  const byCell = new Map<string, { row: number; col: number }>();
  for (const s of slots) byCell.set(`${s.row},${s.col}`, { row: s.row, col: s.col });
  const uniqueCells = [...byCell.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  const numberByCell = new Map(uniqueCells.map((c, i) => [`${c.row},${c.col}`, i + 1]));
  return new Map(slots.map((s) => [s.id, numberByCell.get(`${s.row},${s.col}`)!]));
}

function assertNoSameDirectionCollisions(slots: SlotSpec[]): void {
  for (const direction of ['across', 'down'] as const) {
    const occupied = new Map<string, string>();
    for (const slot of slots.filter((s) => s.direction === direction)) {
      for (const cell of cellsOf(slot)) {
        const key = `${cell.row},${cell.col}`;
        const owner = occupied.get(key);
        if (owner) {
          throw new Error(`Slots "${owner}" and "${slot.id}" (both ${direction}) collide at cell ${key}`);
        }
        occupied.set(key, slot.id);
      }
    }
  }
}

// Standard crossword construction rule: two entries may only ever be
// adjacent through a single shared cell (a real crossing). If two DIFFERENT
// cells that are orthogonally next to each other are both covered by slots,
// there's no black square rendered between them — the grid visually (and
// functionally, since the game reads a straight run of filled cells as one
// word) merges two unrelated entries into what looks like a single longer
// word. Concretely: every maximal horizontal run of filled cells (length
// >= 2) must equal some across slot's exact span, and every maximal
// vertical run must equal some down slot's exact span.
function assertNoOrphanAdjacency(slots: SlotSpec[], rows: number, cols: number): void {
  const filled = new Map<string, string[]>();
  for (const slot of slots) {
    for (const cell of cellsOf(slot)) {
      const key = `${cell.row},${cell.col}`;
      if (!filled.has(key)) filled.set(key, []);
      filled.get(key)!.push(slot.id);
    }
  }
  const acrossSpan = new Map<string, number>();
  const downSpan = new Map<string, number>();
  for (const s of slots) {
    if (s.direction === 'across') acrossSpan.set(`${s.row},${s.col}`, s.length);
    else downSpan.set(`${s.row},${s.col}`, s.length);
  }

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!filled.has(`${r},${c}`)) { c++; continue; }
      const start = c;
      while (c < cols && filled.has(`${r},${c}`)) c++;
      const runLength = c - start;
      if (runLength >= 2 && acrossSpan.get(`${r},${start}`) !== runLength) {
        const owners = Array.from({ length: runLength }, (_, i) => filled.get(`${r},${start + i}`)!.join('+'));
        throw new Error(
          `Orphan adjacency at row ${r}, cols ${start}-${c - 1}: filled cells from unrelated slots touch with ` +
          `no black square between them (${owners.join(' | ')}) — extend or reposition a slot so this becomes ` +
          `a real crossing, or open a gap so it isn't adjacent at all.`
        );
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (!filled.has(`${r},${c}`)) { r++; continue; }
      const start = r;
      while (r < rows && filled.has(`${r},${c}`)) r++;
      const runLength = r - start;
      if (runLength >= 2 && downSpan.get(`${start},${c}`) !== runLength) {
        const owners = Array.from({ length: runLength }, (_, i) => filled.get(`${start + i},${c}`)!.join('+'));
        throw new Error(
          `Orphan adjacency at col ${c}, rows ${start}-${r - 1}: filled cells from unrelated slots touch with ` +
          `no black square between them (${owners.join(' | ')}) — extend or reposition a slot so this becomes ` +
          `a real crossing, or open a gap so it isn't adjacent at all.`
        );
      }
    }
  }
}

function assertConnected(slots: SlotSpec[], crossings: Crossing[]): void {
  const adjacency = new Map<string, Set<string>>();
  for (const s of slots) adjacency.set(s.id, new Set());
  for (const c of crossings) {
    adjacency.get(c.acrossId)!.add(c.downId);
    adjacency.get(c.downId)!.add(c.acrossId);
  }
  const seen = new Set<string>();
  const stack = [slots[0].id];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const neighbor of adjacency.get(id)!) stack.push(neighbor);
  }
  if (seen.size !== slots.length) {
    const unreached = slots.map((s) => s.id).filter((id) => !seen.has(id));
    throw new Error(`Template's slot graph isn't fully connected — unreachable: ${unreached.join(', ')}`);
  }
}

// Keeps the rendered grid a genuinely constant size across every template:
// app.js computes the grid's rows/cols from the actual max cell reach of
// the entries (not from a declared size), so a template that "says" 10x10
// but whose slots only reach row/col 7 would silently render smaller.
function assertFootprint(slots: SlotSpec[], rows: number, cols: number): void {
  let maxRow = -1;
  let maxCol = -1;
  for (const slot of slots) {
    for (const cell of cellsOf(slot)) {
      maxRow = Math.max(maxRow, cell.row);
      maxCol = Math.max(maxCol, cell.col);
    }
  }
  if (maxRow + 1 !== rows || maxCol + 1 !== cols) {
    throw new Error(
      `Template declares ${rows}x${cols} but its slots only reach row ${maxRow + 1}, col ${maxCol + 1} — every template must actually fill its declared footprint so the rendered grid stays a constant size across templates.`
    );
  }
}

export function buildTemplate(id: string, rows: number, cols: number, slots: SlotSpec[]): GridTemplate {
  const across = slots.filter((s) => s.direction === 'across');
  const down = slots.filter((s) => s.direction === 'down');
  if (across.length !== 3 || down.length !== 3) {
    throw new Error(
      `Template "${id}" must have exactly 3 across and 3 down slots, got ${across.length}/${down.length}`
    );
  }

  assertNoSameDirectionCollisions(slots);
  const crossings = computeCrossings(slots);
  assertConnected(slots, crossings);
  assertFootprint(slots, rows, cols);
  assertNoOrphanAdjacency(slots, rows, cols);

  const numbers = computeNumbering(slots);
  const numberedSlots: NumberedSlot[] = slots.map((s) => ({ ...s, number: numbers.get(s.id)! }));

  return { id, rows, cols, slots: numberedSlots, crossings };
}

// Four fixed 10x10 templates, each with 3 across + 3 down slots of
// independently-chosen lengths (6-10 letters, matching the existing
// per-length word pools). Geometry chosen so every template reaches all
// four edges (keeping the rendered footprint exactly 10x10 every time)
// and every slot has at least one crossing (no isolated words).
//
// Reaching an edge does NOT require a slot to actually be 10 letters long:
// an across slot's row is fixed regardless of its length, so an across
// slot sitting at row 9 satisfies the footprint no matter how short it
// is (same for a down slot sitting at col 9). Every template below keeps
// A3 pinned at row 9 and D3 pinned at col 9 for exactly that reason, so
// at most one slot per template needs to actually span an edge along its
// own length — instead of the three 10-letter slots each of the original
// hand-authored templates leaned on, which made every single puzzle
// demand three 10-letter answers regardless of template.
const RAW_TEMPLATES: Array<{ id: string; rows: number; cols: number; slots: SlotSpec[] }> = [
  {
    id: 'cascade-10',
    rows: 10,
    cols: 10,
    slots: [
      { id: 'A1', direction: 'across', row: 0, col: 0, length: 8 },
      { id: 'A2', direction: 'across', row: 6, col: 4, length: 6 },
      { id: 'A3', direction: 'across', row: 9, col: 3, length: 7 },
      { id: 'D1', direction: 'down', row: 0, col: 0, length: 9 },
      { id: 'D2', direction: 'down', row: 0, col: 4, length: 10 },
      { id: 'D3', direction: 'down', row: 3, col: 9, length: 7 },
    ],
  },
  {
    id: 'mirror-10',
    rows: 10,
    cols: 10,
    slots: [
      { id: 'A1', direction: 'across', row: 0, col: 0, length: 7 },
      { id: 'A2', direction: 'across', row: 6, col: 0, length: 10 },
      { id: 'A3', direction: 'across', row: 9, col: 1, length: 9 },
      { id: 'D1', direction: 'down', row: 0, col: 0, length: 7 },
      { id: 'D2', direction: 'down', row: 0, col: 5, length: 8 },
      { id: 'D3', direction: 'down', row: 3, col: 9, length: 7 },
    ],
  },
  {
    id: 'zigzag-10',
    rows: 10,
    cols: 10,
    slots: [
      { id: 'A1', direction: 'across', row: 0, col: 4, length: 6 },
      { id: 'A2', direction: 'across', row: 4, col: 0, length: 10 },
      { id: 'A3', direction: 'across', row: 9, col: 1, length: 9 },
      { id: 'D1', direction: 'down', row: 1, col: 0, length: 8 },
      { id: 'D2', direction: 'down', row: 3, col: 6, length: 7 },
      { id: 'D3', direction: 'down', row: 0, col: 9, length: 8 },
    ],
  },
  {
    id: 'transpose-10',
    rows: 10,
    cols: 10,
    slots: [
      { id: 'A1', direction: 'across', row: 0, col: 3, length: 7 },
      { id: 'A2', direction: 'across', row: 3, col: 0, length: 8 },
      { id: 'A3', direction: 'across', row: 9, col: 3, length: 6 },
      { id: 'D1', direction: 'down', row: 2, col: 0, length: 6 },
      { id: 'D2', direction: 'down', row: 0, col: 4, length: 10 },
      { id: 'D3', direction: 'down', row: 0, col: 9, length: 9 },
    ],
  },
];

export const GRID_TEMPLATES: GridTemplate[] = RAW_TEMPLATES.map((t) =>
  buildTemplate(t.id, t.rows, t.cols, t.slots)
);
