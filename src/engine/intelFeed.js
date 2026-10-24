/**
 * Signed scam-intel feed: hashed phone numbers and UPI IDs from public reports.
 *
 * The feed is only trusted if its ECDSA P-256 signature checks out against the
 * public key pinned below, it has not expired, and it was not issued in the
 * future. Entries need reports from at least `min_sources` independent sources
 * (corroboration), so one poisoned report cannot list a number on its own.
 *
 * A match is the "N" signal: it raises the conversation score a little but can
 * never raise an alert by itself (see decisionEngine.js).
 *
 * Sign a new feed with tools/sign-intel-feed.mjs.
 */
import bundledFeed from '../../shared/scam-intel-feed.json' with { type: 'json' };
import { INTEL_FEED_PUBLIC_KEY } from './intelFeedKey.js';

const MAX_ENTRIES = 200000; // rate limit: refuse absurdly large feeds
const DEFAULT_MIN_SOURCES = 2;

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Indian numbers are compared as 91 + last 10 digits; other numbers as all digits. */
export function normalizePhone(number) {
  const digits = String(number || '').replace(/\D/g, '');
  if (digits.length >= 10 && (digits.length === 10 || digits.startsWith('91') || digits.startsWith('0'))) {
    return `91${digits.slice(-10)}`;
  }
  return digits;
}

export function normalizeVpa(vpa) {
  return String(vpa || '').trim().toLowerCase();
}

/** Hashes are domain-separated so a phone hash can never match a UPI ID hash. */
export const hashPhone = number => sha256Hex(`phone:${normalizePhone(number)}`);
export const hashVpa = vpa => sha256Hex(`vpa:${normalizeVpa(vpa)}`);

export class IntelFeed {
  constructor(payload) {
    const minSources = payload.min_sources ?? DEFAULT_MIN_SOURCES;
    this.version = payload.version;
    this.issuedAt = payload.issued_at;
    this.expiresAt = payload.expires_at;
    this.note = payload.note || '';
    this.phones = new Set();
    this.vpas = new Set();
    for (const entry of payload.entries || []) {
      if ((entry.sources ?? 0) < minSources) continue;
      if (entry.type === 'phone') this.phones.add(entry.sha256);
      if (entry.type === 'vpa') this.vpas.add(entry.sha256);
    }
  }

  get size() {
    return this.phones.size + this.vpas.size;
  }

  async hasPhone(number) {
    if (!number) return false;
    return this.phones.has(await hashPhone(number));
  }

  async hasVpa(vpa) {
    if (!vpa) return false;
    return this.vpas.has(await hashVpa(vpa));
  }
}

/**
 * Verifies a signed feed. Resolves { feed, error }: feed is an IntelFeed when
 * everything checks out, otherwise null with the reason in error.
 */
export async function verifyIntelFeed(signed, { publicKey = INTEL_FEED_PUBLIC_KEY, now = Date.now() } = {}) {
  try {
    if (!signed?.payload_json || !signed?.signature) return { feed: null, error: 'missing payload or signature' };
    if (!publicKey) return { feed: null, error: 'no pinned public key' };
    const key = await crypto.subtle.importKey('jwk', publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromBase64(signed.signature),
      new TextEncoder().encode(signed.payload_json),
    );
    if (!valid) return { feed: null, error: 'bad signature' };
    const payload = JSON.parse(signed.payload_json);
    if (Date.parse(payload.issued_at) > now + 5 * 60 * 1000) return { feed: null, error: 'issued in the future' };
    if (Date.parse(payload.expires_at) <= now) return { feed: null, error: 'expired' };
    if ((payload.entries || []).length > MAX_ENTRIES) return { feed: null, error: 'too many entries' };
    return { feed: new IntelFeed(payload), error: null };
  } catch (error) {
    return { feed: null, error: `invalid feed: ${error?.message || error}` };
  }
}

/** Verifies the feed shipped inside the app. */
export function loadBundledIntelFeed(options) {
  return verifyIntelFeed(bundledFeed, options);
}
