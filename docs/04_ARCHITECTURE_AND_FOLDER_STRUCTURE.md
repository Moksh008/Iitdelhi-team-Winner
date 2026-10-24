# Architecture and folder structure

```text
shared/                  scam-lexicon.json (single rule source) + parity test vectors
src/
  App.jsx                Opens on Home; tabs Home · Nearby · Pay check · Settings; alert page
  styles.css             Light, minimal design system (single stylesheet)
  engine/                localAnalyzer.js (rules), decisionEngine.js (dual-signal tiers),
                         locationExtractor.js, scenarios.js, languages.js
  services/osmPlaces.js  Nominatim + Overpass client with caching and throttling
  native/satarkNative.js Capacitor bridge wrapper (safe fallbacks on the web)
  components/mobile/     HomeScreen, ScamAlertPanel, NearbyHelpPanel, OsmMap, PaymentDemo,
                         MockUPIApp, Tier1Nudge, Tier2PauseModal, Tier3ReportPack, SettingsScreen
android/app/src/main/
  java/in/satark/shield/ SatarkOverlayService (bubble + listening), SpeechCapture,
                         WhisperEngine, SatarkRules, AlertExplainer, LlmEngine,
                         ModelManager, SatarkNativePlugin, SpeechModel, MainActivity
  cpp/                   llama.cpp JNI bridge + CMake (llama.cpp pinned by hash)
  assets/whisper/        generated ONNX speech model (git-ignored)
tools/models/            Whisper export/verification, LLM benchmark, prompt check
tools/web-smoke-test.mjs Headless-browser test that presses every button of the web build
tools/android-ui-test.mjs Emulator/device test of every button incl. the floating bubble
tests/                   node --test suites for the JS engine
server/                  optional FastAPI dev/test server (not used by the app)
model/                   original DistilBERT training scripts (server only)
```

The React UI (Capacitor WebView) and the native overlay share the rule lexicon.
All inference is on the device; OpenStreetMap services are the only runtime
network dependency, plus the optional one-time LLM download.
