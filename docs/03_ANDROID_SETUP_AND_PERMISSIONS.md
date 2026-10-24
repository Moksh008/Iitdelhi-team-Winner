# Android setup and permissions

Open `android/` in Android Studio (or use Gradle). Requirements: Android SDK 36,
JDK 21, NDK 27.2.12479018 and CMake 3.22.1 (for llama.cpp). Generate the speech
model assets first (`tools/models/export_whisper_onnx.py`). The build targets
`arm64-v8a` phones.

Permissions requested, and when:

| Permission | Why | When |
|---|---|---|
| `RECORD_AUDIO` + microphone foreground service | On-device transcription | When the user taps Start listening |
| `SYSTEM_ALERT_WINDOW` | Floating bubble during calls | When the user enables sensing |
| `ACCESS_COARSE_LOCATION` | "Use my location" in Nearby help | Only when tapped; never in the background |
| `POST_NOTIFICATIONS` | Ongoing notification while the bubble or microphone is active | First launch |
| `INTERNET` | OpenStreetMap lookups and the optional model download | User-initiated |

No AccessibilityService, call-log, phone-state or notification-listener access
is requested. Denying any permission leaves typed-text analysis and manual
place search usable. Revoke permissions in Android Settings → Apps → Satark.

The overlay is a foreground service (`microphone|specialUse`). OEM battery
policies can still stop it. Ordinary GSM and WhatsApp remote audio is not
captured; only the phone's microphone is used.
