import React from 'react';
import { 
  Activity, 
  ShieldAlert, 
  Cpu, 
  Zap, 
  Sliders, 
  Globe, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  Flame, 
  Bot, 
  ShieldCheck, 
  BellRing,
  Lock
} from 'lucide-react';
import { SCENARIOS } from '../../engine/scenarios';
import { INDIAN_LANGUAGES } from '../../engine/languages';

export default function TelemetryLab({
  currentScenario,
  onSelectScenario,
  rollingC = 0.0,
  paymentScore = 0.0,
  currentTier = 0,
  currentChunkIndex = 0,
  onStepNextChunk,
  onResetCall,
  isCallActive = false,
  onStartCall,
  chunkHistory = [],
  activeLanguage,
  onSelectLanguage,
  detectedTactics = [],
  voiceCloneScore = 0.08,
  isVoiceCloneDetected = false,
  lastDispatchedSOS = null
}) {
  const getTierBadge = (tier) => {
    switch (tier) {
      case 2:
        return <span className="badge-pill danger">Tier 2 · PAUSE ACTIVATED</span>;
      case 1:
        return <span className="badge-pill warn">Tier 1 · NUDGE ACTIVE</span>;
      default:
        return <span className="badge-pill safe">Tier 0 · WATCH SENSOR</span>;
    }
  };

  const lastChunk = chunkHistory[chunkHistory.length - 1];
  const semanticDetails = lastChunk?.semanticDetails;

  return (
    <div className="studio-panel" id="telemetry-lab">
      {/* 22 Indian Languages Switcher Card */}
      <div className="panel-card" style={{ border: '1px solid var(--border-glow)' }}>
        <div className="panel-card-header">
          <h2 className="panel-card-title">
            <Globe size={18} color="#38bdf8" />
            <span>22 Scheduled Indian Languages Engine (8th Schedule)</span>
          </h2>
          <span className="badge-pill safe" style={{ fontSize: '0.68rem' }}>
            {Object.keys(INDIAN_LANGUAGES).length} Languages Supported
          </span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxHeight: '110px', overflowY: 'auto', padding: '0.2rem' }}>
          {Object.values(INDIAN_LANGUAGES).map((lang) => (
            <button
              key={lang.code}
              onClick={() => onSelectLanguage(lang)}
              style={{
                background: activeLanguage?.code === lang.code ? 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)' : 'rgba(255,255,255,0.04)',
                color: activeLanguage?.code === lang.code ? '#ffffff' : '#cbd5e1',
                border: activeLanguage?.code === lang.code ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.6rem',
                fontSize: '0.72rem',
                cursor: 'pointer',
                fontWeight: activeLanguage?.code === lang.code ? 700 : 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease'
              }}
              id={`lang-btn-${lang.code}`}
              title={`Switch to ${lang.name} (${lang.nativeName}) - Speech Recognition: ${lang.speechLocale}`}
            >
              <span>{lang.nativeName}</span>
              <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>({lang.name})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scenario Control Card */}
      <div className="panel-card">
        <div className="panel-card-header">
          <h2 className="panel-card-title">
            <Sliders size={18} color="#38bdf8" />
            <span>Fraud Typology Scenario Lab (10 + 5 Partition)</span>
          </h2>
          <span className="badge-pill" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
            {currentScenario.partition}
          </span>
        </div>

        <select 
          className="scenario-select"
          value={currentScenario.id}
          onChange={(e) => {
            const sc = SCENARIOS.find(s => s.id === e.target.value);
            if (sc) onSelectScenario(sc);
          }}
          id="select-scenario"
        >
          <optgroup label="Trained Typologies (10 Classes)">
            {SCENARIOS.filter(s => s.partition === 'Trained').map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </optgroup>
          <optgroup label="Held-Out Unseen Typologies (5 Classes - Zero Day Generalization)">
            {SCENARIOS.filter(s => s.partition === 'Unseen (Zero-Day)').map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </optgroup>
          <optgroup label="Benign Controls (Stressful vs Legitimate Payments)">
            {SCENARIOS.filter(s => s.partition === 'Benign Control').map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </optgroup>
        </select>

        <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.85rem' }}>
          {!isCallActive ? (
            <button 
              className="btn-primary" 
              onClick={onStartCall}
              id="btn-start-scenario-call"
              style={{ flex: 1 }}
            >
              Simulate Incoming Call &rarr;
            </button>
          ) : (
            <>
              <button 
                className="btn-primary" 
                onClick={onStepNextChunk}
                id="btn-step-next-chunk"
                style={{ flex: 1 }}
                disabled={currentChunkIndex >= currentScenario.chunks.length}
              >
                {currentChunkIndex >= currentScenario.chunks.length ? 'Script Finished' : 'Inject Next 3s Chunk →'}
              </button>
              <button 
                className="btn-outline" 
                onClick={onResetCall}
                id="btn-reset-scenario-call"
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Advanced Threat Defense Signals (Deepfake, Psychology & Emergency SOS) */}
      <div className="panel-card" style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
        <div className="panel-card-header">
          <h2 className="panel-card-title">
            <Flame size={18} color="#ef4444" />
            <span>Grand Finale Defense Signals (Acoustics + Tactics + SOS)</span>
          </h2>
          <span className="badge-pill danger" style={{ fontSize: '0.65rem' }}>
            Tri-Signal Fusion Active
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
          {/* Signal A: Deepfake Voice Clone */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#94a3b8', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
              <Bot size={13} color={isVoiceCloneDetected ? '#ef4444' : '#10b981'} />
              <span>Voice Clone Risk</span>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: isVoiceCloneDetected ? '#ef4444' : '#10b981' }}>
              {(voiceCloneScore * 100).toFixed(0)}%
            </div>
            <span style={{ fontSize: '0.62rem', color: isVoiceCloneDetected ? '#fca5a5' : '#64748b' }}>
              {isVoiceCloneDetected ? 'Vocoder Artifacts Detected' : 'Vocal Tract Authentic'}
            </span>
          </div>

          {/* Signal B: Psychological Tactics Count */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#94a3b8', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
              <Flame size={13} color="#f59e0b" />
              <span>Active Tactics</span>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: detectedTactics.length > 0 ? '#f59e0b' : '#38bdf8' }}>
              {detectedTactics.length} Vector{detectedTactics.length !== 1 ? 's' : ''}
            </div>
            <span style={{ fontSize: '0.62rem', color: '#64748b' }}>
              {detectedTactics.length > 0 ? detectedTactics[0] : 'No coercive tactics'}
            </span>
          </div>

          {/* Signal C: Emergency Guardian SOS Status */}
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#94a3b8', fontSize: '0.68rem', marginBottom: '0.2rem' }}>
              <BellRing size={13} color={lastDispatchedSOS ? '#ef4444' : '#38bdf8'} />
              <span>Guardian SOS</span>
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: lastDispatchedSOS ? '#ef4444' : '#38bdf8', marginTop: '0.15rem' }}>
              {lastDispatchedSOS ? 'DISPATCHED' : 'ARMED (85%)'}
            </div>
            <span style={{ fontSize: '0.62rem', color: '#64748b' }}>
              {lastDispatchedSOS ? 'SMS Sent to Guardian' : 'Standby / Debounced'}
            </span>
          </div>
        </div>

        {/* Tactics Pill Cloud */}
        {detectedTactics.length > 0 && (
          <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {detectedTactics.map((t, idx) => (
              <span key={idx} className="badge-pill danger" style={{ fontSize: '0.62rem', padding: '0.15rem 0.45rem' }}>
                🚨 {t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Live Dual-Signal Telemetry Gauges */}
      <div className="panel-card">
        <div className="panel-card-header">
          <h2 className="panel-card-title">
            <Activity size={18} color="#10b981" />
            <span>Dual-Signal Decision Gate Telemetry</span>
          </h2>
          {getTierBadge(currentTier)}
        </div>

        <div className="telemetry-grid">
          {/* Signal 1: Conversation Risk (C) */}
          <div className="gauge-box">
            <div className="gauge-title">
              <span>Conversation Score (C)</span>
              <span>θ = 0.80</span>
            </div>
            <div className={`gauge-score ${rollingC >= 0.8 ? 'danger' : rollingC >= 0.65 ? 'warn' : 'safe'}`}>
              {(rollingC * 100).toFixed(0)}%
            </div>
            <div className="gauge-bar-track">
              <div 
                className={`gauge-bar-fill ${rollingC >= 0.8 ? 'danger' : rollingC >= 0.65 ? 'warn' : 'safe'}`}
                style={{ width: `${Math.min(100, rollingC * 100)}%` }}
              ></div>
            </div>
            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
              Multilingual DistilBERT (ICFD-31k) · λ = 0.90
            </span>
          </div>

          {/* Signal 2: Payment Context Risk (P) */}
          <div className="gauge-box">
            <div className="gauge-title">
              <span>Payment Context (P)</span>
              <span>θ = 0.70</span>
            </div>
            <div className={`gauge-score ${paymentScore >= 0.7 ? 'danger' : paymentScore >= 0.4 ? 'warn' : 'safe'}`}>
              {(paymentScore * 100).toFixed(0)}%
            </div>
            <div className="gauge-bar-track">
              <div 
                className={`gauge-bar-fill ${paymentScore >= 0.7 ? 'danger' : paymentScore >= 0.4 ? 'warn' : 'safe'}`}
                style={{ width: `${Math.min(100, paymentScore * 100)}%` }}
              ></div>
            </div>
            <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
              New Payee + Amount Anomaly
            </span>
          </div>

          {/* Corroborated Gate */}
          <div className="gauge-box" style={{ background: currentTier === 2 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(10, 15, 29, 0.6)' }}>
            <div className="gauge-title">
              <span>Gate: C ∧ P Agree?</span>
              <Cpu size={12} />
            </div>
            <div className={`gauge-score ${currentTier === 2 ? 'danger' : 'safe'}`} style={{ fontSize: '1.15rem' }}>
              {currentTier === 2 ? 'MATCH (PAUSE)' : 'DISAGREE'}
            </div>
            <div className="gauge-bar-track">
              <div 
                className={`gauge-bar-fill ${currentTier === 2 ? 'danger' : 'safe'}`}
                style={{ width: currentTier === 2 ? '100%' : '15%' }}
              ></div>
            </div>
            <span style={{ fontSize: '0.65rem', color: currentTier === 2 ? '#fca5a5' : '#64748b' }}>
              {currentTier === 2 ? 'Intervention Active' : 'Never Auto-Blocks'}
            </span>
          </div>
        </div>

        {/* Real-time Semantic Intent Clusters Visualizer */}
        {semanticDetails && (
          <div style={{ marginTop: '0.85rem', background: 'rgba(0,0,0,0.3)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.72rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', color: '#94a3b8', fontWeight: 600 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Layers size={12} color="#38bdf8" />
                <span>Detected Semantic Intent Vectors:</span>
              </span>
              <span style={{ color: '#f1f5f9' }}>Class: <strong>{semanticDetails.category}</strong></span>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span className={`badge-pill ${semanticDetails.matchedClusters?.authority ? 'danger' : 'safe'}`}>
                Authority Imposture: {semanticDetails.matchedClusters?.authority ? 'DETECTED' : 'CLEAR'}
              </span>
              <span className={`badge-pill ${semanticDetails.matchedClusters?.isolation ? 'danger' : 'safe'}`}>
                Coerced Isolation: {semanticDetails.matchedClusters?.isolation ? 'DETECTED' : 'CLEAR'}
              </span>
              <span className={`badge-pill ${semanticDetails.matchedClusters?.urgency ? 'danger' : 'safe'}`}>
                Safe Account Ask: {semanticDetails.matchedClusters?.urgency ? 'DETECTED' : 'CLEAR'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Target Performance Benchmarks Card */}
      <div className="panel-card">
        <div className="panel-card-header">
          <h2 className="panel-card-title">
            <Zap size={18} color="#f59e0b" />
            <span>Grand Finale Benchmark Performance</span>
          </h2>
          <span className="badge-pill safe">F1: 0.9624 (Real HF Datasets)</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.75rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>Holdout Test F1-Score:</div>
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
              0.9624 <span style={{ fontSize: '0.65rem', color: '#64748b' }}>(Baseline: 0.956)</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>Acoustic Deepfake Detector:</div>
            <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
              Vocoder &gt; 7.5kHz <span style={{ fontSize: '0.65rem', color: '#64748b' }}>(AASIST Artifacts)</span>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>Speech Recognition Locales:</div>
            <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
              14 Vernacular Languages
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>DPDP Act 2023 Compliance:</div>
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
              PII Auto-Scrubbed <span style={{ fontSize: '0.65rem', color: '#64748b' }}>(0 Bytes Audio Stored)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
