# Local AI and transcript pipeline

Input can be typed into the call screen or supplied through browser speech
recognition with explicit microphone permission. The client maintains rolling
conversation context and detects Hindi, Hinglish, English, and several Indian
scripts.

The backend extracts emergency events, payment amounts, hospitals, and named
landmarks. It returns `MONITOR`, `SHOW_NEARBY_PLACES`, or
`VERIFY_BEFORE_PAYMENT`.

Ordinary SIM-call remote audio is not available reliably to third-party apps.
Manual transcript input remains the supported fallback. Model scores are
signals only and must not be presented as proof of criminal behavior.
