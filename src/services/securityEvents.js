/**
 * Protection dashboard data and the incident timeline.
 *
 * On Android everything lives in the native SecurityCenter, which also hears
 * the web shield and the call guardian while the app is closed. In a browser
 * only message checks happen, so a small timeline is kept in local storage with
 * the same rule: two different kinds of scam signs within 30 minutes become one
 * high-risk incident.
 */
import { SatarkNative, isNativeApp } from '../native/satarkNative';

const KEY = 'satark.security.v1';
const WINDOW_MS = 30 * 60 * 1000;
const SIGNAL = { link_flagged: 'LINK', scam_message: 'SCAM_TALK', scam_recording: 'SCAM_TALK' };
const SIGNAL_LABEL = { LINK: 'dangerous link', REMOTE: 'screen-sharing app', SCAM_TALK: 'scam call or message', PAYMENT: 'payment app' };

function readLocal() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY)) || { events: [], scan: null };
  } catch {
    return { events: [], scan: null };
  }
}

function writeLocal(state) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...state, events: state.events.slice(0, 100) }));
  } catch {
    // Storage full or unavailable.
  }
}

const listeners = new Set();
/** Called after the timeline changes (web only; Android sends 'securityUpdate'). */
export function onLocalSecurityChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** kind: 'scam_message' | 'scam_recording' | 'link_flagged'. */
export async function recordSecurityEvent({ kind, title, detail }) {
  if (isNativeApp) {
    await SatarkNative.recordSecurityEvent({ kind, title, detail }).catch(() => undefined);
    return;
  }
  const state = readLocal();
  const now = Date.now();
  const nextId = (state.events[0]?.id || 0) + 1;
  state.events.unshift({ id: nextId, time: now, kind, signal: SIGNAL[kind] || null, severity: 'warning', title, detail, dismissed: false });
  const recent = state.events.filter(event => event.signal && now - event.time <= WINDOW_MS).sort((a, b) => a.time - b.time);
  const signals = [...new Set(recent.map(event => event.signal))].sort();
  const key = signals.join('+');
  const alreadyRaised = state.events.some(event => event.kind === 'high_risk' && event.key === key && now - event.time <= WINDOW_MS);
  if (signals.length >= 2 && !alreadyRaised) {
    const clock = time => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    state.events.unshift({
      id: nextId + 1, time: now, kind: 'high_risk', key, signal: null, severity: 'high', dismissed: false,
      title: `High risk: ${signals.map(signal => SIGNAL_LABEL[signal]).join(' + ')}`,
      detail: `Several scam signs happened together:\n${recent.map(event => `${clock(event.time)} — ${event.title}`).join('\n')}\n\n` +
        "Stop now. Don't pay, don't share an OTP or PIN, and call your bank on a number you know.",
    });
  }
  writeLocal(state);
  listeners.forEach(listener => listener());
}

/** Everything the home dashboard shows. */
export async function getDashboard() {
  if (isNativeApp) return SatarkNative.getDashboard();
  const state = readLocal();
  const now = Date.now();
  const active = state.events.filter(event => !event.dismissed && event.severity !== 'info' && now - event.time <= WINDOW_MS);
  const today = new Date().toDateString();
  return {
    riskLevel: active.some(event => event.severity === 'high') ? 'high' : (active.length ? 'warning' : 'ok'),
    threatsBlockedToday: new Set(state.events.filter(event => event.kind === 'link_flagged' && new Date(event.time).toDateString() === today)
      .map(event => event.title)).size,
    activeAlerts: active,
    timeline: state.events.slice(0, 40),
    shield: null,
    remote: null,
    calls: { listening: false, overlayAllowed: false, lastAlert: state.events.find(event => event.kind === 'scam_message') || null },
    network: null,
    scan: state.scan,
  };
}

export async function runSecurityScan() {
  if (isNativeApp) return SatarkNative.runSecurityScan();
  const scan = {
    time: Date.now(),
    issues: 0,
    checks: [
      { id: 'messages', status: 'ok', title: 'Message and link checks are ready', detail: 'Paste a message on the Calls screen to check its words and links.' },
      { id: 'web', status: 'info', title: 'Full phone scan needs the Android app', detail: 'Link blocking, screen-sharing detection and the network log run on the phone.' },
    ],
  };
  writeLocal({ ...readLocal(), scan });
  return scan;
}

export async function dismissRiskAlerts() {
  if (isNativeApp) return SatarkNative.dismissRiskAlerts();
  const state = readLocal();
  state.events.forEach(event => { event.dismissed = true; });
  writeLocal(state);
  listeners.forEach(listener => listener());
  return undefined;
}

export async function clearSecurityEvents() {
  if (isNativeApp) return SatarkNative.clearSecurityEvents();
  writeLocal({ ...readLocal(), events: [] });
  listeners.forEach(listener => listener());
  return undefined;
}
