import React, { useEffect, useState } from 'react';
import { CheckCircle2, FlaskConical, Info } from 'lucide-react';
import { SCENARIOS } from '../../engine/scenarios';
import { getTrustedContact } from '../../engine/trustedContact';
import MockUPIApp from './MockUPIApp';
import Tier1Nudge from './Tier1Nudge';
import Tier2PauseModal from './Tier2PauseModal';
import Tier3ReportPack from './Tier3ReportPack';

/**
 * Demonstrates the dual-signal check with a simulated UPI app. Android does not
 * let other apps see real UPI payments, so this screen is clearly a demo.
 */
export default function PaymentDemo({ engine }) {
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const [conversation, setConversation] = useState(null);
  const [nudge, setNudge] = useState(null);
  const [pause, setPause] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [reportPack, setReportPack] = useState(null);
  const [trustedContact, setTrustedContact] = useState(null);

  // Choosing a scripted call runs it through the on-device rules straight away.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // In real use full pauses are limited to 2 a week; each demo call starts fresh.
      engine.resetAlertBudget();
      const { callerReported } = await engine.startCallSession(scenario.caller);
      if (cancelled) return;
      let last = null;
      for (const chunk of scenario.chunks) last = engine.ingestChunk(chunk.text).analysis;
      engine.endCallSession();
      setConversation({
        score: engine.rollingC,
        title: last?.title || null,
        category: last?.category || null,
        callerReported,
      });
      setNudge(null);
      setOutcome(null);
    })();
    return () => { cancelled = true; };
  }, [scenario, engine]);

  const pay = async (payment) => {
    const result = await engine.evaluatePaymentContext(payment);
    setNudge(null);
    setOutcome(null);
    if (result.decisionTier === 2) {
      setTrustedContact(await getTrustedContact().catch(() => null));
      setPause({ payment, result });
    } else if (result.decisionTier === 1) {
      setNudge(scenario.targetNudge || 'Something about this call looked unusual. Check the payee before entering your PIN.');
      const budget = /budget/i.test(result.reason || '');
      setOutcome({
        tone: 'warning',
        text: budget
          ? 'Warning shown instead of a pause: Satark limits full pauses to 2 a week so they stay meaningful. You could still continue to the PIN screen.'
          : 'Warning shown. In a real UPI app you could still continue to the PIN screen.',
      });
    } else if (/muted/i.test(result.reason || '')) {
      setOutcome({ tone: 'success', text: 'No warning shown: you dismissed this kind of warning several times recently, so Satark is holding it back for a few hours. A full pause can still appear.' });
    } else {
      setOutcome({ tone: 'success', text: 'No warning needed. In a real UPI app you would continue to the PIN screen.' });
    }
  };

  const dismissNudge = () => {
    engine.recordDismissal(conversation?.category);
    setNudge(null);
  };

  const report = async () => {
    const pack = await engine.buildTier3ReportPack(
      { category: conversation?.title || scenario.category, title: scenario.title },
      pause.payment,
      'en'
    );
    setPause(null);
    setReportPack(pack);
  };

  if (reportPack) {
    return <Tier3ReportPack reportPack={reportPack} trustedContact={trustedContact} onDone={() => { setReportPack(null); setOutcome({ tone: 'success', text: 'Report pack ready. Payment not made.' }); }} />;
  }

  const risky = (conversation?.score || 0) >= engine.thetaNudge;

  return (
    <>
      <div className="demo-ribbon" role="note">
        <FlaskConical size={18} />
        <span><strong>Demo.</strong> A simulated UPI app — Satark cannot see real UPI payments, and never blocks a payment.</span>
      </div>

      <section className="card">
        <h2>1. Pick a call</h2>
        <div className="field">
          <label htmlFor="demo-scenario">Scripted call</label>
          <select
            id="demo-scenario"
            className="select"
            value={scenario.id}
            onChange={event => setScenario(SCENARIOS.find(item => item.id === event.target.value))}
          >
            {SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.title.replace(/^\d+\.\s*/, '')}</option>)}
          </select>
        </div>
        {conversation && (
          <p className={`notice ${risky ? 'warning' : 'success'} result-line`} id="demo-conversation">
            {risky ? <Info size={16} /> : <CheckCircle2 size={16} />}
            {risky ? `Call looks risky: ${conversation.title}` : 'Call looks normal'}
          </p>
        )}
        {conversation?.callerReported && (
          <p className="notice warning result-line" id="demo-caller-reported">
            <Info size={16} /> This number is on Satark&apos;s signed list of reported scam numbers (demo list).
          </p>
        )}
      </section>

      <p className="section-label">2. Try to pay</p>
      <Tier1Nudge message={nudge} onDismiss={dismissNudge} />
      <MockUPIApp scenario={scenario} onInitiatePayment={pay} />
      {outcome && (
        <p className={`notice ${outcome.tone}`} role="status" id="demo-outcome">{outcome.text}</p>
      )}

      {pause && (
        <Tier2PauseModal
          scenario={scenario}
          paymentDetails={pause.payment}
          trustedContact={trustedContact}
          scamType={conversation?.title}
          onConfirmReport={report}
          onCancelPayment={() => { setPause(null); setOutcome({ tone: 'success', text: 'Payment cancelled. Good call — verify first.' }); }}
          onKnownPerson={async () => {
            await engine.softenPayeeTrust(pause.payment.payeeVPA);
            setPause(null);
            setOutcome({ tone: 'success', text: 'Marked as someone you know. Payments to this UPI ID will be treated as less unusual. In a real app you would continue to the PIN screen.' });
          }}
          onBypassPayment={() => {
            setPause(null);
            setOutcome({ tone: 'warning', text: 'You chose to continue. In a real app you would now enter your UPI PIN.' });
          }}
        />
      )}
    </>
  );
}
