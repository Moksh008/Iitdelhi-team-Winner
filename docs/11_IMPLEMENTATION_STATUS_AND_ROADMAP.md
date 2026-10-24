# Implementation status and roadmap

Updated for v2.0 (hackathon compliance and on-device AI). Details and
measurements: `12_OFFLINE_AI_AND_FREE_SERVICES.md`.

## Implemented and tested on the development PC

- Azure Maps and every backend call from the app removed; no paid API or key remains.
- Deterministic on-device rules (`shared/scam-lexicon.json`) in JS and Kotlin,
  with shared parity vectors (`npm test`, `gradlew testDebugUnitTest`).
- Whisper Tiny Hinglish converted to ONNX (fp16 storage, fp32 compute);
  transcripts identical to the Transformers reference on 10/10 test clips.
- Kotlin Whisper front end (log-mel, FFT) verified against the NumPy reference.
- llama.cpp v0.7.0 JNI library builds with the NDK; Qwen3-0.6B prompt and
  output validator checked on the PC.
- OpenStreetMap nearby search (Nominatim, Overpass, Leaflet) with caching,
  throttling, mirrors, broader-area fallback and "Find phone number" links.
- Payment demo reconnected (mock UPI → Tier 1 / Tier 2 pause → user-confirmed
  report pack), clearly labelled as a demonstration.
- Report pack no longer claims to be sent anywhere; user saves/shares it and
  can call 1930 or open cybercrime.gov.in themselves.
- Debug and release APKs build (`assembleDebug`, `assembleRelease` unsigned).
- ONNX Runtime telemetry uploader removed from the app.

## Added for the finale (v2.3, tested in Node and a headless browser)

- `npm run metrics`: the six finale metrics from the deck (time to detect,
  tier-2 false positives, alerts per user per week, per-language gap,
  unseen-type recall, engine latency). Report: `docs/metrics/METRICS_REPORT.md`.
- Hindi (Devanagari) and Hinglish versions of all 18 scripted calls
  (`src/engine/scenarioTranslations.js`) for per-language results.
- Encrypted local store with enforced expiry (`src/engine/secureStore.js`):
  AES-GCM, non-extractable device key in IndexedDB; features 24 h, pauses
  7 days, dismissals 30 days, "I know this person" payees 180 days (hashed).
- Weekly pause budget is a rolling 7 days and survives restarts.
- Repeatedly dismissed nudges of one scam type are muted for 2 to 24 hours;
  Tier 2 pauses are never muted.
- Conversation score C holds 30 min after the last cue, then halves hourly.
- Signed scam-intel feed (`shared/scam-intel-feed.json`, ECDSA P-256, pinned
  key, expiry, 2-source corroboration). Demo entries only; re-sign with
  `npm run sign-intel-feed`. The private key stays in `tools/keys/` (git-ignored).
- Trusted contact (Settings): one-tap SMS from the pause and report screens;
  the message never contains call content, amount or payee.
- Alert-wording study kit: `docs/13_ALERT_WORDING_STUDY.md` (not yet run).
- Removed unused Accessibility, NotificationListener and call-receiver classes.

Known gap from the metrics: Hindi in Devanagari script is barely detected by
the rule lexicon. Expanding it needs a fresh Hindi test set written by someone
who has not seen `scenarioTranslations.js`, or the numbers become meaningless.

The Android floating bubble uses SatarkRules.kt (Tier 1 only). Decay, dismissal
muting and the reported-number list are in the JS engine (app screens) only.

## Tested on an Android emulator (x86_64, 4 GB)

- On-device Whisper transcripts identical to the PC reference (5/5 clips).
- Live listening path with a debug WAV feed: segmentation, transcription,
  rules, bubble alert, hand-off to the alert panel.
- LLM download/verify/delete, explanations, memory policy (both models never
  loaded together on <6 GB phones), airplane-mode operation.
- Nearby search with the Nominatim fallback, map tiles, GPS with a mock fix.

## Pending verification on a physical phone

- Real microphone capture and speech-segmentation thresholds.
- ARM latency/RAM for Whisper and the LLM; OEM battery restrictions; overlay
  behaviour during a real call on speaker.

## Not implemented

- Live listening in the web preview (needs on-device Whisper in the browser).
- Access to real UPI payment events (not available to third-party Android apps).
- Remote-party audio of ordinary SIM/WhatsApp calls (not available on Android).
- Room database, WorkManager-based background download, iOS build.

## Next steps

1. Measure latency/RAM on the target phone and tune utterance length and threads.
2. Try a dot-product (ARMv8.2) llama.cpp build for faster LLM inference on newer phones.
3. Collect real (consented) Hinglish scam-call recordings to evaluate the rules.
