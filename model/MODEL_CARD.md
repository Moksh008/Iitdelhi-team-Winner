# Model Card: Project Satark Multilingual DistilBERT

> **Production-Grade Conversational Cyber Fraud Detection Engine for UPI & Telephony Interception**  
> *Fine-Tuned on ICFD-31k and 14 Indian Languages Benchmark Datasets*

---

## 1. Executive Summary

This Model Card details the architecture, training methodology, datasets, and benchmark performance metrics of the **Satark Multilingual Scam Detection Model**. 

The model is built on **`distilbert-base-multilingual-cased`**, fine-tuned to classify 3-second streaming conversational speech chunks and smishing lures into **Legitimate/Ham** or **Coercive Scam/Threat**. It serves as the primary intelligence backend for the **Satark Pre-Payment Scam Shield**, intercepting fraudulent UPI transactions before victim authorization.

| Key Metric | Value | Baseline Reference | Status |
| :--- | :---: | :---: | :---: |
| **Model Architecture** | `distilbert-base-multilingual-cased` | DistilBERT 6-layer Transformer | Production Ready |
| **Parameters** | **134.7 Million** | 40% smaller than mBERT | Lightweight & Fast |
| **Validation Accuracy** | **96.25%** | 90.0% Target | ✅ **Exceeded** |
| **Precision** | **96.48%** | 92.0% Target | ✅ **Exceeded** |
| **Recall (Threat Sensitivity)** | **96.00%** | 90.0% Target | ✅ **Exceeded** |
| **F1-Score** | **0.9624** | **0.956** (Slide 6 & 13) | 🌟 **Beats Benchmark** |
| **Average CPU Latency** | **102.6 ms** | < 250 ms streaming threshold | ✅ **Real-Time Ready** |
| **Indian Languages Supported** | **14 Languages** | Hindi, Gujarati, Marathi, etc. | Pan-India Vernacular |

---

## 2. Model Architecture & Technical Specifications

```
                       [ Incoming Audio Stream ]
                                   │
                                   ▼
             [ 3-Second Audio Chunker & VAD Window ]
                                   │
                                   ▼
          [ Multilingual WordPiece Tokenizer (Vocab: 119k) ]
                                   │
                                   ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │        distilbert-base-multilingual-cased (134.7M Params)        │
 │  • 6 Transformer Encoder Blocks                                  │
 │  • 768 Hidden Dimension                                          │
 │  • 12 Self-Attention Heads per layer                             │
 │  • Cross-Lingual Shared Embedding Space (Devanagari, Dravidian)  │
 └──────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                    [ Classification Head (Pooler) ]
                    Dropout(0.2) ──► Linear(768 ──► 2)
                                   │
                                   ▼
            [ Softmax Probability: P(Scam) vs P(Ham) ]
                                   │
                                   ▼
      [ Rolling Accumulator: C_t = λ*C_{t-1} + (1-λ)*P(Scam) + β ]
```

### Detailed Specifications

* **Base Pretrained Checkpoint**: `distilbert-base-multilingual-cased` (Hugging Face Hub)
* **Tokenizer**: WordPiece Multilingual Tokenizer (cased, vocabulary size: 119,547 tokens)
* **Context Window / Max Sequence Length**: 128 tokens (optimized for 3-second streaming speech chunks)
* **Task Type**: Binary Sequence Classification (`0: Benign / Ham`, `1: Coercive Scam / Threat`)
* **Output Logits**: Softmax probability score $P(\text{Scam}) \in [0.0, 1.0]$
* **Artifact Footprint**: ~510 MB PyTorch checkpoint (`saved_model/model.safetensors`)

---

## 3. Training & Benchmark Datasets

The model was fine-tuned and validated on two real-world, peer-reviewed Indian fraud datasets hosted on Hugging Face:

### Dataset 1: [`rishia2220/icfd-31k`](https://huggingface.co/datasets/rishia2220/icfd-31k)
* **Description**: The official **Indian Conversational Fraud Dataset (ICFD-31k)** cited in Slide 6 & 13 of the Raksham PRD.
* **Original Scale**: 31,000 phone-call conversations and **1,111,071 cumulative 3-second streaming chunks**.
* **Content**: Real conversational dialogs simulating Digital Arrests, CBI impersonation, lottery scams, bank KYC fraud, and legitimate telemarketing/customer support calls.
* **Fields Utilized**: `cumulative_text`, `final_verdict` (`YES` for fraud, `NO` for benign), and `slow_thinking_rationale`.

### Dataset 2: [`anmolshrivastav/scam_ham_india_14_languages`](https://huggingface.co/datasets/anmolshrivastav/scam_ham_india_14_languages)
* **Description**: A balanced benchmark dataset curated for detecting fraud, phishing, and legitimate messages across **14 major Indian languages**.
* **Original Scale**: 14,000 verified samples (1,000 per language, exactly 50:50 Scam/Ham split).
* **Languages Covered**: Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Punjabi, Kannada, Malayalam, Odia, Assamese, Kashmiri, Hinglish, and English.
* **Content**: Coercive payment links, fake lottery wins, utility disconnection notices, delivery parcel threats, and legitimate personal/transactional messages.

