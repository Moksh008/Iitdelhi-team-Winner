# Satark Android overlay setup

## What the Android app provides

Satark includes a native Android floating overlay similar to AssistiveTouch:

- A small SATARK shield stays above other apps after the user grants overlay permission.
- Tap the button to open a compact control panel.
- `Start Sensing` and `Stop Sensing` control the supported speech input.
- The button can be dragged vertically and horizontally.

The overlay is a control surface for Satark. It does not claim to capture remote audio from ordinary GSM calls. Android normally does not expose the other participant's cellular audio to third-party apps. Live speech analysis must use the consented microphone/VoIP flow already present in Satark.

## Build in Android Studio

1. Install Android Studio and the Android SDK.
2. Open the `android` folder in Android Studio:
   `D:\Satark-main\android`
3. Wait for Gradle sync to finish.
4. Connect an Android phone with Developer options and USB debugging enabled, or start an emulator.
5. Click **Run** to install the debug app.

Command-line build:

```powershell
cd D:\Satark-main
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

The APK is generated at:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## First-run permissions

1. Open Satark.
2. Enable **Allow display over other apps** when Android opens the permission screen.
3. Return to Satark. The floating button should appear.
4. Grant microphone permission when using the live speech analysis.
5. Tap the floating shield and choose **Start Sensing**.

## Testing the overlay

1. Start the overlay from Satark.
2. Press the Android Home button.
3. Open another app.
4. Confirm that the shield remains visible.
5. Tap it and verify the Start Sensing/Stop Sensing controls.
6. Provide consented speech and verify that only analyzer-backed warnings expand the panel.
7. Use **Stop Sensing** to return to the bubble.

## Backend connectivity

The browser development proxy does not apply to a packaged APK. The emulator
uses a configurable backend URL for the local FastAPI server. The default
`10.0.2.2:8000` value is emulator-only; a physical phone needs a
reachable HTTPS URL configured in `SatarkOverlayService.kt`; `127.0.0.1`
inside the phone means the phone itself, not the development computer.

## Security and privacy

- Request overlay and microphone permissions only when needed.
- Explain consent before speech analysis.
- Do not describe the overlay as GSM call recording.
- Do not embed Azure keys in the APK.
- Use HTTPS/WSS for production backend traffic.
