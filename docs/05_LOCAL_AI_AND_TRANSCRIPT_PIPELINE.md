# Local AI and transcript pipeline

Everything below runs on the phone; see `12_OFFLINE_AI_AND_FREE_SERVICES.md`
for models, conversion, licences and measurements.

1. **Capture** (`SpeechCapture.kt`): after the user taps Start listening, the
   microphone is read at 16 kHz and cut into utterances at short pauses.
2. **Speech-to-text** (`WhisperEngine.kt`): Whisper Tiny Hinglish (ONNX Runtime)
   transcribes each utterance into romanised Hindi/English/Hinglish. Audio is
   discarded after transcription.
3. **Rules** (`SatarkRules.kt` and `src/engine/localAnalyzer.js`): deterministic
   matching of the shared lexicon (`shared/scam-lexicon.json`) across the whole
   call. Combination rules (for example authority + secrecy, or emergency +
   payment request) produce a Tier 1 advisory with a category, plain advice and
   the cues heard.
4. **Optional explanation** (`AlertExplainer.kt`): if the user installed the
   on-device LLM, it writes a short, validated note when an alert is opened.
5. **Payment check** (demo): `decisionEngine.js` combines the conversation
   signal with payee novelty, amount and timing; only both together give Tier 2.

Typed or pasted text (an SMS, a WhatsApp message, a remembered call) goes
through the same rules in the app. Ordinary SIM/WhatsApp remote audio is not
accessible to third-party apps; Satark hears only what the phone's microphone
picks up. Scores and notes are signals, not proof of a crime.
