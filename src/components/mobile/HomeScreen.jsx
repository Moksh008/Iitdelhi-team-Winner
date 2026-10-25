import React, { useEffect, useState } from 'react';
import { AlertTriangle, Link2, Mic, ShieldAlert, Square } from 'lucide-react';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import RecordingCheck from './RecordingCheck';
import RuleResult from './RuleResult';
import { extractLinks, REASON_TEXT } from '../../engine/linkRules';
import { findTriggerStatement } from '../../engine/localAnalyzer';
import { checkLink } from '../../services/linkCheck';
import { recordSecurityEvent } from '../../services/securityEvents';

/**
 * Scam call guardian: start/stop on-device listening, see what was heard live,
 * check a recording, and check a pasted message (its words and its links) with
 * the same local rules. Nothing here leaves the phone.
 */
export default function HomeScreen({ engine, onAlert, onCritical }) {
  const [live, setLive] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [links, setLinks] = useState(null);

  useEffect(() => {
    let listener;
    SatarkNative.getListeningState().then(setLive).catch(() => undefined);
    SatarkNative.addListener('listeningUpdate', setLive).then(handle => { listener = handle; });
    return () => listener?.remove();
  }, []);

  const listening = Boolean(live?.listening);
  const lines = live?.lines || [];

  const start = async () => {
    if (!isNativeApp) {
      setNotice('Live listening works in the Android app, where speech is turned into text on the phone. You can still check a message below.');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const overlay = await SatarkNative.enableOverlay();
      if (overlay?.status === 'permission_requested') {
        setNotice('Allow "Display over other apps" for Satark, come back, then tap Start again.');
        return;
      }
      const started = await SatarkNative.startSensing({});
      if (started?.status === 'permission_requested') {
        setNotice('Allow microphone access, then tap Start again.');
      } else if (started?.status === 'speech_model_missing') {
        setNotice('The speech model is missing from this build.');
      }
    } catch (error) {
      setNotice(`Could not start listening: ${error?.message || 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    await SatarkNative.stopSensing().catch(() => undefined);
    setBusy(false);
    setNotice('Stopped. Nothing is being recorded.');
  };

  const check = async () => {
    const text = message.trim();
    if (!text) return;
    // Each checked message is judged on its own.
    engine.startCallSession({ source: 'manual' });
    const { analysis } = engine.ingestChunk(text);
    const trigger = analysis.action_tier > 0 ? findTriggerStatement(text) : '';
    const checked = { ...analysis, transcript_excerpt: text, trigger };
    setResult(checked);
    onCritical?.(text, checked);
    if (analysis.action_tier > 0) {
      recordSecurityEvent({ kind: 'scam_message', title: `Scam message: ${analysis.title}`, detail: trigger ? `Triggered by: “${trigger}”` : text.slice(0, 160) });
    }
    // Links in the message are checked too (on Android also against the reported-phishing list).
    const found = extractLinks(text);
    setLinks(found.length ? 'checking' : null);
    if (!found.length) return;
    const verdicts = await Promise.all(found.map(link => checkLink(link.url)));
    setLinks(verdicts);
    const dangerous = verdicts.find(verdict => verdict.blocked);
    if (dangerous) {
      recordSecurityEvent({ kind: 'link_flagged', title: `Dangerous link in a message: ${dangerous.host}`, detail: `${dangerous.host} ${dangerous.detail}.` });
    }
  };

  const clear = () => {
    setMessage('');
    setResult(null);
    setLinks(null);
  };

  const dangerousLinks = Array.isArray(links) ? links.filter(link => link.blocked) : [];

  const statusText = listening
    ? live?.status || 'Listening'
    : (isNativeApp ? 'Tap to start listening' : 'Listening is available in the Android app');

  return (
    <>
      {/* Uploading a recording comes first: it works even where the live microphone is unreliable. */}
      <RecordingCheck engine={engine} onAlert={onAlert} onCritical={onCritical} />

      <section className="card listen-card" aria-label="Listening">
        <button
          type="button"
          id="btn-listen"
          className={`listen-button ${listening ? 'listening' : ''}`}
          onClick={listening ? stop : start}
          disabled={busy}
          aria-pressed={listening}
        >
          <div>
            {listening ? <Square size={30} /> : <Mic size={34} />}
            <span>{listening ? 'Stop' : 'Start'}</span>
          </div>
        </button>
        <p className={`listen-status ${live?.micBlocked && listening ? 'danger' : ''}`} aria-live="polite">{statusText}</p>
        {listening && (
          <div className={`progress ${live?.hearingSpeech ? 'speaking' : ''}`} aria-label="Microphone level">
            <span style={{ width: `${Math.max(3, Math.round((live?.level || 0) * 100))}%` }} />
          </div>
        )}
        <p className="fine-print">
          Satark hears your phone&apos;s microphone only — put calls on speaker. Speech becomes text on this phone and audio is not saved.
        </p>
        {notice && <p className="notice" role="status">{notice}</p>}
      </section>

      {live?.alert && (
        <div className="alert-banner" role="alert">
          <AlertTriangle size={22} />
          <div>
            <strong>{live.alert.title || 'Possible scam'}</strong>
            <p>{live.alert.advice}</p>
            <button type="button" id="btn-live-alert" className="btn btn-danger" onClick={() => onAlert(live.alert)}>
              View details & nearby help
            </button>
          </div>
        </div>
      )}

      {(listening || lines.length > 0) && (
        <section className="card" aria-live="polite">
          <div className="row-between">
            <h2>What Satark heard</h2>
            {live?.transcribing && <span className="chip warning">Converting…</span>}
            {!live?.transcribing && live?.hearingSpeech && <span className="chip success">Hearing speech</span>}
          </div>
          {lines.length === 0 ? (
            <p className="muted">Nothing yet. Speak, then pause — each sentence appears a moment later.</p>
          ) : (
            <ul className="transcript-lines" id="transcript-lines">
              {lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
            </ul>
          )}
          <p className="fine-print">Hindi, English and Hinglish, written in Roman letters.</p>
        </section>
      )}

      <section className="card">
        <h2>Check a message</h2>
        <div className="field">
          <label htmlFor="message-input">Paste an SMS, WhatsApp message or what a caller said</label>
          <textarea
            id="message-input"
            className="textarea"
            value={message}
            onChange={event => { setMessage(event.target.value); setResult(null); setLinks(null); }}
            placeholder="e.g. Your KYC is pending, share the OTP or your account will be blocked"
          />
        </div>
        <div className="btn-row">
          <button type="button" id="btn-check" className="btn btn-primary" onClick={check} disabled={!message.trim()}>Check</button>
          <button type="button" id="btn-clear" className="btn btn-secondary" onClick={clear} disabled={!message && !result}>Clear</button>
        </div>

        {dangerousLinks.length > 0 && (
          <div className="alert-banner" role="alert" id="check-links-danger">
            <ShieldAlert size={22} />
            <div>
              <strong>Dangerous link{dangerousLinks.length > 1 ? 's' : ''} — don’t open</strong>
              {dangerousLinks.map(link => (
                <p key={link.host}><strong>{link.host}</strong>: {REASON_TEXT[link.reason] || 'dangerous'} — it {link.detail}.</p>
              ))}
            </div>
          </div>
        )}
        <RuleResult result={result} onAlert={onAlert} idPrefix="check" hideSafe={dangerousLinks.length > 0} />
        {Array.isArray(links) && links.length > dangerousLinks.length && (
          <ul className="list" id="check-links">
            {links.filter(link => !link.blocked).map(link => (
              <li key={link.host}>
                <Link2 size={13} /> <strong>{link.host}</strong>{' '}
                <span className="muted">
                  {link.shortener ? '— a short link that hides where it goes; check it in Protect before opening'
                    : link.official ? '— official site' : '— no known danger found'}
                </span>
              </li>
            ))}
          </ul>
        )}
        {links === 'checking' && <p className="muted">Checking links…</p>}
        <p className="fine-print">Words and links are checked on this phone. Nothing you paste is sent anywhere.</p>
      </section>
    </>
  );
}
