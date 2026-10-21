# Build, run, and demo

Start the frontend with `npm run dev` and the backend from `server` with
`uvicorn main:app --host 127.0.0.1 --port 8000`. For an APK run:

```powershell
npm run build
npx cap sync android
Set-Location android
.\gradlew.bat assembleDebug
```

Install `app-debug.apk`, grant overlay permission, and return to Satark. Tap
the floating `S`, test Start/Pause, then use the web/app transcript input with a
named location and payment request. Confirm the card shows provider-returned
contacts and only available phone numbers.

For a physical phone, `127.0.0.1` is the phone. Use a reachable HTTPS backend
for production; do not expose development secrets.
