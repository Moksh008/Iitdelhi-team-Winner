import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CreditCard, Home, MapPin, PhoneCall, Settings, Shield, ShieldCheck } from 'lucide-react';
import { SatarkDecisionEngine } from './engine/decisionEngine';
import { extractLocation, findCity } from './engine/locationExtractor';
import { analyzeText, findCriticalCues } from './engine/localAnalyzer';
import { SatarkNative, isNativeApp } from './native/satarkNative';
import HomeScreen from './components/mobile/HomeScreen';
import ScamAlertPanel from './components/mobile/ScamAlertPanel';
import NearbyHelpPanel from './components/mobile/NearbyHelpPanel';
import PaymentDemo from './components/mobile/PaymentDemo';
import SettingsScreen from './components/mobile/SettingsScreen';
import CriticalWordPopup from './components/mobile/CriticalWordPopup';
import ShieldScreen from './components/mobile/ShieldScreen';
import DashboardScreen from './components/mobile/DashboardScreen';
import EmergencyChecklist from './components/mobile/EmergencyChecklist';

const TABS = [
  { id: 'home', label: 'Home', title: 'Satark', icon: Home },
  { id: 'calls', label: 'Calls', title: 'Scam call guardian', icon: PhoneCall },
  { id: 'protect', label: 'Protect', title: 'Link & screen protection', icon: ShieldCheck },
  { id: 'nearby', label: 'Nearby', title: 'Nearby help', icon: MapPin },
  { id: 'settings', label: 'Settings', title: 'Settings', icon: Settings },
  // Opened from the dashboard, not the bottom bar.
  { id: 'payment', label: 'Pay check', title: 'Payment check', icon: CreditCard, hidden: true },
];

