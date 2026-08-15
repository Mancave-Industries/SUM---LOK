// Fills a GridTemplate's 6 slots with real words such that every crossing's
// letters agree. Generalizes the old checkpoint-based hash-grid search
// (which relied on all 6 words sharing one length and 3 shared checkpoint
// positions) into a small constraint-satisfaction backtrack over arbitrary
// per-slot lengths and crossing positions.

import type { Crossing, GridTemplate, NumberedSlot } from './gridTemplates.js';

export interface TemplateSolution {
  templateId: string;
  bySlotId: Record<string, string>;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// letter-at-position -> matching words, built once per slot so that once a
// crossing neighbor is assigned, finding this slot's consistent candidates
// is an index lookup instead of a linear scan re-checking every candidate
// against every constraint from scratch.
function buildPositionIndex(words: string[], length: number): Map<number, Map<string, string[]>> {
  const index = new Map<number, Map<string, string[]>>();
  for (let pos = 0; pos < length; pos++) {
    const byLetter = new Map<string, string[]>();
    for (const w of words) {
      const letter = w[pos];
      if (!byLetter.has(letter)) byLetter.set(letter, []);
      byLetter.get(letter)!.push(w);
    }
    index.set(pos, byLetter);
  }
  return index;
}

// Finds a set of 6 words — one per slot, all distinct — that satisfy every
// crossing constraint in the template.
//
// `wordPools` is keyed by stringified length, matching wordlistsByLength.json.
// `preferred` (answers with an already-banked clue) sorts first in each
// slot's candidate order, same word-reuse bias as the old grid solver.
// `slotPools`, if given, overrides a specific slot's candidate list
// entirely — this is how a caller seeds a slot with only reversal- or
// alternates-capable words, so the search finds a grid that happens to
// include one of those instead of discovering after the fact that none of
// a generic 6-word grid support that device.
export function fillTemplate(
  template: GridTemplate,
  wordPools: Record<string, string[]>,
  exclude: Set<string>,
  preferred: Set<string> = new Set(),
  slotPools: Partial<Record<string, string[]>> = {}
): TemplateSolution | null {
  const candidatesBySlot = new Map<string, string[]>();
  const indexBySlot = new Map<string, Map<number, Map<string, string[]>>>();
  for (const slot of template.slots) {
    const rawPool = slotPools[slot.id] ?? wordPools[String(slot.length)] ?? [];
    const words = shuffle(
      rawPool.map((w) => w.toUpperCase()).filter((w) => w.length === slot.length && !exclude.has(w))
    ).sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)));
    candidatesBySlot.set(slot.id, words);
    if (words.length === 0) return null; // this slot has no possible word at all — fail fast
    indexBySlot.set(slot.id, buildPositionIndex(words, slot.length));
  }

  // Most-constrained-first: slots with more crossings are assigned earlier
  // so inconsistent branches get pruned as early as possible.
  const crossingsBySlot = new Map<string, Crossing[]>();
  for (const slot of template.slots) crossingsBySlot.set(slot.id, []);
  for (const c of template.crossings) {
    crossingsBySlot.get(c.acrossId)!.push(c);
    crossingsBySlot.get(c.downId)!.push(c);
  }
  const orderedSlots = [...template.slots].sort(
    (a, b) => crossingsBySlot.get(b.id)!.length - crossingsBySlot.get(a.id)!.length
  );

  const assignment = new Map<string, string>();
  const used = new Set<string>();
  let steps = 0;
  const maxSteps = 200_000;

  // Candidates for this slot given whichever crossing neighbors are already
  // assigned: with no assigned neighbors yet, every candidate is fair game
  // (in shuffled/preferred order); with one or more, intersect the
  // per-position letter index for each fixed crossing letter, smallest set
  // first, so only words consistent with every current constraint are ever
  // considered — no per-candidate rescan needed.
  function candidatesFor(slot: NumberedSlot): string[] {
    const constraints: Array<{ position: number; letter: string }> = [];
    for (const c of crossingsBySlot.get(slot.id)!) {
      const isAcross = c.acrossId === slot.id;
      const otherId = isAcross ? c.downId : c.acrossId;
      const otherWord = assignment.get(otherId);
      if (!otherWord) continue;
      const myIndex = isAcross ? c.acrossIndex : c.downIndex;
      const otherIndex = isAcross ? c.downIndex : c.acrossIndex;
      constraints.push({ position: myIndex, letter: otherWord[otherIndex] });
    }

    if (constraints.length === 0) return candidatesBySlot.get(slot.id)!;

    const index = indexBySlot.get(slot.id)!;
    const pools = constraints
      .map((c) => index.get(c.position)?.get(c.letter) ?? [])
      .sort((a, b) => a.length - b.length);

    const allowed = new Set(pools[0]);
    for (let k = 1; k < pools.length && allowed.size > 0; k++) {
      const next = new Set(pools[k]);
      for (const w of allowed) if (!next.has(w)) allowed.delete(w);
    }

    // Preserve the slot's original shuffled/preferred ordering among the
    // now-much-smaller consistent set.
    return candidatesBySlot.get(slot.id)!.filter((w) => allowed.has(w));
  }

  function backtrack(i: number): boolean {
    if (i === orderedSlots.length) return true;
    const slot = orderedSlots[i];
    for (const word of candidatesFor(slot)) {
      if (steps++ > maxSteps) return false;
      if (used.has(word)) continue;
      assignment.set(slot.id, word);
      used.add(word);
      if (backtrack(i + 1)) return true;
      assignment.delete(slot.id);
      used.delete(word);
    }
    return false;
  }

  if (!backtrack(0)) return null;

  const bySlotId: Record<string, string> = {};
  for (const slot of template.slots) bySlotId[slot.id] = assignment.get(slot.id)!;
  return { templateId: template.id, bySlotId };
}
