// The §5 generate -> verify loop. Code constructs and mechanically verifies
// the wordplay; the LLM is asked only for a surface reading; every claim it
// makes is re-derived and checked before anything is considered "verified".
// No unverified clue is ever returned from here.

import { randomUUID } from 'node:crypto';
import type { Clue, DeviceType } from '../types.js';
import { getDevice } from '../devices/index.js';
import { writeSurface } from '../llm/surfaceWriter.js';
import { proposeDefinition } from '../llm/proposeDefinition.js';
import {
  combineSurfaceParts,
  verifyDefinitionAtEnd,
  verifyDefinitionDoesNotEchoWordplay,
  verifyWordplayDoesNotRepeatDefinition,
  verifyEnumeration,
} from '../verify/structural.js';
import { verifyDefinitionMeaning } from '../verify/definition.js';

export interface GenerateClueOptions {
  answer: string;
  device: DeviceType;
  // Phase 1/2: pass a hand-trusted seed definition. Phase 3+: omit it and
  // the pipeline will propose one via the LLM and check it against
  // WordNet itself — see verify/definition.ts.
  definition?: string;
  indicatorBank: string[];
  maxRetries?: number;
}

export interface GenerateClueResult {
  clue: Clue | null;
  log: string[];
}

function enumerationFor(answer: string): string {
  return `(${answer.replace(/[^A-Za-z]/g, '').length})`;
}

export async function generateClue(options: GenerateClueOptions): Promise<GenerateClueResult> {
  const { answer, device: deviceType, indicatorBank } = options;
  const maxRetries = options.maxRetries ?? 3;
  const device = getDevice(deviceType);
  const enumeration = enumerationFor(answer);
  const log: string[] = [];

  // Step 1-3: construct the wordplay mechanically. If no legal construction
  // exists for this answer (e.g. no dictionary anagram), skip it — no LLM
  // call is even made.
  const construction = device.construct(answer, indicatorBank);
  if (!construction) {
    log.push(
      `✗ could not construct a ${deviceType} for "${answer}" — no legal fodder/indicator combination found`
    );
    return { clue: null, log };
  }

  const mechanicalCheck = device.verifyMechanics(answer, construction.wordplay, indicatorBank);
  log.push(...mechanicalCheck.log);
  if (!mechanicalCheck.passed) {
    log.push(
      `✗ constructed wordplay failed its own mechanical check — this indicates a bug in the ${deviceType} device, not a fair skip`
    );
    return { clue: null, log };
  }

  const enumerationCheck = verifyEnumeration(answer, enumeration);
  log.push(...enumerationCheck.log);
  if (!enumerationCheck.passed) {
    log.push('✗ enumeration failed before any surface was even requested — aborting');
    return { clue: null, log };
  }

  // Step 4: attach a definition. A caller-supplied seed is trusted as-is
  // (Phase 1/2). Otherwise the LLM proposes one and WordNet checks it —
  // an exact synonym match clears automatically; anything else is still
  // used, but flagged reviewRequired rather than silently accepted.
  let definition = options.definition;
  let definitionReviewRequired = false;
  if (!definition) {
    definition = await proposeDefinition(answer);
    log.push(`--- LLM-proposed definition: "${definition}" ---`);
    const definitionCheck = await verifyDefinitionMeaning(answer, definition);
    log.push(...definitionCheck.log);
    definitionReviewRequired = definitionCheck.reviewRequired;
  }

  // The definition text must literally contain this seed (verifyDefinitionAtEnd
  // enforces that below) — so if the seed itself already echoes a wordplay
  // word, every retry will fail identically. No point spending 3 LLM calls
  // finding that out the slow way.
  const seedEchoCheck = verifyDefinitionDoesNotEchoWordplay(definition, construction.wordplay);
  if (!seedEchoCheck.passed) {
    log.push(...seedEchoCheck.log);
    log.push(`✗ seed definition unavoidably echoes the wordplay — skipping without a surface attempt`);
    return { clue: null, log };
  }

  // Step 5-7: ask for a surface, verify it, retry on failure.
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log.push(`--- surface attempt ${attempt}/${maxRetries} ---`);

    const parts = await writeSurface({
      answer,
      definition,
      device: deviceType,
      wordplay: construction.wordplay,
      enumeration,
    });

    const surfaceSentence = combineSurfaceParts(parts);
    const fullSurface = `${surfaceSentence} ${enumeration}`;

    const structuralCheck = verifyDefinitionAtEnd(fullSurface, parts, definition);
    log.push(...structuralCheck.log);

    const echoCheck = verifyDefinitionDoesNotEchoWordplay(parts.definitionText, construction.wordplay);
    log.push(...echoCheck.log);

    const repeatCheck = verifyWordplayDoesNotRepeatDefinition(parts.wordplayText, definition);
    log.push(...repeatCheck.log);

    // Fodder-based devices need the literal fodder string checked here.
    // Components-based devices (hidden, initials, charade, container) skip
    // this — their surface fairness is a structural property checked by
    // verifySurface below, not literal-string presence, so there's nothing
    // meaningful to log for a field they don't use.
    const wordplayTextLower = parts.wordplayText.toLowerCase();
    let fodderPresent = true;
    if (construction.wordplay.fodder) {
      fodderPresent = wordplayTextLower.includes(construction.wordplay.fodder.toLowerCase());
      log.push(
        fodderPresent
          ? `✓ fodder "${construction.wordplay.fodder}" is present verbatim in the wordplay text`
          : `✗ fodder "${construction.wordplay.fodder}" is missing from the wordplay text the model wrote`
      );
    }

    const indicatorPresent = construction.wordplay.indicator
      ? wordplayTextLower.includes(construction.wordplay.indicator.toLowerCase())
      : true;
    log.push(
      indicatorPresent
        ? `✓ indicator "${construction.wordplay.indicator}" is present verbatim in the wordplay text`
        : `✗ indicator "${construction.wordplay.indicator}" is missing from the wordplay text the model wrote`
    );

    // Devices whose fairness claim is about the rendered surface itself
    // (hidden, initials) get a second check here, against the actual text
    // the model wrote rather than the seed words construct() picked.
    let surfaceCheckPassed = true;
    if (device.verifySurface) {
      const surfaceCheck = device.verifySurface(answer, construction.wordplay, parts.wordplayText);
      log.push(...surfaceCheck.log);
      surfaceCheckPassed = surfaceCheck.passed;
    }

    const allPassed =
      structuralCheck.passed &&
      echoCheck.passed &&
      repeatCheck.passed &&
      fodderPresent &&
      indicatorPresent &&
      surfaceCheckPassed;

    if (allPassed) {
      const clue: Clue = {
        id: randomUUID(),
        answer: answer.toUpperCase(),
        enumeration,
        device: deviceType,
        definition,
        definitionPosition: parts.order === 'definition-first' ? 'start' : 'end',
        wordplay: construction.wordplay,
        surface: fullSurface,
        verified: true,
        verificationLog: log,
        difficulty: 0, // §8 scoring not yet implemented — still a placeholder
        reviewRequired: device.tier === 3 || definitionReviewRequired,
        createdAt: new Date().toISOString(),
      };
      return { clue, log };
    }

    log.push(`✗ attempt ${attempt} failed verification, discarding surface and retrying`);
  }

  log.push(`✗ exhausted ${maxRetries} retries for "${answer}" — skipping`);
  return { clue: null, log };
}
