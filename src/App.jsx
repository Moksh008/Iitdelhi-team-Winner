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
  Globe
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

import TelemetryLab from './components/telemetry/TelemetryLab';
import BankReviewerConsole from './components/console/BankReviewerConsole';

export default function App() {
  // Engine Instance
  const engineRef = useRef(new SatarkDecisionEngine());
  const engine = engineRef.current;

  // Active Language State (Defaults to Hindi for Pan-India awareness)
  const [activeLanguage, setActiveLanguage] = useState(INDIAN_LANGUAGES.hi);

  // Call Source State ('whatsapp' | 'cellular' | 'telegram')
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
    setIsCallActive(true);
    setCurrentChunkIndex(0);
    setChunkHistory([]);
    setRollingC(0.0);
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
    setChunkHistory(prev => [...prev, {
      text: chunk.text,
      chunkScore: result.instantaneousScore,
      rollingC: result.rollingC,
      semanticDetails: result.semanticResult
    }]);
    setCurrentChunkIndex(index + 1);
    setLocalStore([...engine.localFeatureStore]);

    if (result.tier === 1) {
      setTier1Message(activeLanguage?.nudgeDefault || scenarioToUse.targetNudge);
      setCurrentTier(1);
    }
  };

  // Real-Time Live Microphone Voice / Custom Text Ingestion Callback
  const handleLiveChunkReceived = (spokenText) => {
    const result = engine.ingestChunk(spokenText);

    setRollingC(result.rollingC);
    setChunkHistory(prev => [...prev, {
      text: spokenText,
      chunkScore: result.instantaneousScore,
      rollingC: result.rollingC,
      semanticDetails: result.semanticResult
    }]);
    setLocalStore([...engine.localFeatureStore]);

    if (result.tier === 1) {
      setTier1Message(activeLanguage?.nudgeDefault || 'Suspicious speech intent detected');
      setCurrentTier(1);
    }
  };

  const handleStepNextChunk = () => {
    if (currentChunkIndex < currentScenario.chunks.length) {
      ingestChunkAtIndex(currentChunkIndex, currentScenario);
    }
  };

  const handleSelectScenario = (sc) => {
    setCurrentScenario(sc);
    handleStartCall(sc);
  };

  // Payment Interception Hook
  const handleInitiatePayment = (paymentDetails) => {
    setPendingPayment(paymentDetails);

    // Evaluate dual-signal criteria via Satark Decision Engine
    const evalResult = engine.evaluatePaymentContext(paymentDetails);
    setPaymentScore(evalResult.paymentScore);
    setCurrentTier(evalResult.decisionTier);

    if (evalResult.decisionTier === 2) {
      // DUAL-SIGNAL AGREEMENT: Trigger Tier 2 Pause Modal
      setTier2ModalOpen(true);
    } else if (evalResult.decisionTier === 1) {
      // Tier 1 Warning Only
      setTier1Message(activeLanguage?.nudgeDefault || currentScenario.targetNudge);
      alert('Satark Advisory: Suspicious conversation detected. (Proceeding as Tier 1 Nudge)');
    } else {
      // Normal transaction
      alert(`Payment of ₹${paymentDetails.amount.toLocaleString('en-IN')} approved to ${paymentDetails.payeeName}. No coercion detected.`);
    }
  };

  // User Actions from Tier 2 Pause Modal
  const handleConfirmReport = async () => {
    setTier2ModalOpen(false);
    const reportPack = await engine.buildTier3ReportPack(currentScenario, pendingPayment, activeLanguage.code);
    setGeneratedReportPack(reportPack);
    setActiveMobileTab('report');
    setCurrentTier(3);
  };

  const handleKnownPerson = () => {
    // False Positive Softening
    if (pendingPayment) {
      engine.softenPayeeTrust(pendingPayment.payeeVPA);
    }
    setTier2ModalOpen(false);
    setCurrentTier(0);
    alert(`Trust weight softened for ${pendingPayment?.payeeVPA}. Payment authorized!`);
  };

  const handleBypassPayment = () => {
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

          <button 
            className={`tab-nav-btn ${activeStudioTab === 'telemetry' ? 'active' : ''}`}
            onClick={() => setActiveStudioTab('telemetry')}
            id="tab-btn-telemetry"
          >
            <Activity size={15} />
            <span>Dual-Signal Engine</span>
          </button>

          <button 
            className={`tab-nav-btn ${activeStudioTab === 'bank' ? 'active' : ''}`}
            onClick={() => setActiveStudioTab('bank')}
            id="tab-btn-bank"
          >
            <Building2 size={15} />
            <span>Bank & 1930 Console</span>
            {submittedReports.length > 0 && (
              <span className="badge-pill danger" style={{ padding: '0.1rem 0.4rem', fontSize: '0.65rem' }}>
                {submittedReports.length}
              </span>
            )}
          </button>

          <button 
            className="btn-outline"
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
            onClick={() => setShowPhoneFrame(!showPhoneFrame)}
            title="Toggle native frameless mobile mode for direct APK conversion"
            id="btn-toggle-frame"
          >
            {showPhoneFrame ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{showPhoneFrame ? 'Frameless Mode' : 'Show Phone Frame'}</span>
          </button>
        </div>
      </header>

      {/* Studio Grid */}
      <main className="studio-grid">
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
                  onNotifyTrustedContact={() => alert(`Trusted family contact alerted via encrypted SMS: "Meena may need assistance regarding a suspected scam call."`)}
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
                  onConfirmReport={handleConfirmReport}
                  onKnownPerson={handleKnownPerson}
                  onBypassPayment={handleBypassPayment}
                  activeLanguage={activeLanguage}
                />
              )}
            </div>

            {/* Native Mobile Bottom Navigation */}
            <nav className="mobile-bottom-nav">
              <button 
                className={`mobile-nav-item ${activeMobileTab === 'call' ? 'active' : ''}`}
                onClick={() => setActiveMobileTab('call')}
                id="nav-tab-call"
              >
                <PhoneCall size={18} />
                <span>Call Shield</span>
              </button>

              <button 
                className={`mobile-nav-item ${activeMobileTab === 'upi' ? 'active' : ''}`}
                onClick={() => setActiveMobileTab('upi')}
                id="nav-tab-upi"
              >
                <CreditCard size={18} />
                <span>PayRaksham</span>
              </button>

              <button 
                className={`mobile-nav-item ${activeMobileTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveMobileTab('settings')}
                id="nav-tab-settings"
              >
                <SettingsIcon size={18} />
                <span>Security</span>
              </button>
            </nav>
          </div>
        </section>

        {/* ==================== RIGHT COLUMN: STUDIO & TELEMETRY ==================== */}
        <section>
          {activeStudioTab === 'telemetry' ? (
            <TelemetryLab 
              currentScenario={currentScenario}
              onSelectScenario={handleSelectScenario}
              rollingC={rollingC}
              paymentScore={paymentScore}
              currentTier={currentTier}
              currentChunkIndex={currentChunkIndex}
              onStepNextChunk={handleStepNextChunk}
              onResetCall={() => handleStartCall(currentScenario)}
              isCallActive={isCallActive}
              onStartCall={() => handleStartCall(currentScenario)}
              chunkHistory={chunkHistory}
              activeLanguage={activeLanguage}
              onSelectLanguage={setActiveLanguage}
            />
          ) : (
            <BankReviewerConsole 
              reports={submittedReports}
              onPlaceLien={handlePlaceLien}
              onEscalate1930={handleEscalate1930}
            />
          )}
        </section>
      </main>
    </div>
  );
}
