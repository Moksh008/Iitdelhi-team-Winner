# Android setup and permissions

Open `D:\Satark-main\android` in Android Studio. Ensure the Android SDK and
JDK are installed, then build with `.\gradlew.bat assembleDebug`.

The manifest requests internet, microphone, notification, foreground-service,
and overlay permissions. It does not request AccessibilityService, call-log,
phone-state, or notification-listener access. Overlay settings open only after
the user chooses to enable sensing. Denying overlay permission leaves the
normal app usable and manual transcript analysis available.

The overlay is a foreground service using `WindowManager`. OEM battery
policies, Android version differences, and denied permissions can stop or hide
it. Native speech results are posted to the existing FastAPI analyzer. The
default development URL is `http://10.0.2.2:8000` for an Android emulator.
For a physical device, build with a reachable backend URL:

```powershell
Set-Location D:\Satark-main\android
.\gradlew.bat assembleDebug -PSATARK_API_BASE_URL=https://your-api.example.com
```

Use HTTPS outside a local development network. Ordinary GSM and WhatsApp call
audio are not captured.
