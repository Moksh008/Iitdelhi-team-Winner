# Implementation status and roadmap

## Implemented and build-validated

- React/Vite mobile call screen and compact verification card.
- Compact stopped-by-default sensing surface with Start Sensing and Stop Sensing controls.
- Event-driven browser speech/manual transcript input without an auto-started fictional call.
- Native Kotlin/Jetpack Compose overlay bubble with draggable positioning,
  permission-gated speech recognition, and a Capacitor bridge.
- Multilingual script/language detection and rolling transcript context.
- Emergency, payment, amount, hospital, and landmark extraction.
- Azure Maps server-side lookup with proximity filtering and returned-phone handling.
- Floating Android overlay bubble with Start Sensing/Stop Sensing controls.
- Native transcript results are sent to the existing `/api/v1/analyze-text`
  endpoint when the development API is reachable.
- Structured native warning data includes risk level, transcript excerpt,
  extracted location, provider-backed places, and returned phone numbers.
- The native panel only enables `ACTION_DIAL` when a provider actually returns
  a phone number; otherwise it displays "Phone number unavailable."
- Accessibility, notification-listener, call-log, and phone-state interception
  declarations were removed because they are not supported input sources.
- Debug APK build and Capacitor synchronization.

## Partially implemented / requires a device

- Native overlay lifecycle depends on user permission and OEM policy.
- Native overlay speech recognition and microphone permission flow are implemented,
  but behavior still requires physical-device validation.
- Speech recognition is supported where the browser/device exposes it.
- Native backend connectivity defaults to `http://10.0.2.2:8000` for an Android
  emulator. A physical device requires a reachable HTTPS API endpoint.
- Ordinary GSM and WhatsApp call audio remain unavailable to ordinary third-party
  applications and are never claimed as supported.

## Not implemented

- Compose MVVM extraction, Room cache, and WorkManager flows.
- Room database/cache and WorkManager flows.
- Retrofit/OkHttp Azure repository and ONNX Runtime Mobile integration.
- Complete automated Android device suite and physical-device validation.

## Next roadmap

1. Configure a reachable HTTPS API endpoint for the target device.
2. Introduce typed repository interfaces and mocked Azure tests.
3. Add Room cache metadata, deletion controls, and offline states.
4. Add physical-device UI/accessibility tests.
