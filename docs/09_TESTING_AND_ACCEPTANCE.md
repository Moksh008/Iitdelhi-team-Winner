# Testing and acceptance

Automated (development PC):

- `npm test`: shared rule vectors, location extraction, geocode fallback, URL encoding.
- `android\gradlew.bat testDebugUnitTest`: Kotlin rule parity, FFT, Whisper log-mel vs NumPy.
- `python tools/models/verify_whisper_onnx.py --reference`: ONNX transcripts vs Transformers.
- `python tools/models/check_explainer_prompt.py`: LLM prompt and safety validator.
- `npm run build`, `npx cap sync android`, `android\gradlew.bat assembleDebug`.
- `node tools/web-smoke-test.mjs` (with `npx vite preview --port 4173` running): presses every
  button of the web build in headless Edge/Chrome and checks the result.
- `node tools/android-ui-test.mjs` (debug APK installed, test WAVs pushed): presses every app and
  floating-bubble button on a device/emulator and checks external actions (dialer, browser,
  share sheet, Android settings) open the right app.

Device tests (procedure in `12_OFFLINE_AI_AND_FREE_SERVICES.md`, section 8):
overlay on the target OEM, denied permissions, microphone consent, transcription
latency, LLM memory/latency, airplane mode after setup, process death, dialer
intent and map rendering. Do not make real payments or calls during tests.

Acceptance requires: no paid or keyed services, no cloud inference, no
fabricated numbers, no automatic payment blocking/calling/reporting, truthful
source labels, and a usable typed-text and manual-location path.
