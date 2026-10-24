/**
 * Satark Decision Engine
 * Dual-signal policy: the conversation signal comes from the on-device rule
 * session (localAnalyzer.js); the payment signal from the payment context.
 * Neither signal alone can produce a Tier 2 pause, and no tier blocks a payment.
 *
 * What is remembered between app launches lives in an encrypted SecureStore
 * and expires on its own: chunk features (24 h), Tier 2 pauses for the weekly
 * budget (7 days), dismissed nudges (30 days), "I know this person" payees
 * (180 days, stored as hashes).
 */

import { LocalScamSession } from './localAnalyzer.js';
import { DAY, HOUR, SecureStore } from './secureStore.js';
import { hashVpa, loadBundledIntelFeed, sha256Hex } from './intelFeed.js';

export const sha256 = sha256Hex;

const FEATURE_TTL = DAY;
const ALERT_TTL = 7 * DAY;
const DISMISSAL_TTL = 30 * DAY;
const TRUST_TTL = 180 * DAY;

export class SatarkDecisionEngine {
  constructor(config = {}) {
    this.now = config.now ?? (() => Date.now());
    this.thetaNudge = config.thetaNudge ?? 0.65;
    this.thetaScam = config.thetaScam ?? 0.80;
    this.thetaPayment = config.thetaPayment ?? 0.70;

    // C holds for a grace period after the last cue (victims often pay soon after
    // hanging up), then halves every cHalfLifeSeconds.
    this.cGraceSeconds = config.cGraceSeconds ?? 1800;
    this.cHalfLifeSeconds = config.cHalfLifeSeconds ?? 3600;
    // A reported caller (N flag) adds this to C, but only when C already has a cue.
    this.intelBoost = config.intelBoost ?? 0.10;
    this.intelPayeeBoost = config.intelPayeeBoost ?? 0.15;

    // At most this many Tier 2 pauses in any rolling 7 days; extra ones become nudges.
    this.weeklyAlertBudget = config.weeklyAlertBudget ?? 2;
    // Repeatedly dismissed nudges of one scam type are muted for a while (never pauses).
    this.dismissalsBeforeMute = config.dismissalsBeforeMute ?? 2;
    this.maxMuteHours = config.maxMuteHours ?? 24;

    // On-device deterministic conversation rules (shared with the Android overlay)
    this.session = new LocalScamSession(this.now);
    this.store = config.store ?? new SecureStore({ namespace: config.namespace ?? 'engine', now: this.now });
    this.intel = null;
    this.intelError = null;
    const intelReady = config.intel !== undefined
      ? Promise.resolve({ feed: config.intel, error: null })
      : loadBundledIntelFeed({ now: this.now() });
    this.ready = Promise.all([
      this.store.load(),
      intelReady.then(({ feed, error }) => { this.intel = feed; this.intelError = error; }),
    ]).catch(error => { this.intelError = String(error); });

    // Volatile state (RAM only)
    this.rawC = 0.0;
    this.lastCueAt = null;
    this.lastChunkScore = 0.0;
    this.lastCategory = null;
    this.chunkHistory = [];
    this.callActive = false;
    this.callStartTime = null;
    this.callEndTime = null;
    this.callerMetadata = null;
    this.callerReported = false;
  }

  /** Conversation score C with time decay and the reported-caller boost applied. */
  get rollingC() {
    if (this.rawC <= 0 || this.lastCueAt == null) return 0;
    const ageSeconds = Math.max(0, (this.now() - this.lastCueAt) / 1000 - this.cGraceSeconds);
    const decayed = this.rawC * 0.5 ** (ageSeconds / this.cHalfLifeSeconds);
    const boosted = this.callerReported ? decayed + this.intelBoost : decayed;
    return Math.min(1, boosted);
  }

  get alertsTriggeredThisWeek() {
    return this.store.list('tier2_alert').length;
  }

  /** Clears the weekly budget (used by the scripted demo, where every call starts fresh). */
  resetAlertBudget() {
    this.store.remove('tier2_alert');
  }

  async startCallSession(caller) {
    this.callActive = true;
    this.callStartTime = this.now();
    this.callEndTime = null;
    this.rawC = 0.0;
    this.lastCueAt = null;
    this.lastCategory = null;
    this.chunkHistory = [];
    this.callerMetadata = caller;
    this.callerReported = false;
    this.session.reset();
    await this.ready;
    this.callerReported = Boolean(this.intel && caller?.number && await this.intel.hasPhone(caller.number));
    return { callerReported: this.callerReported };
  }

