'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

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
  if (val > 0) return 'text-red-600';   // firm owes employee
  if (val < 0) return 'text-green-600'; // overpaid
  return 'text-[#434654]';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Entry {
  id: string;
  date: string;
  type: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface StatementData {
  employee: { id: string; name: string; phone: string; email: string | null };
  period: { from: string; to: string };
  opening_balance: number;
  entries: Entry[];
  totals: { total_debit: number; total_credit: number };
  closing_balance: number;
  unpaid_claims: number;
  total_unpaid: number;
}

interface ClaimRow {
  id: string;
  merchant: string;
  claim_date: string;
  amount: string;
  amount_paid: string;
  payment_status: string;
  category: { name: string };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountantEmployeeClaimsAccountPage() {
  usePageTitle('Claims Account');
  const params = useParams();
  const id = params.id as string;

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [dateFrom, setDateFrom] = useState(toInputDate(sixMonthsAgo));
  const [dateTo, setDateTo] = useState(toInputDate(new Date()));
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Record Payment modal ──
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(toInputDate(new Date()));
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');
  const [unpaidClaims, setUnpaidClaims] = useState<ClaimRow[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  const fetchStatement = useCallback(async (_download = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/employees/${id}/claims-account?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      if (!res.ok) throw new Error('Failed to load statement');
      const json = await res.json();
      setData(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id, dateFrom, dateTo]);

  useEffect(() => { fetchStatement(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch unpaid claims for payment modal ──
  const openPayModal = async () => {
    setPayError('');
    setPaySaving(false);
    setPayAmount('');
    setPayDate(toInputDate(new Date()));
    setPayRef('');
    setPayNotes('');
    setAllocations({});
    try {
      const res = await fetch(`/api/claims?employeeId=${id}&approval=approved&paymentStatus=unpaid&paymentStatus=partially_paid&type=claim&take=200`);
      const json = await res.json();
      setUnpaidClaims(json.data ?? []);
    } catch {
      setUnpaidClaims([]);
    }
    setShowPayModal(true);
  };

  const allocTotal = Object.values(allocations).reduce((s, v) => s + (v || 0), 0);

  const autoAllocate = () => {
    let remaining = Number(payAmount) || 0;
    const newAlloc: Record<string, number> = {};
    for (const c of unpaidClaims) {
      if (remaining <= 0) break;
      const outstanding = Number(c.amount) - Number(c.amount_paid);
      const alloc = Math.min(remaining, outstanding);
      if (alloc > 0) {
        newAlloc[c.id] = Number(alloc.toFixed(2));
        remaining -= alloc;
      }
    }
    setAllocations(newAlloc);
  };

  const submitPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) { setPayError('Enter a valid amount'); return; }
    if (!payDate) { setPayError('Select a date'); return; }
    if (allocTotal <= 0) { setPayError('Allocate to at least one claim'); return; }
    if (allocTotal > Number(payAmount) + 0.01) { setPayError('Allocations exceed payment amount'); return; }

    setPaySaving(true);
    setPayError('');
    try {
      const claim_allocations = Object.entries(allocations)
        .filter(([, amt]) => amt > 0)
        .map(([claim_id, amount]) => ({ claim_id, amount }));

      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: id,
          amount: Number(payAmount),
          payment_date: payDate,
          reference: payRef || undefined,
          notes: payNotes || undefined,
          claim_allocations,
          direction: 'outgoing',
        }),
      });
      const json = await res.json();
      if (!res.ok) { setPayError(json.error || 'Failed to create payment'); setPaySaving(false); return; }
      setShowPayModal(false);
      fetchStatement();
    } catch {
      setPayError('Network error');
      setPaySaving(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="accountant" />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">

          {/* Back link */}
          <Link href="/accountant/employees" className="inline-flex items-center gap-1.5 text-body-md text-[#8E9196] hover:text-[#434654] transition-colors mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            Back to Employees
          </Link>

          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-[22px] font-bold text-[#191C1E] tracking-tight">
              Claims Account{data?.employee ? ` — ${data.employee.name}` : ''}
            </h1>
            {data && data.total_unpaid > 0 && (
              <button onClick={openPayModal}
                className="btn-primary h-9 px-5 text-body-md font-medium text-white rounded-lg transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--primary)' }}>
                Record Payment
              </button>
            )}
          </div>

          {/* Date range picker */}
          <div className="mt-5 flex items-end gap-3">
            <div>
              <label className="block text-label-sm font-medium text-[#8E9196] uppercase tracking-wide mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="h-9 px-3 text-body-md border border-gray-200 rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-label-sm font-medium text-[#8E9196] uppercase tracking-wide mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="h-9 px-3 text-body-md border border-gray-200 rounded-lg bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <button onClick={() => fetchStatement()} disabled={loading}
              className="btn-primary h-9 px-5 text-body-md font-medium text-white rounded-lg disabled:opacity-50 transition-colors"
              style={{ backgroundColor: 'var(--primary)' }}>
              {loading ? 'Loading...' : 'Generate'}
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          {data && (
            <>
              {/* Employee info */}
              <div className="mt-6 bg-white rounded-lg p-5">
                <div className="flex gap-8">
                  <div>
                    <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Employee</p>
                    <p className="text-sm text-[#191C1E] mt-0.5 font-medium">{data.employee.name}</p>
                  </div>
                  {data.employee.phone && (
                    <div>
                      <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Phone</p>
                      <p className="text-sm text-[#191C1E] mt-0.5">{data.employee.phone}</p>
                    </div>
                  )}
                  {data.employee.email && (
                    <div>
                      <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Email</p>
                      <p className="text-sm text-[#191C1E] mt-0.5">{data.employee.email}</p>
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
                <div className="bg-white rounded-lg p-4 border-l-4 border-l-green-400">
                  <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Total Payments</p>
                  <p className="text-lg font-bold text-green-600 mt-1 tabular-nums">{formatRM(data.totals.total_debit)}</p>
                </div>
                <div className="bg-white rounded-lg p-4 border-l-4 border-l-red-400">
                  <p className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Total Claims</p>
                  <p className="text-lg font-bold text-red-600 mt-1 tabular-nums">{formatRM(data.totals.total_credit)}</p>
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
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-3">Date</th>
                      <th className="px-3 py-3">Reference</th>
                      <th className="px-3 py-3">Description</th>
                      <th className="px-3 py-3 text-right">Debit</th>
                      <th className="px-3 py-3 text-right">Credit</th>
                      <th className="px-6 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Opening balance row */}
                    <tr className="group bg-gray-50/50">
                      <td className="px-6 py-2.5 text-body-sm text-[#434654]">{formatDate(data.period.from)}</td>
                      <td className="px-3 py-2.5 text-body-sm text-[#434654]" colSpan={2}>Opening Balance</td>
                      <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[#8E9196]">—</td>
                      <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[#8E9196]">—</td>
                      <td className={`px-6 py-2.5 text-body-sm text-right tabular-nums font-semibold ${balanceColor(data.opening_balance)}`}>{formatRM(data.opening_balance)}</td>
                    </tr>

                    {data.entries.map((entry, i) => (
                      <tr key={i} className="group text-body-sm hover:bg-white/60 transition-colors">
                        <td className="px-6 py-2.5 text-[#434654] tabular-nums">{formatDate(entry.date)}</td>
                        <td className="px-3 py-2.5 text-[#434654] font-medium">{entry.reference}</td>
                        <td className="px-3 py-2.5 text-[#434654]">{entry.description}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${entry.debit > 0 ? 'text-green-600' : 'text-[#8E9196]'}`}>{entry.debit > 0 ? formatRM(entry.debit) : '—'}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${entry.credit > 0 ? 'text-red-600' : 'text-[#8E9196]'}`}>{entry.credit > 0 ? formatRM(entry.credit) : '—'}</td>
                        <td className={`px-6 py-2.5 text-right tabular-nums font-semibold ${balanceColor(entry.balance)}`}>{formatRM(entry.balance)}</td>
                      </tr>
                    ))}

                    {/* Closing balance row */}
                    <tr className="group bg-gray-50/50 border-t-2 border-gray-200">
                      <td className="px-6 py-3 text-body-sm font-semibold text-[#191C1E]">{formatDate(data.period.to)}</td>
                      <td className="px-3 py-3 text-body-sm font-semibold text-[#191C1E]" colSpan={2}>Closing Balance</td>
                      <td className="px-3 py-3 text-body-sm text-right tabular-nums font-semibold text-green-600">{formatRM(data.totals.total_debit)}</td>
                      <td className="px-3 py-3 text-body-sm text-right tabular-nums font-semibold text-red-600">{formatRM(data.totals.total_credit)}</td>
                      <td className={`px-6 py-3 text-body-sm text-right tabular-nums font-bold ${balanceColor(data.closing_balance)}`}>{formatRM(data.closing_balance)}</td>
                    </tr>
                  </tbody>
                </table>

                {data.entries.length === 0 && (
                  <div className="px-5 py-8 text-center text-sm text-[#8E9196]">No entries found for this period.</div>
                )}
              </div>
            </>
          )}

          {!data && !loading && !error && (
            <div className="mt-8 text-center text-sm text-[#8E9196]">Loading statement...</div>
          )}
        </div>
      </main>

      {/* ═══ RECORD PAYMENT MODAL ═══ */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-[#191C1E]">Record Payment to Employee</h3>
                <p className="text-sm text-[#434654] mt-1">Allocate payment to approved claims.</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[#8E9196] hover:text-[#434654] hover:bg-gray-200 transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {payError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{payError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Amount *</label>
                <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                  className="input-field w-full" placeholder="0.00" autoFocus />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Date *</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Reference</label>
                <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} className="input-field w-full" placeholder="Bank ref / cheque no." />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Notes</label>
                <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className="input-field w-full" placeholder="Optional" />
              </div>
            </div>

            {/* Claim allocation table */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[#191C1E]">Allocate to Claims</p>
              <button onClick={autoAllocate} disabled={!payAmount || Number(payAmount) <= 0}
                className="text-xs font-medium px-3 py-1.5 rounded-md border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Auto-Allocate
              </button>
            </div>

            {unpaidClaims.length === 0 ? (
              <div className="py-6 text-center text-sm text-[#8E9196]">No unpaid claims found.</div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-4 py-2">Date</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Merchant</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-4 py-2 text-right">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unpaidClaims.map(c => {
                      const outstanding = Number(c.amount) - Number(c.amount_paid);
                      return (
                        <tr key={c.id} className="text-body-sm hover:bg-[#F2F4F6] transition-colors">
                          <td className="px-4 py-2 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                          <td className="px-3 py-2 text-[#434654]">{c.category.name}</td>
                          <td className="px-3 py-2 text-[#434654]">{c.merchant}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[#191C1E]">{formatRM(c.amount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600">{formatRM(outstanding)}</td>
                          <td className="px-4 py-2 text-right">
                            <input type="number" step="0.01" min="0" max={outstanding}
                              value={allocations[c.id] ?? ''}
                              onChange={e => setAllocations(prev => ({ ...prev, [c.id]: Number(e.target.value) || 0 }))}
                              className="input-field w-24 text-right tabular-nums" placeholder="0.00" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="flex items-center justify-between text-sm mb-4 px-1">
              <span className="text-[#8E9196]">Total Allocated: <span className={`font-semibold ${allocTotal > Number(payAmount || 0) + 0.01 ? 'text-red-600' : 'text-[#191C1E]'}`}>{formatRM(allocTotal)}</span></span>
              <span className="text-[#8E9196]">Unallocated: <span className="font-semibold text-[#191C1E]">{formatRM(Math.max(0, Number(payAmount || 0) - allocTotal))}</span></span>
            </div>

            <div className="flex gap-3">
              <button onClick={submitPayment} disabled={paySaving}
                className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--primary)' }}>
                {paySaving ? 'Creating...' : 'Create Payment'}
              </button>
              <button onClick={() => setShowPayModal(false)} disabled={paySaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
