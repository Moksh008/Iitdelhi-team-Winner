"""
PC check of the on-device explanation prompt and validator in
android/.../AlertExplainer.kt, using the original Qwen/Qwen3-0.6B weights with
transformers (greedy). The phone runs the Q8_0 GGUF with a JSON grammar, so
outputs can differ slightly; this checks prompt behaviour and the safety filter.

Usage: python tools/models/check_explainer_prompt.py
"""

import json
import re
import sys
import time

KOTLIN = "android/app/src/main/java/in/satark/shield/AlertExplainer.kt"


def kotlin_constants():
    src = open(KOTLIN, encoding="utf-8").read()
    system = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', src.split("private const val SYSTEM =")[1].split("\n\n")[0]))
    system = system.replace('\\"', '"')
    shots_block = src.split("private val SHOTS = listOf(")[1].split("\n    )\n")[0]
    pairs = []
    for user, assistant in re.findall(r'((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)\s+to\s*\n\s*("(?:[^"\\]|\\.)*")', shots_block):
        u = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', user)).replace("\\n", "\n").replace('\\"', '"')
        a = assistant[1:-1].replace('\\"', '"')
        pairs.append((u, a))
    unsafe = re.search(r'private val UNSAFE = Regex\(\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+),', src).group(1)
    unsafe = "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', unsafe)).replace("\\\\", "\\")
    def single(name):
        pattern = re.search(rf'private val {name} = Regex\("((?:[^"\\]|\\.)*)"', src).group(1)
        return re.compile(pattern.replace("\\\\", "\\"), re.I)

    return system, pairs, re.compile(unsafe, re.I), single("SAFETY_WORDS"), single("RISKY_ACTION"), single("NEGATION")


def build_prompt(system, shots, transcript, cues):
    out = f"<|im_start|>system\n{system}<|im_end|>\n"
    for user, assistant in shots:
        out += f"<|im_start|>user\n{user}<|im_end|>\n<|im_start|>assistant\n{assistant}<|im_end|>\n"
    transcript = re.sub(r"\s+", " ", transcript)[:500]
    out += f"<|im_start|>user\nTranscript: {transcript}\nWarning signs: {'; '.join(cues)[:400]}<|im_end|>\n"
    return out + "<|im_start|>assistant\n<think>\n\n</think>\n\n"


def validate(raw, unsafe, safety, risky, negation):
    match = re.search(r"\{.*\}", raw, re.S)
    if not match:
        return None, "no json"
    try:
        text = json.loads(match.group(0)).get("explanation", "").strip()
    except json.JSONDecodeError:
        return None, "bad json"
    if not 20 <= len(text) <= 300:
        return None, "length"
    if unsafe.search(text):
        return None, "unsafe"
    for sentence in re.split(r"[.!?]+", text):
        if risky.search(sentence) and not negation.search(sentence):
            return None, "risky action"
    if not safety.search(text):
        return None, "no safety advice"
    return text, "ok"


CASES = [
    ("I am calling from the CBI cyber crime cell. Your Aadhaar is linked to a narcotics parcel. Do not disconnect this call.",
     ["Claims to be police, a court or a government agency", "Asks you to keep the call secret or stay on the line"]),
    ("your son had an accident near anardana chowk in patiala he is admitted in the hospital send fifty thousand rupees immediately",
     ["Says a relative is in an accident or hospital", "Asks you to send money", "Pressure to act immediately"]),
    ("main police station se bol raha hoon aapke khilaf arrest warrant hai kisi ko mat batana aur turant paise bhejo",
     ["Claims to be police, a court or a government agency", "Asks you to keep the call secret or stay on the line", "Asks you to send money"]),
    ("sir your kyc is pending your bank account will be blocked today please share the otp",
     ["Threatens to block, freeze, disconnect or penalise your account or service", "Asks for an OTP, PIN, password or card details"]),
    ("transfer all your savings to this rbi safe account for verification",
     ["Asks you to move money to a 'safe' or verification account"]),
    ("please install anydesk so I can process your refund", ["Asks you to install a screen-sharing or remote-control app", "Promises a prize, lottery, refund or cashback"]),
    ("aapne lottery jeeti hai inaam lene ke liye processing fee bhejiye", ["Promises a prize, lottery, refund or cashback", "Asks you to send money"]),
    ("we have your brother with us send money to this upi id or you will never see him again", ["Threatens harm, exposure or kidnapping", "Asks you to send money"]),
    ("this is a work from home job with daily payout first make a small deposit", ["Offers a loan, earnings, returns or a payout that sounds too good", "Asks for a fee or deposit before releasing money or a service"]),
    ("पुलिस अधिकारी बोल रहा हूँ, आपके नाम पर वारंट है, किसी को मत बताना", ["Claims to be police, a court or a government agency", "Asks you to keep the call secret or stay on the line"]),
]


def main():
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    system, shots, unsafe, safety, risky, negation = kotlin_constants()
    assert len(shots) == 2, shots
    tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-0.6B")
    model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen3-0.6B", torch_dtype=torch.float32).eval()
    shown = 0
    for transcript, cues in CASES:
        ids = tok(build_prompt(system, shots, transcript, cues), return_tensors="pt")
        start = time.perf_counter()
        with torch.no_grad():
            out = model.generate(**ids, max_new_tokens=90, do_sample=False)
        raw = tok.decode(out[0, ids.input_ids.shape[1]:], skip_special_tokens=True)
        text, reason = validate(raw, unsafe, safety, risky, negation)
        shown += text is not None
        print(f"[{reason:16s}] {time.perf_counter() - start:4.1f}s  {(text or raw).strip()[:230]!r}")
    print(f"\nshown after validation: {shown}/{len(CASES)}")


if __name__ == "__main__":
    sys.exit(main())
