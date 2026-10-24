/**
 * Encrypted local store with per-record expiry.
 *
 * Records live in memory while the app runs and are written to storage as one
 * AES-GCM encrypted blob. The 256-bit key is generated on the device, marked
 * non-extractable, and kept in IndexedDB (where the browser stores it as an
 * opaque CryptoKey); it never appears in the stored blob. Expired records are
 * dropped on load, on every read and before every write.
 *
 * Limits: this protects the data at rest from casual extraction (backups,
 * copied app storage). Anyone who can run code inside the app can still read
 * it. Android Keystore would be the stronger home for the key in production.
 *
 * Without IndexedDB (Node, tests, metrics) the key exists only in memory, so
 * nothing survives a restart, which is the safe failure mode.
 */

const BLOB_VERSION = 1;
const KEY_DB = 'satark-keys';
const KEY_STORE = 'keys';

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** In-memory storage with the localStorage interface. */
export function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: key => { map.delete(key); },
  };
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw in some sandboxed WebViews.
  }
  return memoryStorage();
}

function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function newKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

function openKeyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(KEY_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(KEY_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, mode);
    const request = action(tx.objectStore(KEY_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Loads this namespace's key from IndexedDB, creating it on first use. */
export async function deviceKeyProvider(namespace) {
  if (typeof indexedDB === 'undefined') return newKey();
  try {
    const db = await openKeyDb();
    let key = await idbRequest(db, 'readonly', store => store.get(namespace));
    if (!key) {
      key = await newKey();
      await idbRequest(db, 'readwrite', store => store.put(key, namespace));
    }
    db.close();
    return key;
  } catch {
    return newKey();
  }
}

export class SecureStore {
  constructor({ namespace, storage = defaultStorage(), keyProvider = deviceKeyProvider, now = () => Date.now() } = {}) {
    if (!namespace) throw new Error('SecureStore needs a namespace');
    this.namespace = namespace;
    this.storageKey = `satark.secure.${namespace}`;
    this.storage = storage;
    this.keyProvider = keyProvider;
    this.now = now;
    this.records = []; // { kind, value, expiresAt }
    this.key = null;
    this.writes = Promise.resolve();
    this.loaded = null;
    this.isLoaded = false;
    // Removals made before loading finished, re-applied to what is loaded.
    this.pendingRemovals = [];
  }

  /** Decrypts what was saved earlier. Safe to call more than once. */
  load() {
    this.loaded ||= this.loadOnce();
    return this.loaded;
  }

  async loadOnce() {
    this.key = await this.keyProvider(this.namespace);
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) {
      this.isLoaded = true;
      this.pendingRemovals = [];
      return;
    }
    try {
      const blob = JSON.parse(raw);
      if (blob.v !== BLOB_VERSION) throw new Error('unknown version');
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(blob.iv) }, this.key, fromBase64(blob.data));
      let saved = JSON.parse(new TextDecoder().decode(plain));
      for (const removal of this.pendingRemovals) saved = saved.filter(record => !removal(record));
      // Anything recorded before loading finished is kept as well.
      this.records = [...saved, ...this.records];
    } catch {
      // Wrong key (e.g. app data restored to another phone) or damaged blob: start empty.
      this.storage.removeItem(this.storageKey);
    }
    this.isLoaded = true;
    this.pendingRemovals = [];
    if (this.purgeExpired()) this.persist();
  }

  /** Drops expired records. Returns true if anything was removed. */
  purgeExpired() {
    const at = this.now();
    const before = this.records.length;
    this.records = this.records.filter(record => record.expiresAt > at);
    return this.records.length !== before;
  }

  /** Adds a record that disappears after ttlMs. maxPerKind keeps only the newest. */
  add(kind, value, ttlMs, { maxPerKind } = {}) {
    this.purgeExpired();
    this.records.push({ kind, value, expiresAt: this.now() + ttlMs });
    if (maxPerKind) {
      const ofKind = this.records.filter(record => record.kind === kind);
      const extra = ofKind.length - maxPerKind;
      if (extra > 0) {
        const drop = new Set(ofKind.slice(0, extra));
        this.records = this.records.filter(record => !drop.has(record));
      }
    }
    this.persist();
  }

  /** Replaces every record of this kind with one value. */
  set(kind, value, ttlMs) {
    this.records = this.records.filter(record => record.kind !== kind);
    this.add(kind, value, ttlMs);
  }

  /** Values of one kind that have not expired, oldest first. */
  list(kind) {
    if (this.purgeExpired()) this.persist();
    return this.records.filter(record => record.kind === kind).map(record => record.value);
  }

  get(kind) {
    const values = this.list(kind);
    return values.length ? values[values.length - 1] : null;
  }

  remove(kind, predicate = () => true) {
    const matches = record => record.kind === kind && predicate(record.value);
    if (!this.isLoaded) this.pendingRemovals.push(matches);
    const before = this.records.length;
    this.records = this.records.filter(record => record.kind !== kind || !predicate(record.value));
    if (this.records.length !== before) this.persist();
  }

  clear() {
    if (!this.isLoaded) this.pendingRemovals.push(() => true);
    this.records = [];
    this.persist();
  }

  /** Writes are queued so they land in order; await flush() to be sure they are done. */
  persist() {
    this.writes = this.writes.then(() => this.write()).catch(() => undefined);
    return this.writes;
  }

  flush() {
    return this.writes;
  }

  async write() {
    if (!this.key) await this.load();
    if (!this.records.length) {
      this.storage.removeItem(this.storageKey);
      return;
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(this.records));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.key, plain));
    this.storage.setItem(this.storageKey, JSON.stringify({ v: BLOB_VERSION, iv: toBase64(iv), data: toBase64(data) }));
  }
}
