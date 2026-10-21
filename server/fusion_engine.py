"""
Project Satark - Tri-Signal Multimodal Risk Fusion & Defense Subsystem
Integrates:
1. Multilingual Semantic Conversational Coercion (DistilBERT on ICFD-31k)
2. Acoustic Deepfake / Voice Clone Synthetics (AASIST / Vocoder Artifacts)
3. Financial UPI Mismatch & Anomaly (VPA Graph, Velocity, New Payee Mismatch)
4. Scam Psychology Taxonomy (Authority, Urgency, Isolation, Coercion)
5. PII Scrubber (Aadhaar, PAN, Cards, OTP, Account Redaction)
6. Emergency Guardian SOS Dispatch Engine
"""

import re
import time
from typing import Dict, Any, List, Optional

class PIIScrubber:
    """
    On-device / Gateway PII Redaction compliant with DPDP Act 2023.
    Redacts Aadhaar, PAN, Card, OTP, and Bank Account numbers before logging or storage.
    """
    @staticmethod
    def scrub(text: str) -> str:
        if not text:
            return ""
        scrubbed = text

        # 1. 12-digit Aadhaar
        scrubbed = re.sub(r'\b\d{4}\s?\d{4}\s?\d{4}\b', '[AADHAAR-REDACTED]', scrubbed)
        # 2. 10-char PAN
        scrubbed = re.sub(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b', '[PAN-REDACTED]', scrubbed, flags=re.IGNORECASE)
        # 3. 16-digit Card
        scrubbed = re.sub(r'\b(?:\d{4}[-\s]?){3}\d{4}\b', '[CARD-REDACTED]', scrubbed)
        # 4. OTP / PIN
        scrubbed = re.sub(r'\b(?:otp|code|pin)\s*(?:is|:)?\s*\d{4,6}\b', '[OTP-REDACTED]', scrubbed, flags=re.IGNORECASE)
        # 5. Bank Account Numbers (9-18 digits)
        scrubbed = re.sub(r'\baccount(?:\s*no)?\s*[:#]?\s*\d{9,18}\b', 'account [ACC-REDACTED]', scrubbed, flags=re.IGNORECASE)

        return scrubbed


class ScamPsychologyAnalyzer:
    """
    Categorizes conversational attack vectors into psychological tactics
    (inspired by ScamVoice- and CallShield-AI taxonomy).
    """
    TACTIC_PATTERNS = {
        "Authority Impersonation": [
            r'\b(cbi|police|customs|ed|enforcement directorate|rbi|inspector|commissioner|cyber crime cell)\b',
            r'(सीबीआई|पुलिस|कस्टम|आरबीआई|इंस्पेक्टर|अधिकारी|अरेस्ट|गिरफ्तार|ધરપકડ|અધિકારી|પોલીસ|அதிகாரி|காவல்துறை)'
        ],
        "Manufactured Urgency": [
            r'\b(immediately|right now|urgent|within 10 minutes|power cutoff|electricity disconnect|warrant issued)\b',
            r'(तुरंत|अभी|जल्दी|बिजली कट|वारंट|તાત્કાલિક|હમણાં જ|உடனடியாக|త్వరగా)'
        ],
        "Psychological Isolation": [
            r'\b(do not disconnect|stay on call|quiet room|do not tell anyone|keep it confidential|camera on)\b',
            r'(फोन मत काटना|किसी को मत बताना|कमरे में जाओ|વિડીયો કોલ ચાલુ રાખો|கோர்ட்டில்|ரகசியம்)'
        ],
        "Safe Custody Diversion": [
            r'\b(safe account|escrow|rbi vault|security deposit|refund processing|verification account)\b',
            r'(सुरक्षित खाता|वेरिफिकेशन अकाउंट|रिफंड|સુરક્ષિત ખાતું|பாதுகாப்பான கணக்கு)'
        ],
        "Financial Threat / Seizure": [
            r'\b(freeze account|penalty|legal action|court notice|asset seizure|narcotics parcel)\b',
            r'(खाता सीज|पेनल्टी|कोर्ट|पार्सल|ड्रग्स|જપ્તી|நீதிமன்றம்)'
        ],
        "Emergency Payment Pressure": [
            r'\b(child|son|daughter|relative).*(hospital|admitted|icu|medical emergency).*(money|bill|pay|transfer)\b',
            r'\b(hospital|admitted|icu|medical emergency).*(child|son|daughter|relative).*(money|bill|pay|transfer)\b'
        ]
    }

    @classmethod
    def identify_tactics(cls, text: str) -> List[str]:
        detected = []
        lower = text.lower()
        for tactic, patterns in cls.TACTIC_PATTERNS.items():
            for pat in patterns:
                if re.search(pat, lower, re.IGNORECASE):
                    detected.append(tactic)
                    break
        return detected


class TriSignalFusionEngine:
    """
    Multimodal Risk Fusion Engine combining:
    1. Semantic Conversational Coercion (C_t)
    2. Acoustic Deepfake / Voice Clone Probability (S_acoustic)
    3. Payment Context & Anomaly (M_payment)
    """
    def __init__(self, lambda_decay: float = 0.90):
        self.lambda_decay = lambda_decay
        self.rolling_coercion = 0.0
        self.has_sent_sos_this_session = False
        self.sos_log = []

    def update_coercion_stream(self, chunk_score: float, is_flagged_number: bool = False) -> float:
        """
        Updates exponential moving accumulator C_t.
        """
        beta = 0.25 if is_flagged_number else 0.0
        self.rolling_coercion = (self.lambda_decay * self.rolling_coercion) + ((1.0 - self.lambda_decay) * chunk_score) + beta
        self.rolling_coercion = min(1.0, max(0.0, self.rolling_coercion))
        return self.rolling_coercion

    def fuse(
        self,
        coercion_score: float,
        deepfake_score: float,
        payment_anomaly: float = 0.0,
        amount_inr: float = 0.0,
        tactics: List[str] = None
    ) -> Dict[str, Any]:
        """
        Calculates holistic threat score with critical overrides.
        """
        # Weights: 45% Conversational Coercion, 25% Voice Clone / Deepfake, 30% Payment Anomaly
        w_coercion = 0.45
        w_deepfake = 0.25
        w_payment = 0.30

        raw_fused = (coercion_score * w_coercion) + (deepfake_score * w_deepfake) + (payment_anomaly * w_payment)

        # Critical Overrides:
        # 1. Extreme Coercion (>0.90) or Voice Clone (>0.85) forces high risk
        if coercion_score >= 0.88 or deepfake_score >= 0.85:
            raw_fused = max(raw_fused, 0.85)

        # 2. High amount (>50,000 INR) during active call multiplies risk
        if amount_inr >= 50000 and coercion_score >= 0.65:
            raw_fused = min(1.0, raw_fused * 1.25)

        fused_score = round(min(1.0, max(0.0, raw_fused)), 4)

        # Action Tier Determination
        if fused_score >= 0.80:
            tier = 2
            tier_name = "TIER_2_PAUSE"
            action_desc = "Mandatory 60-Second Cooling Pause & Biometric Voice Challenge"
        elif fused_score >= 0.65:
            tier = 1
            tier_name = "TIER_1_NUDGE"
            action_desc = "Dynamic Contextual Safety Warning Banner"
        else:
            tier = 0
            tier_name = "TIER_0_PASS"
            action_desc = "Normal Watch Mode"

        # Emergency Guardian SOS Check
        trigger_sos = (fused_score >= 0.85) and (not self.has_sent_sos_this_session)
        sos_payload = None
        if trigger_sos:
            self.has_sent_sos_this_session = True
            sos_payload = self._generate_sos_payload(fused_score, tactics, amount_inr)
            self.sos_log.append(sos_payload)

        return {
            "fused_risk_score": fused_score,
            "action_tier": tier,
            "tier_name": tier_name,
            "action_recommendation": action_desc,
            "tactics_identified": tactics or [],
            "signals": {
                "conversational_coercion": round(coercion_score, 4),
                "acoustic_deepfake": round(deepfake_score, 4),
                "payment_anomaly": round(payment_anomaly, 4)
            },
            "emergency_sos": {
                "triggered": trigger_sos,
                "payload": sos_payload
            }
        }

    def _generate_sos_payload(self, score: float, tactics: List[str], amount: float) -> Dict[str, Any]:
        tactics_str = ", ".join(tactics) if tactics else "Coercive Pressure / Digital Arrest"
        amount_str = f"Rs. {amount:,.2f}" if amount > 0 else "High-value funds transfer"

        message = (
            f"🚨 EMERGENCY ALERT (Project Satark):\n"
            f"Potential scam detected on your family member's phone!\n"
            f"Threat Score: {score * 100:.1f}%\n"
            f"Tactics: {tactics_str}\n"
            f"Action: An attempt to transfer {amount_str} was intercepted.\n"
            f"Please call your family member immediately to verify."
        )

        return {
            "timestamp_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "alert_type": "EMERGENCY_GUARDIAN_DISPATCH",
            "threat_score": score,
            "formatted_sms": message,
            "priority": "P0_CRITICAL"
        }

    def reset_session(self):
        self.rolling_coercion = 0.0
        self.has_sent_sos_this_session = False
