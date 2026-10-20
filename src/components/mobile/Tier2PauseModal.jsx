import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertOctagon, Clock, ArrowRight, CheckCircle, ShieldCheck } from 'lucide-react';

export default function Tier2PauseModal({
  scenario,
  paymentDetails,
  onConfirmReport,
  onKnownPerson,
  onBypassPayment,
  activeLanguage
}) {
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  useEffect(() => {
    if (!isTimerRunning || secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning, secondsLeft]);

  const scamCategory = scenario?.category || 'Digital Arrest';
  const targetedQuestion = activeLanguage?.pauseQuestionDefault || scenario?.targetQuestion || 'Did the caller ask you to move your savings into a "safe" or "verification" account?';

  return (
    <div className="tier2-pause-overlay" id="tier2-pause-modal" role="dialog" aria-modal="true">
      {/* Modal Header */}
      <div className="pause-header">
        <div className="pause-shield-badge">
          <ShieldAlert size={32} />
        </div>
        <h2 className="pause-title">
          {activeLanguage?.pauseTitle || 'Pause before you pay'}
        </h2>
        <div className="pause-subtag">
          {activeLanguage?.pauseSubtag || `Pattern: ${scamCategory}`}
        </div>
      </div>

      {/* Targeted One-Question Box */}
      <div className="targeted-question-box">
        <span className="question-label">
          {activeLanguage?.name ? `Language: ${activeLanguage.nativeName} (${activeLanguage.name})` : 'Critical Verification Question:'}
        </span>
        <p className="question-text" style={{ fontSize: '1rem', lineHeight: 1.5 }}>
          {targetedQuestion}
        </p>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.45rem' }}>
          Attempted: <strong style={{ color: '#ffffff' }}>₹{Number(paymentDetails?.amount || 0).toLocaleString('en-IN')}</strong> to <code style={{ color: '#38bdf8' }}>{paymentDetails?.payeeVPA}</code>
        </div>
      </div>

      {/* 60-Second Cooldown Ring */}
      <div className="cooldown-ring-wrapper">
        <Clock size={18} color="#f59e0b" />
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
          {activeLanguage?.btnWait || 'Deliberation cooldown'}:
        </span>
        <span className="cooldown-time-display">
          {secondsLeft > 0 ? `${secondsLeft}s` : '0s (Unlocked)'}
        </span>
      </div>

      {/* 3 Explicit Action Buttons */}
      <div className="pause-actions-group">
        {/* Action 1: Report to 1930 */}
        <button 
          className="action-btn-report"
          onClick={onConfirmReport}
          id="btn-pause-report"
        >
          <AlertOctagon size={18} />
          <span>{activeLanguage?.btnReport || 'Yes, help me report'}</span>
          <ArrowRight size={16} />
        </button>

        {/* Action 2: I know this person (False Positive Recovery) */}
        <button 
          className="action-btn-known"
          onClick={onKnownPerson}
          id="btn-pause-known"
        >
          <CheckCircle size={16} color="#10b981" />
          <span>{activeLanguage?.btnKnown || 'No, I know this person'}</span>
        </button>

        {/* Action 3: Wait / Enforce Pause */}
        {secondsLeft > 0 ? (
          <button 
            className="action-btn-wait"
            disabled
            id="btn-pause-wait"
          >
            {activeLanguage?.btnWait || 'Wait 60 s'} ({secondsLeft}s remaining)
          </button>
        ) : (
          <button 
            className="action-btn-known"
            onClick={onBypassPayment}
            style={{ borderColor: '#64748b' }}
            id="btn-pause-proceed-anyway"
          >
            <ShieldCheck size={16} />
            <span>I understand the risk, proceed to PIN</span>
          </button>
        )}
      </div>

      {/* User Sovereignty Mandate */}
      <div style={{ textAlign: 'center', fontSize: '0.65rem', color: '#64748b', marginTop: '0.5rem' }}>
        No tier blocks a payment. The user always retains control.
      </div>
    </div>
  );
}
