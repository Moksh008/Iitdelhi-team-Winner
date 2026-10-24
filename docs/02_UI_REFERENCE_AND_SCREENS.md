# UI reference and screens

Light, minimal design (`src/styles.css`): white cards on a light grey background,
one blue accent, red/amber only for warnings. The app opens directly on Home.

* **Home** — one large Start/Stop listening button with status and microphone
  level; "What Satark heard" shows each sentence live; a red banner appears when
  a scam pattern is detected; "Check a message" with explicit Check/Clear buttons.
* **Scam warning** (full page, back arrow) — risk, plain advice, Call 1930 and
  Done, the cues heard with a quote, optional on-device AI note, and nearby help
  searched automatically from the place mentioned in the call.
* **Nearby** — place search or "Use my location", category chips, radius,
  map and up to five places with "Find phone number" links.
* **Pay check** — labelled demo: pick a scripted call (analysed automatically),
  try a payment, see the Tier 1 warning or the Tier 2 pause sheet and report pack.
* **Settings** — speech model status, optional AI model download/cancel/remove,
  privacy summary, clear saved searches, open Android permission settings.

The floating bubble (native) uses the same light palette. It is hidden while
the Satark screen is open and appears over other apps (for example during a call
on speaker), opening a compact panel with live text and the warning.
