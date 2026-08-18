// Synchronous, fully-in-memory WordNet reader for offline build scripts
// only (buildHomophonePairs.ts, buildDoubleDefPool.ts) — NOT used by the
// live generation pipeline, which keeps using the async wordnet.ts wrapper
// unchanged.
//
// natural's WordNet.lookup() (wordnet.ts's underlying implementation) does
// a fresh disk-based binary search with real fs.read() syscalls for every
// single call — reasonable for the occasional live lookup during clue
// generation, but scanning ~5,000 words for a build script this way was
// measured taking 20+ minutes of wall time, entirely dominated by syscall
// latency, not actual computation.
//
// The WordNet index/data files are only a few MB total and the format is
// simple (index files map a lemma to byte offsets in the matching data
// file; data files are addressed directly by that offset — see
// https://wordnet.princeton.edu/documentation/wndb5wn). Reading each file
// into memory once and doing every lookup as a plain in-memory Map/string
// operation turns the same ~5,000-word scan into well under a second.

import { readFileSync } from 'node:fs';
import wordnetDb from 'wordnet-db';

type Pos = 'noun' | 'verb' | 'adj' | 'adv';
const POS_FILES: Pos[] = ['noun', 'verb', 'adj', 'adv'];

interface IndexEntry {
  pos: Pos;
  synsetOffsets: number[];
}

let indexCache: Map<string, IndexEntry[]> | null = null;
let dataCache: Record<Pos, string> | null = null;

// Real WordNet index entries never start with whitespace; the license
// header at the top of every index file is the only thing that does, so
// this is a safe, simple filter without needing to count header lines.
function isRealIndexLine(line: string): boolean {
  return line.length > 0 && line[0] !== ' ';
}

function loadIndex(): Map<string, IndexEntry[]> {
  if (indexCache) return indexCache;
  const index = new Map<string, IndexEntry[]>();
  for (const pos of POS_FILES) {
    const path = `${wordnetDb.path}/index.${pos}`;
    const lines = readFileSync(path, 'utf8').split('\n');
    for (const line of lines) {
      if (!isRealIndexLine(line)) continue;
      const parts = line.trim().split(/\s+/);
      const lemma = parts[0];
      const synsetCnt = Number(parts[2]);
      const pCnt = Number(parts[3]);
      // Layout: lemma pos synset_cnt p_cnt [ptr_symbol x p_cnt] sense_cnt
      // tagsense_cnt [synset_offset x synset_cnt]
      const offsetsStart = 4 + pCnt + 2;
      const synsetOffsets = parts.slice(offsetsStart, offsetsStart + synsetCnt).map(Number);
      const entry: IndexEntry = { pos, synsetOffsets };
      const existing = index.get(lemma);
      if (existing) existing.push(entry);
      else index.set(lemma, [entry]);
    }
  }
  indexCache = index;
  return index;
}

function loadData(): Record<Pos, string> {
  if (dataCache) return dataCache;
  dataCache = {
    noun: readFileSync(`${wordnetDb.path}/data.noun`, 'latin1'),
    verb: readFileSync(`${wordnetDb.path}/data.verb`, 'latin1'),
    adj: readFileSync(`${wordnetDb.path}/data.adj`, 'latin1'),
    adv: readFileSync(`${wordnetDb.path}/data.adv`, 'latin1'),
  };
  return dataCache;
}

// A data-file synset line is addressed directly by its byte offset — the
// same offset the index file stored — so this just slices out the line
// starting there, same "direct access" the WNDB format is designed for.
function readSynsetWords(pos: Pos, offset: number): string[] {
  const data = loadData()[pos];
  const end = data.indexOf('\n', offset);
  const line = data.slice(offset, end === -1 ? undefined : end);
  const parts = line.trim().split(/\s+/);
  // Layout: synset_offset lex_filenum ss_type w_cnt [word lex_id x w_cnt] ...
  const wCnt = parseInt(parts[3], 16); // word count is hex, per the WNDB spec
  const words: string[] = [];
  let i = 4;
  for (let w = 0; w < wCnt; w++) {
    words.push(parts[i]);
    i += 2; // word, then its lex_id — skip the lex_id
  }
  return words;
}

// Same shape and semantics as definitions/wordnet.ts's getSynonymSets:
// one array of synonym lemmas per WordNet sense of the word, multi-word
// entries still underscore-joined ("take_heed") exactly as WordNet stores
// them — callers that need spaces already normalize that themselves.
export function getSynonymSetsSync(word: string): string[][] {
  const index = loadIndex();
  const entries = index.get(word.toLowerCase().replace(/\s+/g, '_'));
  if (!entries) return [];
  const sets: string[][] = [];
  for (const entry of entries) {
    for (const offset of entry.synsetOffsets) {
      sets.push(readSynsetWords(entry.pos, offset));
    }
  }
  return sets;
}