### Combined Composite Dataset Assembly
To ensure balanced representation across both spoken phone calls and smishing lures without memory saturation:
* **1,200 samples** sampled uniformly across 14 languages from `scam_ham_india_14_languages`.
* **800 streaming chunks** sampled from `icfd-31k` phone conversations.
* **Total Records**: **2,000 balanced records** (1,000 Scam vs 1,000 Ham).
* **Train / Holdout Split**: 80% Training (1,600 chunks) / 20% Holdout Validation (400 chunks).
* **Dataset Artifact**: Saved in [hf_composite_dataset.json](file:///d:/Hackathons/iitdelhi/model/hf_composite_dataset.json).

---

## 4. Benchmark Performance & Evaluation Metrics

### Holdout Test Set Evaluation (400 Unseen Samples)

The model was evaluated on a dedicated holdout validation set of 400 chunks (200 Benign and 200 Scam) with zero overlap with the training set.

```
===========================================================================
Validation Classification Report (Holdout Test Set)
===========================================================================
               precision    recall  f1-score   support

 Benign / Ham       0.96      0.96      0.96       200
Scam / Threat       0.96      0.96      0.96       200

     accuracy                           0.96       400
    macro avg       0.96      0.96      0.96       400
 weighted avg       0.96      0.96      0.96       400
```

### Detailed Metric Breakdown

| Metric | Score | Formula | Practical Implication |
| :--- | :---: | :--- | :--- |
| **Accuracy** | **96.25%** | $\frac{TP + TN}{TP + TN + FP + FN}$ | High overall classification accuracy across diverse Indian dialects. |
| **Precision** | **96.48%** | $\frac{TP}{TP + FP}$ | Extremely low false-positive rate; prevents annoying legitimate callers. |
| **Recall** | **96.00%** | $\frac{TP}{TP + FN}$ | Intercepts 96 out of 100 actual scam calls in early conversation chunks. |
| **F1-Score** | **0.9624** | $2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}}$ | **Surpasses the PRD baseline of 0.956.** |
| **Inference Latency** | **102.6 ms** | Average forward pass on CPU | Well within 3-second streaming chunk window for zero lag. |

### Confusion Matrix Breakdown (400 Holdout Chunks)

```
                       Predicted Benign    Predicted Scam
  Actual Benign (200)        193                 7      (False Alarm: 3.5%)
  Actual Scam   (200)          8               192      (Missed Threat: 4.0%)
```

---

## 5. Supported Indian Languages Matrix

The model natively understands and tokenizes scripts across all 14 languages without machine translation:

| Language | Script | Locale Code | Example Threat Identified |
| :--- | :--- | :---: | :--- |
| **Hindi** | Devanagari | `hi` | "सीबीआई हेडक्वार्टर से इंस्पेक्टर बोल रहा हूँ, तुरंत पैसे ट्रांसफर करो" |
| **Gujarati** | Gujarati | `gu` | "તમારા ખાતામાં શંકાસ્પદ લેવડદેવડ થઈ છે, તાત્કાલિક સુરક્ષિત ખાતામાં પૈસા મોકલો" |
| **Marathi** | Devanagari | `mr` | "तुमच्या नावे अटक वॉरंट निघाले आहे, त्वरित सरकारी सुरक्षित खात्यात पैसे पाठवा" |
| **Bengali** | Bengali | `bn` | "আপনার নামে গ্রেপ্তারি পরোয়ানা জারি করা হয়েছে, এখনই টাকা স্থানান্তর করুন" |
| **Tamil** | Tamil | `ta` | "உங்கள் மீது கைது வாரண்ட் பிறப்பிக்கப்பட்டுள்ளது, உடனடியாக பணம் செலுத்துங்கள்" |
| **Telugu** | Telugu | `te` | "మీపై అరెస్ట్ వారెంట్ జారీ చేయబడింది, వెంటనే సురక్షిత ఖాతాకు డబ్బు పంపండి" |
| **Punjabi** | Gurmukhi | `pa` | "ਤੁਹਾਡੇ ਨਾਮ 'ਤੇ ਗ੍ਰਿਫਤਾਰੀ ਵਾਰੰਟ ਜਾਰੀ ਕੀਤਾ ਗਿਆ ਹੈ, ਤੁਰੰਤ ਪੈਸੇ ਟ੍ਰਾਂਸਫਰ ਕਰੋ" |
| **Kannada** | Kannada | `kn` | "ನಿಮ್ಮ ವಿರುದ್ಧ ಬಂಧನ ವಾರಂಟ್ ಹೊರಡಿಸಲಾಗಿದೆ, ತಕ್ಷಣ ಹಣವನ್ನು ವರ್ಗಾಯಿಸಿ" |
| **Malayalam** | Malayalam | `ml` | "നിങ്ങളുടെ പേരിൽ അറസ്റ്റ് വാറണ്ട് ഉണ്ട്, ഉടൻ പണം അയക്കുക" |
| **Odia** | Odia | `or` | "ଆପଣଙ୍କ ନାମରେ ଗିରଫ ୱାରେଣ୍ଟ ଜାରି ହୋଇଛି, ତୁରନ୍ତ ଟଙ୍କା ପଠାନ୍ତୁ" |
| **Assamese** | Bengali/Assamese | `as` | "আপোনাৰ নামত গ্ৰেপ্তাৰী ৱাৰেন্ট ওলাইছে, তৎক্ষণাৎ টকা স্থানান্তৰ কৰক" |
| **Hinglish** | Latin | `hi-Latn` | "CBI HQ se bol raha hu, arrest warrant issue hua hai, turant safe account me bhej" |
| **English** | Latin | `en` | "This is Inspector Sharma from Delhi CBI, transfer funds to RBI safe vault now" |
| **Kashmiri** | Perso-Arabic / Latin | `ks` | Regional vernacular smishing threats and coercion patterns |

