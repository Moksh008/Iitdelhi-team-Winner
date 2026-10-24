# Satark metrics report

Generated 2026-10-24T18:49:47.763Z by `npm run metrics` (tools/eval/run-metrics.mjs). Lexicon v1.

**Demo-scale, synthetic data.** 15 scripted scam calls and 3 benign calls, each in English, Hindi and Hinglish, plus 300 simulated user-weeks of everyday calls and payments (seed 20261025). Time to detect assumes 3 s per utterance, as the scripts are written. These are not field results.

## 1. Scam calls, rules only (no reported-number list)

The headline numbers. The demo reported-number list is built from these same scripts, so it is left out here.

| Set | Calls | Nudge recall | Tier-2 recall (pay during call) | Median time to detect | P90 time to detect |
|---|---|---|---|---|---|
| 10 trained types | 30 | 63.3% | 63.3% | 6 s | 15 s |
| 5 unseen types | 15 | 53.3% | 53.3% | 6 s | 9 s |
| All 15 | 45 | 60% | 60% | 6 s | 15 s |

"Unseen" means these five scam types were held out when the scenarios were partitioned. The rule lexicon is hand-written, not trained, and its authors may have seen these scripts, so treat unseen recall as optimistic.

Missed tier-2 pauses (payment during the call):
- customs_parcel_fedex [hi] tier 0, C=0.55
- electricity_disconnection [hi] tier 0, C=0
- electricity_disconnection [hinglish] tier 0, C=0.4
- bank_kyc_sim_expiry [hi] tier 0, C=0
- bank_kyc_sim_expiry [hinglish] tier 0, C=0.45
- telegram_wfh_task [hi] tier 0, C=0
- kbc_lottery_winner [hi] tier 0, C=0
- fake_loan_approval [hi] tier 0, C=0
- reward_points_expiry [hi] tier 0, C=0
- ananydesk_screen_share [hi] tier 0, C=0
- distressed_relative [hi] tier 0, C=0.3
- unseen_ai_voice_kidnap [hi] tier 0, C=0
- unseen_ai_voice_kidnap [hinglish] tier 0, C=0.3
- unseen_sebi_ipo_scheme [hi] tier 0, C=0
- unseen_sextortion_blackmail [hi] tier 0, C=0.3
- unseen_sextortion_blackmail [hinglish] tier 0, C=0.3
- unseen_tax_audit_seizure [hi] tier 0, C=0
- unseen_visa_deportation [hi] tier 0, C=0

With the signed demo list of reported numbers switched on (the N signal), tier-2 recall on all 15 is 60% and nudge recall 62.2%.

## 2. Per-language results (all 15 scam types, rules only)

| Language | Nudge recall | Tier-2 recall | Median time to detect |
|---|---|---|---|
| English | 100% | 100% | 6 s |
| Hindi (Devanagari) | 6.7% | 6.7% | 15 s |
| Hinglish (romanised) | 73.3% | 73.3% | 6 s |

Gap between best and worst language: **93.3 points** (nudge), **93.3 points** (tier 2).

## 3. When the payment comes later (C holds 30 min after the last cue, then halves every 60 min)

| Payment made | Tier-2 recall | Any warning |
|---|---|---|
| during the call | 60% | 60% |
| 10 min after | 60% | 60% |
| 30 min after | 60% | 60% |
| 60 min after | 0% | 8.9% |
| 120 min after | 0% | 0% |

## 4. False positives and alert load (simulated user-weeks)

| | All | English | Hindi | Hinglish |
|---|---|---|---|---|
| Users | 300 | 112 | 95 | 93 |
| Calls (of which tricky) | 6177 (1527) | 2333 | 2002 | 1842 |
| Payments | 4460 | 1691 | 1411 | 1358 |
| **Tier-2 false positives** | **0 (0% of payments)** | 0 | 0 | 0 |
| Calls wrongly nudged | 148 (2.4%) | 68 | 0 | 80 |
| …of which tricky calls | 148 | | | |
| Payment nudges | 50 | 23 | 0 | 27 |
| **Alerts per user per week** | **0.66** | 0.813 | 0 | 1.151 |

Each simulated user gets about 3 calls a day (25% "tricky": real bank, police, OTP, rent or urgency talk), about 1.2 unrelated payments a day, and a payment within 10 minutes after 30% of calls. 15% of payments go to a new payee and 5% are 5-15x the user's usual amount.

The benign scripted calls (tuition to son, angry contractor, grocery) gave **0 tier-2 pauses** and **0 nudged calls** out of 9 runs (3 calls x 3 languages, payment during the call).

## 5. Engine latency (development PC, Node 24.13.0)

| Step | p50 | p95 | max |
|---|---|---|---|
| Score one utterance (rules + tier) | 0.122 ms | 0.166 ms | 2.261 ms |
| Payment check (P + dual-signal gate) | 4.069 ms | 5.217 ms | 10.265 ms |

On-phone numbers still need measuring: Whisper speech-to-text time per utterance dominates and is logged by the Android app (`adb logcat -s SatarkOverlay`).

## Not covered here
- Real recorded calls (only scripted and simulated text).
- Speech-recognition errors: the scripts are clean text, as if Whisper heard perfectly.
- The alert-wording study (A4): see docs/13_ALERT_WORDING_STUDY.md.
