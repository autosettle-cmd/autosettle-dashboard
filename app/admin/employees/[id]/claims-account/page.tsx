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
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toInputDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function balanceColor(val: number) {
  if (val > 0) return 'text-[var(--reject-red)]';   // firm owes employee
  if (val < 0) return 'text-[var(--match-green)]'; // overpaid
  return 'text-[var(--text-secondary)]';
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

export default function AdminEmployeeClaimsAccountPage() {
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
      const res = await fetch(`/api/admin/employees/${id}/claims-account?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      if (!res.ok) throw new Error('Failed to load statement');
      const json = await res.json();
      setData(json.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [id, dateFrom, dateTo]);

  useEffect(() => { fetchStatement(); }, [fetchStatement]);

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
      const res = await fetch(`/api/admin/claims?employeeId=${id}&approval=approved&paymentStatus=unpaid&paymentStatus=partially_paid&type=claim&take=200`);
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

      const res = await fetch('/api/admin/payments', {
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
    <div className="flex h-screen overflow-hidden bg-[var(--surface)]">
      <Sidebar role="admin" />

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between bg-white border-b border-[#E0E3E5] pl-14 pr-6">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">
            Claims Account{data?.employee ? ` — ${data.employee.name}` : ''}
          </h1>
          {data && data.total_unpaid > 0 && (
            <button onClick={openPayModal}
              className="btn-thick-navy h-9 px-5 text-sm font-medium">
              Record Payment
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto paper-texture">
          <div className="ledger-binding p-8 pl-14 max-w-5xl">

            {/* Back link */}
            <Link href="/admin/employees" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors mb-4">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              Back to Employees
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
              <button onClick={() => fetchStatement()} disabled={loading}
                className="btn-thick-navy h-9 px-5 text-sm font-medium disabled:opacity-50">
                {loading ? 'Loading...' : 'Generate'}
              </button>
            </div>

            {error && <p className="mt-4 text-sm text-[var(--reject-red)]">{error}</p>}

            {data && (
              <>
                {/* Employee info */}
                <div className="mt-6 bg-white card-popped p-5">
                  <div className="flex gap-8">
                    <div>
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee</p>
                      <p className="text-sm text-[var(--text-primary)] mt-0.5 font-medium">{data.employee.name}</p>
                    </div>
                    {data.employee.phone && (
                      <div>
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Phone</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{data.employee.phone}</p>
                      </div>
                    )}
                    {data.employee.email && (
                      <div>
                        <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Email</p>
                        <p className="text-sm text-[var(--text-primary)] mt-0.5">{data.employee.email}</p>
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
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Payments</p>
                    <p className="text-lg font-bold text-[var(--match-green)] mt-1 tabular-nums">{formatRM(data.totals.total_debit)}</p>
                  </div>
                  <div className="bg-white card-popped p-4 border-l-4 border-l-[var(--reject-red)]">
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Claims</p>
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
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums text-[var(--text-secondary)]">—</td>
                        <td className="px-3 py-2.5 text-sm text-right tabular-nums text-[var(--text-secondary)]">—</td>
                        <td className={`px-6 py-2.5 text-sm text-right tabular-nums font-semibold ${balanceColor(data.opening_balance)}`}>{formatRM(data.opening_balance)}</td>
                      </tr>

                      {data.entries.map((entry, i) => (
                        <tr key={i} className={`text-sm hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]'}`}>
                          <td className="px-6 py-2.5 text-[var(--text-secondary)] tabular-nums">{formatDate(entry.date)}</td>
                          <td className="px-3 py-2.5 text-[var(--text-secondary)] font-medium">{entry.reference}</td>
                          <td className="px-3 py-2.5 text-[var(--text-secondary)]">{entry.description}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${entry.debit > 0 ? 'text-[var(--match-green)]' : 'text-[var(--text-secondary)]'}`}>{entry.debit > 0 ? formatRM(entry.debit) : '—'}</td>
                          <td className={`px-3 py-2.5 text-right tabular-nums ${entry.credit > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-secondary)]'}`}>{entry.credit > 0 ? formatRM(entry.credit) : '—'}</td>
                          <td className={`px-6 py-2.5 text-right tabular-nums font-semibold ${balanceColor(entry.balance)}`}>{formatRM(entry.balance)}</td>
                        </tr>
                      ))}

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
                    <div className="px-5 py-8 text-center text-sm text-[var(--text-secondary)]">No entries found for this period.</div>
                  )}
                </div>
              </>
            )}

            {!data && !loading && !error && (
              <div className="mt-8 text-center text-sm text-[var(--text-secondary)]">Loading statement...</div>
            )}
          </div>
        </div>
      </main>

      {/* ═══ RECORD PAYMENT MODAL ═══ */}
      {showPayModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="bg-[var(--primary)] px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white uppercase tracking-wide">Record Payment to Employee</h3>
                <p className="text-sm text-white/70 mt-0.5">Allocate payment to approved claims.</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-auto p-6">
              {payError && (
                <div className="mb-4 bg-[var(--error-container)] p-3">
                  <p className="text-sm text-[var(--on-error-container)]">{payError}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Amount *</label>
                  <input type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="input-recessed w-full" placeholder="0.00" autoFocus />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Date *</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="input-recessed w-full" />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Reference</label>
                  <input type="text" value={payRef} onChange={e => setPayRef(e.target.value)} className="input-recessed w-full" placeholder="Bank ref / cheque no." />
                </div>
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Notes</label>
                  <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
              </div>

              {/* Claim allocation table */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">Allocate to Claims</p>
                <button onClick={autoAllocate} disabled={!payAmount || Number(payAmount) <= 0}
                  className="btn-thick-white text-xs font-medium px-3 py-1.5 disabled:opacity-40">
                  Auto-Allocate
                </button>
              </div>

              {unpaidClaims.length === 0 ? (
                <div className="py-6 text-center text-sm text-[var(--text-secondary)]">No unpaid claims found.</div>
              ) : (
                <div className="overflow-hidden mb-4">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Date</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Category</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">Merchant</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Amount</th>
                        <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Outstanding</th>
                        <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right">Allocate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidClaims.map((c, i) => {
                        const outstanding = Number(c.amount) - Number(c.amount_paid);
                        return (
                          <tr key={c.id} className={`text-sm hover:bg-[var(--surface-header)] transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-[var(--surface-low)]'}`}>
                            <td className="px-4 py-2 text-[var(--text-secondary)] tabular-nums">{formatDate(c.claim_date)}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{c.category.name}</td>
                            <td className="px-3 py-2 text-[var(--text-secondary)]">{c.merchant}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--text-primary)]">{formatRM(c.amount)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-[var(--reject-red)]">{formatRM(outstanding)}</td>
                            <td className="px-4 py-2 text-right">
                              <input type="number" step="0.01" min="0" max={outstanding}
                                value={allocations[c.id] ?? ''}
                                onChange={e => setAllocations(prev => ({ ...prev, [c.id]: Number(e.target.value) || 0 }))}
                                className="input-recessed w-24 text-right tabular-nums" placeholder="0.00" />
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
                <span className="text-[var(--text-secondary)]">Total Allocated: <span className={`font-semibold tabular-nums ${allocTotal > Number(payAmount || 0) + 0.01 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(allocTotal)}</span></span>
                <span className="text-[var(--text-secondary)]">Unallocated: <span className="font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(Math.max(0, Number(payAmount || 0) - allocTotal))}</span></span>
              </div>
            </div>

            {/* Modal footer */}
            <div className="bg-[var(--surface-low)] px-6 py-4 flex gap-3">
              <button onClick={submitPayment} disabled={paySaving}
                className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40">
                {paySaving ? 'Creating...' : 'Create Payment'}
              </button>
              <button onClick={() => setShowPayModal(false)} disabled={paySaving}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
