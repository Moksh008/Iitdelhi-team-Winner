/**
 * Free OpenStreetMap-based place lookup (no API key, no billing).
 *
 *  - Geocoding: Nominatim public API  (https://operations.osmfoundation.org/policies/nominatim/)
 *  - Nearby places: Overpass API       (https://wiki.openstreetmap.org/wiki/Overpass_API)
 *
 * These are shared community services with usage limits, so this module:
 *  - sends an identifying User-Agent on Android (browsers send a Referer instead),
 *  - keeps Nominatim to at most one request per second and never autocompletes,
 *  - caches geocodes for 7 days and place lists for 24 hours on the device,
 *  - de-duplicates in-flight requests and applies timeouts.
 *
 * Only the typed place name or the chosen coordinates are sent. Call transcripts are never sent.
 * Nothing here invents a place, address, distance or phone number: every field comes from OSM data.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

const USER_AGENT = 'Satark/1.1 (in.satark.shield; scam-shield hackathon demo; https://github.com/Moksh008/Satark)';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Public community instances, tried in order. They are often busy, so each gets a short timeout.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const CACHE_PREFIX = 'satark.osm.v1:';
const GEOCODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PLACES_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 60;
export const MAX_RESULTS = 5;

export const PLACE_CATEGORIES = [
  {
    id: 'shop', label: 'Shops & businesses',
    selectors: ['nwr["shop"]["name"]', 'nwr["craft"]["name"]'],
    fallback: { q: ['supermarket', 'bakery', 'hardware', 'department store'], accept: r => r.category === 'shop' || r.category === 'craft' },
  },
  {
    id: 'hospital', label: 'Hospitals & clinics',
    selectors: ['nwr["amenity"~"^(hospital|clinic|doctors)$"]["name"]', 'nwr["healthcare"~"^(hospital|clinic|centre)$"]["name"]'],
    fallback: { q: ['hospital', 'clinic'], accept: r => ['hospital', 'clinic', 'doctors'].includes(r.type) },
  },
  {
    id: 'pharmacy', label: 'Pharmacies',
    selectors: ['nwr["amenity"="pharmacy"]["name"]', 'nwr["shop"="chemist"]["name"]', 'nwr["healthcare"="pharmacy"]["name"]'],
    fallback: { q: ['pharmacy', 'chemist'], accept: r => ['pharmacy', 'chemist'].includes(r.type) },
  },
  {
    id: 'police', label: 'Police stations',
    selectors: ['nwr["amenity"="police"]["name"]'],
    fallback: { q: ['police'], accept: r => r.type === 'police' },
  },
  {
    id: 'cybercrime', label: 'Cybercrime police',
    selectors: ['nwr["amenity"="police"]["name"~"cyber",i]', 'nwr["office"="government"]["name"~"cyber",i]'],
    fallback: { q: ['cyber police'], accept: r => /cyber/i.test(r.name || '') },
  },
  {
    id: 'bank', label: 'Banks',
    selectors: ['nwr["amenity"="bank"]["name"]', 'nwr["office"="financial"]["name"]'],
    fallback: { q: ['bank'], accept: r => r.type === 'bank' || r.type === 'financial' },
  },
];

const inflight = new Map();
let lastNominatimAt = 0;
// After every Overpass instance fails, skip Overpass for a while instead of
// making the user wait through the timeouts again.
const OVERPASS_COOLDOWN_MS = 5 * 60 * 1000;
let overpassDownUntil = 0;

function cacheGet(key) {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      window.localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

function cacheSet(key, value, ttlMs) {
  try {
    const keys = Object.keys(window.localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    if (keys.length >= MAX_CACHE_ENTRIES) {
      keys
        .map(k => ({ k, at: JSON.parse(window.localStorage.getItem(k) || '{}').expiresAt || 0 }))
        .sort((a, b) => a.at - b.at)
        .slice(0, keys.length - MAX_CACHE_ENTRIES + 1)
        .forEach(({ k }) => window.localStorage.removeItem(k));
    }
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
  } catch {
    // Storage full or unavailable: caching is best-effort.
  }
}

export function clearPlaceCache() {
  Object.keys(window.localStorage)
    .filter(k => k.startsWith(CACHE_PREFIX))
    .forEach(k => window.localStorage.removeItem(k));
}

async function httpRequest({ url, method = 'GET', params, data, timeoutMs }) {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  if (Capacitor.isNativePlatform()) {
    // Native HTTP lets us send the identifying User-Agent the OSM policies ask for.
    const response = await CapacitorHttp.request({
      url: url + query,
      method,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      data: data ? new URLSearchParams(data).toString() : undefined,
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url + query, {
      method,
      headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: data ? new URLSearchParams(data).toString() : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Request timed out');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

function dedupe(key, task) {
  if (inflight.has(key)) return inflight.get(key);
  const promise = task().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

function friendlyError(error, service) {
  const message = error?.message || 'request failed';
  if (/HTTP 429/.test(message)) return `${service} is rate-limiting requests. Wait a minute and try again.`;
  if (/HTTP 403/.test(message)) return `${service} refused the request (usage-policy block). Try again later or use the public map search link.`;
  if (/HTTP 5\d\d|HTTP 504/.test(message)) return `${service} is busy right now. Try again shortly.`;
  if (/timed out/i.test(message)) return `${service} did not respond in time. Check your connection and try again.`;
  return `${service} could not be reached (${message}). Check your internet connection.`;
}

/**
 * Broader fallbacks for a query OSM does not know, e.g.
 * "Anardana Chowk, Patiala" -> "Patiala". At most two extra lookups.
 */
