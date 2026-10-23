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

## Deploying on Render

The repository includes a Render Blueprint at `render.yaml`. Push the project to a
GitHub, GitLab, or Bitbucket repository, then create a new **Blueprint** in Render
and select that repository. Render will create the `satark-backend` web service
and deploy this directory.

After deployment, verify `https://<your-service>.onrender.com/api/v1/health`;
interactive API documentation is at `/docs`. If place search should use Azure
Maps, add `AZURE_MAPS_KEY` as a secret environment variable in the Render
service settings. Without it, place search returns its configured
not-available response.

This deployment installs only the FastAPI backend dependencies. The optional
PyTorch model in the sibling `model/` directory is not included in the Render
service; endpoints use their built-in non-model scoring behavior when model
inference is unavailable. The included in-memory report and lien state is
intended for demonstration and does not persist across restarts or scale across
instances.
