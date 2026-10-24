import React, { useState } from 'react';
import { CheckCircle2, Download, ExternalLink, MessageSquare, Phone } from 'lucide-react';
import { SatarkNative, isNativeApp } from '../../native/satarkNative';
import { trustedContactMessage, trustedContactSmsLink } from '../../engine/trustedContact';

/**
 * Tier 3: a report pack prepared only after the user confirmed. Nothing is
 * submitted automatically; the user saves/shares it and reports themselves.
 */
export default function Tier3ReportPack({ reportPack, trustedContact, onDone }) {
  const [saved, setSaved] = useState('');

  const scamType = reportPack?.scam_metadata?.scam_category;
  // Only the kind of scam is shared, never what was said, the amount or the payee.
  const familyLink = trustedContact
    ? trustedContactSmsLink(trustedContact, scamType)
    : `sms:?body=${encodeURIComponent(trustedContactMessage(scamType))}`;

  const save = async () => {
    const json = JSON.stringify(reportPack, null, 2);
    const fileName = `${reportPack?.report_id || 'satark-report'}.json`;
    if (isNativeApp) {
      // Android WebView has no web share or downloads: use the native share sheet.
      await SatarkNative.shareText({ title: `Satark report ${reportPack?.report_id || ''}`.trim(), text: json })
        .then(() => setSaved('Share sheet opened — choose where to save or send it.'))
        .catch(() => setSaved('Could not open the share sheet.'));
      return;
    }
    const file = new File([json], fileName, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Satark report pack' });
        setSaved('Shared.');
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return; // the user closed the share sheet
        // Sharing unavailable here: fall back to saving the file.
      }
    }
    try {
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSaved(`Saved as ${fileName}.`);
    } catch {
      setSaved('Could not save on this device.');
    }
  };

  const rows = [
    ['Suspected pattern', reportPack?.scam_metadata?.scam_category || 'Unspecified'],
    ['Amount', `₹${reportPack?.payment_metadata?.amount_inr?.toLocaleString('en-IN')}`],
    ['Payee', reportPack?.payment_metadata?.masked_payee_preview],
    ['Payee fingerprint', `${reportPack?.payment_metadata?.hashed_payee_vpa?.substring(0, 16)}…`],
    ['Report ID', reportPack?.report_id],
  ];

  return (
    <>
      <section className="card" id="tier3-report-pack-screen">
        <h2>Report pack</h2>
        <p className="muted">Prepared on this phone because you asked. It is not sent anywhere unless you share it.</p>
        <dl className="details">
          {rows.map(([label, value]) => (
            <div key={label} className="row-between"><dt className="muted">{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
        <ul className="list fine-print">
          <li>No audio and no call transcript are included.</li>
          <li>The payee&apos;s UPI ID is masked and fingerprinted.</li>
        </ul>
        <button type="button" className="btn btn-primary btn-block" onClick={save} id="btn-save-report"><Download size={16} /> Save or share</button>
        {saved && <p className="notice success result-line" role="status"><CheckCircle2 size={16} /> {saved}</p>}
      </section>

      <section className="card">
        <h2>Report it yourself</h2>
        <a className="btn btn-secondary btn-block" href="tel:1930" id="btn-call-1930"><Phone size={16} /> Call 1930 — Cyber Crime Helpline</a>
        <a className="btn btn-secondary btn-block" href="https://cybercrime.gov.in/" target="_blank" rel="noopener noreferrer" id="btn-open-ncrp">
          <ExternalLink size={16} /> Open cybercrime.gov.in
        </a>
        <a className="btn btn-secondary btn-block" href={familyLink} id="btn-notify-family-contact">
          <MessageSquare size={16} /> {trustedContact ? `Tell ${trustedContact.name || 'my trusted contact'}` : 'Message a family member'}
        </a>
        <p className="fine-print">Satark does not contact banks, police or anyone else on its own.</p>
      </section>

      <button type="button" className="btn btn-ghost btn-block" onClick={onDone} id="btn-report-done">Back to payment check</button>
    </>
  );
}
