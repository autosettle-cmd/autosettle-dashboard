'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { Plus_Jakarta_Sans } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

interface PaymentAllocation {
  invoice_id: string;
  invoice_number: string | null;
  vendor_name: string;
  total_amount: string;
  issue_date: string;
  allocated_amount: string;
}

interface PaymentReceipt {
  id: string;
  merchant: string;
  receipt_number: string | null;
  amount: string;
  claim_date: string;
  thumbnail_url: string | null;
}

interface MatchedPayment {
  id: string;
  reference: string | null;
  payment_date: string;
  amount: string;
  direction: string;
  notes: string | null;
  supplier_name: string;
  allocations: PaymentAllocation[];
  receipts: PaymentReceipt[];
}

interface BankTxn {
  id: string;
  transaction_date: string;
  description: string;
  reference: string | null;
  cheque_number: string | null;
  debit: string | null;
  credit: string | null;
  balance: string | null;
  recon_status: string;
  matched_at: string | null;
  notes: string | null;
  matched_payment: MatchedPayment | null;
}

interface StatementDetail {
  id: string;
  bank_name: string;
  account_number: string | null;
  statement_date: string;
  opening_balance: string | null;
  closing_balance: string | null;
  file_url: string | null;
  summary: { total: number; matched: number; unmatched: number; excluded: number };
  system_balance: { debit: number; credit: number };
  transactions: BankTxn[];
}

interface CandidatePayment {
  id: string;
  supplier_name: string;
  amount: string;
  payment_date: string;
  reference: string | null;
  direction: string;
  notes: string | null;
}

function formatDate(val: string) {
  const d = new Date(val);
  return [d.getUTCDate().toString().padStart(2, '0'), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCFullYear()].join('/');
}

function formatRM(val: string | number | null) {
  if (val === null || val === undefined) return '-';
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  matched:          { label: 'Matched',  cls: 'badge-green' },
  manually_matched: { label: 'Manual',   cls: 'badge-blue' },
  unmatched:        { label: 'Unmatched', cls: 'badge-amber' },
  excluded:         { label: 'Excluded', cls: 'badge-gray' },
};

