/**
 * Link checks for messages and the link checker. Same data
 * (shared/scam-domains.json) and same logic as ScamDomainRules.kt, which the
 * Android web shield uses on every lookup; tests/linkRules.test.mjs keeps the
 * two in step. Runs on the phone; links are never sent anywhere.
 */
import data from '../../shared/scam-domains.json' with { type: 'json' };

const lower = list => (list || []).map(item => item.toLowerCase());
const BLOCKED = new Set(lower(data.blocked));
const OFFICIAL = new Set(lower(data.official));
const WHOLE_BRANDS = new Set(lower(data.brands?.whole));
const PART_BRANDS = lower(data.brands?.part);
const BAIT = lower(data.bait);
const SHORTENERS = new Set(lower(data.shorteners));
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'res', 'gen', 'firm', 'ind', 'nic']);
const GENERIC_NAMES = new Set(['google', 'gstatic', 'googleapis']);
const DIGITS = { 0: 'o', 1: 'l', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g' };

export const REASON_TEXT = {
  scam_link: 'Known scam site',
  threat_feed: 'Reported phishing / malware site',
  lookalike: 'Fake bank or shopping site',
  typosquat: 'Copies an official site name',
  redirect: 'Short link to a dangerous site',
  remote_access_lock: 'Screen-sharing locked',
};

export const normalizeDomain = raw => (raw || '').trim().replace(/\.+$/, '').toLowerCase();

/** The name people recognise: "netbanking.hdfcbank.co.in" -> "hdfcbank". */
export function siteName(domain) {
  const labels = domain.split('.');
  if (labels.length >= 3 && SECOND_LEVEL.has(labels[labels.length - 2])) return labels[labels.length - 3];
  return labels.length >= 2 ? labels[labels.length - 2] : labels[0];
}

const BRAND_NAMES = new Set([...OFFICIAL].map(siteName).filter(name => name.length >= 5 && !GENERIC_NAMES.has(name)));

function underAny(domain, set) {
  let candidate = domain;
  for (;;) {
    if (set.has(candidate)) return true;
    const dot = candidate.indexOf('.');
    if (dot < 0) return false;
    candidate = candidate.slice(dot + 1);
  }
}

const fold = name => name.replace(/-/g, '').split('').map(c => DIGITS[c] ?? c).join('').replace(/rn/g, 'm').replace(/vv/g, 'w');

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length];
}

function typoSquatOf(name) {
  if (name.length < 5 || BRAND_NAMES.has(name)) return null;
  const folded = fold(name);
  for (const brand of BRAND_NAMES) {
    if (folded === brand) return brand;
    if (brand.length >= 7 && Math.abs(folded.length - brand.length) <= 1 && editDistance(folded, brand) === 1) return brand;
  }
  return null;
}

export const isShortener = raw => underAny(normalizeDomain(raw), SHORTENERS);
export const isOfficial = raw => underAny(normalizeDomain(raw), OFFICIAL);

/** { blocked, reason, detail } for one domain. `inThreatFeed` is only available on Android. */
export function checkDomain(raw, inThreatFeed = null) {
  const domain = normalizeDomain(raw);
  if (!domain || !domain.includes('.')) return { blocked: false };
  if (underAny(domain, OFFICIAL)) return { blocked: false };
  if (underAny(domain, BLOCKED)) return { blocked: true, reason: 'scam_link', detail: "is on Satark's scam-domain list" };
  if (inThreatFeed?.(domain)) return { blocked: true, reason: 'threat_feed', detail: 'is reported as a phishing or malware site' };

  const labels = domain.split('.').slice(0, -1);
  const words = labels.flatMap(label => label.split(/[-_]/)).filter(Boolean);
  const joined = labels.join('');
  // Also look through disguises ("amaz0n", "5bi") when finding the brand.
  const foldedJoined = fold(joined);
  const wholeBrand = words.find(word => WHOLE_BRANDS.has(word) || WHOLE_BRANDS.has(fold(word)));
  const brand = (wholeBrand && fold(wholeBrand)) || PART_BRANDS.find(part => joined.includes(part) || foldedJoined.includes(part));
  if (brand) {
    const withoutBrand = foldedJoined.split(brand).join('');
    const bait = BAIT.find(b => (b !== brand && words.includes(b)) || (b.length >= 5 && withoutBrand.includes(b)));
    if (bait) {
      return { blocked: true, reason: 'lookalike', detail: `uses the name "${brand}" but is not an official ${brand} site (and says "${bait}")` };
    }
  }
  const squatted = typoSquatOf(siteName(domain));
  if (squatted) return { blocked: true, reason: 'typosquat', detail: `imitates the official "${squatted}" site name` };
  return { blocked: false };
}

// Top-level domains accepted for links written without "http" (so "Mr.Sharma" is not a link).
const BARE_TLDS = new Set(('com in net org co info xyz top link live site online shop club app io ly gy cc me tk ml ga cf gq icu cfd sbs ' +
  'vip buzz rest store click pro biz us uk cn ru page dev bank ai tv ws ink fun win bid loan work today world space website tech asia ' +
  'mobi one support help sbi').split(' '));
const LINK_PATTERN = /(?:https?:\/\/)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:[/?#][^\s<>"']*)?/gi;

/** Host of a link written with or without "https://", or null. */
export function hostOf(url) {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`).hostname;
    return host.includes('.') ? normalizeDomain(host) : null;
  } catch {
    return null;
  }
}

/** Links in a message: [{ url, host }], at most 10, without duplicates. */
export function extractLinks(text) {
  const found = new Map();
  for (const match of (text || '').matchAll(LINK_PATTERN)) {
    const before = text[match.index - 1];
    if (before === '@' || /[\w.-]/.test(before || '')) continue; // e-mail addresses / middle of a word
    const url = match[0].replace(/[.,;:!?)\]]+$/, '');
    const host = hostOf(url);
    if (!host) continue;
    const explicit = /^https?:\/\//i.test(url) || /^www\./i.test(url);
    if (!explicit && !BARE_TLDS.has(host.split('.').pop())) continue;
    if (!found.has(host)) found.set(host, { url, host });
    if (found.size >= 10) break;
  }
  return [...found.values()];
}
