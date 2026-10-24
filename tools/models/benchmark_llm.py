"""
Compare candidate on-device LLMs for Satark's two LLM tasks.

1. Explanation: the deterministic rules have already matched warning cues; the
   model writes a short, non-accusatory explanation. (Used for every alert.)
2. Ambiguity check: few-shot label for a transcript. (Advisory only; it can
   never raise an alert above Tier 1 or override the rules.)

This is a quality benchmark on a PC using the original Hugging Face weights
(greedy decoding, no grammar). On the phone the selected model runs as GGUF via
llama.cpp with a GBNF JSON grammar, so JSON syntax there is enforced. Phone
latency and RAM must be measured on the device (see docs/12_OFFLINE_AI_AND_FREE_SERVICES.md).

Usage:
  python tools/models/benchmark_llm.py [--models HuggingFaceTB/SmolLM2-360M-Instruct Qwen/Qwen2.5-0.5B-Instruct]
"""

import argparse
import json
import re
import time

PATTERNS = [
    "authority_impersonation", "digital_arrest", "family_emergency", "kyc_or_account_block",
    "safe_account_transfer", "prize_or_refund", "none",
]

EXPLAIN_SYSTEM = (
    "You write short safety notes for a phone user. A rule-based checker already found warning signs in a call. "
    "Explain in at most two short sentences, in simple English, why these signs matter. Do not accuse the caller, "
    "do not give phone numbers or links, and do not tell the user to pay. "
    'Reply as JSON: {"explanation": "..."}'
)

CLASSIFY_SYSTEM = (
    "Classify a phone call transcript. Choose exactly one label from this list: "
    + ", ".join(f'"{p}"' for p in PATTERNS)
    + '. Use "none" for ordinary conversation. Reply as JSON: {"pattern": "<label>"}'
)

EXPLAIN_SHOT = [
    {"role": "user", "content": "Transcript: this is the electricity office your power will be cut tonight pay the bill now on this link\n"
                                "Warning signs found: Urgency: tonight, now; Payment request: pay the bill"},
    {"role": "assistant", "content": '{"explanation": "Real utility offices do not demand instant payment over a call. '
                                     'Check your bill through the official app or office before paying anything."}'},
]

FEW_SHOT = [
    ("This is customs, a parcel in your name has drugs, stay on video call and do not tell your family", '{"pattern": "digital_arrest"}'),
    ("can you pick up milk on the way home", '{"pattern": "none"}'),
    ("papa mera accident ho gaya hai jaldi se is account mein paise daal do", '{"pattern": "family_emergency"}'),
]

# (transcript, expected pattern, cues the deterministic rules would have matched)
CASES = [
    ("I am calling from the CBI cyber crime cell. Your Aadhaar is linked to a narcotics parcel. Do not disconnect this call.",
     "digital_arrest", ["Authority claim: cbi", "Isolation: do not disconnect"]),
    ("your son had an accident near anardana chowk in patiala he is admitted in the hospital send fifty thousand rupees immediately",
     "family_emergency", ["Emergency claim: accident, hospital", "Payment request: send, rupees", "Urgency: immediately"]),
    ("main police station se bol raha hoon aapke khilaf arrest warrant hai kisi ko mat batana aur turant paise bhejo",
     "digital_arrest", ["Authority claim: police, arrest warrant", "Secrecy: kisi ko mat batana", "Payment request: paise bhejo"]),
    ("sir your kyc is pending your bank account will be blocked today please share the otp to update",
     "kyc_or_account_block", ["Account threat: blocked", "Credential request: otp"]),
    ("transfer all your savings to this rbi safe account for verification you will get it back after investigation",
     "safe_account_transfer", ["Safe-account request: safe account", "Authority claim: rbi"]),
    ("hi mom i will be home by seven please keep dinner ready", "none", []),
    ("kal office mein meeting hai das baje aa jana", "none", []),
    ("aapne lottery jeeti hai paanch lakh ka prize lene ke liye processing fee bhejiye",
     "prize_or_refund", ["Prize claim: lottery", "Upfront fee: processing fee"]),
    ("पुलिस अधिकारी बोल रहा हूँ, आपके नाम पर केस दर्ज है, तुरंत पैसे भेजो वरना गिरफ्तारी होगी",
     "digital_arrest", ["Authority claim: पुलिस", "Payment request: पैसे भेजो", "Threat: गिरफ्तारी"]),
    ("beta main hospital mein hoon phone kho gaya is number pe paise bhej do",
     "family_emergency", ["Emergency claim: hospital", "Payment request: paise bhej", "New number claim: phone kho gaya"]),
]

