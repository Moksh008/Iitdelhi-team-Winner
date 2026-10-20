from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class ChunkClassificationRequest(BaseModel):
    text: str = Field(..., description="3-second speech audio transcript chunk")
    language: Optional[str] = Field("hi", description="Language code (hi, gu, mr, bn, ta, te, pa, en, hinglish)")
    is_flagged_number: Optional[bool] = Field(False, description="Whether caller number exists in threat feed")

class ChunkClassificationResponse(BaseModel):
    text: str
    chunk_score: float
    rolling_c: float
    action_tier: int
    detected_category: str
    is_threat: bool

class MultimodalChunkRequest(BaseModel):
    text: str = Field(..., description="3-second speech audio transcript chunk")
    language: Optional[str] = Field("hi", description="Language code")
    is_flagged_number: Optional[bool] = Field(False, description="Whether caller number exists in threat feed")
    audio_pcm_base64: Optional[str] = Field(None, description="Optional base64 raw audio PCM for acoustic deepfake analysis")
    claimed_caller_type: Optional[str] = Field("Unknown", description="e.g. 'Family', 'Bank', 'Police'")
    amount_in_discussion: Optional[float] = Field(0.0, description="Amount mentioned in dialogue")

class MultimodalChunkResponse(BaseModel):
    original_scrubbed_text: str
    redacted_pii_entities: List[str]
    coercion_probability: float
    acoustic_deepfake_probability: float
    fused_risk_score: float
    action_tier: int
    tier_name: str
    action_recommendation: str
    psychology_tactics: List[str]
    signals: Dict[str, float]
    emergency_sos: Dict[str, Any]

class EmergencySOSRequest(BaseModel):
    target_phone: str = Field(..., description="Guardian / Emergency contact phone number")
    ward_name: Optional[str] = "User"
    threat_score: float = Field(..., ge=0.0, le=1.0)
    tactics: Optional[List[str]] = []
    intercepted_amount: Optional[float] = 0.0

class EmergencySOSResponse(BaseModel):
    success: bool
    status: str
    dispatched_sms: str
    timestamp_utc: str

class PIIScrubRequest(BaseModel):
    raw_text: str

class PIIScrubResponse(BaseModel):
    scrubbed_text: str
    redactions_found: bool

class PaymentEvaluationRequest(BaseModel):
    payee_vpa: str = Field(..., description="Beneficiary UPI ID")
    payee_name: Optional[str] = "Unknown Payee"
    amount: float = Field(..., gt=0, description="Amount in INR")
    user_median: Optional[float] = 3500.0
    is_first_time_payee: Optional[bool] = True
    elapsed_seconds_since_call: Optional[int] = 0

class PaymentEvaluationResponse(BaseModel):
    decision_tier: int
    conversation_score_c: float
    payment_score_p: float
    dual_signal_agreement: bool
    status_message: str
    factors: Dict[str, Any]

class Tier3ReportPackRequest(BaseModel):
    report_id: str
    timestamp_utc: str
    language_locale: Optional[str] = "hi"
    scam_metadata: Dict[str, Any]
    payment_metadata: Dict[str, Any]
    privacy_attestation: Dict[str, Any]

class LienActionRequest(BaseModel):
    report_id: str
    officer_id: Optional[str] = "BANK_OFFICER_409"
    duration_hours: Optional[int] = 2
