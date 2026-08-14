// Solves a 3-across/3-down "hash" grid for 8-letter answers: across words
// sit at rows 0/3/7, down words at columns 0/3/7, and every across/down
// pair shares exactly one letter at their intersection (checkpoint
// positions 0, 3, 7 within each 8-letter word). This is the same shape
// every 3A2Dle puzzle has used since day one — see design/3a2dle/mockup.html
// and app/puzzles/2026-08-10.json for the worked example (EASTWARD /
// CARNIVAL / CLARINET across, ELECTRIC / TEENAGER / DAYLIGHT down).

const CP = [0, 3, 7] as const;

export interface GridSolution {
  across: [string, string, string];
  down: [string, string, string];
}

function checkpoint(word: string): string[] {
  return CP.map((i) => word[i]);
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Finds a set of 3 down words + 3 across words, all distinct, that
// interlock validly at the checkpoint positions. Word order is shuffled
// each call so repeated calls against the same pool don't always return
// the same solution.
//
// `preferred` (answers that already have a verified, banked clue) sorts
// first in the search order. The search below is greedy — it returns the
// first valid combination it finds while scanning `words` in order — so
// this makes it try to build a grid entirely out of already-proven words
// before reaching for an unproven one that would need a fresh (and, under
// the current fluency gate, far-from-guaranteed) generation. Without this,
// every attempt is an independent roll of the dice on 6 words landing all
// at once, discarding whichever ones happened to succeed the moment a
// single other word in that combination fails.
export function solveHashGrid(
  wordPool: string[],
  exclude: Set<string>,
  preferred: Set<string> = new Set()
): GridSolution | null {
  const words = shuffle(
    wordPool.map((w) => w.toUpperCase()).filter((w) => w.length === 8 && !exclude.has(w))
  ).sort((a, b) => Number(preferred.has(b)) - Number(preferred.has(a)));
  if (words.length < 6) return null;

  const bySkeleton = new Map<string, string[]>();
  for (const w of words) {
    const sk = checkpoint(w).join('');
    if (!bySkeleton.has(sk)) bySkeleton.set(sk, []);
    bySkeleton.get(sk)!.push(w);
  }

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

  for (const d1 of words) {
    const c1 = checkpoint(d1);
    for (const d2 of words) {
      if (d2 === d1) continue;
      const c2 = checkpoint(d2);

      const validSets = [0, 1, 2].map((i) => {
        const set: string[] = [];
        for (const x of letters) {
          if (bySkeleton.has(c1[i] + c2[i] + x)) set.push(x);
        }
        return set;
      });
      if (!validSets[0].length || !validSets[1].length || !validSets[2].length) continue;

      for (const x0 of validSets[0]) {
        for (const x1 of validSets[1]) {
          for (const x2 of validSets[2]) {
            const d3 = bySkeleton.get(x0 + x1 + x2)?.find((w) => w !== d1 && w !== d2);
            if (!d3) continue;

            const used = new Set([d1, d2, d3]);
            const a1 = bySkeleton.get(c1[0] + c2[0] + x0)?.find((w) => !used.has(w));
            const a2 = bySkeleton.get(c1[1] + c2[1] + x1)?.find((w) => !used.has(w) && w !== a1);
            const a3 = bySkeleton
              .get(c1[2] + c2[2] + x2)
              ?.find((w) => !used.has(w) && w !== a1 && w !== a2);
            if (!a1 || !a2 || !a3) continue;

            return { down: [d1, d2, d3], across: [a1, a2, a3] };
          }
        }
      }
    }
  }

  return null;
}
