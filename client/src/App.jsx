import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Smartphone, 
  Building2, 
  Activity, 
  PhoneCall, 
  CreditCard, 
  Settings as SettingsIcon,
  Maximize2,
  Minimize2,
  Lock,
  Sparkles,
  Globe,
  BellRing,
  Bot,
  HeartHandshake
} from 'lucide-react';

import { SCENARIOS } from './engine/scenarios';
import { INDIAN_LANGUAGES } from './engine/languages';
import { SatarkDecisionEngine } from './engine/decisionEngine';

import MobileStatusBar from './components/mobile/MobileStatusBar';
import LiveCallScreen from './components/mobile/LiveCallScreen';
import MockUPIApp from './components/mobile/MockUPIApp';
import Tier1Nudge from './components/mobile/Tier1Nudge';
import Tier2PauseModal from './components/mobile/Tier2PauseModal';
import Tier3ReportPack from './components/mobile/Tier3ReportPack';
import SecuritySettings from './components/mobile/SecuritySettings';
import FloatingShieldOverlay from './components/mobile/FloatingShieldOverlay';

import TelemetryLab from './components/telemetry/TelemetryLab';
import BankReviewerConsole from './components/console/BankReviewerConsole';

export default function App() {
  // Engine Instance
  const engineRef = useRef(new SatarkDecisionEngine());
  const engine = engineRef.current;

  // Active Language State (Defaults to Hindi for Pan-India awareness)
  const [activeLanguage, setActiveLanguage] = useState(INDIAN_LANGUAGES.hi);

  // Call Source State ('whatsapp' | 'cellular')
  const [callSource, setCallSource] = useState('whatsapp');

  // Selected Scenario
  const [currentScenario, setCurrentScenario] = useState(SCENARIOS[0]);

  // Mobile Application State
  const [activeMobileTab, setActiveMobileTab] = useState('call'); // 'call' | 'upi' | 'settings' | 'report'
  const [isMonitoringActive, setIsMonitoringActive] = useState(true);
  const [isCallActive, setIsCallActive] = useState(false);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [chunkHistory, setChunkHistory] = useState([]);

  // Telemetry & Real-Time Scores
  const [rollingC, setRollingC] = useState(0.0);
  const [paymentScore, setPaymentScore] = useState(0.0);
  const [currentTier, setCurrentTier] = useState(0);

  // Multimodal & Defense Signals (inspired by CallShield-AI, ScamVoice-, and deepfake-shield-agent)
  const [detectedTactics, setDetectedTactics] = useState([]);
  const [voiceCloneScore, setVoiceCloneScore] = useState(0.08);
  const [isVoiceCloneDetected, setIsVoiceCloneDetected] = useState(false);
  const [lastDispatchedSOS, setLastDispatchedSOS] = useState(null);
  const [grandmaModeEnabled, setGrandmaModeEnabled] = useState(false);

  // Intervention UI State
  const [tier1Message, setTier1Message] = useState(null);
  const [tier2ModalOpen, setTier2ModalOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState(null);
  const [generatedReportPack, setGeneratedReportPack] = useState(null);

  // Studio Console State
  const [activeStudioTab, setActiveStudioTab] = useState('telemetry'); // 'telemetry' | 'bank'
  const [submittedReports, setSubmittedReports] = useState([]);
  const [showPhoneFrame, setShowPhoneFrame] = useState(true);
  const [localStore, setLocalStore] = useState([]);

  // Auto-start initial scenario call session for immediate interactive wow-factor
  useEffect(() => {
    handleStartCall(currentScenario);
  }, []);

  const handleStartCall = (scenarioToUse = currentScenario) => {
    engine.startCallSession(scenarioToUse.caller);
    engine.grandmaModeEnabled = grandmaModeEnabled;
    setIsCallActive(true);
    setCurrentChunkIndex(0);
    setChunkHistory([]);
    setRollingC(0.0);
    setDetectedTactics([]);
    setVoiceCloneScore(0.08);
    setIsVoiceCloneDetected(false);
    setLastDispatchedSOS(null);
    setTier1Message(null);
    setTier2ModalOpen(false);
    setActiveMobileTab('call');

    // Automatically ingest first 3-second chunk
    if (scenarioToUse.chunks.length > 0) {
      ingestChunkAtIndex(0, scenarioToUse);
    }
  };

  const handleEndCall = () => {
    engine.endCallSession();
    setIsCallActive(false);
  };

  const ingestChunkAtIndex = (index, scenarioToUse = currentScenario) => {
    if (index >= scenarioToUse.chunks.length) return;

    const chunk = scenarioToUse.chunks[index];
    const result = engine.ingestChunk(chunk.text, chunk.riskScore);

    setRollingC(result.rollingC);
    setDetectedTactics(result.detectedTactics || []);
    setVoiceCloneScore(result.voiceCloneScore || 0.08);
    setIsVoiceCloneDetected(result.isVoiceCloneDetected || false);
    if (result.sosDispatched && result.sosPayload) {
      setLastDispatchedSOS(result.sosPayload);
    }

    setChunkHistory(prev => [...prev, {
      text: result.cleanText || chunk.text,
      chunkScore: result.instantaneousScore,
      rollingC: result.rollingC,
      tactics: result.detectedTactics,
      semanticDetails: result.semanticResult
    }]);
    setCurrentChunkIndex(index + 1);
    setLocalStore([...engine.localFeatureStore]);

    if (result.tier === 1) {
      setTier1Message(activeLanguage?.nudgeDefault || scenarioToUse.targetNudge);
      setCurrentTier(1);
    } else if (result.tier === 2) {
      setCurrentTier(2);
    }
  };

  // Real-Time Live Microphone Voice / Custom Text Ingestion Callback
  const handleLiveChunkReceived = (spokenText) => {
    const result = engine.ingestChunk(spokenText);

    setRollingC(result.rollingC);
    setDetectedTactics(result.detectedTactics || []);
    setVoiceCloneScore(result.voiceCloneScore || 0.08);
    setIsVoiceCloneDetected(result.isVoiceCloneDetected || false);
    if (result.sosDispatched && result.sosPayload) {
      setLastDispatchedSOS(result.sosPayload);
    }

    setChunkHistory(prev => [...prev, {
      text: result.cleanText || spokenText,
      chunkScore: result.instantaneousScore,
      rollingC: result.rollingC,
      tactics: result.detectedTactics,
      semanticDetails: result.semanticResult
    }]);
    setLocalStore([...engine.localFeatureStore]);

    if (result.tier === 1) {
      setTier1Message(activeLanguage?.nudgeDefault || 'Suspicious speech intent detected');
      setCurrentTier(1);
    } else if (result.tier === 2) {
      setCurrentTier(2);
    }
  };

  const handleStepNextChunk = () => {
    if (currentChunkIndex < currentScenario.chunks.length) {
      ingestChunkAtIndex(currentChunkIndex, currentScenario);
    }
  };

  const handleResetCall = () => {
    handleStartCall(currentScenario);
  };

  const handleSelectScenario = (sc) => {
    setCurrentScenario(sc);
    handleStartCall(sc);
  };

  // Pre-Payment Initiation Interception Handler
  const handleInitiatePayment = (paymentData) => {
    setPendingPayment(paymentData);
    engine.grandmaModeEnabled = grandmaModeEnabled;

    const evaluation = engine.evaluatePaymentContext(paymentData);
    setPaymentScore(evaluation.paymentScore);
    setCurrentTier(evaluation.decisionTier);

    if (evaluation.decisionTier === 2) {
      setTier2ModalOpen(true);
    } else if (evaluation.decisionTier === 1) {
      setTier1Message(`Review transaction to ${paymentData.payeeVPA}. New payee & elevated call risk.`);
      alert(`Tier 1 Contextual Warning: Please verify payee identity before entering MPIN.`);
    } else {
      alert(`Payment of Rs. ${paymentData.amount.toLocaleString()} to ${paymentData.payeeVPA} authorized.`);
    }
  };

  const handlePauseTimeExpired = async () => {
    if (!pendingPayment) return;
    const reportPack = await engine.buildTier3ReportPack(currentScenario, pendingPayment, activeLanguage.code);
    setGeneratedReportPack(reportPack);
    setTier2ModalOpen(false);
    setActiveMobileTab('report');
  };

  const handleUserOverrideProceed = () => {
    setTier2ModalOpen(false);
    alert('User Override: Navigating directly to UPI MPIN screen.');
  };

  // Final Dispatch to Bank Console
  const handleFinishReport = (reportPack) => {
    setSubmittedReports(prev => [
      {
        ...reportPack,
        status: 'Under Review'
      },
      ...prev
    ]);
  };

  const handlePlaceLien = (reportId) => {
    setSubmittedReports(prev => prev.map(r => 
      r.report_id === reportId ? { ...r, status: 'Lien Placed (2hr Freeze)' } : r
    ));
    alert(`Lien mandate placed for Report ${reportId}. Destination funds frozen for 2 hours per Supreme Court SOP.`);
  };

  const handleEscalate1930 = (reportId) => {
    setSubmittedReports(prev => prev.map(r => 
      r.report_id === reportId ? { ...r, status: 'Escalated to 1930 Cyber Cell' } : r
    ));
    alert(`Report ${reportId} officially dispatched to National Cybercrime Portal 1930.`);
  };

  return (
    <div className="app-root" id="satark-app-root">
      <div className="ambient-glow" />

      {/* Top Header Navigation */}
      <header className="app-header">
        <div className="brand-section">
          <img src="/logo.jpg" alt="Satark Logo" className="brand-logo-img" />
          <div className="brand-text">
            <h1>Satark <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '0.88rem', color: '#94a3b8' }}>| सतर्क</span></h1>
            <span className="brand-subtitle">The Scam Shield that Steps in BEFORE the UPI Payment</span>
          </div>
        </div>

        <div className="header-actions">
          {/* Quick Multilingual Language Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.5rem' }}>
            <Globe size={14} color="#38bdf8" />
            <select
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontWeight: 700,
                fontSize: '0.78rem',
                outline: 'none',
                cursor: 'pointer'
              }}
              value={activeLanguage.code}
              onChange={(e) => {
                const selected = INDIAN_LANGUAGES[e.target.value];
                if (selected) setActiveLanguage(selected);
              }}
              id="header-language-select"
            >
              {Object.values(INDIAN_LANGUAGES).map(lang => (
                <option key={lang.code} value={lang.code} style={{ background: '#0f172a', color: '#ffffff' }}>
                  {lang.nativeName} ({lang.name})
                </option>
              ))}
            </select>
          </div>

          <div className="tab-pill-group">
            <button 
              className={`tab-pill-btn ${activeStudioTab === 'telemetry' ? 'active' : ''}`}
              onClick={() => setActiveStudioTab('telemetry')}
              id="tab-btn-telemetry"
            >
              <Activity size={14} />
              <span>Studio Telemetry</span>
            </button>
            <button 
              className={`tab-pill-btn ${activeStudioTab === 'bank' ? 'active' : ''}`}
              onClick={() => setActiveStudioTab('bank')}
              id="tab-btn-bank"
            >
              <Building2 size={14} />
              <span>1930 Bank Portal ({submittedReports.length})</span>
            </button>
          </div>

          <button 
            className="btn-outline" 
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
            onClick={() => setShowPhoneFrame(!showPhoneFrame)}
            title="Toggle phone chassis"
          >
            {showPhoneFrame ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </header>

      {/* Main Dual-Column Content */}
      <main className="app-main-layout">
        
        {/* ==================== LEFT COLUMN: PROTECTED PHONE UI ==================== */}
        <section className="phone-wrapper">
          <div className={`phone-frame ${!showPhoneFrame ? 'frameless' : ''}`}>
            {showPhoneFrame && (
              <div className="phone-island">
                <div className="island-camera" />
              </div>
            )}

            {/* Mobile Status Bar */}
            <MobileStatusBar 
              isMonitoringActive={isMonitoringActive} 
              activeLanguage={activeLanguage}
            />

            {/* Mid-Call Floating Shield Overlay (inspired by CallShield-AI) */}
            {isCallActive && activeMobileTab !== 'call' && (
              <FloatingShieldOverlay 
                rollingC={rollingC}
                detectedTactics={detectedTactics}
                isVoiceCloneDetected={isVoiceCloneDetected}
                onEndCall={handleEndCall}
                onOpenCallScreen={() => setActiveMobileTab('call')}
                visible={true}
              />
            )}

            {/* Floating Tier 1 Nudge Banner */}
            {tier1Message && (
              <Tier1Nudge 
                message={tier1Message}
                scamCategory={currentScenario.category}
                activeLanguage={activeLanguage}
                onDismiss={() => setTier1Message(null)}
              />
            )}

            {/* Main Phone Viewport Content */}
            <div className="phone-screen" id="phone-screen-viewport">
              {activeMobileTab === 'call' && (
                <LiveCallScreen 
                  scenario={currentScenario}
                  onEndCall={handleEndCall}
                  onOpenUPI={() => setActiveMobileTab('upi')}
                  chunkHistory={chunkHistory}
                  rollingC={rollingC}
                  activeLanguage={activeLanguage}
                  onLiveChunkReceived={handleLiveChunkReceived}
                  callSource={callSource}
                  onChangeCallSource={setCallSource}
                  detectedTactics={detectedTactics}
                  voiceCloneScore={voiceCloneScore}
                  isVoiceCloneDetected={isVoiceCloneDetected}
                  lastDispatchedSOS={lastDispatchedSOS}
                  grandmaModeEnabled={grandmaModeEnabled}
                  onToggleGrandmaMode={() => {
                    setGrandmaModeEnabled(!grandmaModeEnabled);
                    engine.grandmaModeEnabled = !grandmaModeEnabled;
                  }}
                />
              )}

              {activeMobileTab === 'upi' && (
                <MockUPIApp 
                  scenario={currentScenario}
                  onInitiatePayment={handleInitiatePayment}
                  isCallOngoing={isCallActive}
                  onReturnToCall={() => setActiveMobileTab('call')}
                  activeLanguage={activeLanguage}
                />
              )}

              {activeMobileTab === 'report' && (
                <Tier3ReportPack 
                  reportPack={generatedReportPack}
                  onFinishReport={handleFinishReport}
                  onNotifyTrustedContact={() => alert(`Trusted guardian contact alerted via encrypted SMS: "Potential scam transfer intercepted."`)}
                  onCancel={() => setActiveMobileTab('upi')}
                  activeLanguage={activeLanguage}
                />
              )}

              {activeMobileTab === 'settings' && (
                <SecuritySettings 
                  isMonitoring={isMonitoringActive}
                  onToggleMonitoring={() => setIsMonitoringActive(!isMonitoringActive)}
                  alertBudget={{ used: engine.alertsTriggeredThisWeek, max: engine.weeklyAlertBudget }}
                  localStore={localStore}
                  onClearLocalStore={() => {
                    engine.localFeatureStore = [];
                    setLocalStore([]);
                    alert('Encrypted local feature cache flushed.');
                  }}
                  activeLanguage={activeLanguage}
                />
              )}

              {/* Tier 2 Pause Modal (Full-Screen Pre-PIN Interception) */}
              {tier2ModalOpen && (
                <Tier2PauseModal 
                  scenario={currentScenario}
                  paymentDetails={pendingPayment}
                  conversationScore={rollingC}
                  onExpire={handlePauseTimeExpired}
                  onUserOverride={handleUserOverrideProceed}
                  onCancelPayment={() => {
                    setTier2ModalOpen(false);
                    setPendingPayment(null);
                    alert('Transaction safely cancelled. Funds preserved.');
                  }}
                  activeLanguage={activeLanguage}
                />
              )}
            </div>

            {/* Bottom Mobile Tab Bar */}
            <nav className="phone-bottom-nav">
              <button 
                className={`phone-nav-btn ${activeMobileTab === 'call' ? 'active' : ''}`}
                onClick={() => setActiveMobileTab('call')}
                id="btn-nav-call"
              >
                <PhoneCall size={16} />
                <span>Call ({isCallActive ? 'LIVE' : 'Off'})</span>
              </button>
              <button 
                className={`phone-nav-btn ${activeMobileTab === 'upi' ? 'active' : ''}`}
                onClick={() => setActiveMobileTab('upi')}
                id="btn-nav-upi"
              >
                <CreditCard size={16} />
                <span>UPI Pay</span>
              </button>
              <button 
                className={`phone-nav-btn ${activeMobileTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveMobileTab('settings')}
                id="btn-nav-settings"
              >
                <SettingsIcon size={16} />
                <span>Shield Vault</span>
              </button>
            </nav>
          </div>
        </section>

        {/* ==================== RIGHT COLUMN: STUDIO / CONSOLE ==================== */}
        <section className="studio-wrapper">
          {activeStudioTab === 'telemetry' && (
            <TelemetryLab 
              currentScenario={currentScenario}
              onSelectScenario={handleSelectScenario}
              rollingC={rollingC}
              paymentScore={paymentScore}
              currentTier={currentTier}
              currentChunkIndex={currentChunkIndex}
              onStepNextChunk={handleStepNextChunk}
              onResetCall={handleResetCall}
              isCallActive={isCallActive}
              onStartCall={() => handleStartCall(currentScenario)}
              chunkHistory={chunkHistory}
              activeLanguage={activeLanguage}
              onSelectLanguage={(lang) => setActiveLanguage(lang)}
              detectedTactics={detectedTactics}
              voiceCloneScore={voiceCloneScore}
              isVoiceCloneDetected={isVoiceCloneDetected}
              lastDispatchedSOS={lastDispatchedSOS}
            />
          )}

          {activeStudioTab === 'bank' && (
            <BankReviewerConsole 
              reports={submittedReports}
              onPlaceLien={handlePlaceLien}
              onEscalate1930={handleEscalate1930}
              activeLanguage={activeLanguage}
            />
          )}
        </section>
      </main>
    </div>
  );
}
