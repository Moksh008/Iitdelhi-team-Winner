"""
Project Satark - Hugging Face Real Benchmark Dataset Pipeline & Fine-Tuning
Datasets integrated:
1. https://huggingface.co/datasets/anmolshrivastav/scam_ham_india_14_languages
   - 14 Indian Languages: Hindi, Gujarati, Marathi, Bengali, Tamil, Telugu, Punjabi, Kannada, Malayalam, Oriya, Assamese, etc.
   - SMS & smishing conversational lures.
2. https://huggingface.co/datasets/rishia2220/icfd-31k
   - Official ICFD-31k phone call transcripts & 3-second streaming audio chunks.
   - Exact benchmark cited in Raksham Problem Statement 02 (Slide 6 & 13).
"""

import os
import sys
import json
import time
import requests
import pandas as pd
import numpy as np
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    get_linear_schedule_with_warmup
)
from torch.optim import AdamW
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, classification_report

# Set utf-8 stdout encoding for Indian scripts on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SAVED_MODEL_DIR = os.path.join(BASE_DIR, "saved_model")
METRICS_FILE = os.path.join(BASE_DIR, "benchmark_metrics.json")
COMPOSITE_DATA_FILE = os.path.join(BASE_DIR, "hf_composite_dataset.json")

def load_and_prepare_hf_datasets(max_samples_14lang=2000, max_samples_icfd=1000):
    """
    Fetches parquet shards directly from Hugging Face for both benchmark datasets,
    balances labels (50% scam, 50% ham), and merges them into a standardized format.
    """
    print("\n" + "=" * 75)
    print("STEP 1: Ingesting Real Hugging Face Datasets")
    print("=" * 75)

    all_records = []

    # 1. Ingest anmolshrivastav/scam_ham_india_14_languages
    url_14lang = "https://huggingface.co/datasets/anmolshrivastav/scam_ham_india_14_languages/resolve/main/data/train-00000-of-00001.parquet"
    print(f"Downloading 14 Indian Languages dataset from:\n  {url_14lang}")
    try:
        df_14 = pd.read_parquet(url_14lang)
        print(f"-> Successfully loaded {len(df_14)} records across {df_14['language'].nunique()} languages.")
        
        # Subsample balanced scam vs ham across languages
        scam_14 = df_14[df_14["label"] == 1].sample(min(max_samples_14lang // 2, (df_14["label"] == 1).sum()), random_state=42)
        ham_14 = df_14[df_14["label"] == 0].sample(min(max_samples_14lang // 2, (df_14["label"] == 0).sum()), random_state=42)
        sub_14 = pd.concat([scam_14, ham_14]).sample(frac=1.0, random_state=42)

        for _, row in sub_14.iterrows():
            text = str(row["text"]).strip()
            if text:
                all_records.append({
                    "text": text,
                    "label": int(row["label"]),
                    "language": str(row.get("language", "Unknown")),
                    "source": "scam_ham_india_14_languages"
                })
        print(f"-> Extracted {len(sub_14)} balanced samples from 14-languages dataset.")
    except Exception as e:
        print(f"Warning: Failed to fetch 14-lang dataset: {e}")

    # 2. Ingest rishia2220/icfd-31k
    url_icfd = "https://huggingface.co/datasets/rishia2220/icfd-31k/resolve/main/streaming_chunks/test-00000-of-00008.parquet"
    print(f"\nDownloading ICFD-31k streaming chunks dataset from:\n  {url_icfd}")
    try:
        df_icfd = pd.read_parquet(url_icfd)
        print(f"-> Successfully loaded {len(df_icfd)} ICFD-31k chunks.")
        
        # Filter for cumulative_text and final_verdict ('YES' for scam, 'NO' for ham)
        valid_icfd = df_icfd.dropna(subset=["cumulative_text", "final_verdict"])
        scam_icfd = valid_icfd[valid_icfd["final_verdict"].str.upper() == "YES"]
        ham_icfd = valid_icfd[valid_icfd["final_verdict"].str.upper() == "NO"]

        n_scam = min(max_samples_icfd // 2, len(scam_icfd))
        n_ham = min(max_samples_icfd // 2, len(ham_icfd))

        sampled_scam = scam_icfd.sample(n_scam, random_state=42)
        sampled_ham = ham_icfd.sample(n_ham, random_state=42)
        sub_icfd = pd.concat([sampled_scam, sampled_ham]).sample(frac=1.0, random_state=42)

        for _, row in sub_icfd.iterrows():
            text = str(row["cumulative_text"]).strip()
            label = 1 if str(row["final_verdict"]).upper() == "YES" else 0
            if text:
                all_records.append({
                    "text": text,
                    "label": label,
                    "language": "English/Hinglish",
                    "source": "icfd-31k"
                })
        print(f"-> Extracted {len(sub_icfd)} balanced samples from ICFD-31k.")
    except Exception as e:
        print(f"Warning: Failed to fetch ICFD dataset: {e}")

    # Save cached composite dataset
    with open(COMPOSITE_DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)

    print(f"\nTotal composite benchmark records assembled: {len(all_records)}")
    labels_dist = pd.Series([r["label"] for r in all_records]).value_counts().to_dict()
    print(f"Label distribution: 1 (Scam) = {labels_dist.get(1, 0)}, 0 (Benign/Ham) = {labels_dist.get(0, 0)}")
    return all_records


class MultilingualFraudDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len=128):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, item):
        text = str(self.texts[item])
        label = self.labels[item]

        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_len,
            return_tensors="pt"
        )

        return {
            "input_ids": encoding["input_ids"].flatten(),
            "attention_mask": encoding["attention_mask"].flatten(),
            "labels": torch.tensor(label, dtype=torch.long)
        }


def fine_tune_on_hf_datasets(epochs=2, batch_size=16):
    """
    Fine-tunes distilbert-base-multilingual-cased on the combined real Hugging Face datasets.
    """
    # 1. Load data
    if os.path.exists(COMPOSITE_DATA_FILE):
        print(f"Loading cached composite dataset from {COMPOSITE_DATA_FILE}...")
        with open(COMPOSITE_DATA_FILE, "r", encoding="utf-8") as f:
            records = json.load(f)
    else:
        records = load_and_prepare_hf_datasets()

    texts = [r["text"] for r in records]
    labels = [r["label"] for r in records]

    train_texts, val_texts, train_labels, val_labels = train_test_split(
        texts, labels, test_size=0.2, random_state=42, stratify=labels
    )
    print(f"Dataset split: {len(train_texts)} training chunks, {len(val_texts)} validation holdout chunks.")

    # 2. Tokenizer & Base Architecture
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\nCompute Device: {device}")
    
    model_name = "distilbert-base-multilingual-cased"
    print(f"Loading base architecture: {model_name}...")
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)
    model.to(device)

    # 3. DataLoaders
    train_dataset = MultilingualFraudDataset(train_texts, train_labels, tokenizer)
    val_dataset = MultilingualFraudDataset(val_texts, val_labels, tokenizer)

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    optimizer = AdamW(model.parameters(), lr=3e-5, weight_decay=0.01)
    total_steps = len(train_loader) * epochs
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(total_steps * 0.1),
        num_training_steps=total_steps
    )

    print("\n" + "=" * 75)
    print("STEP 2: Fine-Tuning Multilingual DistilBERT on Real Datasets")
    print("=" * 75)

    start_time = time.time()
    for epoch in range(epochs):
        model.train()
        total_train_loss = 0

        for step, batch in enumerate(train_loader):
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels_tensor = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels_tensor
            )

            loss = outputs.loss
            total_train_loss += loss.item()

            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()

            if (step + 1) % 15 == 0 or (step + 1) == len(train_loader):
                print(f"Epoch [{epoch+1}/{epochs}] Step [{step+1}/{len(train_loader)}] Loss: {loss.item():.4f}")

    train_duration = round(time.time() - start_time, 2)
    print(f"\nTraining completed in {train_duration}s.")

    # 4. Evaluation
    print("\n" + "=" * 75)
    print("STEP 3: Validation on Holdout Benchmark Test Set")
    print("=" * 75)
    model.eval()
    val_preds, val_targets = [], []
    latencies = []

    with torch.no_grad():
        for batch in val_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            
            t0 = time.time()
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            latencies.append((time.time() - t0) * 1000 / len(input_ids))

            preds = torch.argmax(outputs.logits, dim=1).cpu().numpy()
            val_preds.extend(preds)
            val_targets.extend(batch["labels"].numpy())

    acc = accuracy_score(val_targets, val_preds)
    prec, rec, f1, _ = precision_recall_fscore_support(val_targets, val_preds, average="binary", zero_division=0)
    avg_latency = float(np.mean(latencies))

    print("\nValidation Classification Report:")
    print(classification_report(val_targets, val_preds, target_names=["Benign / Ham", "Scam / Threat"]))

    # 5. Export Updated Metrics and Model Weights
    print("=" * 75)
    print("STEP 4: Saving Model Checkpoint & Official Metrics Report")
    print("=" * 75)
    os.makedirs(SAVED_MODEL_DIR, exist_ok=True)
    model.save_pretrained(SAVED_MODEL_DIR)
    tokenizer.save_pretrained(SAVED_MODEL_DIR)
    print(f"-> Fine-tuned weights saved to: {SAVED_MODEL_DIR}")

    metrics = {
        "model_architecture": "distilbert-base-multilingual-cased-HF-Real",
        "primary_benchmarks": [
            "anmolshrivastav/scam_ham_india_14_languages (14 Indian Languages)",
            "rishia2220/icfd-31k (Official Indian Conversational Fraud Dataset)"
        ],
        "supported_languages": [
            "Hindi", "Gujarati", "Marathi", "Bengali", "Tamil",
            "Telugu", "Punjabi", "Kannada", "Malayalam", "Oriya", "Assamese", "Hinglish", "English"
        ],
        "dataset_sample_size": len(records),
        "holdout_test_size": len(val_texts),
        "accuracy": round(float(acc), 4),
        "precision": round(float(prec), 4),
        "recall": round(float(rec), 4),
        "f1_score": round(float(f1), 4),
        "target_f1_baseline": 0.956,
        "inference_latency_ms": round(avg_latency, 2),
        "status": "Production-Grade Fine-Tuned Model Active"
    }

    with open(METRICS_FILE, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print(f"-> Official benchmark report saved to: {METRICS_FILE}")
    print(json.dumps(metrics, indent=2))
    print("\nPipeline complete! Backend API and inference will now use the real HF-trained model.")

if __name__ == "__main__":
    records = load_and_prepare_hf_datasets(max_samples_14lang=1200, max_samples_icfd=800)
    fine_tune_on_hf_datasets(epochs=2, batch_size=16)
