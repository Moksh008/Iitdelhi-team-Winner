# Project Satark (सतर्क)
### Real-Time Multilingual Pre-Payment Scam Shield for UPI
**Winner · Raksham AI Cybersecurity Hackathon · Problem Statement 02**

> *"The scam shield that steps in **before** the UPI payment, not after."*

---

## Architecture Overview (`client`, `server`, `model`)

Satark is structured into three clean, enterprise-grade modules:

```
d:\Hackathons\iitdelhi\
│
├── client/                     # Mobile-First Frontend Application (React + Vite + Capacitor)
│   ├── android/                # Native Android Studio Project & APK build outputs
│   ├── src/                    # 22-Language Localization, Dynamic Decision Engine & Scenarios
│   │   ├── components/         # Mobile components, Studio telemetry, Bank reviewer console
│   │   ├── engine/             # Decision state machine, Multilingual intent engine
│   │   └── App.jsx             # Dual-view coordinator (Mobile + Studio Console)
│   ├── public/                 # PWA manifest, official holographic brand logo
│   └── package.json            # Client dependencies (React 19, Lucide, Confetti, Capacitor)
│
├── server/                     # Production FastAPI Microservice Backend
│   ├── main.py                 # FastAPI Application with Endpoints for 3s Chunks, Payments & 1930
│   ├── schemas.py              # Pydantic Schemas for Requests & Tier-3 Report Packs
│   └── requirements.txt        # FastAPI, Uvicorn, Pydantic
│
├── model/                      # Multilingual AI Model Pipeline (ICFD-31k)
│   ├── dataset_generator.py    # Generates 1,200+ Multilingual 3-second streaming chunks
│   ├── train_distilbert_icfd31k.py # Fine-tunes Multilingual DistilBERT on ICFD-31k with F1 benchmarks
│   ├── infer.py                # Standalone CLI inference across all Indian languages
│   └── requirements.txt        # PyTorch, Transformers, Scikit-learn
│
├── PRD.md                      # Complete Enterprise Product Requirements Document
└── MOBILE_CONVERSION.md        # Guide for compiling native Android APK via Android Studio / Capacitor
```

---

## 1. Client Module (`client/`)

The client delivers a responsive, dual-view experience:
1. **Protected Mobile UI**:
   - **Cellular & WhatsApp Call Interceptor**: Ingests live audio or simulated speech in Hindi, Gujarati, Marathi, Tamil, Telugu, etc.
   - **Tier 1 Nudge**: Floating heads-up banner naming the scam pattern.
   - **PayRaksham UPI App**: Intercepts payment intent **before** the UPI PIN screen.
   - **Tier 2 Pause Modal**: 60-second cooldown timer, targeted scam question, and 3 explicit actions.
   - **Tier 3 One-Tap Report**: Zero-knowledge prefilled 1930 & Bank Evidence Pack with SHA-256 hashed beneficiary.
2. **22 Scheduled Indian Languages**: Instant localization across all Eighth Schedule languages.
3. **Cyber Defense Studio**: Real-time meters for $C_{\text{rolling}}$, $P_{\text{payment}}$, dual-signal gate, and Bank Reviewer Console with 2-hour lien placement.

### Running Client
```bash
cd client
npm run dev
```
Open **`http://localhost:3000/`** (or across Wi-Fi on physical mobile phone).

---

## 2. Server Module (`server/`)

FastAPI microservice handling real-time chunk scoring, pre-payment risk evaluation, and the National Cybercrime Portal (1930) gateway.

### Running Server
```bash
cd server
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Interactive API docs at **`http://localhost:8000/docs`**.

---

## 3. Model Pipeline (`model/`)

Fine-tuning and evaluation pipeline for **Multilingual DistilBERT** on the **ICFD-31k** (Indian Conversational Fraud Dataset).
- **Supported Languages**: Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Punjabi, Hinglish, English.
- **Benchmark Target**: F1 Score `0.956` (Slide 6 & 13 of PRD).

### Generating Dataset & Training Model
```bash
cd model
python dataset_generator.py
python train_distilbert_icfd31k.py
```

### Running Inference
```bash
python infer.py "હું સીબીઆઈ હેડક્વાર્ટર દિલ્હીથી ઇન્સ્પેક્ટર બોલું છું, પૈસા સુરક્ષિત ખાતામાં મોકલો"
```

---

## Team Winner
* **Team Leader**: Moksh Kulshrestha
* **Team Members**: Piyush Wahi, Shivam Thakur
