import sys
import requests
import json

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

payload = {
    "text": "सीबीआई हेडक्वार्टर से इंस्पेक्टर बोल रहा हूँ, आपका आधार नंबर 4829 1928 9182 मनी लॉन्ड्रिंग में फंसा है, किसी को मत बताना, तुरंत सुरक्षित खाते में 2 लाख ट्रांसफर करो",
    "claimed_caller_type": "Police",
    "amount_in_discussion": 200000.0
}

url = "http://127.0.0.1:8000/api/v1/analyze-multimodal-chunk"
print("Sending test request to", url)
r = requests.post(url, json=payload, timeout=30)
print(f"Status Code: {r.status_code}")
print(json.dumps(r.json(), indent=2, ensure_ascii=False))