export default function AccountantReconciliationWorkspacePage() {
  const { id } = useParams<{ id: string }>();

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'matched' | 'excluded'>('all');
  const [matchingTxn, setMatchingTxn] = useState<BankTxn | null>(null);
  const [previewTxn, setPreviewTxn] = useState<BankTxn | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<PaymentAllocation | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceipt | null>(null);
  const [excludingTxn, setExcludingTxn] = useState<BankTxn | null>(null);
  const [excludeReason, setExcludeReason] = useState('');
  const [candidates, setCandidates] = useState<CandidatePayment[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const loadStatement = () => {
    fetch(`/api/bank-reconciliation/statements/${id}`)
      .then((r) => r.json())
      .then((j) => { setStatement(j.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadStatement(); }, [id]);

  const filteredTxns = statement?.transactions.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'matched') return t.recon_status === 'matched' || t.recon_status === 'manually_matched';
    return t.recon_status === filter;
  }) ?? [];

  const openMatchModal = async (txn: BankTxn) => {
    setMatchingTxn(txn);
    setLoadingCandidates(true);
    const amount = txn.debit ?? txn.credit ?? '';
    const params = new URLSearchParams();
    if (amount) params.set('amount', amount);
    const res = await fetch(`/api/bank-reconciliation/unreconciled-payments?${params}`);
    const json = await res.json();
    setCandidates(json.data ?? []);
    setLoadingCandidates(false);
  };

  const doMatch = async (paymentId: string) => {
    if (!matchingTxn) return;
    await fetch('/api/bank-reconciliation/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: matchingTxn.id, paymentId }),
    });
    setMatchingTxn(null);
    loadStatement();
  };

  const doUnmatch = async (txnId: string) => {
    await fetch('/api/bank-reconciliation/unmatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: txnId }),
    });
    loadStatement();
  };

  const openExcludeModal = (txn: BankTxn) => {
    setExcludingTxn(txn);
    setExcludeReason('');
  };

  const doExclude = async () => {
    if (!excludingTxn || !excludeReason) return;
    await fetch('/api/bank-reconciliation/exclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: excludingTxn.id, notes: excludeReason }),
    });
    setExcludingTxn(null);
    loadStatement();
  };



  return (
    <div className={`flex h-screen overflow-hidden bg-[#F5F6F8] ${jakarta.className}`}>
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Link href="/accountant/bank-reconciliation" className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">
              {statement ? `${statement.bank_name} — ${statement.account_number ?? 'N/A'} — ${formatDate(statement.statement_date)}` : 'Loading...'}
            </h1>
          </div>
          {statement?.file_url && (
            <a href={statement.file_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium btn-primary rounded-xl">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download PDF
            </a>
          )}
        </header>

        {/* ── Static summary + filter tabs ── */}
        {!loading && statement && (
          <div className="flex-shrink-0 px-6 pt-4 pb-3 bg-[#F5F6F8] border-b border-gray-100">

              {/* Summary cards */}
              <div className="grid grid-cols-6 gap-3 mb-4">
                {(() => {
                  const totalDebit = statement.transactions.reduce((s, t) => s + Number(t.debit ?? 0), 0);
                  const totalCredit = statement.transactions.reduce((s, t) => s + Number(t.credit ?? 0), 0);
                  return [
                    { label: 'Opening Balance', value: formatRM(statement.opening_balance), color: 'text-gray-900' },
                    { label: 'Total Debit', value: formatRM(totalDebit), color: 'text-red-600' },
                    { label: 'Total Credit', value: formatRM(totalCredit), color: 'text-green-600' },
                    { label: 'Closing Balance', value: formatRM(statement.closing_balance), color: 'text-gray-900' },
                    { label: 'Reconciled', value: `${statement.summary.matched} / ${statement.summary.total}`, color: 'text-green-600' },
                    { label: 'Unmatched', value: String(statement.summary.unmatched), color: statement.summary.unmatched > 0 ? 'text-red-600' : 'text-green-600' },
                  ];
                })().map((c) => (
                  <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{c.label}</p>
                    <p className={`text-[15px] font-bold tabular-nums ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 mb-3">
                {(['all', 'unmatched', 'matched', 'excluded'] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-[12px] font-medium rounded-xl transition-colors ${filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
                  >
                    {f === 'all' ? 'All' : f === 'unmatched' ? `Unmatched (${statement.summary.unmatched})` : f === 'matched' ? `Matched (${statement.summary.matched})` : `Excluded (${statement.summary.excluded})`}
                  </button>
                ))}
              </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6 animate-in">
          {loading || !statement ? (
            <div className="text-center text-sm text-gray-400 py-12">Loading...</div>
          ) : (
            <>
              {/* Transaction table */}
              <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-2.5 text-left w-[70px]">Status</th>
                      <th className="px-3 py-2.5 text-left w-[80px]">Date</th>
                      <th className="px-3 py-2.5 text-left">Description</th>
                      <th className="px-3 py-2.5 text-right w-[110px]">Debit</th>
                      <th className="px-3 py-2.5 text-right w-[110px]">Credit</th>
                      <th className="px-3 py-2.5 text-right w-[110px]">Balance</th>
                      <th className="px-3 py-2.5 text-left">Matched To</th>
                      <th className="px-3 py-2.5 text-right w-[120px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((txn) => {
                      const cfg = STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched;
                      const isExpanded = previewTxn?.id === txn.id;
                      const mp = txn.matched_payment;
                      return (
                        <React.Fragment key={txn.id}>
                        <tr className={`group border-b border-gray-50 transition-colors ${mp ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-gray-50/50'} ${isExpanded ? 'bg-blue-50/60' : txn.recon_status === 'matched' || txn.recon_status === 'manually_matched' ? 'bg-green-50/30' : txn.recon_status === 'excluded' ? 'bg-gray-50/40' : ''}`}
                          onClick={() => mp ? setPreviewTxn(isExpanded ? null : txn) : null}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {mp && (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                              )}
                              <span className={cfg.cls}>{cfg.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-gray-700 tabular-nums">{formatDate(txn.transaction_date)}</td>
                          <td className="px-3 py-2.5 text-[12px] text-gray-900 max-w-[250px] truncate" title={txn.description}>
                            {txn.description.split(' | ')[0]}
                            {txn.reference && <span className="ml-1 text-gray-400 text-[11px]">({txn.reference})</span>}
                          </td>
                          <td className="px-3 py-2.5 text-[12px] text-right tabular-nums text-red-600">{txn.debit ? formatRM(txn.debit) : '-'}</td>
                          <td className="px-3 py-2.5 text-[12px] text-right tabular-nums text-green-600">{txn.credit ? formatRM(txn.credit) : '-'}</td>
                          <td className="px-3 py-2.5 text-[12px] text-right tabular-nums text-gray-700">{txn.balance ? formatRM(txn.balance) : '-'}</td>
                          <td className="px-3 py-2.5 text-[12px] text-gray-500">
                            {mp ? (
                              <span>{mp.supplier_name} {mp.reference ? `(${mp.reference})` : ''}</span>
                            ) : txn.notes ? (
                              <span className="text-gray-400 italic">{txn.notes}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {txn.recon_status === 'unmatched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); openMatchModal(txn); }} className="text-[11px] w-[70px] py-1.5 text-white btn-blue rounded-xl transition-all duration-200 text-center">Match</button>
                                <button onClick={(e) => { e.stopPropagation(); openExcludeModal(txn); }} className="text-[11px] w-[70px] py-1.5 text-white btn-dark rounded-xl transition-all duration-200 text-center">Exclude</button>
                              </div>
                            )}
                            {(txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); doUnmatch(txn.id); }} className="text-[11px] w-[70px] py-1.5 text-white btn-primary rounded-xl transition-all duration-200 text-center">Unmatch</button>
                              </div>
                            )}
                            {txn.recon_status === 'excluded' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); doUnmatch(txn.id); }} className="text-[11px] w-[70px] py-1.5 text-white bg-gray-500 hover:bg-gray-600 rounded-xl transition-colors text-center">Restore</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExpanded && mp && (
                          <tr className="bg-blue-50/30 border-b border-gray-100">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-3 gap-4 mb-3">
                                <div>
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Payment To</p>
                                  <p className="text-[13px] font-medium text-gray-900">{mp.supplier_name}</p>
                                  <p className="text-[12px] text-gray-500">{formatDate(mp.payment_date)} — {formatRM(mp.amount)} — {mp.direction}</p>
                                  {mp.reference && <p className="text-[11px] text-gray-400">Ref: {mp.reference}</p>}
                                  {mp.notes && <p className="text-[11px] text-gray-400 italic">{mp.notes}</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Match Info</p>
                                  <span className={cfg.cls}>{cfg.label}</span>
                                  {txn.matched_at && <p className="text-[11px] text-gray-400 mt-1">{formatDate(txn.matched_at)}</p>}
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Bank Description</p>
                                  <p className="text-[12px] text-gray-600">{txn.description.replace(/ \| /g, '\n')}</p>
                                </div>
                              </div>

                              {mp.allocations.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Linked Invoices ({mp.allocations.length})</p>
                                  <div className="space-y-1">
                                    {mp.allocations.map((a) => (
                                      <div key={a.invoice_id}
                                        onClick={(e) => { e.stopPropagation(); setPreviewInvoice(a); }}
                                        className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer">
                                        <div>
                                          <span className="text-[12px] font-medium text-blue-700">{a.invoice_number ?? 'No number'}</span>
                                          <span className="text-[11px] text-gray-400 ml-2">{a.vendor_name} — {formatDate(a.issue_date)}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-[12px] font-semibold tabular-nums text-gray-900">{formatRM(a.allocated_amount)}</span>
                                          <span className="text-[11px] text-gray-400 ml-1">/ {formatRM(a.total_amount)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mp.receipts.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Linked Receipts ({mp.receipts.length})</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {mp.receipts.map((r) => (
                                      <div key={r.id}
                                        onClick={(e) => { e.stopPropagation(); setPreviewReceipt(r); }}
                                        className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer">
                                        {r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                                        <div className="min-w-0">
                                          <p className="text-[12px] font-medium text-blue-700 truncate">{r.merchant}</p>
                                          <p className="text-[11px] text-gray-400">{r.receipt_number ?? 'No #'} — {formatDate(r.claim_date)} — {formatRM(r.amount)}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mp.allocations.length === 0 && mp.receipts.length === 0 && (
                                <p className="text-[12px] text-gray-400 italic">No invoices or receipts linked to this payment yet.</p>
                              )}
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {filteredTxns.length === 0 && (
                  <div className="text-center py-8 text-sm text-gray-400">No transactions in this filter.</div>
                )}
              </div>

            </>
          )}

          {/* Match modal */}
          {matchingTxn && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setMatchingTxn(null)}>
              <div className="bg-white rounded-xl shadow-xl p-6 w-[560px] max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Match Transaction</h2>
                <div className="bg-gray-50 rounded-xl p-3 mb-4 text-[12px]">
                  <p className="font-medium text-gray-900">{matchingTxn.description.split(' | ')[0]}</p>
                  <p className="text-gray-500 mt-1">
                    {formatDate(matchingTxn.transaction_date)} — {matchingTxn.debit ? `Debit ${formatRM(matchingTxn.debit)}` : `Credit ${formatRM(matchingTxn.credit)}`}
                  </p>
                </div>
                <p className="text-[12px] font-medium text-gray-500 mb-2">Select a payment to match:</p>
                {loadingCandidates ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Loading...</p>
                ) : candidates.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">No matching payments found.</p>
                ) : (
                  <div className="space-y-1">
                    {candidates.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => doMatch(p.id)}
                        className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      >
                        <div>
                          <p className="text-[12px] font-medium text-gray-900">{p.supplier_name}</p>
                          <p className="text-[11px] text-gray-400">{formatDate(p.payment_date)} {p.reference ? `· ${p.reference}` : ''} · {p.direction}</p>
                        </div>
                        <p className="text-[13px] font-semibold tabular-nums text-gray-900">{formatRM(p.amount)}</p>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={() => setMatchingTxn(null)} className="mt-4 w-full px-3 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Exclude modal */}
          {excludingTxn && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={() => setExcludingTxn(null)}>
              <div className="bg-white rounded-xl shadow-xl p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Exclude Transaction</h2>
                <div className="bg-gray-50 rounded-xl p-3 mb-4 text-[12px]">
                  <p className="font-medium text-gray-900">{excludingTxn.description.split(' | ')[0]}</p>
                  <p className="text-gray-500 mt-1">
                    {formatDate(excludingTxn.transaction_date)} — {excludingTxn.debit ? `Debit ${formatRM(excludingTxn.debit)}` : `Credit ${formatRM(excludingTxn.credit)}`}
                  </p>
                </div>
                <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">Reason for excluding</label>
                <div className="space-y-1.5 mb-4">
                  {[
                    { value: 'Personal transaction', label: 'Personal transaction' },
                    { value: 'Bank charges / fees', label: 'Bank charges / fees' },
                    { value: 'Inter-account transfer', label: 'Inter-account transfer' },
                    { value: 'Not business related', label: 'Not business related' },
                    { value: 'Duplicate entry', label: 'Duplicate entry' },
                  ].map((opt) => (
                    <label key={opt.value}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${excludeReason === opt.value ? 'border-blue-300 bg-blue-50/50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input type="radio" name="exclude_reason" value={opt.value} checked={excludeReason === opt.value}
                        onChange={() => setExcludeReason(opt.value)} className="accent-blue-600" />
                      <span className="text-[13px] text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setExcludingTxn(null)} className="flex-1 px-3 py-2 text-[13px] text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Cancel</button>
                  <button onClick={doExclude} disabled={!excludeReason}
                    className="flex-1 px-3 py-2 text-[13px] text-white bg-gray-700 rounded-xl hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed">
                    Exclude
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* === Invoice Preview Slide-over === */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-16 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <dl className="space-y-3">
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Invoice No.</dt><dd className="text-[13px] text-gray-900 font-medium">{previewInvoice.invoice_number ?? '-'}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Vendor</dt><dd className="text-[13px] text-gray-900">{previewInvoice.vendor_name}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Issue Date</dt><dd className="text-[13px] text-gray-900">{formatDate(previewInvoice.issue_date)}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Total Amount</dt><dd className="text-[15px] font-bold text-gray-900 tabular-nums">{formatRM(previewInvoice.total_amount)}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Allocated to Payment</dt><dd className="text-[15px] font-bold text-green-600 tabular-nums">{formatRM(previewInvoice.allocated_amount)}</dd></div>
              </dl>

              {previewTxn && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reconciled via Bank Transaction</p>
                  <p className="text-[12px] text-gray-700">{previewTxn.description.split(' | ')[0]}</p>
                  <p className="text-[11px] text-gray-400">{formatDate(previewTxn.transaction_date)} — {previewTxn.debit ? `Debit ${formatRM(previewTxn.debit)}` : `Credit ${formatRM(previewTxn.credit)}`}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex-shrink-0">
              <button
                onClick={() => window.open(`/accountant/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#152237' }}
              >
                Open in Invoices
              </button>
            </div>
          </div>
        </>
      )}

      {/* === Receipt Preview Slide-over === */}
      {previewReceipt && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewReceipt(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-16 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Receipt Details</h2>
              <button onClick={() => setPreviewReceipt(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-xl border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image</div>
              )}
              <dl className="space-y-3">
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Merchant</dt><dd className="text-[13px] text-gray-900 font-medium">{previewReceipt.merchant}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Receipt No.</dt><dd className="text-[13px] text-gray-900">{previewReceipt.receipt_number ?? '-'}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Date</dt><dd className="text-[13px] text-gray-900">{formatDate(previewReceipt.claim_date)}</dd></div>
                <div><dt className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Amount</dt><dd className="text-[15px] font-bold text-gray-900 tabular-nums">{formatRM(previewReceipt.amount)}</dd></div>
              </dl>

              {previewTxn && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reconciled via Bank Transaction</p>
                  <p className="text-[12px] text-gray-700">{previewTxn.description.split(' | ')[0]}</p>
                  <p className="text-[11px] text-gray-400">{formatDate(previewTxn.transaction_date)} — {previewTxn.debit ? `Debit ${formatRM(previewTxn.debit)}` : `Credit ${formatRM(previewTxn.credit)}`}</p>
                </div>
              )}
            </div>
            <div className="p-4 border-t flex-shrink-0">
              <button
                onClick={() => window.open(`/accountant/claims?search=${encodeURIComponent(previewReceipt.receipt_number ?? previewReceipt.merchant)}`, '_blank')}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#152237' }}
              >
                Open in Claims
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
