# On-device AI and free services (hackathon compliance)

Satark uses **no paid API, paid inference service or billing-dependent key**.
All AI runs on the phone after a one-time model setup. Map and nearby-place
lookups use free OpenStreetMap community services and therefore need internet.

Status keys used below: **Implemented & tested**, **Implemented, pending device
verification**, **Not implemented**.

## 1. What was removed

| Item | Where it was | Status |
|---|---|---|
| Azure Maps (fuzzy geocode + POI search) | `server/claim_verification.py`, `/api/v1/places/search`, `/api/v1/nearby-places` | Removed, with its tests, schema and `AZURE_MAPS_KEY` in `.env.example`, `server/.env.example`, `render.yaml` |
| Azure Speech, Azure AI Foundry, Groq | Not present anywhere in the repository (searched code, configs, build files, docs) | Nothing to remove |
| Google cloud speech via Android `SpeechRecognizer` | `SatarkOverlayService.kt` | Replaced by on-device Whisper |
| Browser Web Speech API (sends audio to Google in Chrome) | `NativeFirstHome.jsx`, `LiveCallScreen.jsx` | Removed; the web preview analyses typed text only |
| App → FastAPI transcript calls | React and Kotlin overlay | Removed; analysis runs on the device. The FastAPI server remains as an optional dev/test server |
| Google Fonts CDN | `index.html` | Replaced by bundled `@fontsource` fonts (OFL) |
| `multer`, `canvas-confetti`, `requests` (server) | `package.json`, `server/requirements.txt` | Removed (unused) |
| ONNX Runtime's built-in HTTP telemetry uploader | Auto-registered by the `onnxruntime-android` AAR (`ai.onnxruntime.TelemetryInitializer` provider + `ACCESS_NETWORK_STATE`) | Removed via manifest merger; `OrtEnvironment.setTelemetry(false)` also called |

No real API key was found in the working tree or git history.

## 2. Architecture after the change

```text
microphone ─► SpeechCapture (16 kHz, energy VAD, ≤12 s utterances)
           ─► WhisperEngine (ONNX Runtime, on device) ─► romanised Hinglish text
           ─► SatarkRules (deterministic, shared lexicon) ─► Tier 1 advisory bubble
                                                            └► "Details & nearby help" ─► React app
React app: localAnalyzer.js (same lexicon) · decisionEngine (dual-signal payment demo)
           AlertExplainer (optional on-device LLM note, validated)
           NearbyHelpPanel ─► Nominatim / Overpass / OSM tiles (internet)
```

* `shared/scam-lexicon.json` is the single rule source for both
  `src/engine/localAnalyzer.js` and `android/.../SatarkRules.kt`;
  `shared/scam-rule-vectors.json` is run by both test suites so they cannot drift.
* A conversation alone can raise at most a **Tier 1** advisory. **Tier 2** (pause
  prompt) needs the conversation signal *and* an unusual payment
  (`decisionEngine.evaluatePaymentContext`). **Tier 3** report packs are built
  only after the user confirms. No tier blocks a payment or contacts anyone.
* Android does not let third-party apps observe real UPI payments, so the
  payment flow is a clearly labelled **demo** (Payment demo tab).

## 3. Speech-to-text: `abhishekgautamm/whisper-tiny-hinglish`

**Checkpoint facts (verified):** Hugging Face `WhisperForConditionalGeneration`,
`model.safetensors` fp32, 39 M parameters (4+4 layers, d=384), 80 mel bins,
16 kHz, 30 s window. Licence: **MIT** (model card; base `openai/whisper-tiny` is
MIT). The model always outputs **romanised** Hindi/English/Hinglish
("paise bhejo", not "पैसे भेजो"), so the rules include romanised Hindi terms.

**Runtime:** ONNX Runtime Android 1.31.0 (`com.microsoft.onnxruntime:onnxruntime-android`,
MIT, Maven Central). A standard Transformers checkpoint cannot run on Android
directly, so it is converted:

* `tools/models/export_whisper_onnx.py` exports two graphs with `torch.onnx`:
  an **encoder** that also emits each decoder layer's cross-attention K/V, and a
  **decoder** with an explicit self-attention KV cache. (Optimum's exporter was
  incompatible with the installed transformers 4.57.)
* Weights are stored as **fp16 with a Cast to fp32**; ONNX Runtime folds the
  cast at load, so arithmetic stays fp32. The logits layer reuses the embedding
  table instead of storing a transposed copy.
* Feature extraction (log-mel, periodic Hann, reflect padding, Slaney mel
  filters shipped as `mel_filters.bin`) and greedy decoding are implemented in
  Kotlin (`WhisperEngine.kt`, `WhisperFrontEnd`, `MixedRadixFft`). Prompt:
  `<|startoftranscript|><|en|><|transcribe|><|notimestamps|>` (from the model's
  `generation_config.json`). A repetition guard stops "array array…" loops.
