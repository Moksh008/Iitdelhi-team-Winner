import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Cpu, Lock, MapPin, Phone, ShieldAlert, ShieldCheck } from 'lucide-react';
import { extractLocation, findCity } from '../../engine/locationExtractor';
import { findTriggerStatement } from '../../engine/localAnalyzer';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import NearbyHelpPanel from './NearbyHelpPanel';

// Which kind of nearby place helps most to verify each scam pattern.
const PLACE_FOR_CATEGORY = {
  family_emergency: 'hospital',
  digital_arrest: 'police',
  authority_impersonation: 'police',
  extortion: 'police',
  pressure_and_secrecy: 'police',
  advisory: 'police',
  kyc_or_account_block: 'bank',
  safe_account_transfer: 'bank',
  remote_access: 'bank',
  prize_or_refund: 'bank',
  advance_fee: 'bank',
};

const AI_STATUS_TEXT = {
  not_installed: 'The optional on-device AI model is not installed (Settings → AI explanations). The advice above comes from Satark’s built-in rules.',
  busy_listening: 'Skipped while live listening is on, to protect this phone’s memory. The advice above still applies.',
  rejected: 'No AI note this time — the draft did not pass Satark’s safety check. The advice above still applies.',
  timeout: 'No AI note this time — it took too long. The advice above still applies.',
  low_memory: 'No AI note — not enough free memory right now. The advice above still applies.',
  busy: 'No AI note — the model is busy. The advice above still applies.',
  error: 'No AI note this time. The advice above still applies.',
};

/**
 * Full warning page for an alert raised by the on-device rules. Nothing here
 * blocks a payment or contacts anyone; every action is the user's choice.
 */
