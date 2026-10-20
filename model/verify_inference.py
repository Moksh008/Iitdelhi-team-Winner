import sys
import os
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

base_dir = os.path.dirname(os.path.abspath(__file__))
saved_model_path = os.path.join(base_dir, "saved_model")

tokenizer = AutoTokenizer.from_pretrained(saved_model_path)
model = AutoModelForSequenceClassification.from_pretrained(saved_model_path)
model.eval()

test_cases = [
    ("Namaste Vikram ji, Barclays Bank se pre-approved loan mila hai.", "Benign / Ham"),
    ("I am Inspector Sharma from CBI headquarters. An arrest warrant is issued in your name, transfer funds immediately to safe custody account.", "Scam / Digital Arrest"),
    ("Dear customer your electricity power will be disconnected tonight at 9:30 PM due to unpaid bill, call immediately to avoid disconnection", "Scam / Utility Disconnection"),
    ("Hi Mom, I will reach home by 7 PM today. Please make tea.", "Benign / Personal"),
    ("તમારા નામ પર ધરપકડ વોરંટ નીકળ્યું છે, સીબીઆઈ અધિકારી બોલું છું, પૈસા સુરક્ષિત ખાતામાં મોકલો", "Scam / Gujarati CBI")
]

print("=" * 80)
print("Evaluating Newly Fine-Tuned Real Hugging Face Model across Indian Languages")
print("=" * 80)

for text, expected in test_cases:
    inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=1).cpu().numpy()[0]
    
    scam_prob = float(probs[1])
    is_scam = scam_prob >= 0.50
    verdict = "SCAM / THREAT" if is_scam else "BENIGN / SAFE"
    
    print(f"\nText: '{text}'")
    print(f"  Expected: {expected}")
    print(f"  Logits: {outputs.logits.tolist()[0]}")
    print(f"  Probs: Ham (0) = {probs[0]*100:.1f}%, Scam (1) = {probs[1]*100:.1f}%")
    print(f"  Model Verdict: {verdict}")
