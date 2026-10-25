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

  // ---- Web shield (local VPN): scam-link blocking, remote-access lock, per-app network log ----
  /** { running, permission, mode: 'off'|'filter'|'lock', lockedUntil, autoLock, remoteAccessApps, allowedDomains, checked, blocked, error } */
  getShieldState: () => (plugin ? plugin.getShieldState() : unavailable()),
  /** Android asks the user to allow the VPN the first time: { status: 'started' | 'denied' }. */
  startShield: () => (plugin ? plugin.startShield() : unavailable()),
  stopShield: () => (plugin ? plugin.stopShield() : unavailable()),
  /** { status: 'locked' | 'needs_shield' | 'no_apps' } */
  lockRemoteAccess: options => (plugin ? plugin.lockRemoteAccess(options || {}) : unavailable()),
  unlockRemoteAccess: () => (plugin ? plugin.unlockRemoteAccess() : unavailable()),
  setShieldOptions: options => (plugin ? plugin.setShieldOptions(options) : unavailable()),
  allowDomain: options => (plugin ? plugin.allowDomain(options) : unavailable()),
  /** { entries: [{ time, lastTime, app, packageName, target, kind, action, reason, detail, count }], checked, blocked } */
  getNetworkLog: options => (plugin ? plugin.getNetworkLog(options || {}) : unavailable({ entries: [] })),
  clearNetworkLog: () => (plugin ? plugin.clearNetworkLog() : unavailable()),

  // ---- Protection dashboard, incident timeline, security scan, link checks ----
  getDashboard: () => (plugin ? plugin.getDashboard() : unavailable()),
  runSecurityScan: () => (plugin ? plugin.runSecurityScan() : unavailable()),
  dismissRiskAlerts: () => (plugin ? plugin.dismissRiskAlerts() : unavailable()),
  clearSecurityEvents: () => (plugin ? plugin.clearSecurityEvents() : unavailable()),
  /** { kind: 'scam_message' | 'scam_recording' | 'link_flagged', title, detail } */
  recordSecurityEvent: event => (plugin ? plugin.recordSecurityEvent(event) : unavailable()),
  /** Downloads the latest phishing / malware domain list: { count, updatedAt, updating, error }. */
  updateThreatFeed: () => (plugin ? plugin.updateThreatFeed() : unavailable()),
  /** { status: 'ok', host, blocked, reason, detail, shortener, official, allowed } */
  checkLink: options => (plugin ? plugin.checkLink(options) : unavailable()),
  /** Follows a short link hop by hop (never opening the final page): { hops, final, verdict, error }. */
  expandLink: options => (plugin ? plugin.expandLink(options) : unavailable()),
  /** { usageAccess, anyActive, anyAccessibility, apps: [...], otherAccessibility: [...] } */
  getRemoteAccessStatus: () => (plugin ? plugin.getRemoteAccessStatus() : unavailable({ apps: [], otherAccessibility: [] })),
  openAppInfo: options => (plugin ? plugin.openAppInfo(options) : unavailable()),
  uninstallApp: options => (plugin ? plugin.uninstallApp(options) : unavailable()),
  /** page: accessibility | usage | airplane | private_dns | developer | security | overlay | vpn */
  openSettingsPage: options => (plugin ? plugin.openSettingsPage(options) : unavailable()),

  addListener: (event, handler) => (plugin ? plugin.addListener(event, handler) : Promise.resolve({ remove: () => {} })),
};
