import React, { useState } from 'react';
import { Building2, Shield, AlertOctagon, CheckCircle2, Search, ExternalLink, Lock, FileSpreadsheet } from 'lucide-react';

export default function BankReviewerConsole({ reports = [], onPlaceLien, onEscalate1930 }) {
  const [searchTerm, setSearchTerm] = useState('');

  // Default illustrative records if none submitted yet
  const defaultReports = [
    {
      report_id: 'SATARK-CBI8912',
      timestamp_utc: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      scam_metadata: {
        scam_category: 'Digital Arrest',
        scam_title: 'CBI Video Call Digital Arrest',
        conversation_score_final: 0.98
      },
      payment_metadata: {
        amount_inr: 480000,
        hashed_payee_vpa: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        masked_payee_preview: 'rbi***@okhdfcbank'
      },
      status: 'Under Review'
    },
    {
      report_id: 'SATARK-FDX3401',
      timestamp_utc: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
      scam_metadata: {
        scam_category: 'Customs Seizure',
        scam_title: 'FedEx Narcotics Parcel Clearance',
        conversation_score_final: 0.94
      },
      payment_metadata: {
        amount_inr: 85000,
        hashed_payee_vpa: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
        masked_payee_preview: 'cus***@icici'
      },
      status: 'Lien Placed (2hr Freeze)'
    }
  ];

  const allReports = [...reports, ...defaultReports];
  const filtered = allReports.filter(r => 
    r.report_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.scam_metadata?.scam_category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="studio-panel" id="bank-reviewer-console">
      {/* Macro Data Banner (Slide 2 of PDF) */}
      <div className="panel-card" style={{ background: 'linear-gradient(135deg, rgba(16,23,42,0.9) 0%, rgba(30,41,59,0.7) 100%)' }}>
        <div className="panel-card-header">
          <h2 className="panel-card-title">
            <Building2 size={18} color="#38bdf8" />
            <span>National Cybercrime Coordination Centre (I4C) & Bank FRM Portal</span>
          </h2>
          <span className="badge-pill warn">Live Mule Link</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', fontSize: '0.75rem' }}>
          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>FY25 UPI Losses:</div>
            <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>
              ₹981 Cr <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>(Lok Sabha)</span>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>Unreported Frauds:</div>
            <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>
              51% <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>(LocalCircles)</span>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>AI Voice Scam Target:</div>
            <div style={{ color: '#38bdf8', fontWeight: 800, fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>
              47% <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>(McAfee)</span>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.65rem', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ color: '#94a3b8' }}>Mule Freezing SLA:</div>
            <div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.05rem', fontFamily: 'var(--font-mono)' }}>
              &lt; 3 mins <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>(SOP Ready)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Incident Feed Table */}
      <div className="panel-card">
        <div className="panel-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h2 className="panel-card-title">
              <Shield size={18} color="#10b981" />
              <span>User-Approved Tier 3 Report Packs ({filtered.length})</span>
            </h2>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', width: '220px' }}>
            <input 
              type="text" 
              className="upi-text-input" 
              placeholder="Search reports..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              id="input-search-reports"
            />
          </div>
        </div>

        <div className="incident-table-wrapper">
          <table className="incident-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>When</th>
                <th>Scam Category</th>
                <th>Attempted Sum</th>
                <th>Hashed Payee ID</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38bdf8' }}>
                    {item.report_id}
                  </td>
                  <td style={{ color: '#94a3b8' }}>
                    {new Date(item.timestamp_utc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <span className="badge-pill warn" style={{ fontSize: '0.68rem' }}>
                      {item.scam_metadata?.scam_category}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#f8fafc' }}>
                    ₹ {Number(item.payment_metadata?.amount_inr || 0).toLocaleString('en-IN')}
                  </td>
                  <td title={item.payment_metadata?.hashed_payee_vpa} style={{ fontFamily: 'var(--font-mono)', color: '#94a3b8', fontSize: '0.7rem' }}>
                    {item.payment_metadata?.hashed_payee_vpa?.substring(0, 12)}...
                  </td>
                  <td>
                    <span className={`badge-pill ${item.status?.includes('Lien') ? 'safe' : 'danger'}`} style={{ fontSize: '0.68rem' }}>
                      {item.status || 'Pending Review'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button 
                        className="action-btn-lien"
                        onClick={() => onPlaceLien && onPlaceLien(item.report_id)}
                        title="Place 2-hour lien on beneficiary per Supreme Court SOP"
                        id={`btn-lien-${item.report_id}`}
                      >
                        Place Lien
                      </button>
                      <button 
                        className="btn-outline"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.68rem' }}
                        onClick={() => onEscalate1930 && onEscalate1930(item.report_id)}
                        title="Escalate to Cyber Police"
                        id={`btn-escalate-${item.report_id}`}
                      >
                        1930 &rarr;
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
