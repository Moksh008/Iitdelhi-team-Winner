# SATARK implementation audit

## Repository structure

- `client/` and `src/`: React/Vite fallback and mobile UI.
- `android/`: Capacitor Android project with Kotlin/Compose overlay service.
- `server/`: FastAPI application, Pydantic schemas, transcript analysis, and
  Azure Maps repository functions.
- `model/`: optional local inference implementation.
- `docs/`: product, architecture, setup, testing, and implementation status.

## Relevant dependencies and entry points

- Frontend: React 19, Vite 8, Capacitor 8, `npm run build`.
- Backend: FastAPI, Uvicorn, Pydantic, Requests, python-dotenv.
- Android: Kotlin, Jetpack Compose Material 3, Capacitor bridge, Gradle.
- Backend routes: `/api/v1/health`, `/api/v1/analyze-text`,
  `/api/v1/transcript-chunk`, and `/api/v1/places/search`.
- Android development backend address: `http://10.0.2.2:8000` for an emulator.
  A physical device needs a reachable HTTPS endpoint.

## Implemented behavior

- Android starts in a small draggable overlay bubble.
- The bubble opens a compact Start Sensing / Stop Sensing panel.
- Sensing uses Android speech recognition only when the device reports that it
  is available and microphone permission is granted.
- Transcript results are posted to the existing FastAPI analyzer.
- Structured warnings include risk level, explanation, transcript excerpt,
  extracted location, provider-backed place data, and provider phone data.
- Dialer access is user-triggered and only available for a returned phone
  number.
- React remains available as a browser/manual-transcript fallback.
- Accessibility, notification-listener, call-log, and phone-state interception
  declarations are not used.

## Findings and prioritized follow-up

1. **Device validation:** overlay, microphone, OEM lifecycle, dialer, and
   physical-device networking require a connected Android device.
2. **Azure live validation:** mocked/no-key behavior is covered; live Azure
   validation requires a valid configured key and must not be run in tests.
3. **Native architecture:** Compose MVVM, Room, and Retrofit are not required
   for the current functional slice and remain future refactoring work.
4. **Frontend test tooling:** no frontend test runner is configured; the
   production build is the current automated frontend check.

## Previous issue fixed during audit

`claim_verification.py` referenced an undefined local contacts collection on
ordinary transcript requests. The collection is now explicitly empty until a
verified directory is configured, preventing runtime failures and preventing
fabricated contacts.
