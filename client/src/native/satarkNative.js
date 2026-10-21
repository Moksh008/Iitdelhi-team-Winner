import { Capacitor, registerPlugin } from '@capacitor/core';

const SatarkNative = registerPlugin('SatarkNative');

export async function startNativeSensing() {
  if (!Capacitor.isNativePlatform()) return null;
  return SatarkNative.startSensing();
}

export async function stopNativeSensing() {
  if (!Capacitor.isNativePlatform()) return null;
  return SatarkNative.stopSensing();
}