export default function App() {
  const engineRef = useRef(null);
  const demoEngineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new SatarkDecisionEngine();
  // The payment demo keeps its own scripted-call state, separate from real checks on Home.
  if (!demoEngineRef.current) demoEngineRef.current = new SatarkDecisionEngine({ namespace: 'demo' });
  const [tab, setTab] = useState('home');
  const [alert, setAlertState] = useState(null);
  // What was said in the latest call; the place for nearby help comes from here.
  const [callText, setCallText] = useState('');
  const [checklistOpen, setChecklistOpen] = useState(false);
  const openChecklist = useCallback(() => setChecklistOpen(true), []);

  const setAlert = useCallback((next) => {
    setAlertState(next);
    if (next?.transcript_excerpt) setCallText(next.transcript_excerpt);
  }, []);

  // Pop-up whenever a scam is possible: the rules raised a warning, or a
  // critical word (OTP/PIN, "safe account", AnyDesk...) was found. During live
  // listening each warning/word pops up once per session, not on every line.
  const [criticalPopup, setCriticalPopup] = useState(null);
  const liveCriticalSeen = useRef(new Set());
  const reportCritical = useCallback((text, analysis, seen = null) => {
    const details = analysis || { ...analyzeText(text), transcript_excerpt: text.slice(-400) };
    const cues = findCriticalCues(text).filter(cue => !seen?.has(cue.cluster));
    const scamKey = details.action_tier > 0 ? `scam:${details.category || 'advisory'}` : null;
    const newScam = Boolean(scamKey) && !seen?.has(scamKey);
    if (!cues.length && !newScam) return;
    cues.forEach(cue => seen?.add(cue.cluster));
    if (scamKey) seen?.add(scamKey);
    // The Nearby tab searches near the place named in this conversation.
    setCallText(text);
    // Add to a pop-up that is already open instead of replacing its words.
    setCriticalPopup(prev => ({
      cues: [...(prev?.cues || []).filter(old => !cues.some(cue => cue.cluster === old.cluster)), ...cues],
      analysis: details,
    }));
  }, []);

  useEffect(() => {
    let listener;
    SatarkNative.addListener('listeningUpdate', state => {
      if (!state?.listening) liveCriticalSeen.current.clear();
      if (state?.transcript) {
        setCallText(state.transcript);
        // The phone's own rules raised state.alert; otherwise judge the text here.
        const nativeAlert = state.alert ? { action_tier: 1, ...state.alert } : null;
        if (state.listening) reportCritical(state.transcript, nativeAlert, liveCriticalSeen.current);
      }
    }).then(handle => { listener = handle; });
    return () => listener?.remove();
  }, [reportCritical]);

  const callPlace = useMemo(() => extractLocation(callText), [callText]);
  const callCity = useMemo(() => {
    const city = findCity(callText);
    return city ? [city.name] : [];
  }, [callText]);

  // When the floating bubble's "Details & nearby help" is tapped, Android brings
  // the app forward with the alert it raised; show it here.
  const checkPendingAlert = useCallback(() => {
    if (!isNativeApp) return;
    SatarkNative.takePendingAlert()
      .then(result => { if (result?.alert) setAlert(result.alert); })
      .catch(() => undefined);
  }, [setAlert]);

  useEffect(() => {
    checkPendingAlert();
    const onVisible = () => document.visibilityState === 'visible' && checkPendingAlert();
    document.addEventListener('visibilitychange', onVisible);
    let listener;
    SatarkNative.addListener('alertOpened', checkPendingAlert).then(handle => { listener = handle; });
    // A threat notification was tapped: show the protection dashboard.
    let screenListener;
    SatarkNative.addListener('openScreen', event => {
      setAlertState(null);
      setTab(TABS.some(item => item.id === event?.screen) ? event.screen : 'home');
    }).then(handle => { screenListener = handle; });
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      listener?.remove();
      screenListener?.remove();
    };
  }, [checkPendingAlert]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, alert]);

  const current = TABS.find(item => item.id === tab);

  return (
    <div className="app">
      <header className="app-header">
        {alert ? (
          <button type="button" className="icon-button" onClick={() => setAlert(null)} aria-label="Back" id="btn-alert-back">
            <ArrowLeft size={20} />
          </button>
        ) : current.hidden ? (
          <button type="button" className="icon-button" onClick={() => setTab('home')} aria-label="Back" id="btn-screen-back">
            <ArrowLeft size={20} />
          </button>
        ) : (
          <div className="brand-mark" aria-hidden="true"><Shield size={18} /></div>
        )}
        <h1>{alert ? 'Scam warning' : current.title}</h1>
        <div className="header-spacer" />
      </header>

      <main className="app-main">
        {alert && <ScamAlertPanel alert={alert} onClose={() => setAlert(null)} onEmergency={openChecklist} />}
        {/* Screens stay mounted (just hidden) so typed text and searches survive navigation. */}
        <div className="screen" hidden={Boolean(alert) || tab !== 'home'}>
          <DashboardScreen active={!alert && tab === 'home'} onNavigate={setTab} onEmergency={openChecklist} />
        </div>
        <div className="screen" hidden={Boolean(alert) || tab !== 'calls'}>
          <HomeScreen engine={engineRef.current} onAlert={setAlert} onCritical={reportCritical} />
        </div>
        <div className="screen" hidden={Boolean(alert) || tab !== 'nearby'}>
          {callPlace ? (
            <p className="notice" id="nearby-call-place">
              Place mentioned in the latest call: <strong>“{callPlace.text}”</strong>. Searched automatically — edit it below if it was misheard.
            </p>
          ) : (
            <p className="muted" id="nearby-call-place">
              No place has been mentioned in a call yet. When a caller names a place, it appears here automatically.
              You can also type one to check a caller&apos;s claim.
            </p>
          )}
          <NearbyHelpPanel
            key={callPlace?.text || 'none'}
            initialQuery={callPlace?.text || ''}
            autoSearch={Boolean(callPlace)}
            fallbackQueries={callCity}
          />
        </div>
        <div className="screen" hidden={Boolean(alert) || tab !== 'protect'}>
          <ShieldScreen active={!alert && tab === 'protect'} onEmergency={openChecklist} />
        </div>
        <div className="screen" hidden={Boolean(alert) || tab !== 'payment'}>
          <PaymentDemo engine={demoEngineRef.current} />
        </div>
        <div className="screen" hidden={Boolean(alert) || tab !== 'settings'}>
          <SettingsScreen />
        </div>
      </main>

      <CriticalWordPopup
        popup={criticalPopup}
        onDetails={() => { setAlert(criticalPopup.analysis); setCriticalPopup(null); }}
        onClose={() => setCriticalPopup(null)}
      />

      <EmergencyChecklist open={checklistOpen} onClose={() => setChecklistOpen(false)} />

      {!alert && (
        <nav className="bottom-nav" aria-label="Sections">
          {TABS.filter(item => !item.hidden).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              id={`nav-${id}`}
              className={`nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
