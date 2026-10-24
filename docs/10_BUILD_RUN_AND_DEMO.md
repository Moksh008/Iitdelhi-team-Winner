# Build, run, and demo

**Web preview** (typed-text analysis, nearby help, payment demo): `npm install`,
`npm run dev`, then open http://localhost:3000. No backend is needed.

**Android APK** (full on-device experience). Convert the speech model first —
see section 7 of `12_OFFLINE_AI_AND_FREE_SERVICES.md`. Then:

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Demo script:

1. Shield → Start listening; grant overlay and microphone permission.
2. Play or say a scam line on speaker, for example "main police station se bol
   raha hoon, kisi ko mat batana, turant paise bhejo". The bubble turns amber.
3. Tap "Details & nearby help": advice, cues heard, the optional on-device AI
   note, and OpenStreetMap search (try "Patiala") with "Find phone number" links.
4. Payment demo tab: pick a scripted call, run it through the rules, then try
   the suggested payment to see Tier 1/Tier 2 and the user-confirmed report pack.
5. Airplane mode: listening, rules and the AI note keep working; nearby search
   reports that the map services are unreachable.

The optional FastAPI server in `server/` is a development/test service only;
the app does not call it.
