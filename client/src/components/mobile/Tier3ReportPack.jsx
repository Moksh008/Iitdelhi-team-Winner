import React, { useState } from 'react';
import { ShieldCheck, Send, CheckCircle2, Lock, Users, AlertTriangle, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function Tier3ReportPack({
  reportPack,
  onFinishReport,
  onNotifyTrustedContact,
  onCancel,
  activeLanguage
}) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [trustedContactNotified, setTrustedContactNotified] = useState(false);

  const handleSubmit = () => {
    setIsSubmitted(true);
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
    if (onFinishReport) {
      onFinishReport(reportPack);
    }
  };

  const handleNotifyContact = () => {
    setTrustedContactNotified(true);
    if (onNotifyTrustedContact) {
      onNotifyTrustedContact();
    }
  };

  if (isSubmitted) {
    return (
      <div className="report-pack-screen" id="report-submitted-screen" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '2px solid var(--color-safe)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-safe)',
          marginBottom: '1.25rem',
          boxShadow: 'var(--shadow-glow)'
        }}>
          <CheckCircle2 size={40} />
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
          {activeLanguage?.safeMessage || 'Payment Intercepted! Your savings are safe.'}
        </h2>
        <p style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: '300px', margin: '0.5rem auto 1.5rem', lineHeight: 1.5 }}>
          Your savings of <strong>₹{reportPack?.payment_metadata?.amount_inr?.toLocaleString('en-IN')}</strong> are completely safe. Report pack dispatched to Bank FRM & 1930 Cyber Cell.
        </p>

        <div className="badge-pill safe" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '0.4rem 0.85rem' }}>
          Token: {reportPack?.report_id || 'SATARK-SECURE'} · Lang: {activeLanguage?.nativeName || 'हिन्दी'}
        </div>

        <button 
          className="btn-primary" 
          onClick={onCancel}
          style={{ marginTop: '2rem', width: '100%' }}
          id="btn-return-home-after-report"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="report-pack-screen" id="tier3-report-pack-screen">
      <div className="report-pack-header">
        <button 
          onClick={onCancel}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
          id="btn-back-report"
        >
          <ArrowLeft size={18} />
        </button>
        <h2>{activeLanguage?.reportTitle || 'Prefilled 1930 Report'}</h2>
      </div>

      <div className="evidence-pack-card">
        <div className="evidence-row">
          <span className="evidence-label">Scam Typology:</span>
          <span className="evidence-value" style={{ color: '#f87171' }}>
            {reportPack?.scam_metadata?.scam_category || 'Digital Arrest'}
          </span>
        </div>

        <div className="evidence-row">
          <span className="evidence-label">Attempted Sum:</span>
          <span className="evidence-value">
            ₹ {reportPack?.payment_metadata?.amount_inr?.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="evidence-row">
          <span className="evidence-label">Beneficiary VPA:</span>
          <span className="evidence-value">
            Hashed SHA-256 Only
          </span>
        </div>

        <div className="evidence-row">
          <span className="evidence-label">Hash Fingerprint:</span>
          <span className="evidence-value" style={{ fontSize: '0.65rem' }}>
            {reportPack?.payment_metadata?.hashed_payee_vpa?.substring(0, 16)}...
          </span>
        </div>

        <div className="evidence-row">
          <span className="evidence-label">Language:</span>
          <span className="evidence-value" style={{ color: '#38bdf8' }}>
            {activeLanguage?.nativeName} ({activeLanguage?.name})
          </span>
        </div>
      </div>

      {/* Zero Knowledge Privacy Guarantee Checklist */}
      <div className="privacy-checklist">
        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
          <Lock size={13} />
          <span>Zero-Knowledge Privacy Attestation</span>
        </div>
        <div className="checklist-item">
          <CheckCircle2 size={12} color="#10b981" />
          <span>Audio Recording: <strong>0% (Never recorded)</strong></span>
        </div>
        <div className="checklist-item">
          <CheckCircle2 size={12} color="#10b981" />
          <span>Call Transcript: <strong>Never leaves phone RAM</strong></span>
        </div>
        <div className="checklist-item">
          <CheckCircle2 size={12} color="#10b981" />
          <span>DPDP Act 2023 & RBI FREE-AI Certified</span>
        </div>
      </div>

      {/* Report Dispatch Button */}
      <button 
        className="send-report-btn"
        onClick={handleSubmit}
        id="btn-dispatch-1930"
      >
        <Send size={18} />
        <span>{activeLanguage?.reportDispatch || 'Send to 1930 + My Bank'}</span>
      </button>

      {/* Optional Family Notification */}
      <button 
        className="notify-contact-btn"
        onClick={handleNotifyContact}
        id="btn-notify-family-contact"
      >
        <Users size={16} />
        <span>{trustedContactNotified ? (activeLanguage?.familyAlertSent || 'Family Contact Notified ✓') : (activeLanguage?.familyAlert || 'Alert Family Contact (No audio/text)')}</span>
      </button>
    </div>
  );
}
