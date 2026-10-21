import React, { useEffect, useRef, useState } from 'react';
import { Mic, Shield, ShieldAlert, X } from 'lucide-react';
import { startNativeSensing, stopNativeSensing } from '../../native/satarkNative';

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function CompactSensingSurface({ engine, activeLanguage }) {
  const [sensing, setSensing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [manualText, setManualText] = useState('');
  const [status, setStatus] = useState('Stopped');
  const [warning, setWarning] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    engine.endCallSession();
  }, [engine]);

  const processText = (text) => {
    const value = text.trim();
    if (!value) return;

    const result = engine.ingestChunk(value);
    if (result.tier >= 1) {
      setWarning({
        level: result.tier >= 2 ? 'high' : 'caution',
        excerpt: result.cleanText || value,
        reasons: result.detectedTactics || []
      });
    }
  };

  const startSensing = async () => {
    await startNativeSensing();
    engine.startCallSession({ source: SpeechRecognition ? 'browser speech recognition' : 'manual test input' });
    setSensing(true);
    setExpanded(false);
    setWarning(null);

    if (!SpeechRecognition) {
      setStatus('Audio/transcript input unavailable');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = activeLanguage?.speechLocale || 'en-IN';
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index].isFinal) {
          processText(event.results[index][0].transcript);
        }
      }
    };
    recognition.onerror = () => setStatus('Audio/transcript input unavailable');
    recognition.onend = () => {
      if (sensing) setStatus('Audio/transcript input unavailable');
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setStatus('Sensing active: browser speech input');
    } catch {
      setStatus('Audio/transcript input unavailable');
    }
  };

  const stopSensing = async () => {
    await stopNativeSensing();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    engine.endCallSession();
    setSensing(false);
    setWarning(null);
    setStatus('Stopped');
    setExpanded(false);
  };

  const submitManualText = (event) => {
    event.preventDefault();
    processText(manualText);
    setManualText('');
  };

  if (!expanded && !warning) {
    return (
      <button
        type="button"
        className={`compact-shield-bubble ${sensing ? 'sensing' : ''}`}
        onClick={() => setExpanded(true)}
        aria-label={sensing ? 'Open active Satark controls' : 'Open Satark controls'}
      >
        {sensing ? <ShieldAlert size={24} /> : <Shield size={24} />}
      </button>
    );
  }

  if (warning) {
    return (
      <section className={`compact-warning-panel ${warning.level}`} aria-live="assertive">
        <header>
          <strong><ShieldAlert size={18} /> SATARK</strong>
          <button type="button" onClick={() => setWarning(null)} aria-label="Dismiss warning">
            <X size={18} />
          </button>
        </header>
        <h2>{warning.level === 'high' ? 'High-risk warning' : 'Caution'}</h2>
        <p className="warning-excerpt">“{warning.excerpt}”</p>
        {warning.reasons.length > 0 && <p>Signals: {warning.reasons.join(', ')}</p>}
        <p>Verify independently before sending money. Satark does not place payments or calls.</p>
        <button type="button" className="secondary-control" onClick={stopSensing}>Stop Sensing</button>
      </section>
    );
  }

  return (
    <section className="compact-control-panel">
      <header>
        <strong><Shield size={18} /> SATARK</strong>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Minimize Satark controls">
          <X size={18} />
        </button>
      </header>
      <p className={sensing ? 'active-status' : 'muted-status'}>{status}</p>
      <div className="compact-controls">
        <button type="button" className="primary-control" onClick={startSensing} disabled={sensing}>
          <Mic size={16} /> Start Sensing
        </button>
        <button type="button" className="secondary-control" onClick={stopSensing} disabled={!sensing}>
          Stop Sensing
        </button>
      </div>
      {sensing && (
        <form onSubmit={submitManualText} className="manual-test-form">
          <label htmlFor="manual-transcript">Manual transcript test input</label>
          <textarea
            id="manual-transcript"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Enter supplied transcript text"
            rows={3}
          />
          <button type="submit" className="secondary-control" disabled={!manualText.trim()}>
            Analyze text
          </button>
        </form>
      )}
    </section>
  );
}
