import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CreditCard, Home, MapPin, Settings, Shield } from 'lucide-react';
import { SatarkDecisionEngine } from './engine/decisionEngine';
import { extractLocation, findCity } from './engine/locationExtractor';
import { SatarkNative, isNativeApp } from './native/satarkNative';
import HomeScreen from './components/mobile/HomeScreen';
import ScamAlertPanel from './components/mobile/ScamAlertPanel';
import NearbyHelpPanel from './components/mobile/NearbyHelpPanel';
import PaymentDemo from './components/mobile/PaymentDemo';
import SettingsScreen from './components/mobile/SettingsScreen';

const TABS = [
  { id: 'home', label: 'Home', title: 'Satark', icon: Home },
  { id: 'nearby', label: 'Nearby', title: 'Nearby help', icon: MapPin },
  { id: 'payment', label: 'Pay check', title: 'Payment check', icon: CreditCard },
  { id: 'settings', label: 'Settings', title: 'Settings', icon: Settings },
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

  const setAlert = useCallback((next) => {
    setAlertState(next);
    if (next?.transcript_excerpt) setCallText(next.transcript_excerpt);
  }, []);

  useEffect(() => {
    let listener;
    SatarkNative.addListener('listeningUpdate', state => {
      if (state?.transcript) setCallText(state.transcript);
    }).then(handle => { listener = handle; });
    return () => listener?.remove();
  }, []);

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
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      listener?.remove();
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
        ) : (
          <div className="brand-mark" aria-hidden="true"><Shield size={18} /></div>
        )}
        <h1>{alert ? 'Scam warning' : current.title}</h1>
        <div className="header-spacer" />
      </header>

      <main className="app-main">
        {alert && <ScamAlertPanel alert={alert} onClose={() => setAlert(null)} />}
        {/* Screens stay mounted (just hidden) so typed text and searches survive navigation. */}
        <div className="screen" hidden={Boolean(alert) || tab !== 'home'}>
          <HomeScreen engine={engineRef.current} onAlert={setAlert} />
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
        <div className="screen" hidden={Boolean(alert) || tab !== 'payment'}>
          <PaymentDemo engine={demoEngineRef.current} />
        </div>
        <div className="screen" hidden={Boolean(alert) || tab !== 'settings'}>
          <SettingsScreen />
        </div>
      </main>

      {!alert && (
        <nav className="bottom-nav" aria-label="Sections">
          {TABS.map(({ id, label, icon: Icon }) => (
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
