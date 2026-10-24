/**
 * Trusted contact: one person the user chooses to alert at a Tier 2 pause or
 * Tier 3 report. Satark never sends anything itself: it opens the SMS app with
 * a prefilled message and the user presses send. The message names the kind
 * of scam only, never what was said, the amount or the payee.
 */
import { DAY, SecureStore } from './secureStore.js';

const KIND = 'trusted_contact';
const TTL = 5 * 365 * DAY;

let store = null;
function settingsStore() {
  store ||= new SecureStore({ namespace: 'settings' });
  return store;
}

export function normalizeContactNumber(number) {
  const text = String(number || '').trim();
  const plus = text.startsWith('+') ? '+' : '';
  return plus + text.replace(/\D/g, '');
}

export function isValidContactNumber(number) {
  const digits = normalizeContactNumber(number).replace('+', '');
  return digits.length >= 10 && digits.length <= 15;
}

/** Resolves { name, number } or null. */
export async function getTrustedContact() {
  const s = settingsStore();
  await s.load();
  return s.get(KIND);
}

export async function setTrustedContact({ name, number }) {
  if (!isValidContactNumber(number)) throw new Error('Enter a phone number with at least 10 digits.');
  const contact = { name: String(name || '').trim().slice(0, 40), number: normalizeContactNumber(number) };
  const s = settingsStore();
  await s.load();
  s.set(KIND, contact, TTL);
  await s.flush();
  return contact;
}

export async function clearTrustedContact() {
  const s = settingsStore();
  await s.load();
  s.remove(KIND);
  await s.flush();
}

export function trustedContactMessage(scamType) {
  const kind = scamType ? ` that looks like a ${scamType} scam` : ' that looks like a scam';
  return `Satark alert: I may be on a call${kind} and someone is asking me to pay. Please call me now before I send any money.`;
}

/** sms: link with recipient and body (works on Android and in most browsers). */
export function trustedContactSmsLink(contact, scamType) {
  const body = encodeURIComponent(trustedContactMessage(scamType));
  return `sms:${contact?.number || ''}?body=${body}`;
}
