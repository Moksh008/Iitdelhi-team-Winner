import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock, CreditCard, Globe, Info, MonitorSmartphone, PhoneCall,
  RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Trash2,
} from 'lucide-react';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import {
  clearSecurityEvents, dismissRiskAlerts, getDashboard, onLocalSecurityChange, runSecurityScan,
} from '../../services/securityEvents';

const clock = time => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const when = time => {
  if (!time) return 'never';
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return new Date(time).toLocaleDateString();
};
const SCAN_AGE_MS = 6 * 60 * 60 * 1000;
const STATUS_ICON = { ok: CheckCircle2, info: Info, warn: AlertTriangle, risk: ShieldAlert };
const SETTINGS_ACTIONS = new Set(['accessibility', 'usage', 'developer', 'private_dns', 'security', 'overlay']);

/**
 * Home: one protection status for the whole phone, with cards for link
 * protection, scam calls, screen sharing and suspicious network activity, the
 * current risk alerts, the last security scan and the incident timeline.
 */
export default function DashboardScreen({ active, onNavigate, onEmergency }) {
  const [data, setData] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const next = await getDashboard().catch(() => null);
    if (next) setData(next);
    return next;
  }, []);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      await runSecurityScan();
      await refresh();
    } finally {
      setScanning(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    refresh().then(next => {
      // Scan automatically when the last scan is old (or there has never been one).
      if (!cancelled && next && (!next.scan || Date.now() - next.scan.time > SCAN_AGE_MS)) scan();
    });
    const timer = window.setInterval(refresh, 5000);
    const handles = [];
    SatarkNative.addListener('securityUpdate', refresh).then(handle => handles.push(handle));
    SatarkNative.addListener('shieldUpdate', refresh).then(handle => handles.push(handle));
    const stopLocal = onLocalSecurityChange(refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      handles.forEach(handle => handle.remove());
      stopLocal();
    };
  }, [active, refresh, scan]);

  const act = async (task, done) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await task();
      if (done) setMessage(done(result) || '');
      await refresh();
    } catch (error) {
      setMessage(error?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const shield = data?.shield;
  const shieldOn = Boolean(shield?.running);
  const risk = data?.riskLevel || 'ok';
  const alerts = data?.activeAlerts || [];
  const remote = data?.remote;
  const remoteApps = remote?.apps || [];
  const locked = shield?.lockedUntil > Date.now();
  const scanResult = data?.scan;
  const scanIssues = (scanResult?.checks || []).filter(check => check.status === 'warn' || check.status === 'risk');
  const recentBlocked = data?.network?.recentBlocked || [];

  const toggleShield = () => act(
    () => (shieldOn ? SatarkNative.stopShield() : SatarkNative.startShield()),
    result => (result?.status === 'denied' ? 'Android needs your permission to start protection. Tap again and choose OK.' : ''),
  );

  const runAction = (action) => {
    if (action === 'shield') return toggleShield();
    if (action === 'feed') return act(() => SatarkNative.updateThreatFeed(), result => (result?.error || `Threat list updated: ${result?.count || 0} sites.`));
    if (action === 'remote' || action === 'checklist') return onEmergency();
    if (SETTINGS_ACTIONS.has(action)) return SatarkNative.openSettingsPage({ page: action });
    return undefined;
  };

  let hero;
  if (risk === 'high') hero = { tone: 'danger', icon: ShieldAlert, title: 'High risk — act now', text: 'Several scam signs happened together. Don’t pay or share any OTP.' };
  else if (risk === 'warning') hero = { tone: 'warning', icon: AlertTriangle, title: 'Warning — check the alerts below', text: 'Satark noticed a scam sign recently.' };
  else if (!isNativeApp) hero = { tone: 'warning', icon: ShieldCheck, title: 'Message checks ready', text: 'Link blocking and screen-sharing protection run in the Android app.' };
  else if (shieldOn) hero = { tone: 'success', icon: ShieldCheck, title: 'You’re protected', text: 'Links, screen-sharing apps and scam signs are being watched on this phone.' };
  else hero = { tone: 'warning', icon: ShieldOff, title: 'Partly protected', text: 'Turn protection on to block scam links and watch for screen-sharing apps.' };
  const HeroIcon = hero.icon;

  return (
    <>
      <section className={`hero-card ${hero.tone}`} id="dashboard-status">
        <div className="hero-top">
          <HeroIcon size={34} />
          <div>
            <h2 id="dashboard-title">{hero.title}</h2>
            <p>{hero.text}</p>
          </div>
        </div>
        {isNativeApp && (
          <button type="button" className={`btn btn-block ${shieldOn ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleShield} disabled={busy} id="btn-protection-toggle">
            {shieldOn ? 'Protection ON — tap to turn off' : 'Turn protection ON'}
          </button>
        )}
        <div className="stat-row">
          <div className="stat" id="stat-blocked"><strong>{data?.threatsBlockedToday ?? 0}</strong><span>Threats blocked today</span></div>
          <div className="stat" id="stat-alerts"><strong>{alerts.length}</strong><span>Risk alerts</span></div>
          <div className="stat" id="stat-scan"><strong>{scanResult ? when(scanResult.time) : '—'}</strong><span>Last security scan</span></div>
        </div>
      </section>

      {message && <p className="notice" role="status" id="dashboard-message">{message}</p>}

      {alerts.length > 0 && (
        <section className="card" id="risk-alerts">
          <div className="card-title" style={{ color: 'var(--danger)' }}><AlertTriangle size={18} /> <h2>Current risk alerts</h2></div>
          <ul className="event-list">
            {alerts.slice(0, 5).map(alert => (
              <li key={alert.id} className={`event ${alert.severity}`}>
                <div className="row-between"><strong>{alert.title}</strong><span className="fine-print">{clock(alert.time)}</span></div>
                <p className="event-detail">{alert.detail}</p>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button type="button" className="btn btn-danger" onClick={onEmergency} id="btn-alert-steps">Safety steps</button>
            <button type="button" className="btn btn-secondary" onClick={() => act(dismissRiskAlerts)} id="btn-dismiss-alerts">I’m safe — dismiss</button>
          </div>
        </section>
      )}

      <div className="tile-grid">
        <button type="button" className="tile" onClick={() => onNavigate('protect')} id="tile-links">
          <Globe size={20} />
          <strong>Link protection</strong>
          <span className={`chip ${shieldOn ? 'success' : 'warning'}`}>{isNativeApp ? (shieldOn ? 'On' : 'Off') : 'App only'}</span>
          <span className="fine-print">
            {shield?.threatFeed?.count ? `${shield.threatFeed.count.toLocaleString()} reported sites` : 'Fake bank & phishing sites'}
          </span>
        </button>
        <button type="button" className="tile" onClick={() => onNavigate('calls')} id="tile-calls">
          <PhoneCall size={20} />
          <strong>Scam calls</strong>
          <span className={`chip ${data?.calls?.listening ? 'success' : 'primary'}`}>{data?.calls?.listening ? 'Listening' : 'Ready'}</span>
          <span className="fine-print">{data?.calls?.lastAlert ? `Last: ${data.calls.lastAlert.title}` : 'No scam call detected'}</span>
        </button>
        <button type="button" className="tile" onClick={() => onNavigate('protect')} id="tile-remote">
          <MonitorSmartphone size={20} />
          <strong>Screen sharing</strong>
          {!isNativeApp ? <span className="chip primary">App only</span>
            : locked ? <span className="chip danger">Locked</span>
              : remote?.anyActive ? <span className="chip danger">Active</span>
                : remoteApps.length ? <span className="chip warning">{remoteApps.length} installed</span>
                  : <span className="chip success">None</span>}
          <span className="fine-print">
            {remote?.anyActive ? 'A screen-sharing app is active' : remoteApps.length ? remoteApps.map(app => app.app).join(', ') : 'AnyDesk, TeamViewer…'}
          </span>
        </button>
        <button type="button" className="tile" onClick={() => onNavigate('protect')} id="tile-network">
          <Activity size={20} />
          <strong>Network activity</strong>
          <span className={`chip ${recentBlocked.length ? 'danger' : 'success'}`}>{recentBlocked.length ? 'Blocked' : 'Clear'}</span>
          <span className="fine-print">
            {recentBlocked[0] ? `${recentBlocked[0].app} → ${recentBlocked[0].target}` : (isNativeApp ? 'Nothing suspicious' : 'App only')}
          </span>
        </button>
      </div>

      <section className="card" id="scan-card">
        <div className="row-between">
          <div className="card-title"><Clock size={18} /> <h2>Security scan</h2></div>
          <button type="button" className="btn btn-ghost" onClick={scan} disabled={scanning} id="btn-scan">
            <RefreshCw size={14} /> {scanning ? 'Scanning…' : 'Scan now'}
          </button>
        </div>
        {scanResult ? (
          <>
            <p className="muted" id="scan-summary">
              {scanIssues.length ? `${scanIssues.length} thing${scanIssues.length > 1 ? 's' : ''} to fix` : 'No problems found'} · {when(scanResult.time)}
            </p>
            <ul className="scan-list" id="scan-checks">
              {(scanResult.checks || []).map(check => {
                const Icon = STATUS_ICON[check.status] || Info;
                return (
                  <li key={check.id} className={`scan-item ${check.status}`}>
                    <Icon size={18} />
                    <div>
                      <strong>{check.title}</strong>
                      <p className="fine-print">{check.detail}</p>
                      {check.action && isNativeApp && (
                        <button type="button" className="btn btn-ghost scan-action" onClick={() => runAction(check.action)} disabled={busy}>
                          Fix <ChevronRight size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted">{scanning ? 'Checking this phone…' : 'Not scanned yet.'}</p>
        )}
      </section>

      <section className="card" id="timeline-card">
        <div className="row-between">
          <div className="card-title"><Activity size={18} /> <h2>Incident timeline</h2></div>
          {(data?.timeline || []).length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => act(clearSecurityEvents)} id="btn-clear-timeline"><Trash2 size={14} /> Clear</button>
          )}
        </div>
        <p className="fine-print">Links, screen-sharing apps, scam calls and messages are joined here, so connected signs raise one high-risk warning.</p>
        {(data?.timeline || []).length ? (
          <ul className="event-list timeline" id="timeline">
            {data.timeline.slice(0, 15).map(event => (
              <li key={event.id} className={`event ${event.severity}`}>
                <div className="row-between"><strong>{event.title}</strong><span className="fine-print">{clock(event.time)}</span></div>
                <p className="event-detail">{event.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" id="timeline-empty">Nothing suspicious yet.</p>
        )}
      </section>

      <button type="button" className="btn btn-danger btn-block emergency-button" onClick={onEmergency} id="btn-emergency">
        <ShieldAlert size={18} /> I think I’m being scammed
      </button>

      <button type="button" className="btn btn-ghost btn-block" onClick={() => onNavigate('payment')} id="btn-open-payment">
        <CreditCard size={16} /> Try the payment check demo
      </button>
    </>
  );
}