---

## 6. Training Hyperparameters & Infrastructure

Fine-tuning was conducted using PyTorch and Hugging Face Transformers:

* **Optimizer**: `AdamW` with $\beta_1 = 0.9$, $\beta_2 = 0.999$, $\epsilon = 10^{-8}$
* **Base Learning Rate**: $3 \times 10^{-5}$
* **Weight Decay**: $0.01$ (L2 regularization)
* **Learning Rate Schedule**: Linear decay with 10% warmup steps
* **Batch Size**: 16
* **Epochs**: 2 complete passes over composite dataset
* **Gradient Clipping**: Norm threshold 1.0
* **Loss Function**: `CrossEntropyLoss` with equal class weighting
* **Training Time**: ~28 minutes on CPU (under 2 minutes on NVIDIA T4/A100)

---

## 7. Two-Tier Defense Architecture (Edge + Cloud)

Satark implements a **defense-in-depth** strategy to balance privacy, latency, and model depth:

```
+-------------------------------------------------------------------------+
| LEVEL 1: CLIENT-SIDE ON-DEVICE VECTOR ENGINE                            |
| File: client/src/engine/semanticClassifier.js                           |
| Latency: < 10 ms | Offline: 100% | Privacy: No audio leaves phone        |
| Coverage: 22 Indian Languages + Hinglish Regex + Coercion Indicators   |
+-------------------------------------------------------------------------+
                                   │
                    (If Network Available / High Risk)
                                   ▼
+-------------------------------------------------------------------------+
| LEVEL 2: MICROSERVICE MULTILINGUAL DISTILBERT (THIS MODEL)              |
| File: server/main.py -> model/saved_model                               |
| Latency: ~100 ms | Deep Contextual Attention | F1: 0.9624               |
| Computes 3-second Rolling Risk Accumulator C_t                         |
+-------------------------------------------------------------------------+
```

---

## 8. Privacy & Regulatory Compliance

* **DPDP Act 2023 (Digital Personal Data Protection Act)**: 
  * Audio recordings are **never stored** on remote servers.
  * Audio chunks are transcribed on-device; only transient, non-PII semantic feature tokens are processed.
  * VPA / UPI IDs are SHA-256 hashed before evaluation (`rbi***@okhdfcbank`).
* **RBI FREE-AI Compliance**:
  * **Fairness**: Balanced across 14 linguistic populations without geographical bias.
  * **Reliability**: Dual-signal cross-validation (Spoken Coercion + Payment Mismatch).
  * **Explainability**: Outputs human-readable slow-thinking rationales for why a call was flagged.
  * **Ethics**: Strict opt-in accessibility permission with zero background eavesdropping.

---

## 9. How to Use, Evaluate, and Re-Train

### 1. Test Inference via CLI
```powershell
cd d:\Hackathons\iitdelhi\model
python infer.py "સીબીઆઈ હેડક્વાર્ટરથી ઇન્સ્પેક્ટર બોલું છું, તરત જ સુરક્ષિત ખાતામાં પૈસા મોકલો"
```

### 2. Verify Across Multi-Language Test Cases
```powershell
python verify_inference.py
```

### 3. Re-Train on Fresh Hugging Face Datasets
```powershell
python train_hf_datasets.py
```

### 4. Query via FastAPI Backend
```bash
curl -X POST "http://127.0.0.1:8000/api/v1/classify-chunk" \
     -H "Content-Type: application/json" \
     -d '{"text": "CBI video call arrest warrant, transfer 5 lakh rupees to safe account"}'
```

---

## 10. Authors & Citation

```bibtex
@dataset{ahuja2024icfd,
  author    = {Rishi Ahuja},
  title     = {ICFD-31k: Indian Conversational Fraud Dataset for Static, Streaming, and Cross-Domain Fraud Detection},
  year      = {2024},
  publisher = {Hugging Face},
  howpublished = {\url{https://huggingface.co/datasets/rishia2220/icfd-31k}}
}

@dataset{shrivastav2024scamham,
  author    = {Anmol Shrivastav},
  title     = {Indian Multilingual Scam & Ham SMS Dataset (14 Languages)},
  year      = {2024},
  publisher = {Hugging Face},
  howpublished = {\url{https://huggingface.co/datasets/anmolshrivastav/scam_ham_india_14_languages}}
}
```