* Streaming: Whisper is not a streaming model. `SpeechCapture.kt` cuts the
  microphone stream into utterances at ~0.8 s pauses (max 12 s) and transcribes
  each; at most one utterance waits in the queue so latency stays bounded.

**Quantisation choice (measured on 10 clips: 6 FLEURS Hindi, 3 English TTS, 1 TTS Hinglish):**

| Variant | Size (enc+dec) | Word similarity to fp32 | Identical transcripts |
|---|---|---|---|
| Dynamic int8, both graphs | 11 + 48 MB | 0.64 (one clip looped "array array…") | 0/10 |
| int8 encoder only | 11 + 193 MB | 0.65 | 0/10 |
| int8 embedding only | 38 + 133 MB | 0.90 | 5/10 |
| **fp16 storage, fp32 compute (shipped)** | **19 + 57 MB** | **1.00** | **10/10** |

`tools/models/verify_whisper_onnx.py --reference` confirms the shipped graphs
reproduce the Transformers `generate()` transcripts exactly (10/10) and our
log-mel matches `WhisperFeatureExtractor` to ~2e-5. The Kotlin log-mel is
checked against the NumPy reference in `WhisperFrontEndTest` (max diff < 1e-3).

PC timings (Windows laptop CPU, 4 threads; **not a phone measurement**): encoder
~0.2 s per utterance, decoder ~8 ms per token.

**Model delivery:** the converted files (~76 MB) are generated into
`android/app/src/main/assets/whisper/` and **bundled in the APK**, so speech
recognition works offline immediately after install. On first use they are
copied once to app-private no-backup storage and loaded by file path with the
ONNX Runtime CPU arena disabled — this cut Whisper's memory from ~470 MB to
~270 MB on the device (PC: 435 → 264 MB). The files are git-ignored;
regenerate them with the setup steps below.

## 4. Local language model: Qwen3-0.6B (Q8_0 GGUF) via llama.cpp

**Role (constrained):** writes a one-to-two-sentence plain-English note for an
alert the rules already raised. It cannot change the tier, block payments,
contact anyone or run actions. If it is missing, busy, slow (30 s budget), low
on memory, or its output fails validation, the app shows only the rule-based
advice (which is always shown anyway).

**Benchmark** (`tools/models/benchmark_llm.py`, PC, original HF weights, greedy):

| Model | Licence | Explanations | Few-shot labels exact | Scams flagged | Benign kept clear | PC time/answer |
|---|---|---|---|---|---|---|
| HuggingFaceTB/SmolLM2-360M-Instruct | Apache-2.0 | 0/8 usable (echoed input) | 0/10 | 2/8 | 0/2 | 2.1 s |
| Qwen/Qwen2.5-0.5B-Instruct | Apache-2.0 | fluent but sometimes harmful ("should not be disconnected") | 3/10 | 8/8 | 0/2 | 3.2 s |
| **Qwen/Qwen3-0.6B** | **Apache-2.0** | mostly sensible | **6/10** | 7/8 | **2/2** | 3.7 s |
| Qwen/Qwen2.5-1.5B-Instruct | Apache-2.0 | best wording | 5/10 | 8/8 | 0/2 | 9.6 s (too slow/large for 3–4 GB phones) |

None is reliable enough to classify scams on its own, which is why the LLM only
explains. **Selected:** Qwen3-0.6B — best balance on a 3–4 GB phone, Apache-2.0
(redistribution allowed with licence notice). File:
`Qwen/Qwen3-0.6B-GGUF/Qwen3-0.6B-Q8_0.gguf`, revision
`23749fefcc72300e3a2ad315e1317431b06b590a`, 639,446,688 bytes, SHA-256
`9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`. The official
repo publishes only Q8_0; it is used as-is so the checksum can be verified.

**Runtime:** llama.cpp v0.7.0 (MIT), fetched by CMake from the release tarball
and pinned by SHA-256 (`android/app/src/main/cpp/CMakeLists.txt`), built with the
NDK for baseline ARMv8 (runs on Cortex-A53 phones; no dot-product extensions),
optimised even in debug builds. JNI bridge: `satark_llm.cpp`; Kotlin:
`LlmEngine.kt`, `AlertExplainer.kt`.

**Safety constraints:**

