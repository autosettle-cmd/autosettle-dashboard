'use client';

import { useState, useEffect } from 'react';

interface GlAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
}

interface Props {
  firmId: string;
  onComplete: () => void;
  onClose: () => void;
}

export default function SetupGlDefaultsModal({ firmId, onComplete, onClose }: Props) {
  const [accounts, setAccounts] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [tradePayables, setTradePayables] = useState('');
  const [staffClaims, setStaffClaims] = useState('');
  const [tradeReceivables, setTradeReceivables] = useState('');
  const [retainedEarnings, setRetainedEarnings] = useState('');

  useEffect(() => {
    // Fetch GL accounts for this firm
    fetch(`/api/gl-accounts?firmId=${firmId}`)
      .then(r => r.json())
      .then(j => {
        setAccounts(j.data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Fetch current firm defaults from firms/details
    fetch('/api/firms/details')
      .then(r => r.json())
      .then(j => {
        const firm = (j.data ?? []).find((f: { id: string }) => f.id === firmId);
        if (firm) {
          setTradePayables(firm.default_trade_payables_gl_id ?? '');
          setStaffClaims(firm.default_staff_claims_gl_id ?? '');
          setTradeReceivables(firm.default_trade_receivables_gl_id ?? '');
          setRetainedEarnings(firm.default_retained_earnings_gl_id ?? '');
        }
      })
      .catch(() => {});
  }, [firmId]);

  const handleSave = async () => {
    if (!tradePayables || !staffClaims) {
      setError('Trade Payables and Staff Claims Payable are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/firms/${firmId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_trade_payables_gl_id: tradePayables || null,
          default_staff_claims_gl_id: staffClaims || null,
          default_trade_receivables_gl_id: tradeReceivables || null,
          default_retained_earnings_gl_id: retainedEarnings || null,
        }),
      });
      if (res.ok) {
        window.dispatchEvent(new Event('setup-step-completed'));
        onComplete();
      } else {
        const json = await res.json();
        setError(json.error || 'Failed to save');
      }
    } catch { setError('Failed to save'); }
    finally { setSaving(false); }
  };

  const liabilityAccounts = accounts.filter(a => a.account_type === 'Liability');
  const assetAccounts = accounts.filter(a => a.account_type === 'Asset');
  const equityAccounts = accounts.filter(a => a.account_type === 'Equity');

  const selectClass = 'input-recessed w-full text-sm';
  const labelClass = 'block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1';

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-lg flex flex-col animate-in" onClick={e => e.stopPropagation()}>
        <div className="bg-[var(--primary)] px-5 py-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-white uppercase tracking-wide">GL Defaults</h2>
          <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">Set default contra accounts used in journal entries. Trade Payables and Staff Claims are required.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">No GL accounts found. Import a Chart of Accounts first.</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Trade Payables (Invoices) *</label>
                <select value={tradePayables} onChange={e => setTradePayables(e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Staff Claims Payable *</label>
                <select value={staffClaims} onChange={e => setStaffClaims(e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Trade Receivables (Sales)</label>
                <select value={tradeReceivables} onChange={e => setTradeReceivables(e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {assetAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Retained Earnings (Year-End)</label>
                <select value={retainedEarnings} onChange={e => setRetainedEarnings(e.target.value)} className={selectClass}>
                  <option value="">Select...</option>
                  {equityAccounts.map(a => <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-thick-white px-4 py-2 text-sm font-medium">Cancel</button>
            <button onClick={handleSave} disabled={saving || loading || accounts.length === 0} className="btn-approve px-4 py-2 text-sm font-bold disabled:opacity-40">
              {saving ? 'Saving...' : 'Save Defaults'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
