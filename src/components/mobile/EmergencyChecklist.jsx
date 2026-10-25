import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Lock, Phone, PhoneOff, Plane, ShieldAlert, Trash2, X } from 'lucide-react';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';

/**
 * "I think I'm being scammed": step-by-step safety checklist. Satark cannot
 * close another app or end someone else's session by itself; each button opens
 * the Android screen where the user can do it, or uses Satark's own VPN lock.
 */
export default function EmergencyChecklist({ open, onClose }) {
  const [done, setDone] = useState({});
  const [remote, setRemote] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setNote('');
    if (isNativeApp) SatarkNative.getRemoteAccessStatus().then(setRemote).catch(() => setRemote(null));
  }, [open]);

  if (!open) return null;
  const apps = remote?.apps || [];
  const controllers = [...apps.filter(app => app.accessibility), ...(remote?.otherAccessibility || [])];
  const toggle = id => setDone(prev => ({ ...prev, [id]: !prev[id] }));

  const lock = async () => {
    const result = await SatarkNative.lockRemoteAccess({ minutes: 30 }).catch(() => null);
    setNote({
      locked: 'Done: screen-sharing apps are cut off from the internet for 30 minutes.',
      needs_shield: 'Turn on scam link blocking (Protect tab) once, then tap again — or use airplane mode now.',
      no_apps: 'No screen-sharing app is installed.',
    }[result?.status] || 'Could not lock. Use airplane mode instead.');
    if (result?.status === 'locked') setDone(prev => ({ ...prev, internet: true }));
  };

  const Step = ({ id, title, children }) => (
    <li className={`check-step ${done[id] ? 'done' : ''}`}>
      <button type="button" className="check-toggle" onClick={() => toggle(id)} aria-pressed={Boolean(done[id])} aria-label={`Mark "${title}" done`}>
        {done[id] ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      <div className="check-body">
        <strong>{title}</strong>
        {children}
      </div>
    </li>
  );

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="checklist-title" id="emergency-checklist">
      <div className="sheet">
        <div className="row-between">
          <div className="card-title" style={{ color: 'var(--danger)' }}>
            <ShieldAlert size={24} /> <h2 id="checklist-title">Safety steps — do these now</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" id="btn-checklist-close"><X size={20} /></button>
        </div>
        <p className="muted">Go top to bottom. Tick each step when it is done.</p>

        <ol className="check-list">
          <Step id="hangup" title="1. Hang up the call">
            <p className="muted"><PhoneOff size={13} /> Banks, police and companies never mind you calling back on their official number.</p>
          </Step>

          <Step id="session" title="2. Stop screen sharing">
            {apps.length ? apps.map(app => (
              <div key={app.packageName} className="check-app">
                <span><strong>{app.app}</strong>{app.active ? <span className="chip danger">active</span> : null}</span>
                <div className="btn-row">
                  <button type="button" className="btn btn-secondary" onClick={() => SatarkNative.openAppInfo({ packageName: app.packageName })}>
                    <ExternalLink size={14} /> Force stop
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => SatarkNative.uninstallApp({ packageName: app.packageName })}>
                    <Trash2 size={14} /> Uninstall
                  </button>
                </div>
              </div>
            )) : (
              <p className="muted">
                {isNativeApp ? 'No screen-sharing app found on this phone.' : 'Close any screen-sharing app (AnyDesk, TeamViewer…) and uninstall it.'}
              </p>
            )}
            <p className="fine-print">“Force stop” opens Android’s page for the app — tap Force stop there.</p>
          </Step>

          <Step id="internet" title="3. Cut the connection">
            {isNativeApp && (
              <button type="button" className="btn btn-danger btn-block" onClick={lock} id="btn-checklist-lock">
                <Lock size={14} /> Cut off screen-sharing apps (30 min)
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-block" onClick={() => SatarkNative.openSettingsPage({ page: 'airplane' })}>
              <Plane size={14} /> Turn on airplane mode
            </button>
            <p className="fine-print">Airplane mode disconnects everything, including a session Satark can’t see.</p>
          </Step>

          {(controllers.length > 0 || !isNativeApp) && (
            <Step id="control" title="4. Take back control of your screen">
              <p className="muted">
                {controllers.length
                  ? `${controllers.map(app => app.app).join(', ')} can control your phone through Accessibility. Switch it off there.`
                  : 'Open Settings → Accessibility and switch off any app you did not set up yourself.'}
              </p>
              {isNativeApp && (
                <button type="button" className="btn btn-secondary" onClick={() => SatarkNative.openSettingsPage({ page: 'accessibility' })}>
                  <ExternalLink size={14} /> Open Accessibility settings
                </button>
              )}
            </Step>
          )}

          <Step id="money" title="5. Protect your money">
            <ul className="list">
              <li>Call your bank on the number on your card or passbook — not one from the caller.</li>
              <li>Block UPI and cards in your bank app, then change your UPI PIN and banking passwords.</li>
              <li>Never share an OTP or PIN, even with “bank staff” or “police”.</li>
            </ul>
          </Step>

          <Step id="report" title="6. Report it">
            <div className="btn-row">
              <a className="btn btn-danger" href="tel:1930" id="btn-checklist-1930"><Phone size={14} /> Call 1930</a>
              <a className="btn btn-secondary" href="https://cybercrime.gov.in" target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> cybercrime.gov.in
              </a>
            </div>
            <p className="fine-print">Report quickly: money lost to fraud can sometimes be frozen if reported within hours.</p>
          </Step>
        </ol>

        {note && <p className="notice" role="status">{note}</p>}
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
