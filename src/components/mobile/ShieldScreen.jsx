import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, Ban, CheckCircle2, Globe, Link2, Lock, MonitorSmartphone, RefreshCw, ShieldAlert, ShieldCheck, Trash2, Unlock,
} from 'lucide-react';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import { REASON_TEXT } from '../../engine/linkRules';
import { checkLink } from '../../services/linkCheck';

const time = value => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ago = value => {
  const minutes = Math.round((Date.now() - value) / 60000);
  return minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
};

/** Verdict for one checked link, with the reason. */
function LinkVerdict({ result, expanded }) {
  if (!result) return null;
  if (result.invalid) return <p className="notice warning" id="link-verdict">That doesn’t look like a web link.</p>;
  if (result.blocked) {
    return (
      <div className="notice danger" id="link-verdict" role="alert">
        <div className="result-line"><ShieldAlert size={16} /> <strong>Dangerous: {REASON_TEXT[result.reason] || 'Blocked'}</strong></div>
        <p><strong>{result.host}</strong> {result.detail}. Don’t open it or enter any details.</p>
      </div>
    );
  }
  return (
    <div className={`notice ${result.shortener ? 'warning' : 'success'}`} id="link-verdict">
      <div className="result-line">
        {result.shortener ? <Link2 size={16} /> : <CheckCircle2 size={16} />}
        <strong>
          {result.shortener ? 'Short link — it hides where it goes'
            : result.official ? 'Official site' : result.allowed ? 'On your trusted list' : 'No known danger found'}
        </strong>
      </div>
      <p>
        {result.shortener
          ? 'Scammers use short links to hide fake sites. Satark can check where it leads without opening it.'
          : `${result.host} is not on any scam list${result.official ? ' and is an official domain' : ''}. Still, never enter an OTP or PIN on a page opened from a message.`}
      </p>
      {expanded && (
        <p className="fine-print" id="link-expanded">
          {expanded.hops?.length ? `Leads to: ${expanded.final}` : expanded.error ? `Could not follow it (${expanded.error}).` : 'It did not redirect anywhere.'}
        </p>
      )}
    </div>
  );
}

/**
 * Protect: the on-phone web shield and remote-access protection. Checks every
 * website an app looks up (scam lists, reported phishing sites, fake bank and
 * shopping sites), cuts screen-sharing apps off during a scam, and shows which
 * app connected where. Runs as a local VPN; nothing leaves the phone.
 */
