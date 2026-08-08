import type { DeviceModule, DeviceType } from '../types.js';
import { anagramDevice } from './anagram.js';
import { hiddenDevice } from './hidden.js';
import { reversalDevice } from './reversal.js';
import { alternatesDevice } from './alternates.js';
import { initialsDevice } from './initials.js';
import { charadeDevice } from './charade.js';
import { containerDevice } from './container.js';
import { deletionDevice } from './deletion.js';

// Tier 3 devices (homophone, double definition, etc.) are never registered
// here — they require human judgement and are out of scope for the
// automated construct/verify loop entirely.
const deviceRegistry: Partial<Record<DeviceType, DeviceModule>> = {
  anagram: anagramDevice,
  hidden: hiddenDevice,
  reversal: reversalDevice,
  alternates: alternatesDevice,
  initials: initialsDevice,
  charade: charadeDevice,
  container: containerDevice,
  deletion: deletionDevice,
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
