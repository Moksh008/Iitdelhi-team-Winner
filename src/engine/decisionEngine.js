/**
 * Satark Decision Engine
 * Integrated with Multilingual SemanticScamClassifier for real-time 22-language processing
 */

import { SemanticScamClassifier } from './semanticClassifier';

// Simple browser-compatible SHA-256 utility
export async function sha256(message) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    hash = ((hash << 5) - hash) + message.charCodeAt(i);
    hash |= 0;
  }
  return 'hash_' + Math.abs(hash).toString(16).padStart(16, '0');
}

export class SatarkDecisionEngine {
  constructor(config = {}) {
    this.lambdaDecay = config.lambdaDecay ?? 0.90;
    this.thetaNudge = config.thetaNudge ?? 0.65;
    this.thetaScam = config.thetaScam ?? 0.80;
    this.thetaPayment = config.thetaPayment ?? 0.70;
    this.threatBeta = config.threatBeta ?? 0.25;

    // Multilingual Semantic Intent Engine
    this.semanticClassifier = new SemanticScamClassifier();

    // Volatile State (RAM only - never written to disk unencrypted)
    this.rollingC = 0.0;
    this.lastChunkScore = 0.0;
    this.lastChunkText = '';
    this.chunkHistory = [];
    this.callActive = false;
    this.callStartTime = null;
    this.callEndTime = null;
    this.callerMetadata = null;

    // Trust Weight Softening Map (payee -> multiplier, 1.0 down to 0.125)
    this.trustWeights = {};

    // Alert Budget (weekly cap)
    this.weeklyAlertBudget = 2;
    this.alertsTriggeredThisWeek = 0;

    // Encrypted Local Feature Cache (Simulating 24h TTL)
    this.localFeatureStore = [];
  }

  startCallSession(caller) {
    this.callActive = true;
    this.callStartTime = Date.now();
    this.callEndTime = null;
    this.rollingC = 0.0;
    this.chunkHistory = [];
    this.callerMetadata = caller;
  }

  endCallSession() {
    this.callActive = false;
    this.callEndTime = Date.now();
  }

  /**
   * Ingests a real-time streaming audio transcript chunk (from live mic or speech stream)
   * Uses Multilingual Semantic Intent Scoring instead of brittle regex
   */
  ingestChunk(chunkText, explicitModelScore = null) {
    // Real-time Multilingual Semantic Classification
    const semanticResult = this.semanticClassifier.classifyText(chunkText);
    const semanticScore = semanticResult.score;

    // Instantaneous Chunk Risk S_t
    const instantaneousScore = explicitModelScore !== null 
      ? Math.max(explicitModelScore, semanticScore) 
      : semanticScore;

    this.lastChunkScore = instantaneousScore;
    this.lastChunkText = chunkText;

    const isFlaggedNumber = Boolean(this.callerMetadata?.isFlagged);
    const beta = isFlaggedNumber ? this.threatBeta : 0.0;

    // Rolling Accumulator with Temporal Decay: C_t = lambda * C_{t-1} + (1 - lambda) * S_t + beta * N_flag
    this.rollingC = (this.lambdaDecay * this.rollingC) + ((1.0 - this.lambdaDecay) * instantaneousScore) + beta;
    this.rollingC = Math.max(0.0, Math.min(1.0, this.rollingC));

    const chunkEntry = {
      timestamp: Date.now(),
      text: chunkText,
      chunkScore: instantaneousScore,
      rollingC: this.rollingC,
      semanticDetails: semanticResult
    };
    this.chunkHistory.push(chunkEntry);

    // Record high-level feature vector to local cache (without raw text)
    this.recordLocalFeature({
      type: 'chunk_evaluation',
      timestamp: Date.now(),
      score: instantaneousScore,
      rollingC: this.rollingC,
      semanticCategory: semanticResult.category,
      clusters: semanticResult.matchedClusters
    });

    const tier = this.rollingC >= this.thetaNudge ? 1 : 0;
    return {
      tier,
      instantaneousScore,
      rollingC: this.rollingC,
      semanticResult,
      isFlaggedCaller: isFlaggedNumber
    };
  }

