# Satark Server (FastAPI Microservice Backend)

This is the production backend for **Project Satark (सतर्क)**, built with FastAPI, PyTorch, and Uvicorn.

---

## Features
- **Multilingual Inference Endpoint**: `/api/v1/classify-chunk` evaluates 3-second streaming audio chunks across all Indian languages.
- **Dual-Signal Payment Gate**: `/api/v1/evaluate-payment` joins conversation risk score ($C_t$) with payment context ($P$) before UPI PIN entry.
- **National Cybercrime 1930 / I4C Gateway**: `/api/v1/submit-report` and `/api/v1/reports` for bank fraud analysts.
- **2-Hour Temporary Lien**: `/api/v1/place-lien` per Supreme Court of India mule account SOP.

---

## Running the Server

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Start Uvicorn Server
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Interactive Swagger API Documentation will be available at:
👉 **`http://localhost:8000/docs`**
