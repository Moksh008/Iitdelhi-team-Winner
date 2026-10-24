import re

 
def detect_transcript_language(text: str) -> str:
    """Best-effort language identification from script and common Hinglish words."""
    if re.search(r"[\u0a80-\u0aff]", text):
        return "gu"
    if re.search(r"[\u0a00-\u0a7f]", text):
        return "pa"
    if re.search(r"[\u0b80-\u0bff]", text):
        return "ta"
    if re.search(r"[\u0c00-\u0c7f]", text):
        return "te"
    if re.search(r"[\u0c80-\u0cff]", text):
        return "kn"
    if re.search(r"[\u0d00-\u0d7f]", text):
        return "ml"
    if re.search(r"[\u0b00-\u0b7f]", text):
        return "or"
    if re.search(r"[\u0980-\u09ff]", text):
        return "as" if re.search(r"[\u09f0\u09f1]", text) else "bn"
    if re.search(r"[\u0600-\u06ff]", text):
        return "ur"
    if re.search(r"[\u0900-\u097f]", text):
        if any(marker in text for marker in ("आहे", "आणि", "तुम्ही", "मला", "करा")):
            return "mr"
        if any(marker in text for marker in ("छैन", "गर्नुहोस्", "तपाईं", "लाई", "छ")):
            return "ne"
        return "hi"

    latin_text = text.lower()
    if re.search(
        r"\b(kya|hai|hain|nahi|nahin|aap|aapka|paise|bhejo|karna|"
        r"mat|mein|kyun|kaise|kripya)\b",
        latin_text,
    ):
        return "hinglish"
    return "en"
