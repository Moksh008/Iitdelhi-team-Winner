import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, Globe, Lock, Mic, Settings2, Trash2, UserCheck } from 'lucide-react';
import { clearPlaceCache } from '../../services/osmPlaces';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import { clearTrustedContact, getTrustedContact, setTrustedContact } from '../../engine/trustedContact';

const LLM_TEXT = {
  not_installed: 'Not installed',
  downloading: 'Downloading…',
  verifying: 'Checking the download…',
  ready: 'Installed — works offline',
  failed: 'Download failed',
  unsupported: 'Not supported on this phone',
  unavailable: 'Android app only',
};

const mb = bytes => `${Math.round((bytes || 0) / 1e6)} MB`;

/** Settings: on-device models, privacy and permissions. */
export default function SettingsScreen() {
  const [models, setModels] = useState(null);
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  useEffect(() => {
    getTrustedContact().then(setContact).catch(() => setContact(null));
  }, []);

  const saveContact = async () => {
    setMessage('');
    try {
      const saved = await setTrustedContact({ name: contactName, number: contactNumber });
      setContact(saved);
      setContactName('');
      setContactNumber('');
      setMessage('Trusted contact saved on this phone.');
    } catch (error) {
      setMessage(error?.message || 'Could not save the contact.');
    }
  };

  const removeContact = async () => {
    await clearTrustedContact().catch(() => undefined);
    setContact(null);
    setMessage('Trusted contact removed.');
  };

  const refresh = useCallback(() => {
    SatarkNative.getModelStatus().then(setModels).catch(() => setModels(null));
  }, []);

  useEffect(() => {
    refresh();
    let listener;
    SatarkNative.addListener('llmDownloadProgress', progress => {
      setModels(current => ({ ...(current || {}), llm: { ...(current?.llm || {}), ...progress } }));
    }).then(handle => { listener = handle; });
    return () => listener?.remove();
  }, [refresh]);

  const llm = models?.llm || { state: isNativeApp ? 'not_installed' : 'unavailable' };
  const speechReady = models?.speech?.state === 'ready';
  const percent = llm.totalBytes ? Math.round((llm.bytesDownloaded / llm.totalBytes) * 100) : 0;

  const run = async (action, done) => {
    setMessage('');
    try {
      await action();
      if (done) setMessage(done);
    } catch (error) {
      setMessage(error?.message || 'Something went wrong.');
    }
    refresh();
  };

  return (
    <>
      <p className="section-label">On-device AI</p>
      <section className="card">
        <div className="row-between">
          <div className="card-title"><Mic size={18} /> <h2>Speech to text</h2></div>
          <span className={`chip ${speechReady ? 'success' : ''}`} id="speech-status">
            {isNativeApp ? (speechReady ? 'Ready' : 'Missing') : 'Android app only'}
          </span>
        </div>
        <p className="muted">Whisper Tiny Hinglish runs on this phone for Hindi, English and Hinglish. Built in, no download needed.</p>
      </section>

      <section className="card" id="llm-card">
        <div className="row-between">
          <div className="card-title"><Cpu size={18} /> <h2>AI explanations</h2></div>
          <span className={`chip ${llm.state === 'ready' ? 'success' : llm.state === 'failed' ? 'danger' : ''}`} id="llm-status">
            {LLM_TEXT[llm.state] || llm.state}
          </span>
        </div>
        <p className="muted">
          Optional. A small language model (Qwen3-0.6B, about 640 MB) writes a short plain-language note for each warning,
          on this phone. Scam detection works without it.
        </p>
        {llm.state === 'downloading' && (
          <>
            <div className="progress" aria-label="Download progress"><span style={{ width: `${percent}%` }} /></div>
            <p className="fine-print">{mb(llm.bytesDownloaded)} of {mb(llm.totalBytes)}</p>
          </>
        )}
        {llm.detail && (llm.state === 'failed' || llm.state === 'unsupported') && <p className="notice danger">{llm.detail}</p>}
        {isNativeApp && (
          <div className="btn-row">
            {(llm.state === 'not_installed' || llm.state === 'failed') && (
              <button type="button" id="btn-llm-download" className="btn btn-primary" onClick={() => run(() => SatarkNative.downloadLlm())}>
                Download (Wi-Fi recommended)
              </button>
            )}
            {llm.state === 'downloading' && (
              <button type="button" id="btn-llm-cancel" className="btn btn-secondary" onClick={() => run(() => SatarkNative.cancelLlmDownload(), 'Download paused. Tap Download to resume.')}>
                Cancel
              </button>
            )}
            {llm.state === 'ready' && (
              <button type="button" id="btn-llm-remove" className="btn btn-danger" onClick={() => run(() => SatarkNative.deleteLlm(), 'AI model removed.')}>
                <Trash2 size={16} /> Remove
              </button>
            )}
          </div>
        )}
      </section>

      <p className="section-label">Trusted contact</p>
      <section className="card" id="trusted-contact-card">
        <div className="card-title"><UserCheck size={18} /> <h2>Someone to tell</h2></div>
        <p className="muted">
          When Satark pauses a payment, you can message this person in one tap. The message only says you may be on a scam
          call. It never includes what was said, the amount or who you were paying, and you press send yourself.
        </p>
        {contact ? (
          <>
            <p className="notice success" id="trusted-contact-current">
              <strong>{contact.name || 'Trusted contact'}</strong> · {contact.number}
            </p>
            <button type="button" id="btn-trusted-remove" className="btn btn-secondary btn-block" onClick={removeContact}>
              <Trash2 size={16} /> Remove
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="trusted-name">Name</label>
              <input id="trusted-name" className="input" value={contactName} maxLength={40} onChange={event => setContactName(event.target.value)} placeholder="e.g. Priya (daughter)" />
            </div>
            <div className="field">
              <label htmlFor="trusted-number">Phone number</label>
              <input id="trusted-number" className="input" type="tel" inputMode="tel" value={contactNumber} onChange={event => setContactNumber(event.target.value)} placeholder="+91 98xxx xxxxx" />
            </div>
            <button type="button" id="btn-trusted-save" className="btn btn-primary btn-block" onClick={saveContact} disabled={!contactNumber.trim()}>
              Save
            </button>
          </>
        )}
        <p className="fine-print">Stored encrypted on this phone only.</p>
      </section>

      <p className="section-label">Privacy</p>
      <section className="card">
        <div className="card-title"><Lock size={18} /> <h2>Stays on this phone</h2></div>
        <ul className="list">
          <li>Microphone audio — turned into text here, then discarded.</li>
          <li>What was said — checked by built-in rules, kept only while listening.</li>
          <li>AI notes — written by the on-device model. No cloud AI is used.</li>
          <li>Report packs — only created and shared when you choose.</li>
          <li>Scores and warning history — encrypted on this phone, deleted automatically after 1 to 30 days.</li>
          <li>Satark never asks for UPI PINs, OTPs or passwords.</li>
        </ul>
      </section>

      <section className="card">
        <div className="card-title"><Globe size={18} /> <h2>Uses the internet</h2></div>
        <ul className="list">
          <li>Nearby search sends only the place name mentioned in the call (or that you type) to free OpenStreetMap services. Your phone&apos;s location is never used.</li>
          <li>Map images come from OpenStreetMap.</li>
          <li>The AI model is downloaded once from Hugging Face, only if you tap Download.</li>
          <li>“Find phone number” opens a public map search in your browser.</li>
        </ul>
        <button type="button" id="btn-clear-cache" className="btn btn-secondary btn-block" onClick={() => { clearPlaceCache(); setMessage('Saved place searches cleared.'); }}>
          <Trash2 size={16} /> Clear saved place searches
        </button>
      </section>

      <p className="section-label">Permissions</p>
      <section className="card">
        <ul className="list">
          <li><strong>Microphone</strong> — only while listening is on.</li>
          <li><strong>Display over other apps</strong> — for the floating warning bubble during calls.</li>
        </ul>
        {isNativeApp && (
          <button type="button" id="btn-open-app-settings" className="btn btn-secondary btn-block" onClick={() => run(() => SatarkNative.openAppSettings())}>
            <Settings2 size={16} /> Change permissions in Android settings
          </button>
        )}
      </section>

      {message && <p className="notice success" role="status" id="settings-message">{message}</p>}
      <p className="fine-print" style={{ textAlign: 'center' }}>Satark 2.3 · on-device scam shield</p>
    </>
  );
}