* Prompt: Qwen3 ChatML with reasoning disabled, two worked examples, rules' cues.
* GBNF grammar forces `{"explanation": "<20–280 plain characters>"}`.
* Validator rejects URLs, numbers ≥5 digits, repeating the caller's threat
  ("will be blocked", "if you don't"), vouching for the caller ("this is a
  government call"), accusations, and any sentence that tells the user to pay,
  send, transfer, install, share, give or stay **without** a negation/"before";
  it also requires verification advice. On the PC check
  (`tools/models/check_explainer_prompt.py`) 6/10 notes passed and every harmful
  draft seen ("install the app…", "account might be blocked if you don't provide
  the OTP") was rejected.
* Memory: loaded lazily only when an alert is opened, only if ≥1.2 GB RAM is
  available and Android is not in low-memory state; unloaded 45 s after use and
  on `onTrimMemory`. Weights stay memory-mapped (llama.cpp weight repacking is
  disabled) so their pages are reclaimable. On phones with <6 GB RAM the two
  models are never loaded together: Whisper is released first, and while live
  listening is on the AI note is skipped (`busy_listening`). In testing, having
  both loaded on a 4 GB device reached 1.58 GB RSS and Android killed the app;
  with this policy the peak was ~410 MB PSS.
* Download: explicit "Download AI model" button, resumable, SHA-256 verified,
  stored in app-private storage, never re-downloaded on startup; "Remove AI
  model" deletes it. Devices without arm64 or with <3 GB RAM are marked unsupported.

## 5. Nearby help with OpenStreetMap

* **Geocoding:** Nominatim public API (`countrycodes=in`, `limit=1`), ≤1 request/s,
  no autocomplete (search on submit only), cached 7 days.
* **Places:** Overpass API, three public instances tried in order (12 s timeout
  each), named features only, cached 24 h on a ~110 m grid. If all fail, Overpass
  is skipped for 5 minutes and the app uses **Nominatim's bounded category
  search** over the same OSM data instead (labelled as possibly less complete).
* **Geocoding detail:** large administrative areas (state/district) are skipped in
  favour of the first specific match, because a district centroid can be ~15 km
  from the town the user means.
* **Map:** Leaflet 1.9.4 (BSD-2) with `tile.openstreetmap.org` tiles and the
  required "© OpenStreetMap contributors" attribution. If tiles fail, the list
  still works.
* **GPS:** `@capacitor/geolocation` (official, MIT), coarse location, requested only when
  the user taps "Use my location". Manual entry always works.
* **Categories:** shops & businesses · hospitals & clinics · pharmacies · police
  · cybercrime police (name contains "cyber") · banks. Up to **5** nearest named
  results per category, radius 1/3/5/10 km, straight-line distance.
* **Contact links:** each result gets
  `https://www.google.com/maps/search/?api=1&query=<URL-encoded "name, locality">`
  labelled **"Find phone number (opens a public map search)"**. A phone number
  is shown only when OSM has a `phone`/`contact:phone` tag, labelled "listed on
  OpenStreetMap by volunteers, not verified by Satark". Nothing is invented.
* **When OSM does not know a place:** e.g. "Anardana Chowk, Patiala" is not in
  OSM (checked on 2026-10-24). The app widens to "Patiala" and says so; if
  nothing matches it asks for a city/landmark or GPS. If Overpass is down it
  offers a public map search for the category near the area.
* Public Nominatim/Overpass instances are shared, rate-limited and sometimes
  overloaded — during development Overpass returned 502/504/timeouts for
  several minutes. They are suitable for a demo, not unlimited production use.

## 6. Every network request the app can make

| Destination | When | Data sent | Paid? |
|---|---|---|---|
| `nominatim.openstreetmap.org` | User presses Search in Nearby help | Typed place name | Free (usage policy) |
| `overpass-api.de`, `overpass.private.coffee`, `overpass.kumi.systems` | After a place/GPS point is chosen | Coordinates, radius, category | Free (fair use) |
| `nominatim.openstreetmap.org` (fallback) | Only when Overpass is unavailable | Category word + map bounding box | Free (usage policy) |
| `tile.openstreetmap.org` | Map is shown | Tile coordinates of the visible area | Free (tile policy, attribution) |
| `huggingface.co` (redirects to its CDN) | User taps "Download AI model" | File request only | Free download |
| `www.google.com/maps/search` | Only if the user taps "Find phone number" (opens browser) | Place name + locality | Free public web page |
| `cybercrime.gov.in`, `tel:1930`, `sms:` | Only if the user taps those buttons | Nothing automatic | — |

Audio, transcripts and AI prompts never leave the device. Build-time only:
Gradle/Maven, npm, and the llama.cpp tarball from GitHub.

## 7. Setup (reproducible)

```powershell
# 1. Web app and dependencies
npm install
npm test                      # rule engine + location + URL tests (node --test)

# 2. Convert Whisper (once; needs Python 3.10+, ~2 GB download/RAM)
pip install torch transformers onnx onnxruntime soundfile
python tools/models/export_whisper_onnx.py          # writes android/app/src/main/assets/whisper/
python tools/models/make_whisper_test_fixture.py    # Kotlin front-end test fixture
# optional check against the original model on your own 16 kHz WAVs:
python tools/models/verify_whisper_onnx.py --audio <folder-with-wavs> --reference

# 3. Android build (needs Android SDK, NDK 27.2.12479018, CMake 3.22.1, JDK 21)
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug testDebugUnitTest
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

NDK/CMake can be installed with
`sdkmanager "ndk;27.2.12479018" "cmake;3.22.1"`. The first native build downloads
llama.cpp (~38 MB) from GitHub.

## 8. Testing

Automated (run on the development PC):

* `npm test` — 29 tests: shared rule vectors (English, Hinglish, Devanagari,
  multi-utterance sessions, expiry, false-positive guards), location extraction,
  geocode fallback, URL encoding.
* `gradlew testDebugUnitTest` — rule parity with the same vectors, FFT vs naive
  DFT, Kotlin log-mel vs NumPy, token table.
* `node tools/web-smoke-test.mjs` — 12 headless-browser checks of the built web
  app (scam text → alert, benign text → quiet, Tier 2 only with both signals,
  user-confirmed report pack, six categories, no page errors).
* Scripted demo calls (`src/engine/scenarios.js`): 15/15 scam scripts raise an
  advisory, 0/3 benign scripts do. These scripts were used while extending the
  lexicon, so this is **not** a held-out accuracy estimate.
* `server/test_api.py` — 26 pass; 1 pre-existing failure (the server's DistilBERT
  head is untrained because no trained weights are in the repo).

On-device checks (see section 9 for results):

1. Install the APK, open Satark, grant notification permission.
2. Shield → Start listening → allow overlay + microphone. Speak (or play on
   speaker) "main police station se bol raha hoon, kisi ko mat batana, turant
   paise bhejo". Expect the bubble to turn amber with a digital-arrest advisory.
3. Tap "Details & nearby help" → alert panel with AI note (if installed) and
   nearby search. Search "Patiala" → hospitals list + map.
4. Download the AI model on Wi-Fi; then enable **airplane mode** and repeat step 2
   and open the alert: transcription, rules and AI note must still work; nearby
   search must show a clear "could not be reached" message.
5. Latency: `adb push <16 kHz mono wav> /sdcard/Android/data/in.satark.shield/files/`
   then, in Chrome `chrome://inspect` → the app's WebView console:
   `await Capacitor.Plugins.SatarkNative.debugTranscribeFile({ name: 'clip.wav' })`
   (debug builds only). `adb logcat -s SatarkOverlay SatarkLlm` shows per-utterance
   and LLM timings; `adb shell dumpsys meminfo in.satark.shield` shows RAM.

## 9. Results on an Android emulator (physical phone still pending)

No physical phone was connected during development. The app was tested on the
Android Studio `Pixel_7` emulator (Android 16, x86_64, started with 4 GB RAM;
debug builds include x86_64 libraries because the emulator's ARM translation
cannot run ONNX Runtime's arm64 library). **Timings below are from emulated
hardware and are not phone measurements.**

| Check | Result |
|---|---|
| App launch, permissions, overlay service | Works (after removing ONNX Runtime's telemetry provider, which crashed launch under ARM translation) |
| Whisper on device vs PC reference | 5/5 test clips produced identical transcripts |
| Whisper latency (emulator) | encoder 0.3–0.6 s warm, decoder 0.1–1.0 s per utterance (≈1.5–2.5 s first run incl. load) |
| Live listening path (debug WAV feed through the microphone segmenter) | Speech split at pauses into 3 utterances, all transcribed, rules raised "Urgent money request linked to an emergency", bubble expanded, "Details & nearby help" opened the app panel with cues and pre-filled place |
| Utterance backlog | Earlier version dropped an utterance when busy; now queued utterances are merged into the next transcription — none dropped |
| LLM download | 639 MB in ~80 s, SHA-256 verified, survived app update without re-download; "Remove AI model" deletes it |
| LLM explanation (emulator) | 6.8–9.2 s per note; 3 of 5 notes passed validation, 2 rejected → rule advice only |
| Memory (PSS) | idle ~175 MB; Whisper loaded ~445 MB; LLM loaded with Whisper released ~410 MB; back to ~258 MB after LLM unload |
| Airplane mode after setup | Whisper and the LLM worked; nearby search showed "could not be reached" |
| Nearby search online | "Anardana Chowk, Patiala" → widened to Patiala with notice; Overpass unreachable from this network so the Nominatim fallback returned 5 real hospitals with addresses; OSM tiles and attribution rendered; GPS ("Use my location") worked with a mock fix |
| Microphone | The emulator has no audio input, so real microphone capture is **pending device verification** |

Still to verify on the target 3–4 GB phone: real microphone capture and VAD
thresholds, ARM latency for Whisper and the LLM (baseline ARMv8 build), RAM
under real conditions, OEM battery restrictions, and overlay behaviour during
an actual call on speaker.
