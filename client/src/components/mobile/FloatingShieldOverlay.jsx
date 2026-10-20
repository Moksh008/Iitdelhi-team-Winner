import React, { useState } from 'react';
import { Shield, ShieldAlert, PhoneOff, AlertTriangle, Flame, Bell, X } from 'lucide-react';

export default function FloatingShieldOverlay({
  rollingC = 0.0,
  detectedTactics = [],
  isVoiceCloneDetected = false,
  onEndCall,
  onOpenCallScreen,
  visible = true
}) {
  const [minimized, setMinimized] = useState(false);

  if (!visible) return null;

  const isCritical = rollingC >= 0.80 || isVoiceCloneDetected;
  const isWarning = rollingC >= 0.65;

  const badgeColor = isCritical ? '#ef4444' : (isWarning ? '#f59e0b' : '#10b981');

  return (
    <div 
      className="floating-shield-bubble"
      style={{
        position: 'absolute',
        top: '65px',
        right: '12px',
        zIndex: 999,
        background: 'rgba(15, 23, 42, 0.94)',
        border: `1.5px solid ${badgeColor}`,
        boxShadow: isCritical ? '0 0 15px rgba(239, 68, 68, 0.6)' : '0 4px 12px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(8px)',
        borderRadius: minimized ? 'var(--radius-full)' : 'var(--radius-md)',
        padding: minimized ? '0.35rem 0.65rem' : '0.45rem 0.65rem',
        color: '#ffffff',
        cursor: 'pointer',
        transition: 'all 0.25s ease',
        maxWidth: '210px'
      }}
      onClick={(e) => {
        if (e.target.tagName !== 'BUTTON' && onOpenCallScreen) {
          onOpenCallScreen();
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {isCritical ? (
            <ShieldAlert size={14} color="#ef4444" className="pulse-icon" />
          ) : (
            <Shield size={14} color={badgeColor} />
          )}
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: badgeColor }}>
            SATARK SHIELD
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ 
            fontSize: '0.68rem', 
            fontFamily: 'var(--font-mono)', 
            fontWeight: 800,
            background: 'rgba(255,255,255,0.1)',
            padding: '0.1rem 0.35rem',
            borderRadius: '4px',
            color: badgeColor
          }}>
            {(rollingC * 100).toFixed(0)}%
          </span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setMinimized(!minimized);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.65rem',
              padding: 0
            }}
          >
            {minimized ? '+' : '–'}
          </button>
        </div>
      </div>

      {!minimized && (
        <div style={{ marginTop: '0.3rem', fontSize: '0.62rem', color: '#cbd5e1' }}>
          {isVoiceCloneDetected && (
            <div style={{ color: '#fca5a5', fontWeight: 700, marginBottom: '0.2rem' }}>
              🤖 AI Voice Clone Active
            </div>
          )}

          {detectedTactics.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginBottom: '0.3rem' }}>
              {detectedTactics.slice(0, 2).map((t, i) => (
                <span key={i} style={{ background: 'rgba(239, 68, 68, 0.25)', color: '#fca5a5', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                  {t}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', marginBottom: '0.2rem' }}>Monitoring Call Audio</div>
          )}

          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.25rem' }}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onEndCall) onEndCall();
              }}
              style={{
                flex: 1,
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '0.2rem 0',
                fontSize: '0.62rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem'
              }}
            >
              <PhoneOff size={10} />
              <span>Drop Call</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
