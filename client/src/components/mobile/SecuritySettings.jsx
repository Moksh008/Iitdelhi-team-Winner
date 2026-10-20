import React, { useState } from 'react';
import { Shield, Lock, Power, UserCheck, Bell, Trash2, Key } from 'lucide-react';

export default function SecuritySettings({ 
  isMonitoring, 
  onToggleMonitoring, 
  alertBudget = { used: 0, max: 2 },
  localStore = [],
  onClearLocalStore
}) {
  const [dpdpConsent, setDpdpConsent] = useState(true);
  const [trustedContact, setTrustedContact] = useState('+91 98112 33445 (Son - Aman)');

  return (
    <div className="upi-app-screen" id="security-settings-screen">
      <div className="upi-app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={20} color="#38bdf8" />
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>
            Satark Shield Settings
          </h2>
        </div>
        <div className={`badge-pill ${isMonitoring ? 'safe' : 'danger'}`}>
          {isMonitoring ? 'Active' : 'Disabled'}
        </div>
      </div>

      {/* Emergency Kill Switch */}
      <div className="transfer-card" style={{ borderColor: isMonitoring ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>
              One-Tap Shield Kill Switch
            </h3>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              Instantly terminates background audio chunking and flushes volatile RAM buffers.
            </p>
          </div>
          <button 
            className="call-btn-circle" 
            style={{ 
              width: 44, 
              height: 44, 
              background: isMonitoring ? '#10b981' : '#dc2626',
              color: '#ffffff'
            }}
            onClick={onToggleMonitoring}
            id="btn-toggle-kill-switch"
            title="Toggle Protection"
          >
            <Power size={20} />
          </button>
        </div>
      </div>

      {/* DPDP Act 2023 Consent & Privacy */}
      <div className="transfer-card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Lock size={15} color="#10b981" />
          <span>DPDP Act 2023 Compliance</span>
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ color: '#cbd5e1' }}>Microphone Streaming Ingestion (3s Volatile RAM)</span>
            <input 
              type="checkbox" 
              checked={dpdpConsent} 
              onChange={() => setDpdpConsent(!dpdpConsent)}
              id="chk-dpdp-mic"
            />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ color: '#cbd5e1' }}>Payment-Screen SDK Accessibility Interceptor</span>
            <input type="checkbox" defaultChecked disabled />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
            <span style={{ color: '#cbd5e1' }}>Signed National Scam-Intel Feed Synchronization</span>
            <input type="checkbox" defaultChecked disabled />
          </label>
        </div>
      </div>

      {/* Weekly Alert Budget */}
      <div className="transfer-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Bell size={15} color="#f59e0b" />
            <span>Weekly Alert Budget</span>
          </h3>
          <span className="badge-pill warn" id="alert-budget-count">
            {alertBudget.used} / {alertBudget.max} Used
          </span>
        </div>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
          Enforces maximum 2 Tier-2 interruptions per week to eliminate warning fatigue and automatic dismissal habituation.
        </p>
      </div>

      {/* Trusted Family Contact */}
      <div className="transfer-card">
        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <UserCheck size={15} color="#38bdf8" />
          <span>Designated Trusted Contact</span>
        </h3>
        <input 
          type="text" 
          className="upi-text-input" 
          value={trustedContact}
          onChange={(e) => setTrustedContact(e.target.value)}
          id="input-trusted-contact"
        />
        <p style={{ fontSize: '0.7rem', color: '#64748b' }}>
          Trusted contact receives an alert badge only if you confirm a Tier 2 report. No call audio or text is ever transmitted.
        </p>
      </div>

      {/* Encrypted Feature Cache */}
      <div className="transfer-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Key size={15} color="#a855f7" />
            <span>Encrypted Feature Store ({localStore.length} items)</span>
          </h3>
          <button 
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            onClick={onClearLocalStore}
            id="btn-clear-cache"
          >
            <Trash2 size={12} />
            <span>Purge</span>
          </button>
        </div>
        <p style={{ fontSize: '0.7rem', color: '#64748b' }}>
          All features encrypted via AES-256 with Android Keystore hardware-backed keys. Automatic 24-hour expiration TTL.
        </p>
      </div>
    </div>
  );
}
