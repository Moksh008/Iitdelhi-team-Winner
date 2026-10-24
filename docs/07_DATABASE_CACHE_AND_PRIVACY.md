# Storage, cache and privacy

* **Audio:** processed in memory by on-device Whisper and discarded; never stored or uploaded.
* **Transcripts:** kept in memory for the current listening session only (the last
  ~1,200 characters in the overlay) and cleared when listening stops.
* **Rule results:** only high-level features (scores and cue types, no text) are kept
  in JS memory for 24 hours for the payment demo.
* **Place searches:** Nominatim/Overpass responses are cached in the WebView's
  `localStorage` (geocodes 7 days, places 24 hours, at most 60 entries).
  Privacy tab → "Clear saved place searches" removes them.
* **Models:** the Whisper files ship inside the APK; the optional LLM is stored in
  app-private storage after a verified download and can be removed in the app.
  App backup is disabled so these files and caches are not copied off the phone.
* **Report packs:** created only after the user confirms, contain no audio or
  transcript, and leave the phone only if the user shares them.
* Satark never asks for or stores UPI PINs, OTPs, passwords or bank credentials.
* No API keys are needed or stored. Searches send only the typed place name or
  the chosen coordinates to OpenStreetMap services.
