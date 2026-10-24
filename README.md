# SATARK (सतर्क)

Satark is a consent-based pre-payment scam shield for Android. After you tap
**Start listening**, it transcribes what the phone's microphone hears **on the
device** (Whisper Tiny Hinglish via ONNX Runtime), checks it with deterministic
scam rules, and shows a small advisory bubble when a scam pattern appears. An
optional on-device language model (Qwen3-0.6B via llama.cpp) adds a short,
validated explanation. Nearby hospitals, police, banks and shops can be found
with free OpenStreetMap services so you can verify a caller's claim yourself.

**No paid APIs, no API keys, no cloud AI.** Audio and transcripts never leave
the phone. Map lookups need internet; everything else works offline once
installed. Details: [docs/12_OFFLINE_AI_AND_FREE_SERVICES.md](docs/12_OFFLINE_AI_AND_FREE_SERVICES.md).

## Quick start

Web preview (typed-text analysis, nearby help, payment demo):

```powershell
npm install
npm test
npm run dev
```

Android (full experience):

```powershell
pip install torch transformers onnx onnxruntime soundfile
python tools/models/export_whisper_onnx.py     # converts the speech model into android assets
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug testDebugUnitTest
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Requires Android SDK 36, JDK 21, NDK 27.2.12479018 and CMake 3.22.1. The APK
targets `arm64-v8a` phones.

## Safety boundaries

* Satark only hears the phone's microphone. Android mutes the microphone for
  other apps during a phone call, so live listening cannot hear a call on the
  same phone: run Satark on a second phone next to the speaker, or use
  **Check a recording** on a saved call recording or voice note (m4a, mp3,
  opus, wav...), which is transcribed and checked on the phone.
* A conversation alone raises at most an advisory. A "pause before you pay"
  prompt needs both a suspicious conversation and an unusual payment, and no
  tier blocks a payment. Reports are prepared and shared only by the user.
* The payment flow is a labelled demo: Android does not expose real UPI payments.
* Nearby listings come from OpenStreetMap and do not confirm an emergency.
  Phone numbers are shown only when OSM lists one, marked as unverified; a
  "Find phone number" link opens a public map search instead.

## Documentation

1. [Product and scope](docs/01_PRODUCT_AND_SCOPE.md)
2. [UI reference](docs/02_UI_REFERENCE_AND_SCREENS.md)
3. [Android setup and permissions](docs/03_ANDROID_SETUP_AND_PERMISSIONS.md)
4. [Architecture](docs/04_ARCHITECTURE_AND_FOLDER_STRUCTURE.md)
5. [On-device AI pipeline](docs/05_LOCAL_AI_AND_TRANSCRIPT_PIPELINE.md)
6. [OpenStreetMap nearby services](docs/06_OPENSTREETMAP_NEARBY_SERVICES.md)
7. [Storage, cache and privacy](docs/07_DATABASE_CACHE_AND_PRIVACY.md)
8. [Verification and dialer](docs/08_VERIFICATION_PANEL_AND_DIALER.md)
9. [Testing](docs/09_TESTING_AND_ACCEPTANCE.md)
10. [Build and demo](docs/10_BUILD_RUN_AND_DEMO.md)
11. [Status and roadmap](docs/11_IMPLEMENTATION_STATUS_AND_ROADMAP.md)
12. [On-device AI and free services (compliance, models, licences)](docs/12_OFFLINE_AI_AND_FREE_SERVICES.md)
13. [Alert-wording study (assumption A4)](docs/13_ALERT_WORDING_STUDY.md)

Finale metrics (synthetic, demo-scale): `npm run metrics` writes
[docs/metrics/METRICS_REPORT.md](docs/metrics/METRICS_REPORT.md).