export default function ScamAlertPanel({ alert, onClose, onEmergency }) {
  const [aiNote, setAiNote] = useState({ status: isNativeApp ? 'loading' : 'unavailable' });
  const [lockNote, setLockNote] = useState('');
  const lockRemoteAccess = async () => {
    const result = await SatarkNative.lockRemoteAccess({ minutes: 30 }).catch(() => null);
    setLockNote({
      locked: 'Screen-sharing apps are cut off from the internet for 30 minutes (Protect tab to unlock).',
      needs_shield: 'Turn on scam link blocking in the Protect tab once, then tap again.',
      no_apps: 'No screen-sharing app is installed on this phone.',
    }[result?.status] || 'Could not lock screen-sharing apps.');
  };
  const location = useMemo(() => extractLocation(alert?.transcript_excerpt || ''), [alert]);
  const cityFallback = useMemo(() => {
    const city = findCity(alert?.transcript_excerpt || '');
    return city ? [city.name] : [];
  }, [alert]);
  const high = alert?.risk_level === 'high';
  // The statement that raised the warning (the phone sends it; otherwise find it in the transcript).
  const trigger = useMemo(() => alert?.trigger || findTriggerStatement(alert?.transcript_excerpt || ''), [alert]);

  useEffect(() => {
    let cancelled = false;
    if (!alert || !isNativeApp) return undefined;
    setAiNote({ status: 'loading' });
    SatarkNative.explainAlert({
      transcript: (alert.transcript_excerpt || '').slice(-600),
      category: alert.category || 'advisory',
      cues: (alert.indicators || []).map(item => `${item.label}: ${item.terms.join(', ')}`),
    })
      .then(result => {
        if (cancelled) return;
        const text = typeof result?.explanation === 'string' ? result.explanation.trim() : '';
        setAiNote(result?.status === 'ok' && text && text.length <= 320 ? { status: 'ok', explanation: text } : { status: result?.status || 'error' });
      })
      .catch(() => !cancelled && setAiNote({ status: 'error' }));
    return () => { cancelled = true; };
  }, [alert]);

  if (!alert) return null;

  return (
    <>
      <section className={`risk-header ${high ? '' : 'caution'}`} id="alert-header">
        <div className="row-between">
          <AlertTriangle size={26} color={high ? 'var(--danger)' : 'var(--warning)'} />
          <span className={`chip ${high ? 'danger' : 'warning'}`}>{high ? 'High risk' : 'Caution'}</span>
        </div>
        <h2>{alert.title || 'Verify this call independently'}</h2>
        <p>{alert.advice || 'These signs are not proof of fraud. Do not send money based only on an urgent claim.'}</p>
        {trigger && <p className="trigger-line" id="alert-trigger">Triggered by: “{trigger}”</p>}
        <p className="fine-print">This is advice, not proof. Satark never blocks a payment or calls anyone for you.</p>
      </section>

      <button type="button" className="btn btn-danger btn-block" onClick={onEmergency} id="btn-alert-checklist">
        <ShieldAlert size={16} /> Safety steps
      </button>

      <div className="btn-row">
        <a className="btn btn-secondary" href="tel:1930" id="btn-alert-call-1930"><Phone size={16} /> Call 1930</a>
        <button type="button" className="btn btn-primary" onClick={onClose} id="btn-alert-done">Done</button>
      </div>

      {isNativeApp && (
        <section className="card" id="alert-remote-lock">
          <button type="button" className="btn btn-danger btn-block" onClick={lockRemoteAccess} id="btn-alert-lock">
            <Lock size={16} /> Cut off screen-sharing apps
          </button>
          <p className="fine-print">
            Routes AnyDesk, TeamViewer and similar apps into Satark’s VPN and drops their traffic, which stops most sessions. To be sure,
            also force-stop or uninstall the app (see Safety steps).
          </p>
          {lockNote && <p className="notice" role="status">{lockNote}</p>}
        </section>
      )}

      <section className="card">
        <h2>Why Satark warned you</h2>
        <ul className="list" id="alert-reasons">
          {(alert.indicators || []).map(item => (
            <li key={item.cluster}>
              <strong>{item.label}</strong>
              <span className="muted"> — heard “{item.terms.map(term => term.replace(/\*$/, '…')).join('”, “')}”</span>
            </li>
          ))}
        </ul>
        {alert.transcript_excerpt && <blockquote className="quote">“{alert.transcript_excerpt.slice(-400)}”</blockquote>}
      </section>

      {aiNote.status !== 'unavailable' && (
        <section className="card" id="alert-ai-note">
          <div className="card-title"><Cpu size={18} /> <h2>On-device AI note</h2></div>
          {aiNote.status === 'loading' && <p className="muted">Writing a short explanation on this phone…</p>}
          {aiNote.status === 'ok' && <p className="ai-note">{aiNote.explanation}</p>}
          {AI_STATUS_TEXT[aiNote.status] && <p className="muted">{AI_STATUS_TEXT[aiNote.status]}</p>}
          <p className="fine-print">Written by a small model on this phone. It can be wrong and never changes the warning.</p>
        </section>
      )}

      <section className="card">
        <div className="card-title"><MapPin size={18} /> <h2>Check the claim nearby</h2></div>
        {location ? (
          <p className="notice" id="alert-detected-place">
            Place mentioned in the call: <strong>“{location.text}”</strong>. Satark searched near it automatically (only the place
            name is sent). Edit it below if it was misheard.
          </p>
        ) : (
          <p className="muted">No place was mentioned in the call. Type the area, landmark or city the caller named.</p>
        )}
        <NearbyHelpPanel
          key={location?.text || 'none'}
          initialQuery={location?.text || ''}
          preferredCategory={PLACE_FOR_CATEGORY[alert.category] || 'hospital'}
          autoSearch={Boolean(location)}
          fallbackQueries={cityFallback}
        />
      </section>

      <p className="notice success result-line">
        <ShieldCheck size={16} /> Before paying, call back on a number you find yourself — never one the caller gives you.
      </p>
    </>
  );
}
