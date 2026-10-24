import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SatarkDecisionEngine } from '../src/engine/decisionEngine.js';
import { DAY, HOUR, SecureStore, memoryStorage } from '../src/engine/secureStore.js';
import { IntelFeed, hashPhone, hashVpa, loadBundledIntelFeed, verifyIntelFeed } from '../src/engine/intelFeed.js';
import { trustedContactMessage, trustedContactSmsLink, isValidContactNumber } from '../src/engine/trustedContact.js';

const SCAM_CALL = [
  'I am calling from the CBI cyber crime cell, there is an arrest warrant against you.',
  'Do not disconnect this call and do not tell anyone in your family.',
];
const RISKY_PAYMENT = { payeeVPA: 'escrow.verify@okhdfcbank', amount: 480000, userMedian: 3500, isFirstTimePayee: true };

function setup({ intel = null, storage = memoryStorage(), keyProvider } = {}) {
  const clock = { t: Date.parse('2026-10-01T10:00:00Z') };
  const now = () => clock.t;
  const store = new SecureStore({ namespace: 'test', storage, now, ...(keyProvider ? { keyProvider } : {}) });
  const engine = new SatarkDecisionEngine({ now, intel, store });
  return { clock, engine, store };
}

async function scamCall(engine, clock, caller = { number: '+91 9000000001' }) {
  await engine.startCallSession(caller);
  for (const line of SCAM_CALL) {
    clock.t += 3000;
    engine.ingestChunk(line);
  }
}

test('tier 2 needs both signals; neither alone pauses', async () => {
  const { clock, engine } = setup();
  await scamCall(engine, clock);
  const paused = await engine.evaluatePaymentContext(RISKY_PAYMENT);
  assert.equal(paused.decisionTier, 2);

  const quiet = setup();
  await quiet.engine.startCallSession({ number: '+91 9000000002' });
  quiet.engine.ingestChunk('see you at dinner tonight');
  assert.equal((await quiet.engine.evaluatePaymentContext(RISKY_PAYMENT)).decisionTier, 0);

  const knownPayee = await engine.evaluatePaymentContext({ ...RISKY_PAYMENT, amount: 500, isFirstTimePayee: false });
  assert.equal(knownPayee.decisionTier, 1, 'risky call + ordinary payment is only a nudge');
});

test('C holds through the grace period, then decays', async () => {
  const { clock, engine } = setup();
  await scamCall(engine, clock);
  engine.endCallSession();
  const start = engine.rollingC;
  clock.t += 29 * 60 * 1000;
  assert.equal(engine.rollingC, start);
  clock.t += 61 * 60 * 1000; // 30 min grace + 60 min = one half-life
  assert.ok(Math.abs(engine.rollingC - start / 2) < 0.01);
  assert.equal((await engine.evaluatePaymentContext(RISKY_PAYMENT)).decisionTier, 0);
});

