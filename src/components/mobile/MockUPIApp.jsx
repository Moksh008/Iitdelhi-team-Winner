import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';

/** Simulated UPI "send money" form used only by the payment demo. */
export default function MockUPIApp({ scenario, onInitiatePayment }) {
  const initial = scenario?.suggestedPayment || {
    payeeName: 'Rahul K.',
    payeeVPA: 'rahulk@okhdfcbank',
    amount: 4800,
    userMedian: 3500,
    isFirstTimePayee: true,
  };
  const [payeeName, setPayeeName] = useState(initial.payeeName);
  const [payeeVPA, setPayeeVPA] = useState(initial.payeeVPA);
  const [amount, setAmount] = useState(String(initial.amount));

  // A new scripted call brings its own suggested payee and amount.
  useEffect(() => {
    setPayeeName(initial.payeeName);
    setPayeeVPA(initial.payeeVPA);
    setAmount(String(initial.amount));
  }, [scenario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = payeeName.trim() && /.+@.+/.test(payeeVPA.trim()) && Number(amount) > 0;

  const submit = (event) => {
    event.preventDefault();
    if (!valid) return;
    onInitiatePayment({
      payeeName: payeeName.trim(),
      payeeVPA: payeeVPA.trim(),
      amount: Number(amount),
      userMedian: initial.userMedian,
      isFirstTimePayee: initial.isFirstTimePayee,
    });
  };

  return (
    <form className="card" onSubmit={submit} id="upi-form">
      <div className="row-between">
        <h2>Send money</h2>
        <span className="chip">Simulated UPI</span>
      </div>
      <div className="field">
        <label htmlFor="input-payee-name">Payee name</label>
        <input id="input-payee-name" className="input" value={payeeName} onChange={e => setPayeeName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="input-payee-vpa">UPI ID</label>
        <input id="input-payee-vpa" className="input" value={payeeVPA} onChange={e => setPayeeVPA(e.target.value)} placeholder="name@bank" required />
      </div>
      <div className="field">
        <label htmlFor="input-payment-amount">Amount</label>
        <div className="amount-field">
          <span>₹</span>
          <input id="input-payment-amount" className="input" type="number" inputMode="numeric" min="1" value={amount} onChange={e => setAmount(e.target.value)} required />
        </div>
        <p className="fine-print">Your usual payment is about ₹{Number(initial.userMedian || 0).toLocaleString('en-IN')}.{initial.isFirstTimePayee ? ' This payee is new to you.' : ''}</p>
      </div>
      <button type="submit" id="btn-submit-upi-pay" className="btn btn-primary btn-block" disabled={!valid}>
        <Send size={16} /> Pay ₹{Number(amount || 0).toLocaleString('en-IN')}
      </button>
    </form>
  );
}