  /**
   * Evaluates Payment Context Score (P)
   */
  evaluatePaymentContext(paymentDetails) {
    const { payeeVPA, amount, userMedian = 3500, isFirstTimePayee = true } = paymentDetails;

    // Payee Novelty (w1 = 0.40)
    const isNew = isFirstTimePayee ? 1.0 : 0.0;

    // Non-linear Amount Anomaly (w2 = 0.35)
    let amtFactor = 0.0;
    if (userMedian > 0) {
      amtFactor = Math.min(1.0, Math.max(0.0, (amount - userMedian) / (2.0 * userMedian)));
    } else {
      amtFactor = amount > 10000 ? 1.0 : 0.2;
    }

    // Temporal Proximity (w3 = 0.25, half life tau = 600s)
    let dtSeconds = 0;
    if (this.callActive) {
      dtSeconds = 0; // Call currently ongoing! Maximum risk
    } else if (this.callEndTime) {
      dtSeconds = Math.max(0, (Date.now() - this.callEndTime) / 1000);
    } else {
      dtSeconds = 1800;
    }
    const timeFactor = Math.exp(-dtSeconds / 600.0);

    // Payee Trust Dampener (Omega)
    const dampener = this.trustWeights[payeeVPA] ?? 1.0;

    const rawPaymentScore = (0.40 * isNew) + (0.35 * amtFactor) + (0.25 * timeFactor);
    const finalP = Math.min(1.0, rawPaymentScore * dampener);

    // DUAL-SIGNAL AND GATE EVALUATION
    let decisionTier = 0;
    let reason = 'Safe';

    if (this.rollingC >= this.thetaScam && finalP >= this.thetaPayment) {
      if (this.alertsTriggeredThisWeek < this.weeklyAlertBudget) {
        decisionTier = 2; // TIER 2 PAUSE
        reason = 'Dual-Signal Agreement: High Multilingual Conversation Risk + Payment Anomaly';
        this.alertsTriggeredThisWeek++;
      } else {
        decisionTier = 1; // Soften to Tier 1 if budget reached
        reason = 'Weekly Alert Budget Reached: Softened to Tier 1 Nudge';
      }
    } else if (this.rollingC >= this.thetaNudge) {
      decisionTier = 1; // TIER 1 NUDGE
      reason = 'Conversation Urgency Elevated, but Payment Context Normal';
    } else {
      decisionTier = 0; // TIER 0 WATCH
      reason = 'Normal Transaction Context';
    }

    return {
      decisionTier,
      conversationScore: this.rollingC,
      paymentScore: finalP,
      factors: {
        isNewPayee: Boolean(isFirstTimePayee),
        amountRatio: (amount / (userMedian || 1)).toFixed(1),
        secondsSinceCall: Math.round(dtSeconds),
        trustDampener: dampener
      },
      reason
    };
  }

  softenPayeeTrust(payeeVPA) {
    const current = this.trustWeights[payeeVPA] ?? 1.0;
    this.trustWeights[payeeVPA] = current * 0.5;
    return this.trustWeights[payeeVPA];
  }

  async buildTier3ReportPack(scamScenario, paymentDetails, languageCode = 'en') {
    const hashedPayee = await sha256(paymentDetails.payeeVPA);
    const reportId = 'SATARK-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    const reportPack = {
      report_id: reportId,
      timestamp_utc: new Date().toISOString(),
      language_locale: languageCode,
      scam_metadata: {
        scam_category: scamScenario.category,
        scam_title: scamScenario.title,
        trigger_tier: 2,
        conversation_score_final: Number(this.rollingC.toFixed(3)),
        call_duration_seconds: Math.round((Date.now() - (this.callStartTime || Date.now())) / 1000)
      },
      payment_metadata: {
        hashed_payee_vpa: hashedPayee,
        masked_payee_preview: paymentDetails.payeeVPA.replace(/(^.{3})(.*)(@.*$)/, '$1***$3'),
        amount_inr: paymentDetails.amount,
        is_first_time_payee: paymentDetails.isFirstTimePayee,
        elapsed_seconds_since_call: this.callActive ? 0 : Math.round((Date.now() - (this.callEndTime || Date.now())) / 1000)
      },
      privacy_attestation: {
        raw_audio_included: false,
        transcript_text_included: false,
        user_explicitly_authorized: true,
        dpdp_act_2023_compliant: true
      }
    };

    return reportPack;
  }

  recordLocalFeature(feature) {
    this.localFeatureStore.push({
      ...feature,
      expiresAt: Date.now() + (24 * 60 * 60 * 1000)
    });
    if (this.localFeatureStore.length > 50) {
      this.localFeatureStore.shift();
    }
  }

  resetVolatileBuffers() {
    this.rollingC = 0.0;
    this.chunkHistory = [];
    this.callActive = false;
    this.callStartTime = null;
    this.callEndTime = null;
  }
}
