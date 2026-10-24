# SATARK test report

> **Superseded (v2.0):** Azure Maps and the app-to-backend transcript flow described here were removed for hackathon compliance. Current design: `docs/12_OFFLINE_AI_AND_FREE_SERVICES.md`.

## Frontend

**Status: Implemented and tested.**

- `npm run build` — passed.
- Vite output generated successfully.
- No frontend test/lint scripts are configured in `package.json`; no frontend
  test count is claimed.

## Backend

**Status: Implemented and tested.**

- `python -m pytest -q` from `server/` — **6 passed, 0 failed**.
- Covered health, validation, ordinary transcript, suspicious transcript,
  no-key places behavior, and places request validation.
- `python -m compileall -q server` — passed.

## Azure Maps

**Status: Partially implemented.**

- No-key behavior was tested with a mocked/missing credential and returned an
  empty provider result without fabricated contacts.
- Live Azure Maps integration was not performed because a live credential and
  network-backed provider test were not established.

## Android compile and APK

**Status: Implemented and tested.**

- `npm run build` — passed.
- `npx cap sync android` — passed.
- `android\gradlew.bat assembleDebug --no-daemon` — passed.
- `android\gradlew.bat testDebugUnitTest assembleDebug --no-daemon` —
  build passed; Android unit-test source set is currently `NO-SOURCE`.
- The native service distinguishes `Waiting for Input`, `Listening`,
  `Analyzing`, `Input Unavailable`, `Backend Unavailable`, and `Analysis
  Failed`; this path is compile-validated but not device-tested.
- APK: `android\app\build\outputs\apk\debug\app-debug.apk`.

## Emulator/device

**Status: Blocked by missing credentials, device, or permissions.**

- No emulator or physical Android device was available in this environment.
- Install result and UI test counts are therefore not claimed.
- Required command when a device is available:

```powershell
Set-Location D:\Satark-main\android
.\gradlew.bat connectedDebugAndroidTest
```

## Audio input

**Status: Implemented but not device-tested.**

The supported source is device speech recognition with microphone consent.
Ordinary GSM and WhatsApp remote call audio are not claimed or intercepted.

## End-to-end

**Status: Implemented but not device-tested.**

Backend unit/API tests and Android compilation passed. A connected-device
transcript-to-warning flow, overlay permission behavior, real speech
recognition, dialer invocation, process death, and OEM lifecycle remain to be
verified on hardware or an emulator.

## Remaining failures and actions

1. No automated instrumented Android suite exists: add Compose/UI tests.
2. No connected device was available: run device acceptance tests.
3. Live Azure lookup was not run: configure a server-side key and run a
   separately marked integration test.
4. Physical-device backend URL is not configured: set a reachable HTTPS URL in
   the native service before hardware testing.
