import React, { useEffect, useState } from 'react';
import { FileAudio } from 'lucide-react';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import RuleResult from './RuleResult';
import { findTriggerStatement } from '../../engine/localAnalyzer';
import { recordSecurityEvent } from '../../services/securityEvents';

const clock = seconds => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Check a recording: the user picks a voice note, call recording or any audio
 * file; it is turned into text on the phone and checked by the same rules as a
 * live call. Works even though Android mutes other apps' microphones during calls.
 */
export default function RecordingCheck({ engine, onAlert, onCritical }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [recording, setRecording] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let listener;
    SatarkNative.addListener('recordingProgress', update => {
      if (update?.stage === 'decoding') setProgress('Reading the recording…');
      if (update?.stage === 'transcribing') {
        setProgress(update.total > 1 ? `Turning speech into text… part ${Math.min(update.done + 1, update.total)} of ${update.total}` : 'Turning speech into text…');
      }
    }).then(handle => { listener = handle; });
    return () => listener?.remove();
  }, []);

  /** Runs the transcript through the same rule session as a live call. */
  const analyse = async (outcome) => {
    if (outcome?.status === 'cancelled') return;
    if (outcome?.status !== 'ok') {
      setError(outcome?.message || 'Could not check this recording.');
      return;
    }
    await engine.startCallSession({ source: 'recording' });
    let analysis = null;
    for (const segment of outcome.segments) analysis = engine.ingestChunk(segment.text).analysis;
    engine.endCallSession();
    const transcript = outcome.segments.map(segment => segment.text).join('\n');
    const trigger = analysis?.action_tier > 0 ? findTriggerStatement(transcript) : '';
    const checked = analysis
      ? { ...analysis, transcript_excerpt: transcript.slice(-400), trigger }
      : { action_tier: 0, indicators: [], transcript_excerpt: '' };
    setRecording(outcome);
    setResult(checked);
    if (analysis) onCritical?.(transcript, checked);
    if (analysis?.action_tier > 0) {
      recordSecurityEvent({ kind: 'scam_recording', title: `Scam recording: ${analysis.title}`, detail: trigger ? `Triggered by: “${trigger}”` : '' });
    }
  };

  const run = async (action) => {
    setBusy(true);
    setError('');
    setRecording(null);
    setResult(null);
    setProgress('');
    try {
      await analyse(await action());
    } catch (err) {
      setError(err?.message || 'Could not check this recording.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <section className="card" id="recording-card">
      <div className="card-title"><FileAudio size={18} /> <h2>Upload a recording</h2></div>
      <p className="muted">
        Pick a voice note, call recording or any audio file. Satark turns it into text on this phone and checks it for scam signs.
      </p>
      {isNativeApp ? (
        <button type="button" id="btn-pick-recording" className="btn btn-primary btn-block" onClick={() => run(() => SatarkNative.pickRecording())} disabled={busy}>
          {busy ? 'Checking…' : 'Upload recording'}
        </button>
      ) : (
        <p className="notice" id="recording-web-note">Checking recordings works in the Android app, where speech is turned into text on the phone.</p>
      )}
      {busy && progress && <p className="notice" role="status" id="recording-progress">{progress}</p>}
      {error && <p className="notice danger" role="alert" id="recording-error">{error}</p>}

      {recording && (
        <>
          <p className="fine-print" id="recording-meta">
            {recording.name} · {clock(recording.durationSeconds)} long · checked in {((recording.totalMs || 0) / 1000).toFixed(1)} s
          </p>
          {recording.segments.length === 0 ? (
            <p className="muted" id="recording-empty">No speech could be made out in this recording.</p>
          ) : (
            <ul className="transcript-lines" id="recording-lines">
              {recording.segments.map(segment => (
                <li key={`${segment.start}-${segment.text}`}><span className="fine-print">{clock(segment.start)}</span> {segment.text}</li>
              ))}
            </ul>
          )}
          <RuleResult result={result} onAlert={onAlert} idPrefix="recording" />
        </>
      )}
      <p className="fine-print">The recording is read on this phone only. It is not uploaded or kept.</p>
    </section>
  );
}
