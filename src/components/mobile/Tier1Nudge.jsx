import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

/** Tier 1: a gentle, dismissible warning. The user can still pay. */
export default function Tier1Nudge({ message, onDismiss }) {
  if (!message) return null;
  return (
    <div className="alert-banner caution-banner" id="tier1-nudge-banner" role="alert">
      <AlertTriangle size={22} />
      <div style={{ flex: 1 }}>
        <strong>Check before you pay</strong>
        <p>{message}</p>
      </div>
      <button type="button" className="icon-button" onClick={onDismiss} id="dismiss-nudge-btn" aria-label="Dismiss warning">
        <X size={16} />
      </button>
    </div>
  );
}
