import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

/** Outcome of the on-device rules for a checked message or recording. */
export default function RuleResult({ result, onAlert, idPrefix = 'check' }) {
  if (!result) return null;
  if (result.action_tier > 0) {
    return (
      <div className="alert-banner" role="alert" id={`${idPrefix}-result`}>
        <AlertTriangle size={22} />
        <div>
          <strong>{result.title}</strong>
          <p>{result.advice}</p>
          <button type="button" id={`btn-${idPrefix}-details`} className="btn btn-danger" onClick={() => onAlert(result)}>
            View details & nearby help
          </button>
        </div>
      </div>
    );
  }
  if (result.indicators.length > 0) {
    return (
      <div className="notice warning" id={`${idPrefix}-result`}>
        <div className="result-line"><Info size={16} /> <strong>Some warning signs, not enough for an alert</strong></div>
        <ul className="list">{result.indicators.map(item => <li key={item.cluster}>{item.label}</li>)}</ul>
      </div>
    );
  }
  return (
    <div className="notice success result-line" id={`${idPrefix}-result`}>
      <CheckCircle2 size={16} /> No scam signs found. Still verify before paying anyone new.
    </div>
  );
}