export default function ShieldScreen({ active, onEmergency }) {
  const [state, setState] = useState(null);
  const [remote, setRemote] = useState(null);
  const [entries, setEntries] = useState([]);
  const [blockedOnly, setBlockedOnly] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [linkResult, setLinkResult] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [trustedInput, setTrustedInput] = useState('');

  const refresh = useCallback(async () => {
    if (!isNativeApp) return;
    const [next, log, remoteStatus] = await Promise.all([
      SatarkNative.getShieldState(),
      SatarkNative.getNetworkLog({ blockedOnly, limit: 150 }),
      SatarkNative.getRemoteAccessStatus(),
    ]);
    setState(next);
    setEntries(log.entries || []);
    setRemote(remoteStatus);
  }, [blockedOnly]);

  useEffect(() => {
    if (!active || !isNativeApp) return undefined;
    refresh().catch(() => undefined);
    // New lookups arrive all the time; refresh the log while this screen is open.
    const timer = window.setInterval(() => refresh().catch(() => undefined), 3000);
    let listener;
    SatarkNative.addListener('shieldUpdate', next => setState(next)).then(handle => { listener = handle; });
    return () => {
      window.clearInterval(timer);
      listener?.remove();
    };
  }, [active, refresh]);

  const act = async (task, done) => {
    setBusy(true);
    setMessage('');
    try {
      const result = await task();
      if (done) setMessage(done(result) || '');
      await refresh();
      return result;
    } catch (error) {
      setMessage(error?.message || 'Something went wrong.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const runLinkCheck = async (event) => {
    event?.preventDefault();
    setExpanded(null);
    setLinkResult(await checkLink(linkInput));
  };

  const expand = async () => {
    const result = await act(() => SatarkNative.expandLink({ url: linkInput }));
    if (!result) return;
    setExpanded(result);
    if (result.verdict) setLinkResult({ ...result.verdict, shortener: false, expandedFrom: linkInput });
  };

  const running = Boolean(state?.running);
  const locked = state?.lockedUntil > Date.now();
  const remoteApps = remote?.apps || state?.remoteAccessApps || [];
  const feed = state?.threatFeed;
  const trusted = state?.allowedDomains || [];

  const linkChecker = (
    <section className="card" id="link-check-card">
      <div className="card-title"><Link2 size={18} /> <h2>Check a link</h2></div>
      <p className="muted">Paste a link from an SMS, WhatsApp or e-mail before you open it.</p>
      <form className="inline-form" onSubmit={runLinkCheck}>
        <label htmlFor="link-input" className="sr-only">Link</label>
        <input id="link-input" className="input" value={linkInput} placeholder="e.g. sbi-kyc-update.com/login" autoComplete="off"
          onChange={event => { setLinkInput(event.target.value); setLinkResult(null); setExpanded(null); }} />
        <button type="submit" className="btn btn-primary" disabled={!linkInput.trim()} id="btn-link-check">Check</button>
      </form>
      <LinkVerdict result={linkResult} expanded={expanded} />
      {linkResult?.shortener && isNativeApp && !expanded && (
        <button type="button" className="btn btn-secondary btn-block" onClick={expand} disabled={busy} id="btn-link-expand">
          See where it leads (without opening it)
        </button>
      )}
      <p className="fine-print">
        Checked on this phone{isNativeApp ? ', including the downloaded list of reported phishing sites' : ''}. Satark checks the site
        name, so it can’t judge every page of a site or promise that every bad link is caught.
      </p>
    </section>
  );

  if (!isNativeApp) {
    return (
      <>
        {linkChecker}
        <section className="card" id="shield-web-note">
          <div className="card-title"><Globe size={18} /> <h2>Web shield</h2></div>
          <p className="notice">
            Blocking scam links in every app, locking screen-sharing apps during a scam call and the per-app network log work in the Android app.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="card" id="shield-card">
        <div className="row-between">
          <div className="card-title"><Globe size={18} /> <h2>Scam link blocking</h2></div>
          <span className={`chip ${running ? 'success' : 'warning'}`}>{running ? 'On' : 'Off'}</span>
        </div>
        <p className="muted">
          Checks every website an app on this phone tries to open and blocks known scam sites, reported phishing and malware sites,
          fake bank and shopping sites (e.g. “sbi-kyc-update.com”, “amaz0n-offer.in”) and short links that lead to them.
          Works through a local VPN — your browsing never leaves the phone.
        </p>
        {state && <p className="fine-print" id="shield-stats">{state.checked} lookups checked · {state.blocked} blocked</p>}
        <button type="button" id="btn-shield-toggle" className={`btn btn-block ${running ? 'btn-secondary' : 'btn-primary'}`} disabled={busy}
          onClick={() => act(
            () => (running ? SatarkNative.stopShield() : SatarkNative.startShield()),
            result => (result?.status === 'denied' ? 'Android needs your permission to start the web shield. Tap again and choose OK.' : ''),
          )}>
          {running ? 'Turn off' : 'Turn on'}
        </button>
        {state?.error && <p className="notice danger">{state.error}</p>}
        <div className="row-between feed-row" id="threat-feed">
          <span className="fine-print">
            Threat list: {feed?.count ? `${feed.count.toLocaleString()} reported sites, updated ${ago(feed.updatedAt)}` : 'not downloaded yet'}
            {feed?.error ? ` — ${feed.error}` : ''}
          </span>
          <button type="button" className="btn btn-ghost" disabled={busy || feed?.updating} id="btn-feed-update"
            onClick={() => act(() => SatarkNative.updateThreatFeed(), result => (result?.error || `Threat list updated: ${(result?.count || 0).toLocaleString()} sites.`))}>
            <RefreshCw size={14} /> {feed?.updating ? 'Updating…' : 'Update'}
          </button>
        </div>
        <p className="fine-print">
          The list of reported phishing and malware sites is downloaded once a day and checked on the phone. If Android’s Private DNS is
          set to a specific provider, lookups skip the shield. Only one VPN can run at a time.
        </p>
      </section>

      {linkChecker}

      <section className="card" id="remote-lock-card">
        <div className="row-between">
          <div className="card-title"><MonitorSmartphone size={18} /> <h2>Screen-sharing protection</h2></div>
          {locked && <span className="chip danger">Locked until {time(state.lockedUntil)}</span>}
        </div>
        <p className="muted">
          Scammers ask you to install AnyDesk, TeamViewer or similar apps to watch your screen and read OTPs. Satark warns when one becomes
          active, and during a scam alert routes its internet into Satark’s VPN and drops it.
        </p>
        {remoteApps.length ? (
          <ul className="list net-log" id="remote-apps">
            {remoteApps.map(item => (
              <li key={item.packageName} className={item.active || item.accessibility ? 'blocked' : ''}>
                <div className="row-between">
                  <strong>{item.app}</strong>
                  {item.active ? <span className="chip danger">{item.sessionRunning ? 'Session running' : `Active ${ago(item.lastActive)}`}</span>
                    : <span className="chip warning">Installed</span>}
                </div>
                {item.accessibility && <span className="fine-print">Can control your phone (Accessibility is on)</span>}
                <div className="btn-row">
                  <button type="button" className="btn btn-ghost" onClick={() => SatarkNative.openAppInfo({ packageName: item.packageName })}>Force stop</button>
                  <button type="button" className="btn btn-ghost" onClick={() => SatarkNative.uninstallApp({ packageName: item.packageName })}>Uninstall</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice success" id="remote-apps-none">No screen-sharing app is installed on this phone.</p>
        )}
        {(remote?.otherAccessibility || []).length > 0 && (
          <p className="notice warning" id="other-accessibility">
            Can read or control your screen: {remote.otherAccessibility.map(item => item.app).join(', ')}. Switch off any you don’t fully trust in
            {' '}<button type="button" className="link-button" onClick={() => SatarkNative.openSettingsPage({ page: 'accessibility' })}>Accessibility settings</button>.
          </p>
        )}
        {remote && !remote.usageAccess && (
          <p className="fine-print" id="usage-access-note">
            To notice a screen-sharing session even with link blocking off,{' '}
            <button type="button" className="link-button" onClick={() => SatarkNative.openSettingsPage({ page: 'usage' })}>allow usage access</button> for Satark.
          </p>
        )}
        <label className="row-between" htmlFor="auto-lock">
          <span>Lock automatically when a call looks like a scam</span>
          <input id="auto-lock" type="checkbox" checked={Boolean(state?.autoLock)}
            onChange={event => act(() => SatarkNative.setShieldOptions({ autoLock: event.target.checked }))} />
        </label>
        {locked ? (
          <button type="button" id="btn-unlock" className="btn btn-secondary btn-block" disabled={busy}
            onClick={() => act(() => SatarkNative.unlockRemoteAccess(), () => 'Screen-sharing apps can use the internet again.')}>
            <Unlock size={16} /> Unlock now
          </button>
        ) : (
          <button type="button" id="btn-lock" className="btn btn-danger btn-block" disabled={busy || !remoteApps.length}
            onClick={() => act(() => SatarkNative.lockRemoteAccess({ minutes: 30 }), result => ({
              locked: 'Screen-sharing apps are cut off for 30 minutes.',
              needs_shield: 'Turn on scam link blocking first — the lock uses the same local VPN.',
              no_apps: 'No screen-sharing app is installed.',
            }[result?.status]))}>
            <Lock size={16} /> Cut off for 30 minutes
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-block" onClick={onEmergency} id="btn-shield-checklist">
          <ShieldAlert size={16} /> Safety steps if someone is on your screen
        </button>
        <p className="fine-print">
          Satark can’t close another app by itself. The lock stops most sessions; to be sure, also force-stop or uninstall the app, or turn on airplane mode.
          {locked ? ' While locked, scam-link checks for other apps pause.' : ''}
        </p>
      </section>

      {message && <p className="notice" role="status" id="shield-message">{message}</p>}

      <section className="card" id="trusted-card">
        <div className="card-title"><ShieldCheck size={18} /> <h2>Trusted sites</h2></div>
        <p className="muted">Sites you trust are never blocked, even if they look suspicious.</p>
        <form className="inline-form" onSubmit={(event) => {
          event.preventDefault();
          const domain = trustedInput.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
          if (!domain.includes('.')) return;
          act(() => SatarkNative.allowDomain({ domain, allowed: true }), () => `${domain} is now trusted.`).then(() => setTrustedInput(''));
        }}>
          <label htmlFor="trusted-input" className="sr-only">Trusted site</label>
          <input id="trusted-input" className="input" value={trustedInput} onChange={event => setTrustedInput(event.target.value)} placeholder="e.g. mybank.example" autoComplete="off" />
          <button type="submit" className="btn btn-secondary" disabled={!trustedInput.includes('.') || busy}>Add</button>
        </form>
        {trusted.length ? (
          <ul className="list net-log" id="trusted-list">
            {trusted.map(domain => (
              <li key={domain}>
                <div className="row-between">
                  <span className="net-target">{domain}</span>
                  <button type="button" className="btn btn-ghost" onClick={() => act(() => SatarkNative.allowDomain({ domain, allowed: false }), () => `${domain} removed from trusted sites.`)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="fine-print">No trusted sites added.</p>}
      </section>

      <section className="card" id="network-log-card">
        <div className="row-between">
          <div className="card-title"><Activity size={18} /> <h2>Network activity</h2></div>
          <button type="button" className="btn btn-ghost" id="btn-clear-log" disabled={busy || !entries.length}
            onClick={() => act(() => SatarkNative.clearNetworkLog())}>
            <Trash2 size={14} /> Clear
          </button>
        </div>
        <div className="chip-row" role="tablist" aria-label="Filter">
          <button type="button" role="tab" aria-selected={!blockedOnly} className={`chip-button ${!blockedOnly ? 'active' : ''}`} onClick={() => setBlockedOnly(false)} id="log-all">All</button>
          <button type="button" role="tab" aria-selected={blockedOnly} className={`chip-button ${blockedOnly ? 'active' : ''}`} onClick={() => setBlockedOnly(true)} id="log-blocked">Blocked</button>
        </div>
        {!state?.appIdentification && <p className="fine-print">App names need Android 10 or newer.</p>}
        {entries.length ? (
          <ul className="list net-log" id="network-log">
            {entries.map(entry => {
              const isBlocked = entry.action === 'blocked';
              const allowed = trusted.includes(entry.target);
              return (
                <li key={`${entry.time}-${entry.uid}-${entry.target}`} className={isBlocked ? 'blocked' : ''}>
                  <div className="row-between">
                    <strong>{entry.app}</strong>
                    <span className="fine-print">{time(entry.lastTime || entry.time)}{entry.count > 1 ? ` · ×${entry.count}` : ''}</span>
                  </div>
                  <span className="net-target">{entry.target}</span>
                  {isBlocked && <span className="chip danger"><Ban size={12} /> {REASON_TEXT[entry.reason] || 'Blocked'}</span>}
                  {entry.detail && <span className="fine-print">{entry.detail}</span>}
                  {entry.kind === 'dns' && isBlocked && entry.reason !== 'remote_access_lock' && (
                    <button type="button" className="btn btn-ghost" disabled={busy}
                      onClick={() => act(() => SatarkNative.allowDomain({ domain: entry.target, allowed: !allowed }),
                        () => (allowed ? `${entry.target} will be blocked again.` : `${entry.target} is now trusted and will not be blocked.`))}>
                      {allowed ? 'Block again' : 'Trust this site'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted" id="network-log-empty">
            {running ? 'Nothing yet. Websites apps open will appear here.' : 'Turn on scam link blocking to see which app connects where.'}
          </p>
        )}
        <p className="fine-print">Kept only on this phone (last 400 entries).</p>
      </section>
    </>
  );
}
