# SATARK (सतर्क)

Satark is a consent-based pre-payment scam shield. Its native Android
call-time experience is a small Compose floating bubble that analyzes only
explicitly supported speech/transcript input. It expands into a compact
warning panel only when actual analysis returns relevant indicators. The
React/Vite dashboard remains available as a fallback and development surface.

This repository currently uses a React/Vite mobile UI packaged with Capacitor
and a small native Android overlay service. It is not a pure Kotlin/Compose
application yet. The implementation status is recorded in
[docs/11_IMPLEMENTATION_STATUS_AND_ROADMAP.md](docs/11_IMPLEMENTATION_STATUS_AND_ROADMAP.md).

## Quick start

```powershell
npm install
npm run dev
```

Run the API separately:

```powershell
Set-Location server
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Build the debug APK:

```powershell
Set-Location D:\Satark-main
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
```

APK: `android\app\build\outputs\apk\debug\app-debug.apk`.

The native overlay requires user-granted overlay permission and microphone
permission before speech sensing. Ordinary cellular and WhatsApp call audio
is not assumed to be accessible. The native bridge exposes
`SatarkNative.startSensing`, `SatarkNative.stopSensing`, and
`SatarkNative.openOverlaySettings` to the React fallback.

## Safety boundaries

Satark does not promise access to both sides of an ordinary cellular call.
Nearby listings and phone numbers are provider data, not proof of an incident.
The app does not place calls automatically, send money, or embed Azure secrets.

## Documentation

1. [Product and scope](docs/01_PRODUCT_AND_SCOPE.md)
2. [UI reference](docs/02_UI_REFERENCE_AND_SCREENS.md)
3. [Android setup](docs/03_ANDROID_SETUP_AND_PERMISSIONS.md)
4. [Architecture](docs/04_ARCHITECTURE_AND_FOLDER_STRUCTURE.md)
5. [AI and transcript pipeline](docs/05_LOCAL_AI_AND_TRANSCRIPT_PIPELINE.md)
7. [Cache and privacy](docs/07_DATABASE_CACHE_AND_PRIVACY.md)
8. [Verification and dialer](docs/08_VERIFICATION_PANEL_AND_DIALER.md)
9. [Testing](docs/09_TESTING_AND_ACCEPTANCE.md)
10. [Build and demo](docs/10_BUILD_RUN_AND_DEMO.md)
11. [Status and roadmap](docs/11_IMPLEMENTATION_STATUS_AND_ROADMAP.md)
