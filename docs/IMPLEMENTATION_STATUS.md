# SATARK implementation status

> **Superseded (v2.0):** Azure Maps and the app-to-backend transcript flow described here were removed for hackathon compliance. Current design: `docs/12_OFFLINE_AI_AND_FREE_SERVICES.md`.

## Implemented and tested

- React/Vite production build.
- Capacitor Android asset synchronization.
- FastAPI health, transcript analysis, validation, and no-key places behavior.
- Native Android compilation and debug APK packaging.
- Native structured analyzer/place/dialer code path by inspection and compile
  validation.
- No fabricated phone numbers or automatic calls/payments.

## Implemented but not device-tested

- Overlay permission flow.
- Draggable Compose bubble.
- Start Sensing / Stop Sensing lifecycle.
- Android speech-recognition input.
- Native warning panel dismissal and reopening.
- User-triggered `ACTION_DIAL`.

## Partially implemented

- Native API URL is a development constant; production deployment configuration
  is not yet externalized.
- Frontend and native warning panels are separate implementations rather than a
  shared typed warning package.

## Blocked by missing credentials, device, or permissions

- Live Azure Maps integration test requires a configured `AZURE_MAPS_KEY`.
- Physical Android acceptance tests require an emulator or connected device,
  overlay permission, microphone permission, and a reachable backend.

## Not implemented

- Room cache, WorkManager flows, Retrofit repository, and complete automated
  instrumented Android suite.

## Next actions

1. Connect a target emulator/device and run the commands in
   `docs/TEST_REPORT.md`.
2. Configure a reachable HTTPS backend for a physical device.
3. Configure Azure credentials only in the server environment and run the
   optional live lookup test.