test('weekly budget is a rolling 7 days and survives a restart', async () => {
  const storage = memoryStorage();
  let key;
  const keyProvider = async () => (key ||= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  const first = setup({ storage, keyProvider });
  for (let i = 0; i < 2; i += 1) {
    await scamCall(first.engine, first.clock);
    assert.equal((await first.engine.evaluatePaymentContext(RISKY_PAYMENT)).decisionTier, 2);
  }
  await scamCall(first.engine, first.clock);
  const third = await first.engine.evaluatePaymentContext(RISKY_PAYMENT);
  assert.equal(third.decisionTier, 1);
  assert.match(third.reason, /budget/i);
  await first.store.flush();

  // Same storage and key, new engine: the count is still there.
  const second = setup({ storage, keyProvider });
  second.clock.t = first.clock.t;
  await second.engine.ready;
  assert.equal(second.engine.alertsTriggeredThisWeek, 2);

  second.clock.t += 7 * DAY + 1000;
  assert.equal(second.engine.alertsTriggeredThisWeek, 0, 'budget frees up after 7 days');
});

test('repeated dismissals mute nudges for a while, never pauses', async () => {
  const { clock, engine } = setup();
  await scamCall(engine, clock);
  const category = engine.lastCategory;
  engine.recordDismissal(category);
  assert.equal(engine.isNudgeMuted(category), false, 'one dismissal is not enough');
  engine.recordDismissal(category);
  assert.equal(engine.isNudgeMuted(category), true);
  const ordinary = await engine.evaluatePaymentContext({ ...RISKY_PAYMENT, amount: 500, isFirstTimePayee: false });
  assert.equal(ordinary.decisionTier, 0);
  assert.match(ordinary.reason, /muted/i);
  assert.equal((await engine.evaluatePaymentContext(RISKY_PAYMENT)).decisionTier, 2, 'tier 2 is never muted');
  clock.t += 2 * HOUR + 1000;
  assert.equal(engine.isNudgeMuted(category), false, 'two dismissals mute for 2 hours');
});

test('"I know this person" softens the payee and is stored hashed', async () => {
  const { engine, store } = setup();
  assert.equal(await engine.softenPayeeTrust(RISKY_PAYMENT.payeeVPA), 0.5);
  assert.equal(await engine.softenPayeeTrust(RISKY_PAYMENT.payeeVPA), 0.25);
  assert.ok(!JSON.stringify(store.records).includes(RISKY_PAYMENT.payeeVPA));
});

test('reported caller raises C but never fires alone', async () => {
  const feed = new IntelFeed({ min_sources: 1, entries: [{ type: 'phone', sha256: await hashPhone('+91 98765 43210'), sources: 1 }] });
  const { clock, engine } = setup({ intel: feed });
  const { callerReported } = await engine.startCallSession({ number: '09876543210' });
  assert.equal(callerReported, true);
  clock.t += 3000;
  assert.equal(engine.ingestChunk('hello, how are you today').tier, 0, 'no cue, no alert');
  assert.equal(engine.rollingC, 0);
  clock.t += 3000;
  const withCue = engine.ingestChunk('this is the police');
  assert.equal(withCue.tier, 1, 'one authority cue + reported number = nudge');
  assert.ok(Math.abs(withCue.rollingC - (withCue.analysis.conversation_score + 0.1)) < 1e-9);
});

test('features are encrypted at rest and expire after 24 h', async () => {
  const storage = memoryStorage();
  const { clock, engine, store } = setup({ storage });
  await scamCall(engine, clock);
  await store.flush();
  const raw = storage.getItem('satark.secure.test');
  assert.ok(raw && !raw.includes('chunk_evaluation') && !raw.includes('digital_arrest'));
  assert.ok(engine.localFeatureStore.length > 0);
  clock.t += DAY + 1000;
  assert.equal(engine.localFeatureStore.length, 0);
});

test('store starts empty when the key does not match', async () => {
  const storage = memoryStorage();
  const a = new SecureStore({ namespace: 'x', storage });
  a.add('k', { v: 1 }, DAY);
  await a.flush();
  const b = new SecureStore({ namespace: 'x', storage }); // new random key
  await b.load();
  assert.deepEqual(b.list('k'), []);
});

test('bundled intel feed verifies; tampering is rejected', async () => {
  const { feed, error } = await loadBundledIntelFeed();
  assert.equal(error, null);
  assert.ok(feed.size > 0);
  const { default: signed } = await import('../shared/scam-intel-feed.json', { with: { type: 'json' } });
  const payload = JSON.parse(signed.payload_json);
  payload.entries.push({ type: 'phone', sha256: await hashVpa('attacker@ybl'), sources: 9 });
  const tampered = await verifyIntelFeed({ ...signed, payload_json: JSON.stringify(payload) });
  assert.equal(tampered.feed, null);
  assert.equal(tampered.error, 'bad signature');
  const expired = await verifyIntelFeed(signed, { now: Date.parse(payload.expires_at) + 1 });
  assert.equal(expired.error, 'expired');
});

test('uncorroborated feed entries are ignored', async () => {
  const feed = new IntelFeed({ min_sources: 2, entries: [{ type: 'phone', sha256: await hashPhone('9000000009'), sources: 1 }] });
  assert.equal(await feed.hasPhone('9000000009'), false);
});

test('trusted contact message carries no call content', () => {
  const message = trustedContactMessage('Digital arrest');
  assert.ok(!/\d/.test(message), 'no amounts or numbers');
  assert.ok(trustedContactSmsLink({ number: '+919812345678' }, 'x').startsWith('sms:+919812345678?body='));
  assert.equal(isValidContactNumber('98123'), false);
  assert.equal(isValidContactNumber('+91 98123 45678'), true);
});

test('a removal made before loading finishes also removes saved records', async () => {
  const storage = memoryStorage();
  let key;
  const keyProvider = async () => (key ||= await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']));
  const first = new SecureStore({ namespace: 'r', storage, keyProvider });
  first.add('tier2_alert', { at: 1 }, DAY);
  first.add('other', { keep: true }, DAY);
  await first.flush();

  const second = new SecureStore({ namespace: 'r', storage, keyProvider });
  second.remove('tier2_alert'); // e.g. the demo resetting its budget straight after the app opens
  await second.load();
  assert.deepEqual(second.list('tier2_alert'), []);
  assert.deepEqual(second.list('other'), [{ keep: true }]);
});
