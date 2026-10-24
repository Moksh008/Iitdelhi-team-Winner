/**
 * Thin wrapper around the SatarkNative Capacitor plugin (Android).
 * In a browser every call resolves to a "not available" result so the web
 * build keeps working with typed transcripts only.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export const isNativeApp = Capacitor.isNativePlatform();
const plugin = isNativeApp ? registerPlugin('SatarkNative') : null;

const unavailable = (extra = {}) => Promise.resolve({ status: 'unavailable', ...extra });

export const SatarkNative = {
  enableOverlay: () => (plugin ? plugin.enableOverlay() : unavailable()),
  openOverlaySettings: () => (plugin ? plugin.openOverlaySettings() : unavailable()),
  /** Opens Android's share sheet with text; the user chooses the app. */
  shareText: payload => (plugin ? plugin.shareText(payload) : unavailable()),
  /** Opens Android's settings page for Satark (permissions, storage). */
  openAppSettings: () => (plugin ? plugin.openAppSettings() : unavailable()),
  startSensing: options => (plugin ? plugin.startSensing(options) : unavailable()),
  stopSensing: () => (plugin ? plugin.stopSensing() : unavailable()),

  /** { speech: { state, detail }, llm: { state, bytesDownloaded, totalBytes, detail } } */
  getModelStatus: () => (plugin ? plugin.getModelStatus() : unavailable({ speech: { state: 'unavailable' }, llm: { state: 'unavailable' } })),
  downloadLlm: () => (plugin ? plugin.downloadLlm() : unavailable()),
  cancelLlmDownload: () => (plugin ? plugin.cancelLlmDownload() : unavailable()),
  deleteLlm: () => (plugin ? plugin.deleteLlm() : unavailable()),

  /**
   * Asks the on-device LLM for a short, validated explanation of an alert the
   * rules already raised. Resolves { status: 'ok', explanation } or another status.
   */
  explainAlert: payload => (plugin ? plugin.explainAlert(payload) : unavailable()),

  /** { listening, status, level, hearingSpeech, transcribing, micBlocked, lines, alert } */
  getListeningState: () => (plugin ? plugin.getListeningState() : Promise.resolve({ listening: false, status: 'Not listening', lines: [] })),

  /**
   * Opens the file picker for a recording and turns it into text on the phone.
   * { status: 'ok', name, durationSeconds, segments: [{ start, end, text }] } | { status: 'cancelled' } | { status: 'error', message }
   */
  pickRecording: () => (plugin ? plugin.pickRecording() : unavailable()),

  /** Alert the overlay asked the app to open in full (or null). */
  takePendingAlert: () => (plugin ? plugin.takePendingAlert() : Promise.resolve({ alert: null })),

  addListener: (event, handler) => (plugin ? plugin.addListener(event, handler) : Promise.resolve({ remove: () => {} })),
};