  endCallSession() {
    this.callActive = false;
    this.callEndTime = this.now();
  }

  /**
   * Ingests one transcript utterance (from on-device speech recognition or typed text).
   * The conversation score is the rule score over all cues seen in this session.
   */
  ingestChunk(chunkText) {
    const analysis = this.session.ingest(chunkText);
    this.rawC = analysis.conversation_score;
    if (analysis.conversation_score > 0) this.lastCueAt = this.now();
    this.lastChunkScore = analysis.chunk_score;
    this.lastCategory = analysis.category;
    const rollingC = this.rollingC;

    this.chunkHistory.push({
      timestamp: this.now(),
      chunkScore: analysis.chunk_score,
      rollingC,
      category: analysis.category,
    });

    // Record high-level features only (never raw text)
    this.recordLocalFeature({
      type: 'chunk_evaluation',
      timestamp: this.now(),
      score: analysis.chunk_score,
      rollingC,
      category: analysis.category,
      clusters: analysis.indicators.map(item => item.cluster),
    });

    // The reported-caller boost can lift C over the nudge line, but only on top of a real cue.
    let tier = rollingC >= this.thetaNudge ? 1 : 0;
    const muted = tier === 1 && this.isNudgeMuted(analysis.category);
    if (muted) tier = 0;

    return {
      tier,
      nudgeMuted: muted,
      callerReported: this.callerReported,
      instantaneousScore: analysis.chunk_score,
      rollingC,
      analysis,
    };
  }

  /**
   * Evaluates the payment context score P and the dual-signal tier.
   */
  async evaluatePaymentContext(paymentDetails) {
    await this.ready;
    const { payeeVPA, amount, userMedian = 3500, isFirstTimePayee = true } = paymentDetails;
    const payeeHash = await hashVpa(payeeVPA);
    const payeeReported = Boolean(this.intel && await this.intel.hasVpa(payeeVPA));

    // Payee Novelty (w1 = 0.40)
    const isNew = isFirstTimePayee ? 1.0 : 0.0;

    // Non-linear Amount Anomaly (w2 = 0.35)
    let amtFactor = 0.0;
    if (userMedian > 0) {
      amtFactor = Math.min(1.0, Math.max(0.0, (amount - userMedian) / (2.0 * userMedian)));
    } else {
      amtFactor = amount > 10000 ? 1.0 : 0.2;
    }

    // Temporal Proximity (w3 = 0.25, time constant tau = 600 s)
    let dtSeconds = 0;
    if (this.callActive) {
      dtSeconds = 0; // Call currently ongoing! Maximum risk
    } else if (this.callEndTime) {
      dtSeconds = Math.max(0, (this.now() - this.callEndTime) / 1000);
    } else {
      dtSeconds = 1800;
    }
    const timeFactor = Math.exp(-dtSeconds / 600.0);

    // Payee Trust Dampener (Omega), from earlier "I know this person" answers
    const dampener = this.trustWeight(payeeHash);

    const rawPaymentScore = (0.40 * isNew) + (0.35 * amtFactor) + (0.25 * timeFactor)
      + (payeeReported ? this.intelPayeeBoost : 0);
    const finalP = Math.min(1.0, rawPaymentScore * dampener);
    const conversationScore = this.rollingC;

    // DUAL-SIGNAL AND GATE EVALUATION
    let decisionTier = 0;
    let reason = 'Normal Transaction Context';

    if (conversationScore >= this.thetaScam && finalP >= this.thetaPayment) {
      if (this.alertsTriggeredThisWeek < this.weeklyAlertBudget) {
        decisionTier = 2; // TIER 2 PAUSE
        reason = 'Dual-Signal Agreement: High Conversation Risk + Payment Anomaly';
        this.store.add('tier2_alert', { at: this.now(), category: this.lastCategory }, ALERT_TTL);
      } else {
        // Over budget the strong dual signal still earns a nudge, even if nudges were muted.
        decisionTier = 1;
        reason = 'Weekly Alert Budget Reached: Softened to Tier 1 Nudge';
      }
    } else if (conversationScore >= this.thetaNudge) {
      if (this.isNudgeMuted(this.lastCategory)) {
        reason = 'Nudge muted: this kind of warning was dismissed repeatedly';
      } else {
        decisionTier = 1; // TIER 1 NUDGE
        reason = 'Conversation Urgency Elevated, but Payment Context Normal';
      }
    }

    return {
      decisionTier,
      conversationScore,
      paymentScore: finalP,
      factors: {
        isNewPayee: Boolean(isFirstTimePayee),
        amountRatio: (amount / (userMedian || 1)).toFixed(1),
        secondsSinceCall: Math.round(dtSeconds),
        trustDampener: dampener,
        callerReported: this.callerReported,
        payeeReported,
      },
      reason
    };
  }

