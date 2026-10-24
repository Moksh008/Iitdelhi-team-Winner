import React, { useEffect, useState } from 'react';
import { Clock, MessageSquare, ShieldAlert } from 'lucide-react';
import { trustedContactSmsLink } from '../../engine/trustedContact';

export const PAUSE_SECONDS = 60;

/**
 * Tier 2: shown only when the conversation AND the payment both look risky.
 * It pauses, asks one question, and leaves every choice to the user — the
 * payment is never blocked.
 */
export default function Tier2PauseModal({ scenario, paymentDetails, trustedContact, scamType, onConfirmReport, onKnownPerson, onBypassPayment, onCancelPayment }) {
  // Count down to a fixed end time: timers are throttled when the app is in the
  // background, so counting ticks would make the pause longer than 60 s.
  const [secondsLeft, setSecondsLeft] = useState(PAUSE_SECONDS);

  useEffect(() => {
    const endsAt = Date.now() + PAUSE_SECONDS * 1000;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const question = scenario?.targetQuestion || 'Did the caller ask you to move money to a "safe" or "verification" account?';

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="pause-title" id="tier2-pause-modal">
      <div className="sheet">
        <div className="card-title" style={{ color: 'var(--danger)' }}>
          <ShieldAlert size={26} />
          <h2 id="pause-title">Pause before you pay</h2>
        </div>
        <p className="muted">
          This call and this payment both look like a common scam. Take a moment before entering your UPI PIN.
        </p>
        <div className="notice">
          <strong>{question}</strong>
          <p className="fine-print" style={{ marginTop: 6 }}>
            ₹{Number(paymentDetails?.amount || 0).toLocaleString('en-IN')} to {paymentDetails?.payeeVPA}
          </p>
        </div>

        <button type="button" className="btn btn-danger btn-block" onClick={onConfirmReport} id="btn-pause-report">
          Yes — help me report it
        </button>
        <button type="button" className="btn btn-secondary btn-block" onClick={onCancelPayment} id="btn-pause-cancel">
          Don&apos;t pay
        </button>
        {trustedContact && (
          <a className="btn btn-secondary btn-block" href={trustedContactSmsLink(trustedContact, scamType)} id="btn-pause-trusted-contact">
            <MessageSquare size={16} /> Tell {trustedContact.name || 'my trusted contact'}
          </a>
        )}
        <button type="button" className="btn btn-secondary btn-block" onClick={onKnownPerson} id="btn-pause-known">
          No — I know this person
        </button>
        {secondsLeft > 0 ? (
          <p className="countdown" id="pause-countdown"><Clock size={16} /> You can continue to pay in {secondsLeft}s</p>
        ) : (
          <button type="button" className="btn btn-ghost btn-block" onClick={onBypassPayment} id="btn-pause-proceed-anyway">
            I understand the risk — continue to pay
          </button>
        )}
        <p className="fine-print">Satark never blocks a payment. You stay in control.</p>
      </div>
    </div>
  );
}
