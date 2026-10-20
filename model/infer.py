"""
Satark Multilingual Inference Pipeline
Tests single or streaming chunks across all Indian languages (Hindi, Gujarati, Marathi, Bengali, Tamil, etc.)
"""

import sys
import os
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def predict_chunk(text, model_dir="model/saved_model"):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    saved_model_path = os.path.join(base_dir, "saved_model")
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if os.path.exists(saved_model_path):
        tokenizer = AutoTokenizer.from_pretrained(saved_model_path)
        model = AutoModelForSequenceClassification.from_pretrained(saved_model_path)
    else:
        # Fallback to base model if fine-tuned checkpoint not generated yet
        print("Notice: Using pretrained base multilingual architecture...")
        model_name = "distilbert-base-multilingual-cased"
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForSequenceClassification.from_pretrained(model_name, num_labels=2)

    model.to(device)
    model.eval()

    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128).to(device)
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=1).cpu().numpy()[0]

    scam_prob = float(probs[1])
    is_scam = scam_prob >= 0.65

    result = {
        "text": text,
        "scam_probability": round(scam_prob, 4),
        "is_threat": is_scam,
        "action_tier": 2 if scam_prob >= 0.80 else (1 if scam_prob >= 0.65 else 0),
        "status": "DANGER (Tier 2 Pause)" if scam_prob >= 0.80 else ("WARNING (Tier 1 Nudge)" if scam_prob >= 0.65 else "SAFE (Tier 0 Watch)")
    }
    return result

if __name__ == "__main__":
    sample_text = sys.argv[1] if len(sys.argv) > 1 else "હું સીબીઆઈ હેડક્વાર્ટર દિલ્હીથી ઇન્સ્પેક્ટર બોલું છું, તમારા નામનું પાર્સલ પકડાયું છે, તાત્કાલિક સુરક્ષિત ખાતામાં પૈસા મોકલો"
    print(f"\nAnalyzing chunk: '{sample_text}'")
    res = predict_chunk(sample_text)
    print(f"Scam Risk Probability: {res['scam_probability'] * 100:.2f}%")
    print(f"Intervention Tier: {res['status']}\n")