  trustWeight(payeeHash) {
    return this.store.list('trust').filter(entry => entry.payeeHash === payeeHash).reduce((weight, entry) => weight * entry.factor, 1.0);
  }

  /** "I know this person": halves this payee's payment score (down to 1/8) for 180 days. */
  async softenPayeeTrust(payeeVPA) {
    const payeeHash = await hashVpa(payeeVPA);
    if (this.trustWeight(payeeHash) > 0.125) {
      this.store.add('trust', { payeeHash, factor: 0.5 }, TRUST_TTL);
    }
    return this.trustWeight(payeeHash);
  }

  /** The user closed a nudge without acting on it. */
  recordDismissal(category) {
    this.store.add('dismissal', { category: category || 'unknown', at: this.now() }, DISMISSAL_TTL);
  }

  /**
   * After `dismissalsBeforeMute` dismissals of one scam type in 30 days, nudges of
   * that type are muted for 2, 4, 8 ... hours (at most maxMuteHours) after the
   * latest dismissal. Tier 2 pauses are never muted.
   */
  nudgeMuteUntil(category) {
    const dismissals = this.store.list('dismissal').filter(entry => entry.category === (category || 'unknown'));
    if (dismissals.length < this.dismissalsBeforeMute) return null;
    const hours = Math.min(this.maxMuteHours, 2 ** (dismissals.length - this.dismissalsBeforeMute + 1));
    const last = Math.max(...dismissals.map(entry => entry.at));
    return last + hours * HOUR;
  }

  isNudgeMuted(category) {
    const until = this.nudgeMuteUntil(category);
    return until != null && this.now() < until;
  }

  async buildTier3ReportPack(scamScenario, paymentDetails, languageCode = 'en') {
    const hashedPayee = await hashVpa(paymentDetails.payeeVPA);
    const reportId = 'SATARK-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    const reportPack = {
      report_id: reportId,
      timestamp_utc: new Date(this.now()).toISOString(),
      language_locale: languageCode,
      scam_metadata: {
        scam_category: scamScenario.category,
        scam_title: scamScenario.title,
        trigger_tier: 2,
        conversation_score_final: Number(this.rollingC.toFixed(3)),
        caller_on_reported_list: this.callerReported,
        call_duration_seconds: Math.round((this.now() - (this.callStartTime || this.now())) / 1000)
      },
      payment_metadata: {
        hashed_payee_vpa: hashedPayee,
        masked_payee_preview: paymentDetails.payeeVPA.replace(/(^.{3})(.*)(@.*$)/, '$1***$3'),
        amount_inr: paymentDetails.amount,
        is_first_time_payee: paymentDetails.isFirstTimePayee,
        elapsed_seconds_since_call: this.callActive ? 0 : Math.round((this.now() - (this.callEndTime || this.now())) / 1000)
      },
      privacy_attestation: {
        raw_audio_included: false,
        transcript_text_included: false,
        user_explicitly_authorized: true,
        // Designed around DPDP Act 2023 principles; not a legal compliance claim.
        designed_for_dpdp_principles: true
      }
    };

    return reportPack;
  }

  recordLocalFeature(feature) {
    this.store.add('feature', feature, FEATURE_TTL, { maxPerKind: 200 });
  }

  get localFeatureStore() {
    return this.store.list('feature');
  }

  resetVolatileBuffers() {
    this.session.reset();
    this.rawC = 0.0;
    this.lastCueAt = null;
    this.chunkHistory = [];
    this.callActive = false;
    this.callStartTime = null;
    this.callEndTime = null;
    this.callerReported = false;
  }
}