BANNED = re.compile(r"(https?://|www\.|\+?\d[\d\s-]{7,}|\bpay (?:the|them|now)\b|\bsend (?:the )?money\b)", re.I)


def generate(tok, model, messages, max_new_tokens):
    import torch

    # enable_thinking=False turns off Qwen3's reasoning mode; other templates ignore it.
    prompt = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
    ids = tok(prompt, return_tensors="pt")
    start = time.perf_counter()
    with torch.no_grad():
        out = model.generate(**ids, max_new_tokens=max_new_tokens, do_sample=False)
    text = tok.decode(out[0, ids.input_ids.shape[1]:], skip_special_tokens=True).strip()
    return text, time.perf_counter() - start


def first_json(text):
    match = re.search(r"\{.*?\}", text, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def run(model_id):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(model_id, torch_dtype=torch.float32).eval()
    times = []

    print("  -- explanation task (rules already matched cues)")
    explain_ok = 0
    for transcript, expected, cues in CASES:
        if not cues:
            continue
        user = f"Transcript: {transcript}\nWarning signs found: {'; '.join(cues)}"
        messages = [{"role": "system", "content": EXPLAIN_SYSTEM}] + EXPLAIN_SHOT + [{"role": "user", "content": user}]
        text, dt = generate(tok, model, messages, 80)
        times.append(dt)
        data = first_json(text)
        explanation = data.get("explanation", "") if isinstance(data, dict) else ""
        ok = bool(explanation) and len(explanation) <= 300 and not BANNED.search(explanation)
        explain_ok += ok
        print(f"    [{expected:22s}] {'OK ' if ok else 'BAD'} {explanation or text[:160]!r}")

    print("  -- ambiguity check (few-shot classification)")
    correct = scam_flagged = benign_clear = 0
    for transcript, expected, _ in CASES:
        messages = [{"role": "system", "content": CLASSIFY_SYSTEM}]
        for shot_in, shot_out in FEW_SHOT:
            messages += [{"role": "user", "content": shot_in}, {"role": "assistant", "content": shot_out}]
        messages.append({"role": "user", "content": transcript})
        text, dt = generate(tok, model, messages, 16)
        times.append(dt)
        data = first_json(text)
        label = data.get("pattern") if isinstance(data, dict) else None
        correct += label == expected
        if expected == "none":
            benign_clear += label == "none"
        else:
            scam_flagged += label not in (None, "none")
        print(f"    [{expected:22s}] -> {label!r}")

    n_scam = sum(1 for _, e, _ in CASES if e != "none")
    n_explain = sum(1 for *_, c in CASES if c)
    print(
        f"== {model_id}: explanations usable {explain_ok}/{n_explain}; labels exact {correct}/{len(CASES)}, "
        f"scams flagged {scam_flagged}/{n_scam}, benign clear {benign_clear}/{len(CASES) - n_scam}; "
        f"mean PC time {sum(times) / len(times):.2f}s"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models", nargs="+", default=["HuggingFaceTB/SmolLM2-360M-Instruct", "Qwen/Qwen2.5-0.5B-Instruct"])
    args = parser.parse_args()
    for model_id in args.models:
        print(f"\n### {model_id}")
        run(model_id)


if __name__ == "__main__":
    main()
