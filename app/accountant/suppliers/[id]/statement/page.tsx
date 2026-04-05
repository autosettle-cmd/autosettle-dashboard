'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { generateSOAPdf } from '@/lib/generate-soa-pdf';
import type { StatementData } from '@/lib/generate-soa-pdf';
import Sidebar from '@/components/Sidebar';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function balanceColor(val: number) {
  if (val > 0) return 'text-red-600';
  if (val < 0) return 'text-green-600';
  return 'text-[#434654]';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountantSupplierStatementPage() {
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">

          {/* Back link */}
          <Link href="/accountant/suppliers" className="inline-flex items-center gap-1.5 text-body-md text-[#8E9196] hover:text-[#434654] transition-colors mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            Back to Suppliers
          </Link>

          {/* Header */}
          <h1 className="text-[22px] font-bold text-[#191C1E] tracking-tight">
            Statement of Account{data?.supplier ? ` — ${data.supplier.name}` : ''}
          </h1>

          {/* Date range picker */}
          <div className="mt-5 flex items-end gap-3">
            <div>
              <label className="block text-label-sm font-medium text-[#8E9196] uppercase tracking-wide mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 px-3 text-body-md border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-label-sm font-medium text-[#8E9196] uppercase tracking-wide mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-9 px-3 text-body-md border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={fetchStatement} disabled={loading}
              className="btn-primary h-9 px-5 text-body-md font-medium rounded-lg disabled:opacity-50 transition-colors">
              {loading ? 'Loading...' : 'Generate'}
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          {data && (
            <>
              {/* Supplier info */}
              <div className="mt-6 bg-white rounded-lg p-5">
                <div className="flex gap-8">
                  <div>
                    <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Supplier</p>
                    <p className="text-sm text-[#191C1E] mt-0.5 font-medium">{data.supplier.name}</p>
                  </div>
                  {data.supplier.contact_email && (
                    <div>
                      <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Email</p>
                      <p className="text-sm text-[#191C1E] mt-0.5">{data.supplier.contact_email}</p>
                    </div>
                  )}
                  {data.supplier.contact_phone && (
                    <div>
                      <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Phone</p>
                      <p className="text-sm text-[#191C1E] mt-0.5">{data.supplier.contact_phone}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Period</p>
                    <p className="text-sm text-[#191C1E] mt-0.5">{formatDate(data.period.from)} — {formatDate(data.period.to)}</p>
                  </div>
                </div>
              </div>

              {/* Summary boxes */}
              <div className="mt-4 grid grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderLeftColor: data.opening_balance > 0 ? '#dc2626' : data.opening_balance < 0 ? '#16a34a' : '#9ca3af' }}>
                  <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Opening Balance</p>
                  <p className={`text-lg font-bold mt-1 tabular-nums ${balanceColor(data.opening_balance)}`}>{formatRM(data.opening_balance)}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border-l-4 border-l-red-400">
                  <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Total Debit</p>
                  <p className="text-lg font-bold text-red-600 mt-1 tabular-nums">{formatRM(data.totals.total_debit)}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border-l-4 border-l-green-400">
                  <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Total Credit</p>
                  <p className="text-lg font-bold text-green-600 mt-1 tabular-nums">{formatRM(data.totals.total_credit)}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border-l-4" style={{ borderLeftColor: data.closing_balance > 0 ? '#dc2626' : data.closing_balance < 0 ? '#16a34a' : '#9ca3af' }}>
                  <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Closing Balance</p>
                  <p className={`text-lg font-bold mt-1 tabular-nums ${balanceColor(data.closing_balance)}`}>{formatRM(data.closing_balance)}</p>
                </div>
              </div>

              {/* Statement table */}
              <div className="mt-4 bg-white rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50/50">
                      <th className="px-6 py-3 text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide">Date</th>
                      <th className="px-3 py-3 text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide">Reference</th>
                      <th className="px-3 py-3 text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide">Description</th>
                      <th className="px-3 py-3 text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide text-right">Debit</th>
                      <th className="px-3 py-3 text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide text-right">Credit</th>
                      <th className="px-6 py-3 text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="bg-gray-50/50 group">
                      <td className="px-6 py-2.5 text-body-sm text-[#434654]">{formatDate(data.period.from)}</td>
                      <td className="px-3 py-2.5 text-body-sm text-[#434654]" colSpan={2}>Opening Balance</td>
                      <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[#8E9196]">&mdash;</td>
                      <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[#8E9196]">&mdash;</td>
                      <td className={`px-6 py-2.5 text-body-sm text-right tabular-nums font-semibold ${balanceColor(data.opening_balance)}`}>{formatRM(data.opening_balance)}</td>
                    </tr>

                    {/* Data rows */}
                    {data.entries.map((entry, i) => {
                      const isReceivable = entry.type === 'sales_invoice' || entry.type === 'incoming_payment';
                      const rowBg = isReceivable ? 'bg-green-50/40' : '';
                      return (
                        <tr key={i} className={`group text-body-sm hover:bg-white/60 transition-colors ${rowBg}`}>
                          <td className="px-6 py-2.5 text-[#434654] tabular-nums">{formatDate(entry.date)}</td>
                          <td className="px-3 py-2.5 text-[#434654] font-medium">{entry.reference}</td>
                          <td className="px-3 py-2.5 text-[#434654]">{entry.description}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${entry.debit > 0 ? 'text-red-600' : 'text-[#8E9196]'}`}>{entry.debit > 0 ? formatRM(entry.debit) : '\u2014'}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${entry.credit > 0 ? 'text-green-600' : 'text-[#8E9196]'}`}>{entry.credit > 0 ? formatRM(entry.credit) : '\u2014'}</td>
                          <td className={`px-6 py-2.5 text-right tabular-nums font-semibold ${balanceColor(entry.balance)}`}>{formatRM(entry.balance)}</td>
                        </tr>
                      );
                    })}

                    {/* Closing balance row */}
                    <tr className="bg-gray-50/50 border-t-2 border-gray-200 group">
                      <td className="px-6 py-3 text-body-sm font-semibold text-[#191C1E]">{formatDate(data.period.to)}</td>
                      <td className="px-3 py-3 text-body-sm font-semibold text-[#191C1E]" colSpan={2}>Closing Balance</td>
                      <td className="px-3 py-3 text-body-sm text-right tabular-nums font-semibold text-red-600">{formatRM(data.totals.total_debit)}</td>
                      <td className="px-3 py-3 text-body-sm text-right tabular-nums font-semibold text-green-600">{formatRM(data.totals.total_credit)}</td>
                      <td className={`px-6 py-3 text-body-sm text-right tabular-nums font-bold ${balanceColor(data.closing_balance)}`}>{formatRM(data.closing_balance)}</td>
                    </tr>
                  </tbody>
                </table>

                {data.entries.length === 0 && (
                  <div className="px-6 py-8 text-center text-sm text-[#8E9196]">No entries found for this period.</div>
                )}
              </div>
            </>
          )}

          {!data && !loading && !error && (
            <div className="mt-8 text-center text-sm text-[#8E9196]">Select a date range and click Generate to view the statement.</div>
          )}
        </div>
      </main>
    </div>
  );
}
