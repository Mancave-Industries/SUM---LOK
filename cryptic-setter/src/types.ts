// Core data model — brief §6, plus the internal shapes the pipeline passes
// between device construction, the LLM surface writer, and the verifier.

export type DeviceType =
  // Tier 1 — pure letter operations
  | 'anagram'
  | 'hidden'
  | 'reversal'
  | 'alternates'
  | 'initials'
  // Tier 2 — needs abbreviation/synonym tables
  | 'charade'
  | 'container'
  | 'deletion'
  // Tier 3 — judgement devices, never auto-shipped
  | 'homophone'
  | 'doubleDefinition'
  | 'crypticDefinition'
  | 'allInOne'
  | 'spoonerism';

export type DeviceTier = 1 | 2 | 3;

export type DefinitionPosition = 'start' | 'end';

export interface Wordplay {
  indicator?: string;
  fodder?: string; // Tier 1
  components?: string[]; // Tier 2 charade/container parts
  operation: string; // machine-readable parse, e.g. "anagram(LISTEN, fodder=SILENT)"
}

export interface Clue {
  id: string;
  answer: string;
  enumeration: string; // "(6)", "(4,4)"
  device: DeviceType;
  definition: string;
  definitionPosition: DefinitionPosition;
  wordplay: Wordplay;
  surface: string;
  verified: boolean;
  verificationLog: string[];
  difficulty: number;
  reviewRequired: boolean;
  createdAt: string;
}

// What a device's construct() step produces: a mechanically-valid wordplay
// for a given answer, before any surface reading has been written.
export interface DeviceConstruction {
  device: DeviceType;
  wordplay: Wordplay;
}

// What the LLM must hand back for the surface reading. Splitting definition
// and wordplay into labelled parts (rather than one freeform sentence) is
// what lets the "definition sits at one end" rule be checked mechanically —
// see verify/structural.ts.
export interface SurfaceParts {
  definitionText: string;
  wordplayText: string;
  order: 'definition-first' | 'wordplay-first';
}

export interface DeviceModule {
  type: DeviceType;
  tier: DeviceTier;
  // Attempt to construct a mechanically-valid wordplay for this answer.
  // Returns null if no legal construction can be found (e.g. no dictionary
  // anagram exists for this answer) — the pipeline skips and logs it.
  construct(answer: string, indicatorBank: string[]): DeviceConstruction | null;
  // Re-derive and check the wordplay against the answer from scratch. This
  // is the deterministic fairness guarantee — never an LLM judgement.
  verifyMechanics(
    answer: string,
    wordplay: Wordplay,
    indicatorBank: string[]
  ): { passed: boolean; log: string[] };
  // Optional second check that runs against the LLM's actual rendered
  // wordplay text rather than the constructed wordplay object. Needed by
  // devices whose fairness claim is about the surface itself — a hidden
  // word must really be findable in the rendered clue, not just in the
  // seed words construct() picked as raw material.
  verifySurface?(answer: string, wordplayText: string): VerificationResult;
}

export interface VerificationResult {
  passed: boolean;
  log: string[];
}
