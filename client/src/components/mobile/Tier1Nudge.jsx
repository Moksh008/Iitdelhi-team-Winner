import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function Tier1Nudge({ message, onDismiss, scamCategory, activeLanguage }) {
  if (!message) return null;

  return (
    <div className="tier1-nudge-banner" id="tier1-nudge-banner" role="alert">
      <div className="nudge-icon">
        <AlertTriangle size={20} />
      </div>

      <div className="nudge-content">
        <div className="nudge-header">
          {activeLanguage?.nudgeTitle || 'Heads Up · Potential Scam'}
        </div>
        <div className="nudge-body">
          {message}
        </div>
      </div>

      <button 
        className="nudge-dismiss-btn" 
        onClick={onDismiss}
        id="dismiss-nudge-btn"
        title="Dismiss warning"
      >
        <X size={16} />
      </button>
    </div>
  );
}