export function broaderQueries(query) {
  const parts = query.split(',').map(part => part.trim()).filter(Boolean);
  const out = [];
  for (let i = 1; i < parts.length && out.length < 2; i += 1) out.push(parts.slice(i).join(', '));
  if (!out.length) {
    const words = query.trim().split(/\s+/);
    if (words.length > 2) out.push(words.slice(-1)[0]);
  }
  return out.filter(candidate => candidate.length >= 3);
}

/**
 * Resolves a typed place, widening the search when the exact place is not in
 * OpenStreetMap. The result says which text actually matched so the UI can
 * tell the user that results are around a broader area.
 */
export async function resolvePlace(query) {
  const exact = await geocode(query);
  if (exact) return { ...exact, matchedQuery: query.trim(), approximate: false };
  for (const candidate of broaderQueries(query)) {
    const broader = await geocode(candidate);
    if (broader) return { ...broader, matchedQuery: candidate, approximate: true };
  }
  return null;
}

// Nominatim's usage policy allows at most one request per second.
async function nominatimTurn() {
  const wait = lastNominatimAt + 1100 - Date.now();
  if (wait > 0) await new Promise(resolve => window.setTimeout(resolve, wait));
  lastNominatimAt = Date.now();
}

/** Converts a typed place name into coordinates. Returns null when nothing matches. */
export async function geocode(query) {
  const cleaned = query.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 3) throw new Error('Enter at least 3 characters for the place name.');
  const key = `geo:${cleaned.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  return dedupe(key, async () => {
    await nominatimTurn();
    let results;
    try {
      results = await httpRequest({
        url: NOMINATIM_URL,
        params: { q: cleaned, format: 'jsonv2', countrycodes: 'in', limit: '5', addressdetails: '1' },
        timeoutMs: 10000,
      });
    } catch (error) {
      throw new Error(friendlyError(error, 'The OpenStreetMap geocoder (Nominatim)'));
    }
    // Large administrative areas (e.g. a district) have centroids far from the
    // town people mean, so prefer the first more specific match.
    const list = Array.isArray(results) ? results : [];
    const tooBroad = result => ['state', 'state_district', 'county', 'district', 'region', 'country'].includes(result.addresstype);
    const top = list.find(result => !tooBroad(result)) || list[0] || null;
    const value = top ? {
      lat: Number(top.lat),
      lon: Number(top.lon),
      label: top.display_name,
      locality: top.address?.city || top.address?.town || top.address?.village || top.address?.suburb
        || top.address?.state_district || top.address?.county || top.address?.state || '',
    } : null;
    cacheSet(key, value, GEOCODE_TTL_MS);
    return value;
  });
}

export function distanceKm(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function formatAddress(tags) {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:place'],
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:city'] || tags['addr:district'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : tags['addr:full'] || '';
}

/**
 * A public web search the user can open to find the place's contact details
 * themselves. It is a search, not a verified contact.
 */
export function contactSearchUrl(name, locality) {
  const query = [name, locality].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Fallback when the place services are unavailable: a public map search for
 * the whole category around the chosen area. It lists nothing itself.
 */
export function categorySearchUrl(categoryLabel, locality) {
  return contactSearchUrl(`${categoryLabel} near`, locality).replace('near%2C%20', 'near%20');
}

function buildQuery(category, lat, lon, radiusM) {
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)})`;
  const body = category.selectors.map(selector => `${selector}${around};`).join('');
  return `[out:json][timeout:12];(${body});out center tags 80;`;
}

