'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePageTitle } from '@/lib/use-page-title';


interface DeletedRecord {
  id: string;
  type: string;
  firmId: string;
  firmName: string;
  description: string;
  amount: string;
  deletedAt: string;
  deletedBy: string | null;
  deletedByName: string | null;
}

const TYPE_BADGES: Record<string, string> = {
  Invoice: 'badge-blue',
  Claim: 'badge-green',
  'Mileage Claim': 'badge-green',
  Receipt: 'badge-amber',
  Payment: 'badge-gray',
  'Bank Statement': 'badge-navy',
};

const TYPE_OPTIONS = ['All', 'Invoice', 'Claim', 'Payment', 'Bank Statement'];

function daysRemaining(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const expiry = new Date(deleted);
  expiry.setDate(expiry.getDate() + 30);
  const now = new Date();
  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${yyyy}.${mm}.${dd} ${time}`;
}

function formatAmount(val: string) {
  return Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  showFirm?: boolean; // platform owner sees firm column
}

export default function DeletedItemsPage({ showFirm = false }: Props) {
  usePageTitle('Deleted Items');
  const [records, setRecords] = useState<DeletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('All');
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<DeletedRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/deleted-records');
      const json = await res.json();
      if (json.data) setRecords(json.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const handleRestore = async (record: DeletedRecord) => {
    setRestoring(record.id);
    setError(null);
    try {
      const modelMap: Record<string, string> = {
        Invoice: 'invoice',
        Claim: 'claim',
        'Mileage Claim': 'claim',
        Receipt: 'claim',
        Payment: 'payment',
        'Bank Statement': 'bankStatement',
      };
      const res = await fetch('/api/deleted-records/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelMap[record.type], id: record.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to restore');
      } else {
        setRecords(prev => prev.filter(r => r.id !== record.id));
      }
    } catch {
      setError('Failed to restore');
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  };

  const filtered = typeFilter === 'All'
    ? records
    : records.filter(r => {
        if (typeFilter === 'Claim') return r.type === 'Claim' || r.type === 'Mileage Claim' || r.type === 'Receipt';
        return r.type === typeFilter;
      });

  return (
    <>
      <div className="flex-1 flex flex-col overflow-hidden ledger-binding">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Deleted Items</h1>
        </header>

        <main className="flex-1 overflow-auto p-8 pl-14 space-y-6 paper-texture animate-in">
          {/* Filters */}
          <div className="flex items-center gap-3">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt}
                onClick={() => setTypeFilter(opt)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  typeFilter === opt
                    ? 'btn-thick-navy'
                    : 'btn-thick-white'
                }`}
              >
                {opt}
              </button>
            ))}
            <span className="ml-auto text-xs text-[var(--text-secondary)]">
              {filtered.length} item{filtered.length !== 1 ? 's' : ''} — auto-purged after 30 days
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="bg-white p-12 text-center">
              <p className="text-sm text-[var(--text-secondary)]">Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white p-12 text-center">
              <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No Deleted Items</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {typeFilter === 'All' ? 'Nothing has been deleted recently.' : `No deleted ${typeFilter.toLowerCase()}s found.`}
              </p>
            </div>
          ) : (
            <div className="bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left">
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Type</th>
                    {showFirm && <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Firm</th>}
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Amount</th>
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Deleted By</th>
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Deleted</th>
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-center">Days Left</th>
                    <th className="px-6 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((record, idx) => {
                    const days = daysRemaining(record.deletedAt);
                    return (
                      <tr key={record.id} className={`group text-body-md hover:bg-[var(--surface-low)] transition-colors ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td className="px-6 py-3">
                          <span className={`${TYPE_BADGES[record.type] || 'badge-gray'} text-xs`}>{record.type}</span>
                        </td>
                        {showFirm && <td className="px-6 py-3 text-[var(--text-secondary)] text-sm">{record.firmName}</td>}
                        <td className="px-6 py-3 text-[var(--text-primary)] font-medium">{record.description}</td>
                        <td className="px-6 py-3 text-right font-mono text-sm">{formatAmount(record.amount)}</td>
                        <td className="px-6 py-3 text-sm text-[var(--text-secondary)]">{record.deletedByName || '—'}</td>
                        <td className="px-6 py-3 text-sm text-[var(--text-secondary)]">{formatDate(record.deletedAt)}</td>
                        <td className="px-6 py-3 text-center">
                          <span className={`text-xs font-semibold ${days <= 7 ? 'text-red-600' : days <= 14 ? 'text-amber-600' : 'text-[var(--text-secondary)]'}`}>
                            {days}d
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => setConfirmRestore(record)}
                            disabled={restoring === record.id}
                            className="btn-thick-navy text-xs font-medium px-3 py-1.5"
                          >
                            {restoring === record.id ? 'Restoring...' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Restore confirmation modal */}
      {confirmRestore && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60]" onClick={() => setConfirmRestore(null)} />
          <div className="fixed inset-0 z-[61] flex items-center justify-center p-4">
            <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-md flex flex-col">
              <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                <h3 className="text-white font-bold text-sm uppercase tracking-wider">Confirm Restore</h3>
                <button onClick={() => setConfirmRestore(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mx-auto"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-[var(--text-primary)]">
                  Restore <strong>{confirmRestore.type}</strong>: {confirmRestore.description}?
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  The record will be restored as <strong>pending approval</strong>. You will need to re-approve it to generate journal entries.
                </p>
              </div>
              <div className="flex gap-3 p-5 bg-[var(--surface-low)]">
                <button
                  onClick={() => handleRestore(confirmRestore)}
                  disabled={restoring === confirmRestore.id}
                  className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold"
                >
                  {restoring === confirmRestore.id ? 'Restoring...' : 'Restore'}
                </button>
                <button
                  onClick={() => setConfirmRestore(null)}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
