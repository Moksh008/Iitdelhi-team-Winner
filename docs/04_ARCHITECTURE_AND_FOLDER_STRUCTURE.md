# Architecture and folder structure

Current implementation:

```text
src/
  App.jsx
  components/mobile/
  engine/
server/
  main.py
  claim_verification.py
  schemas.py
model/
  infer.py
android/app/src/main/java/in/satark/shield/
  MainActivity.java
  SatarkOverlayService.kt
  SatarkNativePlugin.java
```

React owns the fallback mobile experience and calls FastAPI for transcript and
nearby place work. The native Compose service owns the minimized overlay,
consented speech source, analyzer request, structured warning panel, and
dialer intent. `claim_verification.py` extracts entities and applies proximity
filtering. Native GSM and WhatsApp remote audio are deliberately unsupported.

The requested Kotlin/Compose MVVM, Room, Retrofit, and ONNX layers are not
present yet; see the roadmap rather than assuming they exist.
