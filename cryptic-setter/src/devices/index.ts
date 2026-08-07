import type { DeviceModule, DeviceType } from '../types.js';
import { anagramDevice } from './anagram.js';
import { hiddenDevice } from './hidden.js';
import { reversalDevice } from './reversal.js';
import { alternatesDevice } from './alternates.js';
import { initialsDevice } from './initials.js';

// Only devices proven in earlier phases are registered here. Tier 2 adds
// charade/container/deletion once the definition layer exists.
const deviceRegistry: Partial<Record<DeviceType, DeviceModule>> = {
  anagram: anagramDevice,
  hidden: hiddenDevice,
  reversal: reversalDevice,
  alternates: alternatesDevice,
  initials: initialsDevice,
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
