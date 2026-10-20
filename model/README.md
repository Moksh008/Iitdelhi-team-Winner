# Project Satark AI Model Pipeline

> **Multilingual DistilBERT for Conversational Scam Interception**  
> Fine-tuned on the **ICFD-31k** official benchmark and **14 Indian Languages** smishing datasets.

For the full technical deep dive, see the comprehensive [MODEL_CARD.md](MODEL_CARD.md).

---

## Benchmark Performance Highlights

| Metric | Baseline Target (PRD) | Achieved Score | Status |
| :--- | :---: | :---: | :---: |
| **Model** | `distilbert-base-multilingual-cased` | 134.7M Parameters | ✅ Production |
| **Accuracy** | 90.0% | **96.25%** | ✅ Exceeded |
| **Precision** | 92.0% | **96.48%** | ✅ Exceeded |
| **Recall** | 90.0% | **96.00%** | ✅ Exceeded |
| **F1-Score** | **0.956** | **0.9624** | 🌟 **Beats Benchmark** |
| **CPU Latency** | < 250 ms | **102.6 ms** | ✅ Real-time Edge Compliant |
| **Languages** | Pan-India | **14 Indian Languages** | Native tokenization |

---

## Datasets Integrated

1. **[`rishia2220/icfd-31k`](https://huggingface.co/datasets/rishia2220/icfd-31k)**: Official Indian Conversational Fraud Dataset (31,000 conversations, 1.11M streaming chunks) cited in Slide 6 & 13 of the PRD.
2. **[`anmolshrivastav/scam_ham_india_14_languages`](https://huggingface.co/datasets/anmolshrivastav/scam_ham_india_14_languages)**: 14,000 verified smishing lures across 14 Indian languages and scripts.

---

## Quickstart Commands

### 1. Run Live Inference
```powershell
python infer.py "તમારા બેંક એકાઉન્ટમાં શંકાસ્પદ લેવડદેવડ થઈ છે, તાત્કાલિક સુરક્ષિત ખાતામાં પૈસા મોકલો"
```

### 2. Run Comprehensive Multilingual Verification
```powershell
python verify_inference.py
```

### 3. Re-train / Re-benchmark on Hugging Face Datasets
```powershell
python train_hf_datasets.py
```

### 4. Detailed Documentation
* Read [MODEL_CARD.md](MODEL_CARD.md) for hyperparameter details, confusion matrix, and DPDP/RBI FREE-AI compliance notes.
* View [benchmark_metrics.json](benchmark_metrics.json) for machine-readable evaluation metrics.
* See [deepfake_detector.py](deepfake_detector.py) for neural vocoder cutoff (>7.5 kHz) and pitch jitter/shimmer voice clone detection.
* See `reference_repos/` for full architectural analysis of `CallShield-AI`, `ScamVoice-`, and `deepfake-shield-agent`.

