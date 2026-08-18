import type { DeviceModule, DeviceType } from '../types.js';
import { anagramDevice } from './anagram.js';
import { hiddenDevice } from './hidden.js';
import { reversalDevice } from './reversal.js';
import { alternatesDevice } from './alternates.js';
import { initialsDevice } from './initials.js';
import { charadeDevice } from './charade.js';
import { containerDevice } from './container.js';
import { deletionDevice } from './deletion.js';
import { homophoneDevice } from './homophone.js';
import { doubleDefinitionDevice } from './doubleDefinition.js';

// Tier 3 devices (homophone, doubleDefinition) ARE registered and run
// through the same construct/verifyMechanics/verifySurface loop as every
// other device — the judgement they require isn't in the mechanical check,
// it's downstream: generateClue.ts sets reviewRequired: true for any
// tier-3 clue, and clueBank.ts routes that straight to review-queue.json
// instead of clues.json. A human has to explicitly approve one before
// assemblePuzzles.ts's tier-3-restricted bank lookup (clues.json only —
// see loadBankClue/loadBankAnswers) will ever use it in a real puzzle.
// crypticDefinition, allInOne, and spoonerism remain unimplemented.
const deviceRegistry: Partial<Record<DeviceType, DeviceModule>> = {
  anagram: anagramDevice,
  hidden: hiddenDevice,
  reversal: reversalDevice,
  alternates: alternatesDevice,
  initials: initialsDevice,
  charade: charadeDevice,
  container: containerDevice,
  deletion: deletionDevice,
  homophone: homophoneDevice,
  doubleDefinition: doubleDefinitionDevice,
};

export function getDevice(type: DeviceType): DeviceModule {
  const device = deviceRegistry[type];
  if (!device) {
    throw new Error(`No device module registered for "${type}"`);
  }
  return device;
}

export function listAvailableDevices(): DeviceType[] {
  return Object.keys(deviceRegistry) as DeviceType[];
}
