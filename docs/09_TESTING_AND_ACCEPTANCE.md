# Testing and acceptance

Validated in this workspace:

- `npm run build` passes.
- Capacitor asset sync passes.
- `android\gradlew.bat assembleDebug` passes.
- Hindi, Hinglish, English, named landmark, and generic-location flows were
  tested previously against the transcript API.
- Nearby results are geocoded and filtered to the configured radius.

Required device tests still pending: overlay on the target OEM, denied
permissions, process death, microphone consent, dialer intent, offline/cache
states, and Android call-screen behavior. Do not make real calls during tests.

Acceptance requires no fabricated numbers, no automatic payment/calling, no
embedded secrets, truthful source labels, and a usable manual transcript path.
