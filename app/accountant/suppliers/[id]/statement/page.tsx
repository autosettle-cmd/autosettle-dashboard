'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { generateSOAPdf } from '@/lib/generate-soa-pdf';
import type { StatementData } from '@/lib/generate-soa-pdf';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function balanceColor(val: number) {
  if (val > 0) return 'text-[var(--reject-red)]';
  if (val < 0) return 'text-[var(--match-green)]';
  return 'text-[var(--text-secondary)]';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountantSupplierStatementPage() {
  usePageTitle('Statement of Account');
  const params = useParams();
  const id = params.id as string;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [dateFrom, setDateFrom] = useState(toInputDate(sixMonthsAgo));
  const [dateTo, setDateTo] = useState(toInputDate(new Date()));
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function fetchStatement() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/suppliers/${id}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      if (!res.ok) throw new Error('Failed to load statement');
      const json = await res.json();
      setData(json.data);
      generateSOAPdf(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // Load HTML preview on mount (without PDF download)
  useEffect(() => {
    async function loadInitial() {
      setLoading(true);
      try {
        const res = await fetch(`/api/suppliers/${id}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}`);
        if (!res.ok) throw new Error('Failed to load statement');
        const json = await res.json();
        setData(json.data);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [id, dateFrom, dateTo]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center bg-white border-b border-[#E0E3E5] pl-14 pr-6">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">
            Statement of Account{data?.supplier ? ` — ${data.supplier.name}` : ''}
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto paper-texture">
          <div className="ledger-binding p-8 pl-14 max-w-5xl">

            {/* Back link */}
            <Link href="/accountant/suppliers" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              Back to Suppliers
            </Link>

            {/* Date range picker */}
            <div className="mt-5 flex items-end gap-3">
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">From</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="input-field h-9 px-3" />
              </div>
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">To</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="input-field h-9 px-3" />
              </div>
              <button onClick={fetchStatement} disabled={loading}
                className="btn-thick-navy h-9 px-5 text-sm font-medium disabled:opacity-50">
                {loading ? 'Loading...' : 'Generate'}
              </button>
            </div>

            {error && <p className="mt-4 text-sm text-[var(--reject-red)]">{error}</p>}

            {data && (
              <>
                {/* Supplier info */}
                <div className="mt-6 bg-white card-popped p-5">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier</p>
                      <p className="text-sm text-[var(--text-primary)] mt-0.5 font-medium">{data.supplier.name}</p>
                    </div>
                    {data.supplier.contact_email && (
                      <div>
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Email</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{data.supplier.contact_email}</p>
                      </div>
                    )}
                    {data.supplier.contact_phone && (
                      <div>
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Phone</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{data.supplier.contact_phone}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Period</p>
                      <p className="text-sm text-[var(--text-primary)] mt-0.5">{formatDate(data.period.from)} — {formatDate(data.period.to)}</p>
                    </div>
                  </div>
                </div>

                {/* Summary boxes */}
                <div className="mt-4 grid grid-cols-4 gap-3">
                  <div className="bg-white card-popped p-4 border-l-4" style={{ borderLeftColor: data.opening_balance > 0 ? 'var(--reject-red)' : data.opening_balance < 0 ? 'var(--match-green)' : 'var(--outline-variant)' }}>
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Opening Balance</p>
                    <p className={`text-lg font-bold mt-1 tabular-nums ${balanceColor(data.opening_balance)}`}>{formatRM(data.opening_balance)}</p>
                  </div>
                  <div className="bg-white card-popped p-4 border-l-4 border-l-[var(--match-green)]">
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Debit</p>
                    <p className="text-lg font-bold text-[var(--match-green)] mt-1 tabular-nums">{formatRM(data.totals.total_debit)}</p>
                  </div>
                  <div className="bg-white card-popped p-4 border-l-4 border-l-[var(--reject-red)]">
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Credit</p>
                    <p className="text-lg font-bold text-[var(--reject-red)] mt-1 tabular-nums">{formatRM(data.totals.total_credit)}</p>
                  </div>
                  <div className="bg-white card-popped p-4 border-l-4" style={{ borderLeftColor: data.closing_balance > 0 ? 'var(--reject-red)' : data.closing_balance < 0 ? 'var(--match-green)' : 'var(--outline-variant)' }}>
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Closing Balance</p>
                    <p className={`text-lg font-bold mt-1 tabular-nums ${balanceColor(data.closing_balance)}`}>{formatRM(data.closing_balance)}</p>
                  </div>
                </div>

                {/* Statement table */}
                <div className="mt-4 bg-white card-popped overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Date</th>
                        <th className="px-3 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Reference</th>
                        <th className="px-3 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Description</th>
                        <th className="px-3 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Debit</th>
                        <th className="px-3 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Credit</th>
                        <th className="px-6 py-3 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance row */}
                      <tr className="bg-[var(--surface-low)]">
                        <td className="px-6 py-2.5 text-sm text-[var(--text-secondary)] tabular-nums">{formatDate(data.period.from)}</td>
                        <td className="px-3 py-2.5 text-sm text-[var(--text-secondary)]" colSpan={2}>Opening Balance</td>
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums text-[var(--text-secondary)]">&mdash;</td>
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums text-[var(--text-secondary)]">&mdash;</td>
                        <td className={`px-6 py-2.5 text-sm text-right tabular-nums font-semibold ${balanceColor(data.opening_balance)}`}>{formatRM(data.opening_balance)}</td>
                      </tr>

                      {/* Data rows */}
                      {data.entries.map((entry, i) => {
                        const isReceivable = entry.type === 'sales_invoice' || entry.type === 'incoming_payment';
                        const rowBg = isReceivable ? 'bg-[var(--surface-low)]' : (i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]');
                        return (
                          <tr key={i} className={`text-sm hover:bg-[var(--surface-header)] transition-colors ${rowBg}`}>
                            <td className="px-6 py-2.5 text-[var(--text-secondary)] tabular-nums">{formatDate(entry.date)}</td>
                            <td className="px-3 py-2.5 text-[var(--text-secondary)] font-medium">{entry.reference}</td>
                            <td className="px-3 py-2.5 text-[var(--text-secondary)]">{entry.description}</td>
                            <td className={`px-3 py-2.5 text-right tabular-nums ${entry.debit > 0 ? 'text-[var(--match-green)]' : 'text-[var(--text-secondary)]'}`}>{entry.debit > 0 ? formatRM(entry.debit) : '\u2014'}</td>
                            <td className={`px-3 py-2.5 text-right tabular-nums ${entry.credit > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-secondary)]'}`}>{entry.credit > 0 ? formatRM(entry.credit) : '\u2014'}</td>
                            <td className={`px-6 py-2.5 text-right tabular-nums font-semibold ${balanceColor(entry.balance)}`}>{formatRM(entry.balance)}</td>
                          </tr>
                        );
                      })}

                      {/* Closing balance row */}
                      <tr className="bg-[var(--surface-low)] border-t-2 border-[var(--surface-header)]">
                        <td className="px-6 py-3 text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatDate(data.period.to)}</td>
                        <td className="px-3 py-3 text-sm font-semibold text-[var(--text-primary)]" colSpan={2}>Closing Balance</td>
                        <td className="px-3 py-3 text-sm text-right tabular-nums font-semibold text-[var(--match-green)]">{formatRM(data.totals.total_debit)}</td>
                        <td className="px-3 py-3 text-sm text-right tabular-nums font-semibold text-[var(--reject-red)]">{formatRM(data.totals.total_credit)}</td>
                        <td className={`px-6 py-3 text-sm text-right tabular-nums font-bold ${balanceColor(data.closing_balance)}`}>{formatRM(data.closing_balance)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {data.entries.length === 0 && (
                    <div className="px-6 py-8 text-center text-sm text-[var(--text-secondary)]">No entries found for this period.</div>
                  )}
                </div>
              </>
            )}

            {!data && !loading && !error && (
              <div className="mt-8 text-center text-sm text-[var(--text-secondary)]">Select a date range and click Generate to view the statement.</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
