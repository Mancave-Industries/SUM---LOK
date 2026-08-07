import type { DeviceModule, DeviceType } from '../types.js';
import { anagramDevice } from './anagram.js';

// Only Tier 1 devices proven in earlier phases are registered here.
// Phase 2 adds hidden/reversal/alternates/initials to this map.
const deviceRegistry: Partial<Record<DeviceType, DeviceModule>> = {
  anagram: anagramDevice,
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
