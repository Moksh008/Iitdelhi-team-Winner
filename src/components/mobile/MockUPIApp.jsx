import React, { useState } from 'react';
import { Send, UserCheck, ShieldCheck, PhoneCall, Sparkles, AlertCircle } from 'lucide-react';

export default function MockUPIApp({ 
  onInitiatePayment, 
  scenario,
  isCallOngoing,
  onReturnToCall
}) {
  const initialPayment = scenario?.suggestedPayment || {
    payeeName: 'Rahul K.',
    payeeVPA: 'rahulk.verified@okhdfcbank',
    amount: 480000,
    userMedian: 3500,
    isFirstTimePayee: true
  };

  const [payeeName, setPayeeName] = useState(initialPayment.payeeName);
  const [payeeVPA, setPayeeVPA] = useState(initialPayment.payeeVPA);
  const [amount, setAmount] = useState(initialPayment.amount);
  const [note, setNote] = useState('Verification deposit');

  const handleSubmit = (e) => {
    e.preventDefault();
    onInitiatePayment({
      payeeName,
      payeeVPA,
      amount: Number(amount),
      userMedian: initialPayment.userMedian,
      isFirstTimePayee: initialPayment.isFirstTimePayee
    });
  };

  return (
    <div className="upi-app-screen" id="upi-app-screen">
      {/* Ongoing Call Banner */}
      {isCallOngoing && (
        <div 
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            cursor: 'pointer'
          }}
          onClick={onReturnToCall}
          id="banner-ongoing-call"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#fca5a5' }}>
            <PhoneCall size={14} className="nudge-icon" />
            <span>Call with <strong>{scenario?.caller?.name || 'Unknown'}</strong> ongoing</span>
          </div>
          <span style={{ color: '#38bdf8', fontWeight: 600 }}>Return to call &rarr;</span>
        </div>
      )}

      {/* UPI User Header */}
      <div className="upi-app-header">
        <div className="upi-profile-badge">
          <div className="upi-avatar-circle">M</div>
          <div className="upi-user-details">
            <h3>Meena Sharma</h3>
            <p>A/c balance: ₹ 58,400.00</p>
          </div>
        </div>

        <div className="badge-pill safe" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <ShieldCheck size={12} />
          <span>UPI Protected</span>
        </div>
      </div>

      {/* Transfer Form Card */}
      <div className="transfer-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Send Money</h2>
          <span className="badge-pill warn" style={{ fontSize: '0.65rem' }}>
            Pre-PIN Shield
          </span>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <div className="upi-input-group">
            <label className="upi-input-label">To Payee Name</label>
            <input 
              type="text" 
              className="upi-text-input"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="Beneficiary Name"
              required
              id="input-payee-name"
            />
          </div>

          <div className="upi-input-group">
            <label className="upi-input-label">Payee UPI ID (VPA)</label>
            <input 
              type="text" 
              className="upi-text-input"
              value={payeeVPA}
              onChange={(e) => setPayeeVPA(e.target.value)}
              placeholder="e.g. name@bank"
              required
              id="input-payee-vpa"
            />
          </div>

          <div className="upi-input-group">
            <label className="upi-input-label">Amount (INR)</label>
            <div className="upi-amount-field">
              <span className="upi-rupee-symbol">₹</span>
              <input 
                type="number" 
                className="upi-text-input upi-amount-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                required
                min="1"
                id="input-payment-amount"
              />
            </div>
            <div className="median-indicator-chip">
              <AlertCircle size={11} color="#94a3b8" />
              <span>Your typical monthly median transfer: <strong>₹{initialPayment.userMedian.toLocaleString('en-IN')}</strong></span>
            </div>
          </div>

          <div className="upi-input-group">
            <label className="upi-input-label">Add a Note (Optional)</label>
            <input 
              type="text" 
              className="upi-text-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What is this for?"
              id="input-payment-note"
            />
          </div>

          <button 
            type="submit" 
            className="upi-pay-btn"
            id="btn-submit-upi-pay"
          >
            <Send size={16} />
            <span>Pay ₹ {Number(amount || 0).toLocaleString('en-IN')}</span>
          </button>
        </form>
      </div>

      {/* Suggested Quick Transfers */}
      <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Sparkles size={12} />
        <span>Satark SDK intercepts payment intent <strong>before</strong> the UPI PIN screen.</span>
      </div>
    </div>
  );
}
