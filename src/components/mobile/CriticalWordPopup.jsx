import React, { useMemo } from 'react';
import { MapPin, Phone, ShieldAlert } from 'lucide-react';
import { extractLocation } from '../../engine/locationExtractor';

/**
 * Pop-up raised the moment a scam looks possible: the rules raised a warning or
 * a critical word (OTP/PIN, "safe account", a screen-sharing app...) was found.
 * Shows which words were heard, where in the conversation, and the place the
 * caller mentioned. Advice only; nothing is blocked.
 */
export default function CriticalWordPopup({ popup, onDetails, onClose }) {
  const place = useMemo(() => extractLocation(popup?.analysis?.transcript_excerpt || ''), [popup]);
  if (!popup) return null;
  const { cues, analysis } = popup;
  const scam = analysis?.action_tier > 0;
  // Critical words first; otherwise the warning signs behind the alert.
  const reasons = cues.length ? cues : (analysis?.indicators || []);
  const high = analysis?.risk_level === 'high';
  return (
    <div className="sheet-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="critical-title" id="critical-popup">
      <div className="sheet">
        <div className="card-title" style={{ color: 'var(--danger)' }}>
          <ShieldAlert size={26} />
          <h2 id="critical-title">{cues.length ? 'Alert: critical word detected' : 'Alert: possible scam'}</h2>
        </div>
        {scam && analysis.title && (
          <p>
            <strong id="critical-scam-type">{analysis.title}</strong>{' '}
            <span className={`chip ${high ? 'danger' : 'warning'}`}>{high ? 'High risk' : 'Caution'}</span>
          </p>
        )}
        <ul className="list" id="critical-reasons">
          {reasons.map(cue => (
            <li key={cue.cluster}>
              <strong>{cue.label}</strong>
              <span className="muted"> — “{cue.terms.map(term => term.replace(/\*$/, '…')).join('”, “')}”</span>
              {cue.context && <blockquote className="quote critical-context">Heard: “{cue.context}”</blockquote>}
            </li>
          ))}
        </ul>
        {place && (
          <p className="notice" id="critical-place">
            <MapPin size={14} /> Place mentioned: <strong>“{place.text}”</strong>. Details show police, hospitals and banks near it so you can check the claim.
          </p>
        )}
        <p className="notice danger">
          {scam && analysis.advice
            ? analysis.advice
            : 'Never share an OTP or PIN, move money to a “safe account” or install an app because a caller asked. Banks and police never do this.'}
        </p>
        <button type="button" className="btn btn-danger btn-block" onClick={onDetails} id="btn-critical-details">
          View details & nearby help
        </button>
        <a className="btn btn-secondary btn-block" href="tel:1930" id="btn-critical-1930"><Phone size={16} /> Call 1930</a>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose} id="btn-critical-dismiss">Dismiss</button>
      </div>
    </div>
  );
}
