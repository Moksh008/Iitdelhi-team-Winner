import React, { useEffect, useRef, useState } from 'react';
import { Activity, ExternalLink, Mic, Shield, X } from 'lucide-react';
import { registerPlugin } from '@capacitor/core';
import { INDIAN_LANGUAGES } from '../../engine/languages';
import ClaimVerificationPanel from './ClaimVerificationPanel';

const isNativeApp = window.Capacitor?.isNativePlatform?.() === true;
const SatarkNative = isNativeApp ? registerPlugin('SatarkNative') : null;
const SPEECH_LANGUAGE_CODES = [
  'en', 'hi', 'hinglish', 'bn', 'gu', 'mr', 'ta', 'te',
  'kn', 'ml', 'pa', 'or', 'as', 'ur', 'ne'
];
const SPEECH_LANGUAGES = SPEECH_LANGUAGE_CODES.map(code => INDIAN_LANGUAGES[code]);
const getLanguageName = code => INDIAN_LANGUAGES[code]?.name || code;

export default function NativeFirstHome() {
  const [expanded, setExpanded] = useState(!isNativeApp);
  const [sensing, setSensing] = useState(false);
  const [status, setStatus] = useState('Stopped');
  const [backend, setBackend] = useState('Checking backend');
  const [overlay, setOverlay] = useState('Checking overlay permission');
  const [manualText, setManualText] = useState('');
  const [warning, setWarning] = useState(null);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [analysisError, setAnalysisError] = useState('');
  const [language, setLanguage] = useState('auto');
  const [recognizedTranscript, setRecognizedTranscript] = useState('');
  const recognitionRef = useRef(null);
  const speechTranscriptRef = useRef('');
  const sensingRef = useRef(false);
  const requestsRef = useRef(new Set());
  const sequenceRef = useRef(0);
  const analysisRequestRef = useRef(null);
  const manualAnalysisTimeoutRef = useRef(null);

  const apiUrl = (path) => `${apiBaseUrl.replace(/\/$/, '')}${path}`;

  useEffect(() => () => {
    sensingRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    requestsRef.current.forEach(controller => controller.abort());
    requestsRef.current.clear();
    if (manualAnalysisTimeoutRef.current !== null) {
      window.clearTimeout(manualAnalysisTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isNativeApp) return;
    SatarkNative.getApiBaseUrl()
      .then((result) => setApiBaseUrl(result?.baseUrl || ''))
      .catch(() => setBackend('Backend URL unavailable'));
  }, []);

  useEffect(() => {
    if (isNativeApp && !apiBaseUrl) return;
    fetch(apiUrl('/api/v1/health'))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((health) => setBackend(health.status === 'healthy' ? 'Backend connected' : 'Backend unhealthy'))
      .catch((error) => setBackend(`Backend unavailable${error.message ? ` (${error.message})` : ''}`));
    if (isNativeApp) {
      setOverlay('Enable overlay permission from Android settings');
    } else {
      setOverlay('Web mode: Android floating bubble is unavailable here');
    }
  }, [apiBaseUrl]);

  const startSensing = async () => {
    if (!isNativeApp) {
      if (!window.isSecureContext) {
        setStatus('Microphone speech recognition requires HTTPS or localhost. Open this site on localhost or HTTPS.');
        return;
      }
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setStatus('Live speech recognition is not supported by this browser. Use manual transcript input or Chrome/Edge.');
        return;
      }

      const selectedLanguage = SPEECH_LANGUAGES.find(item => item.code === language);
      const recognition = new SpeechRecognition();
      recognition.lang = selectedLanguage?.speechLocale || navigator.language || 'en-IN';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      sensingRef.current = true;
      speechTranscriptRef.current = '';
      setRecognizedTranscript('');
      setSensing(true);
      setAnalysisError('');
      setStatus(`Requesting microphone access (${selectedLanguage?.name || 'system language'} speech hint)…`);

      recognition.onstart = () => {
        if (sensingRef.current) {
          setStatus(`Microphone active · ${selectedLanguage?.name || 'system language'} · nearby speech only`);
        }
      };
      recognition.onresult = (event) => {
        const phrases = [];
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const speechResult = event.results[index];
          if (speechResult.isFinal) {
            const transcript = speechResult[0]?.transcript?.trim();
            if (transcript) phrases.push(transcript);
          }
        }
        const transcript = phrases.join(' ').trim();
        if (!transcript || !sensingRef.current) return;

        speechTranscriptRef.current = [speechTranscriptRef.current, transcript]
          .filter(Boolean)
          .join('\n');
        setRecognizedTranscript(speechTranscriptRef.current);
        setManualText(current => [current, transcript].filter(Boolean).join('\n'));
        void analyzeTranscript(speechTranscriptRef.current, language);
      };
      recognition.onerror = (event) => {
        if (!sensingRef.current || event.error === 'aborted') return;
        const messages = {
          'not-allowed': 'Microphone permission was denied. Allow microphone access in browser settings, then try again.',
          'service-not-allowed': 'The browser speech service is blocked. Use manual transcript input or another supported browser.',
          'audio-capture': 'No usable microphone was found. Check the microphone and try again.',
          'language-not-supported': `${selectedLanguage?.name || 'Selected language'} is not supported by this browser speech service. Choose another language or use manual input.`,
          network: 'Browser speech recognition needs a working network connection. Manual transcript input is still available.',
          'no-speech': 'No speech was detected yet. Keep the microphone active or enter a transcript manually.'
        };
        const message = messages[event.error] || `Speech recognition stopped (${event.error}). You can still analyze a manual transcript.`;
        setStatus(message);
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'network'].includes(event.error)) {
          sensingRef.current = false;
          setSensing(false);
          recognitionRef.current = null;
        }
      };
      recognition.onend = () => {
        if (!sensingRef.current || recognitionRef.current !== recognition) return;
        window.setTimeout(() => {
          if (!sensingRef.current || recognitionRef.current !== recognition) return;
          try {
            recognition.start();
          } catch (error) {
            sensingRef.current = false;
            recognitionRef.current = null;
            setSensing(false);
            setStatus(`Could not restart speech recognition: ${error.message || 'try again'}.`);
          }
        }, 400);
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (error) {
        sensingRef.current = false;
        recognitionRef.current = null;
        setSensing(false);
        setStatus(`Could not start microphone recognition: ${error.message || 'check browser permissions'}.`);
      }
      return;
    }
    try {
      const overlayResult = await SatarkNative.enableOverlay();
      if (overlayResult?.status === 'permission_requested') {
        setStatus('Overlay permission required');
        setExpanded(true);
        return;
      }
      const selectedLanguage = SPEECH_LANGUAGES.find(item => item.code === language);
      const result = await SatarkNative.startSensing({
        speechLocale: selectedLanguage?.speechLocale || '',
        language: language === 'auto' ? 'auto' : language,
        autoDetect: language === 'auto'
      });
      if (result?.status === 'permission_requested') {
        setStatus('Microphone permission required. Grant it, then tap Start Sensing again.');
        setExpanded(true);
        return;
      }
      setSensing(true);
      setStatus('Waiting for Input');
      setExpanded(false);
    } catch {
      setStatus('Input Unavailable');
      setExpanded(true);
    }
  };

  const stopSensing = async () => {
    sensingRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.stop();
    if (manualAnalysisTimeoutRef.current !== null) {
      window.clearTimeout(manualAnalysisTimeoutRef.current);
      manualAnalysisTimeoutRef.current = null;
    }
    requestsRef.current.forEach(controller => controller.abort());
    requestsRef.current.clear();
    analysisRequestRef.current = null;
    if (isNativeApp) await SatarkNative.stopSensing().catch(() => undefined);
    setSensing(false);
    setWarning(null);
    setStatus('Stopped');
    setExpanded(false);
  };

  const analyzeTranscript = async (inputText, inputLanguage = language) => {
    const text = inputText.trim();
    if (!text) return;
    setStatus('Analyzing');
    setAnalysisError('');
    const startedAt = performance.now();
    const endpoint = apiUrl('/api/v1/analyze-text');
    const controller = new AbortController();
    analysisRequestRef.current?.abort();
    analysisRequestRef.current = controller;
    requestsRef.current.add(controller);
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 10000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: `web-${Date.now()}`,
          sequence: sequenceRef.current++,
          text,
          language: inputLanguage,
          is_final: true
        }),
        signal: controller.signal
      });
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`Backend returned invalid JSON (HTTP ${response.status})`);
      }
      if (!response.ok) {
        throw new Error(typeof result.detail === 'string' ? result.detail : `HTTP ${response.status}`);
      }
      if (typeof result.action_tier !== 'number' || typeof result.risk_level !== 'string'
        || typeof result.detected_language !== 'string'
        || !Array.isArray(result.evidence_indicators) || !Array.isArray(result.entities)) {
        throw new Error('Unexpected analyzer response: required risk/evidence fields are missing.');
      }
      console.info('[SATARK web] analysis response', {
        endpoint,
        method: 'POST',
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt)
      });
      if (result.action_tier > 0) {
        setWarning({ ...result, transcript_excerpt: text });
        setExpanded(false);
      } else {
        setStatus(result.risk_level
          ? `Analysis complete · ${getLanguageName(result.detected_language || inputLanguage)} · ${result.risk_level.replace('_', ' ')}`
          : 'Analysis complete: Insufficient Evidence');
      }
    } catch (error) {
      if (error.name === 'AbortError' && !timedOut) return;
      const message = timedOut
        ? 'Analysis request timed out.'
        : error instanceof TypeError
          ? 'Cannot reach the backend. Confirm FastAPI is running and the URL is reachable.'
          : error.message || 'Analysis request failed.';
      console.warn('[SATARK web] analysis request failed', {
        endpoint,
        method: 'POST',
        durationMs: Math.round(performance.now() - startedAt),
        message
      });
      setAnalysisError(message);
      setStatus('Analysis failed');
    } finally {
      window.clearTimeout(timeoutId);
      requestsRef.current.delete(controller);
      if (analysisRequestRef.current === controller) analysisRequestRef.current = null;
    }
  };

  const handleManualTranscriptChange = (event) => {
    const text = event.target.value;
    setManualText(text);
    if (manualAnalysisTimeoutRef.current !== null) {
      window.clearTimeout(manualAnalysisTimeoutRef.current);
      manualAnalysisTimeoutRef.current = null;
    }
    analysisRequestRef.current?.abort();
    analysisRequestRef.current = null;
    if (!text.trim()) return;
    manualAnalysisTimeoutRef.current = window.setTimeout(() => {
      manualAnalysisTimeoutRef.current = null;
      void analyzeTranscript(text, language);
    }, 700);
  };

  if (warning) {
    return (
      <main className="satark-web-shell">
        <ClaimVerificationPanel result={warning} onClose={() => { setWarning(null); setExpanded(true); }} />
      </main>
    );
  }

  if (!expanded) {
    return (
      <div className="satark-setup-home">
        <div className="satark-setup-card">
          <Shield size={34} color="#38bdf8" />
          <h1>SATARK <span>| सतर्क</span></h1>
          <p className="setup-subtitle">Consent-based scam protection</p>
          <div className="setup-status"><Activity size={15} /> {status}</div>
          <div className="setup-status">{overlay}</div>
          <div className="setup-status">{backend}</div>
          <button type="button" className="primary-control" onClick={() => setExpanded(true)}>
            Open SATARK controls
          </button>
              <p className="setup-disclaimer">
            SATARK does not capture both sides of ordinary cellular or WhatsApp calls.
            It only processes supported, consented transcript input.
          </p>
          <p className="setup-disclaimer">
            Completed speech phrases are analyzed automatically. A warning and nearby search appear only when the real analyzer returns a warning tier and a location is extracted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <section className="compact-control-panel">
      <header>
        <strong><Shield size={18} /> SATARK</strong>
        <button type="button" onClick={() => setExpanded(false)} aria-label="Minimize controls"><X size={18} /></button>
      </header>
      <p className={sensing ? 'active-status' : 'muted-status'} aria-live="polite">{status}</p>
      <div className="setup-status"><Activity size={15} /> {backend}</div>
      {analysisError && <p className="analysis-error" role="alert">{analysisError}</p>}
      <label className="speech-language-label" htmlFor="speech-language">Speech language</label>
      <select
        id="speech-language"
        className="speech-language-select"
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        disabled={sensing}
      >
        <option value="auto">Auto detect (best effort)</option>
        {SPEECH_LANGUAGES.map(item => (
          <option key={item.code} value={item.code}>{item.nativeName} · {item.name}</option>
        ))}
      </select>
      <p className="setup-disclaimer">
        {isNativeApp
          ? 'Auto mode asks Android 14+ speech services to detect and switch language when supported. Older devices use their system language. Microphone only—not remote SIM or WhatsApp call audio.'
          : 'Auto mode uses the browser system-language hint; standard browser speech APIs do not expose automatic language switching. Choose a language for speech input. Browser speech may be processed online. Microphone only—not remote call audio.'}
      </p>
      <div className="compact-controls">
        <button type="button" className="primary-control" onClick={startSensing} disabled={sensing}>
          <Mic size={16} /> Start Sensing
        </button>
        <button type="button" className="secondary-control" onClick={stopSensing} disabled={!sensing}>
          Stop Sensing
        </button>
      </div>
      {recognizedTranscript && (
        <div className="recognized-transcript" aria-live="polite">
          <strong>Speech recognized</strong>
          <p>{recognizedTranscript}</p>
        </div>
      )}
      <div className="manual-test-form">
        <label htmlFor="manual-transcript">Manual transcript fallback</label>
        <textarea
          id="manual-transcript"
          value={manualText}
          onChange={handleManualTranscriptChange}
          placeholder="Paste a consented transcript for testing"
          rows={6}
        />
        <small>Analyzed automatically after you pause typing. A warning appears only when the analyzer finds relevant risk indicators.</small>
      </div>
      <p className="setup-disclaimer"><ExternalLink size={13} /> Manual text is sent to FastAPI. Nearby listings and phone numbers appear only when returned by the provider.</p>
    </section>
  );
}
