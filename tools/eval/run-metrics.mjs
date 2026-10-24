/**
 * Satark finale metrics (deck slide 13): time to detect, tier-2 false
 * positives, alerts per user per week, per-language gap, unseen-type recall
 * and engine latency.
 *
 *   npm run metrics            (writes docs/metrics/metrics-latest.json and METRICS_REPORT.md)
 *
 * Everything runs through the real decision engine (src/engine) with a
 * simulated clock. Inputs are the 18 scripted calls in English, Hindi and
 * Hinglish plus seeded simulated user-weeks of everyday calls and payments.
 * All data is synthetic; numbers are demo-scale and should be reported as such.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { SatarkDecisionEngine } from '../../src/engine/decisionEngine.js';
import { SecureStore, memoryStorage } from '../../src/engine/secureStore.js';
import { loadBundledIntelFeed } from '../../src/engine/intelFeed.js';
import { SCENARIOS } from '../../src/engine/scenarios.js';
import { EVAL_LANGUAGES, scenarioUtterances } from '../../src/engine/scenarioTranslations.js';
import { BENIGN_CALLS } from './benignCorpus.mjs';
import lexicon from '../../shared/scam-lexicon.json' with { type: 'json' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const outDir = join(root, 'docs', 'metrics');
const SECONDS_PER_UTTERANCE = 3; // the scripts are written as ~3 s chunks
const PAYMENT_DELAYS_MIN = [0, 10, 30, 60, 120]; // 0 = paying while still on the call
const SIM_USERS = 300;
const SIM_SEED = 20261025;
const T0 = Date.parse('2026-10-01T09:00:00Z');
const LANG_NAMES = { en: 'English', hi: 'Hindi (Devanagari)', hinglish: 'Hinglish (romanised)' };

// ---------- helpers ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SIM_SEED);
const pick = list => list[Math.floor(rand() * list.length)];
function poisson(mean) {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do { k += 1; p *= rand(); } while (p > limit);
  return k - 1;
}
function normal() {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
const pct = (num, den) => (den ? Math.round((num / den) * 1000) / 10 : null);
function quantile(values, q) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
const round = (value, digits = 3) => (value == null ? null : Math.round(value * 10 ** digits) / 10 ** digits);

function makeEngine(clock, intel) {
  const now = () => clock.t;
  return new SatarkDecisionEngine({
    now,
    intel,
    store: new SecureStore({ namespace: 'eval', storage: memoryStorage(), now }),
  });
}

// ---------- scripted calls ----------
async function runScripted(scenario, language, delayMin, intel) {
  const clock = { t: T0 };
  const engine = makeEngine(clock, intel);
  await engine.ready;
  await engine.startCallSession(scenario.caller);
  let ttd = null;
  let elapsed = 0;
  let firstTier1Utterance = null;
  const utterances = scenarioUtterances(scenario, language);
  utterances.forEach((text, index) => {
    elapsed += SECONDS_PER_UTTERANCE;
    clock.t += SECONDS_PER_UTTERANCE * 1000;
    const result = engine.ingestChunk(text);
    if (ttd == null && result.tier >= 1) {
      ttd = elapsed;
      firstTier1Utterance = index + 1;
    }
  });
  if (delayMin > 0) {
    engine.endCallSession();
    clock.t += delayMin * 60 * 1000;
  }
  const payment = await engine.evaluatePaymentContext(scenario.suggestedPayment);
  return {
    scenario: scenario.id,
    partition: scenario.partition,
    language,
    delayMin,
    utterances: utterances.length,
    nudged: ttd != null,
    ttdSeconds: ttd,
    firstTier1Utterance,
    paymentTier: payment.decisionTier,
    conversationScore: round(payment.conversationScore),
    paymentScore: round(payment.paymentScore),
  };
}

async function scriptedSuite(intel) {
  const runs = [];
  for (const scenario of SCENARIOS) {
    for (const language of EVAL_LANGUAGES) {
      for (const delay of PAYMENT_DELAYS_MIN) runs.push(await runScripted(scenario, language, delay, intel));
    }
  }
  return runs;
}

function summarizeScam(runs, filter) {
  const atCall = runs.filter(run => run.delayMin === 0 && filter(run));
  const ttds = atCall.filter(run => run.nudged).map(run => run.ttdSeconds);
  return {
    calls: atCall.length,
    nudgeRecallPct: pct(atCall.filter(run => run.nudged).length, atCall.length),
    tier2RecallPct: pct(atCall.filter(run => run.paymentTier === 2).length, atCall.length),
    anyWarningAtPaymentPct: pct(atCall.filter(run => run.paymentTier >= 1).length, atCall.length),
    ttdMedianSeconds: quantile(ttds, 0.5),
    ttdP90Seconds: quantile(ttds, 0.9),
    missed: atCall.filter(run => run.paymentTier < 2).map(run => `${run.scenario} [${run.language}] tier ${run.paymentTier}, C=${run.conversationScore}`),
  };
}

// ---------- simulated user-weeks ----------
let simPhone = 7000000000;
async function simulateUser(intel) {
  const clock = { t: T0 };
  const engine = makeEngine(clock, intel);
  await engine.ready;
  const language = pick(EVAL_LANGUAGES);
  const median = Math.round(3500 * Math.exp(0.5 * normal()));
  const knownPayees = Array.from({ length: 6 }, (_, i) => `known${i}.${Math.floor(rand() * 1e6)}@okaxis`);
  const events = [];
  for (let day = 0; day < 7; day += 1) {
    const dayStart = T0 + day * 24 * 3600 * 1000;
    const calls = poisson(3);
    for (let i = 0; i < calls; i += 1) {
      const at = dayStart + Math.floor(rand() * 14 * 3600 * 1000);
      const tricky = rand() < 0.25;
      events.push({ at, type: 'call', tricky, lines: pick(BENIGN_CALLS[language][tricky ? 'tricky' : 'everyday']) });
      if (rand() < 0.3) events.push({ at: at + 60 * 1000 + Math.floor(rand() * 9 * 60 * 1000), type: 'payment' });
    }
    const payments = poisson(1.2);
    for (let i = 0; i < payments; i += 1) events.push({ at: dayStart + Math.floor(rand() * 14 * 3600 * 1000), type: 'payment' });
  }
  events.sort((a, b) => a.at - b.at);

  const tally = { language, calls: 0, trickyCalls: 0, payments: 0, callNudges: 0, trickyCallNudges: 0, paymentNudges: 0, tier2: 0 };
  for (const event of events) {
    clock.t = Math.max(clock.t, event.at);
    if (event.type === 'call') {
      tally.calls += 1;
      if (event.tricky) tally.trickyCalls += 1;
      await engine.startCallSession({ number: `+91 ${simPhone += 1}` });
      let nudged = false;
      for (const line of event.lines) {
        clock.t += SECONDS_PER_UTTERANCE * 1000;
        if (engine.ingestChunk(line).tier >= 1) nudged = true;
      }
      engine.endCallSession();
      if (nudged) {
        tally.callNudges += 1;
        if (event.tricky) tally.trickyCallNudges += 1;
      }
    } else {
      tally.payments += 1;
      const firstTime = rand() < 0.15;
      const large = rand() < 0.05;
      const amount = Math.round(median * (large ? 5 + rand() * 10 : Math.exp(0.8 * normal())));
      const payee = firstTime ? `new.${Math.floor(rand() * 1e9)}@ybl` : pick(knownPayees);
      const result = await engine.evaluatePaymentContext({ payeeVPA: payee, amount, userMedian: median, isFirstTimePayee: firstTime });
      if (result.decisionTier === 2) tally.tier2 += 1;
      else if (result.decisionTier === 1) tally.paymentNudges += 1;
    }
  }
  return tally;
}

async function simulationSuite(intel) {
  const users = [];
  for (let i = 0; i < SIM_USERS; i += 1) users.push(await simulateUser(intel));
  const sum = (list, key) => list.reduce((total, user) => total + user[key], 0);
  const summarize = list => ({
    users: list.length,
    calls: sum(list, 'calls'),
    trickyCalls: sum(list, 'trickyCalls'),
    payments: sum(list, 'payments'),
    callNudges: sum(list, 'callNudges'),
    trickyCallNudges: sum(list, 'trickyCallNudges'),
    paymentNudges: sum(list, 'paymentNudges'),
    tier2Pauses: sum(list, 'tier2'),
    alertsPerUserPerWeek: round((sum(list, 'callNudges') + sum(list, 'paymentNudges') + sum(list, 'tier2')) / (list.length || 1), 3),
    tier2FalsePositivePctOfPayments: pct(sum(list, 'tier2'), sum(list, 'payments')),
    callNudgeFalsePositivePctOfCalls: pct(sum(list, 'callNudges'), sum(list, 'calls')),
  });
  return {
    all: summarize(users),
    byLanguage: Object.fromEntries(EVAL_LANGUAGES.map(lang => [lang, summarize(users.filter(user => user.language === lang))])),
  };
}

// ---------- latency ----------
async function latencySuite() {
  const clock = { t: T0 };
  const engine = makeEngine(clock, null);
  await engine.ready;
  const lines = SCENARIOS.flatMap(scenario => EVAL_LANGUAGES.flatMap(lang => scenarioUtterances(scenario, lang)));
  const chunkTimes = [];
  for (let pass = 0; pass < 20; pass += 1) {
    await engine.startCallSession({ number: '+91 9000000000' });
    for (const line of lines) {
      clock.t += 3000;
      const start = performance.now();
      engine.ingestChunk(line);
      chunkTimes.push(performance.now() - start);
    }
  }
  const paymentTimes = [];
  for (let i = 0; i < 2000; i += 1) {
    const start = performance.now();
    await engine.evaluatePaymentContext({ payeeVPA: `p${i}@ybl`, amount: 5000 + i, userMedian: 3500, isFirstTimePayee: i % 2 === 0 });
    paymentTimes.push(performance.now() - start);
  }
  await engine.store.flush();
  const stats = times => ({ samples: times.length, p50Ms: round(quantile(times, 0.5), 3), p95Ms: round(quantile(times, 0.95), 3), maxMs: round(Math.max(...times), 3) });
  return { ingestChunk: stats(chunkTimes), evaluatePaymentContext: stats(paymentTimes) };
}

// ---------- report ----------
function decayTable(runs) {
  return PAYMENT_DELAYS_MIN.map(delay => {
    const scam = runs.filter(run => run.delayMin === delay && run.partition !== 'Benign Control');
    return { delayMin: delay, tier2RecallPct: pct(scam.filter(run => run.paymentTier === 2).length, scam.length), anyWarningPct: pct(scam.filter(run => run.paymentTier >= 1).length, scam.length) };
  });
}

function languageTable(runs) {
  const rows = {};
  for (const lang of EVAL_LANGUAGES) {
    rows[lang] = summarizeScam(runs, run => run.language === lang && run.partition !== 'Benign Control');
  }
  const values = key => EVAL_LANGUAGES.map(lang => rows[lang][key]);
  return {
    rows,
    nudgeRecallGapPts: round(Math.max(...values('nudgeRecallPct')) - Math.min(...values('nudgeRecallPct')), 1),
    tier2RecallGapPts: round(Math.max(...values('tier2RecallPct')) - Math.min(...values('tier2RecallPct')), 1),
  };
}

function markdown(report) {
  const r = report;
  const line = (label, s) => `| ${label} | ${s.calls} | ${s.nudgeRecallPct}% | ${s.tier2RecallPct}% | ${s.ttdMedianSeconds ?? '-'} s | ${s.ttdP90Seconds ?? '-'} s |`;
  const scamHeader = '| Set | Calls | Nudge recall | Tier-2 recall (pay during call) | Median time to detect | P90 time to detect |\n|---|---|---|---|---|---|';
  const sim = r.simulation.all;
  const simLang = lang => r.simulation.byLanguage[lang];
  const missed = r.scripted.rulesOnly.trained.missed.concat(r.scripted.rulesOnly.unseen.missed);
  return `# Satark metrics report

Generated ${r.generatedAt} by \`npm run metrics\` (tools/eval/run-metrics.mjs). Lexicon v${r.config.lexiconVersion}.

**Demo-scale, synthetic data.** 15 scripted scam calls and 3 benign calls, each in English, Hindi and Hinglish, plus ${sim.users} simulated user-weeks of everyday calls and payments (seed ${r.config.seed}). Time to detect assumes ${SECONDS_PER_UTTERANCE} s per utterance, as the scripts are written. These are not field results.

## 1. Scam calls, rules only (no reported-number list)

The headline numbers. The demo reported-number list is built from these same scripts, so it is left out here.

${scamHeader}
${line('10 trained types', r.scripted.rulesOnly.trained)}
${line('5 unseen types', r.scripted.rulesOnly.unseen)}
${line('All 15', r.scripted.rulesOnly.all)}

"Unseen" means these five scam types were held out when the scenarios were partitioned. The rule lexicon is hand-written, not trained, and its authors may have seen these scripts, so treat unseen recall as optimistic.

Missed tier-2 pauses (payment during the call):
${missed.length ? missed.map(item => `- ${item}`).join('\n') : '- none'}

With the signed demo list of reported numbers switched on (the N signal), tier-2 recall on all 15 is ${r.scripted.withIntel.all.tier2RecallPct}% and nudge recall ${r.scripted.withIntel.all.nudgeRecallPct}%.

## 2. Per-language results (all 15 scam types, rules only)

| Language | Nudge recall | Tier-2 recall | Median time to detect |
|---|---|---|---|
${EVAL_LANGUAGES.map(lang => { const s = r.scripted.byLanguage.rows[lang]; return `| ${LANG_NAMES[lang]} | ${s.nudgeRecallPct}% | ${s.tier2RecallPct}% | ${s.ttdMedianSeconds ?? '-'} s |`; }).join('\n')}

Gap between best and worst language: **${r.scripted.byLanguage.nudgeRecallGapPts} points** (nudge), **${r.scripted.byLanguage.tier2RecallGapPts} points** (tier 2).

## 3. When the payment comes later (C holds ${r.config.cGraceSeconds / 60} min after the last cue, then halves every ${r.config.cHalfLifeSeconds / 60} min)

| Payment made | Tier-2 recall | Any warning |
|---|---|---|
${r.scripted.decay.map(row => `| ${row.delayMin === 0 ? 'during the call' : `${row.delayMin} min after`} | ${row.tier2RecallPct}% | ${row.anyWarningPct}% |`).join('\n')}

## 4. False positives and alert load (simulated user-weeks)

| | All | English | Hindi | Hinglish |
|---|---|---|---|---|
| Users | ${sim.users} | ${simLang('en').users} | ${simLang('hi').users} | ${simLang('hinglish').users} |
| Calls (of which tricky) | ${sim.calls} (${sim.trickyCalls}) | ${simLang('en').calls} | ${simLang('hi').calls} | ${simLang('hinglish').calls} |
| Payments | ${sim.payments} | ${simLang('en').payments} | ${simLang('hi').payments} | ${simLang('hinglish').payments} |
| **Tier-2 false positives** | **${sim.tier2Pauses} (${sim.tier2FalsePositivePctOfPayments}% of payments)** | ${simLang('en').tier2Pauses} | ${simLang('hi').tier2Pauses} | ${simLang('hinglish').tier2Pauses} |
| Calls wrongly nudged | ${sim.callNudges} (${sim.callNudgeFalsePositivePctOfCalls}%) | ${simLang('en').callNudges} | ${simLang('hi').callNudges} | ${simLang('hinglish').callNudges} |
| …of which tricky calls | ${sim.trickyCallNudges} | | | |
| Payment nudges | ${sim.paymentNudges} | ${simLang('en').paymentNudges} | ${simLang('hi').paymentNudges} | ${simLang('hinglish').paymentNudges} |
| **Alerts per user per week** | **${sim.alertsPerUserPerWeek}** | ${simLang('en').alertsPerUserPerWeek} | ${simLang('hi').alertsPerUserPerWeek} | ${simLang('hinglish').alertsPerUserPerWeek} |

Each simulated user gets about 3 calls a day (25% "tricky": real bank, police, OTP, rent or urgency talk), about 1.2 unrelated payments a day, and a payment within 10 minutes after 30% of calls. 15% of payments go to a new payee and 5% are 5-15x the user's usual amount.

The benign scripted calls (tuition to son, angry contractor, grocery) gave **${r.scripted.benign.tier2} tier-2 pauses** and **${r.scripted.benign.nudged} nudged calls** out of ${r.scripted.benign.calls} runs (3 calls x 3 languages, payment during the call).

## 5. Engine latency (development PC, Node ${process.versions.node})

| Step | p50 | p95 | max |
|---|---|---|---|
| Score one utterance (rules + tier) | ${r.latency.ingestChunk.p50Ms} ms | ${r.latency.ingestChunk.p95Ms} ms | ${r.latency.ingestChunk.maxMs} ms |
| Payment check (P + dual-signal gate) | ${r.latency.evaluatePaymentContext.p50Ms} ms | ${r.latency.evaluatePaymentContext.p95Ms} ms | ${r.latency.evaluatePaymentContext.maxMs} ms |

On-phone numbers still need measuring: Whisper speech-to-text time per utterance dominates and is logged by the Android app (\`adb logcat -s SatarkOverlay\`).

## Not covered here
- Real recorded calls (only scripted and simulated text).
- Speech-recognition errors: the scripts are clean text, as if Whisper heard perfectly.
- The alert-wording study (A4): see docs/13_ALERT_WORDING_STUDY.md.
`;
}

// The feed's validity dates are checked against the real clock, not the simulated one.
const intelResult = await loadBundledIntelFeed({ now: Date.now() });
if (!intelResult.feed) console.warn(`Reported-number feed not loaded: ${intelResult.error}`);

const rulesRuns = await scriptedSuite(null);
const intelRuns = await scriptedSuite(intelResult.feed);
const isScam = run => run.partition !== 'Benign Control';
const benignAtCall = rulesRuns.filter(run => run.partition === 'Benign Control' && run.delayMin === 0);

const report = {
  generatedAt: new Date().toISOString(),
  config: {
    lexiconVersion: lexicon.version,
    seed: SIM_SEED,
    simulatedUsers: SIM_USERS,
    secondsPerUtterance: SECONDS_PER_UTTERANCE,
    thetaNudge: 0.65,
    thetaScam: 0.80,
    thetaPayment: 0.70,
    cGraceSeconds: 1800,
    cHalfLifeSeconds: 3600,
    weeklyAlertBudget: 2,
    languages: EVAL_LANGUAGES,
    intelFeed: intelResult.feed ? `${intelResult.feed.size} entries (${intelResult.feed.note})` : `not loaded: ${intelResult.error}`,
  },
  scripted: {
    rulesOnly: {
      trained: summarizeScam(rulesRuns, run => run.partition === 'Trained'),
      unseen: summarizeScam(rulesRuns, run => run.partition.startsWith('Unseen')),
      all: summarizeScam(rulesRuns, isScam),
    },
    withIntel: {
      all: summarizeScam(intelRuns, isScam),
    },
    byLanguage: languageTable(rulesRuns),
    decay: decayTable(rulesRuns),
    benign: {
      calls: benignAtCall.length,
      nudged: benignAtCall.filter(run => run.nudged).length,
      tier2: benignAtCall.filter(run => run.paymentTier === 2).length,
    },
    runs: rulesRuns,
  },
  simulation: await simulationSuite(null),
  latency: await latencySuite(),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'metrics-latest.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(join(outDir, 'METRICS_REPORT.md'), markdown(report));

const s = report.scripted;
console.log('Satark metrics (synthetic, demo-scale)');
console.log(`  Trained types : nudge ${s.rulesOnly.trained.nudgeRecallPct}%  tier-2 ${s.rulesOnly.trained.tier2RecallPct}%  median TTD ${s.rulesOnly.trained.ttdMedianSeconds}s`);
console.log(`  Unseen types  : nudge ${s.rulesOnly.unseen.nudgeRecallPct}%  tier-2 ${s.rulesOnly.unseen.tier2RecallPct}%  median TTD ${s.rulesOnly.unseen.ttdMedianSeconds}s`);
for (const lang of EVAL_LANGUAGES) {
  const row = s.byLanguage.rows[lang];
  console.log(`  ${LANG_NAMES[lang].padEnd(22)}: nudge ${row.nudgeRecallPct}%  tier-2 ${row.tier2RecallPct}%`);
}
console.log(`  Language gap  : ${s.byLanguage.nudgeRecallGapPts} pts nudge, ${s.byLanguage.tier2RecallGapPts} pts tier-2`);
console.log(`  Decay         : ${s.decay.map(row => `${row.delayMin}min ${row.tier2RecallPct}%`).join(', ')}`);
console.log(`  Simulated     : ${report.simulation.all.alertsPerUserPerWeek} alerts/user/week, tier-2 FP ${report.simulation.all.tier2Pauses} (${report.simulation.all.tier2FalsePositivePctOfPayments}% of payments), call nudges ${report.simulation.all.callNudges}/${report.simulation.all.calls}`);
console.log(`  Latency (PC)  : utterance p95 ${report.latency.ingestChunk.p95Ms} ms, payment p95 ${report.latency.evaluatePaymentContext.p95Ms} ms`);
console.log(`Wrote ${join('docs', 'metrics', 'METRICS_REPORT.md')} and metrics-latest.json`);