async function nominatimCategorySearch(category, lat, lon, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  // Nominatim only understands specific types ("supermarket", not "shop"), so
  // try a few terms in turn (one request per second) and merge the results.
  const results = [];
  for (const term of category.fallback.q) {
    await nominatimTurn();
    const batch = await httpRequest({
      url: NOMINATIM_URL,
      params: {
        q: term,
        format: 'jsonv2',
        viewbox: [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map(v => v.toFixed(5)).join(','),
        bounded: '1',
        limit: '20',
        extratags: '1',
        addressdetails: '1',
      },
      timeoutMs: 12000,
    });
    if (Array.isArray(batch)) results.push(...batch);
    if (results.filter(result => result.name && category.fallback.accept(result)).length >= MAX_RESULTS) break;
  }
  return results
    .filter(result => result.name && category.fallback.accept(result))
    .map(result => {
      const address = result.address || {};
      const extra = result.extratags || {};
      return {
        type: result.osm_type,
        id: result.osm_id,
        lat: Number(result.lat),
        lon: Number(result.lon),
        tags: {
          name: result.name,
          'addr:housenumber': address.house_number,
          'addr:street': address.road,
          'addr:suburb': address.suburb || address.neighbourhood,
          'addr:city': address.city || address.town || address.village,
          'addr:postcode': address.postcode,
          phone: extra.phone || extra['contact:phone'],
          website: extra.website || extra['contact:website'],
        },
      };
    });
}

/**
 * Finds up to MAX_RESULTS named places of one category near a point,
 * sorted by straight-line distance.
 */
export async function searchNearby({ lat, lon, categoryId, radiusKm, locality = '' }) {
  const category = PLACE_CATEGORIES.find(item => item.id === categoryId);
  if (!category) throw new Error(`Unknown category ${categoryId}`);
  const radiusM = Math.min(Math.max(radiusKm, 0.5), 20) * 1000;
  // ~110 m grid so nearby repeat searches reuse the cache instead of hitting Overpass again.
  const key = `places:${categoryId}:${lat.toFixed(3)}:${lon.toFixed(3)}:${radiusM}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, fromCache: true };

  return dedupe(key, async () => {
    const query = buildQuery(category, lat, lon, radiusM);
    let payload = null;
    let lastError = new Error('Request timed out');
    if (Date.now() >= overpassDownUntil) {
      // Ask the instances together and take the first answer, so a dead
      // instance costs one 10 s timeout instead of 12 s each, one after another.
      try {
        payload = await Promise.any(OVERPASS_URLS.map(url =>
          httpRequest({ url, method: 'POST', data: { data: query }, timeoutMs: 10000 })
            .then(result => {
              if (!Array.isArray(result?.elements)) throw new Error('unexpected Overpass reply');
              return result;
            })));
      } catch (error) {
        lastError = error.errors?.[0] || error;
        overpassDownUntil = Date.now() + OVERPASS_COOLDOWN_MS;
      }
    }
    let elements;
    let source = 'overpass';
    if (payload) {
      elements = payload.elements || [];
    } else {
      // Overpass instances are often overloaded; fall back to Nominatim's
      // bounded search over the same OpenStreetMap data (less complete).
      try {
        elements = await nominatimCategorySearch(category, lat, lon, radiusM);
        source = 'nominatim';
      } catch (fallbackError) {
        // Both services failed; a rate limit is the more useful thing to tell the user.
        if (/HTTP 429/.test(fallbackError?.message || '')) throw new Error(friendlyError(fallbackError, 'OpenStreetMap'));
        throw new Error(friendlyError(lastError, 'The OpenStreetMap places service (Overpass)'));
      }
    }

    const seen = new Set();
    const places = elements
      .map(element => {
        const tags = element.tags || {};
        const plat = element.lat ?? element.center?.lat;
        const plon = element.lon ?? element.center?.lon;
        if (!tags.name || plat == null || plon == null) return null;
        const placeLocality = tags['addr:city'] || tags['addr:suburb'] || tags['addr:district'] || locality;
        return {
          id: `${element.type}/${element.id}`,
          name: tags.name,
          category: category.label,
          lat: plat,
          lon: plon,
          distanceKm: Math.round(distanceKm(lat, lon, plat, plon) * 10) / 10,
          address: formatAddress(tags),
          // Community-edited OSM data: shown as "listed on OpenStreetMap", never as verified.
          osmPhone: tags.phone || tags['contact:phone'] || tags['phone:mobile'] || '',
          osmWebsite: tags.website || tags['contact:website'] || '',
          searchUrl: contactSearchUrl(tags.name, placeLocality),
          osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        };
      })
      .filter(Boolean)
      .filter(place => {
        const dedupeKey = `${place.name.toLowerCase()}|${place.lat.toFixed(4)}|${place.lon.toFixed(4)}`;
        if (seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return place.distanceKm <= radiusM / 1000;
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_RESULTS);

    const value = { places, source, retrievedAt: new Date().toISOString() };
    // An empty list from the fallback is not trustworthy enough to cache; Overpass answers are.
    if (places.length || source === 'overpass') cacheSet(key, value, PLACES_TTL_MS);
    return value;
  });
}
