'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import HelpTooltip from '@/components/HelpTooltip';
import { usePageTitle } from '@/lib/use-page-title';
import { useFirm } from '@/contexts/FirmContext';

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
  file_url: string | null;
  gl_label: string | null;
  contra_gl_label: string | null;
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
  matched_invoice: { id: string; invoice_number: string; vendor_name: string; total_amount: string; amount_paid: string; issue_date: string; file_url: string | null; thumbnail_url: string | null } | null;
  matched_sales_invoice: { id: string; invoice_number: string; total_amount: string; amount_paid: string; issue_date: string; buyer_name: string } | null;
  matched_claim: { id: string; merchant: string; amount: string; claim_date: string; receipt_number: string | null; file_url: string | null; thumbnail_url: string | null; employee_name: string; category_name: string } | null;
}

interface StatementDetail {
  id: string;
  firm_id: string;
  bank_name: string;
  account_number: string | null;
  bank_gl_label: string | null;
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
  matched:          { label: 'Suggested',  cls: 'badge-amber' },
  manually_matched: { label: 'Confirmed',  cls: 'badge-green' },
  unmatched:        { label: 'Unmatched',  cls: 'badge-red' },
};

export default function AccountantReconciliationWorkspacePage() {
  usePageTitle('Bank Reconciliation');
  const { id } = useParams<{ id: string }>();
  const { firmId: selectedFirmId } = useFirm();

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unmatched' | 'suggested' | 'confirmed'>('all');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [matchingTxn, setMatchingTxn] = useState<BankTxn | null>(null);
  const [previewTxn, setPreviewTxn] = useState<BankTxn | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<PaymentAllocation | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceipt | null>(null);
  const [_candidates, _setCandidates] = useState<CandidatePayment[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [outstandingItems, setOutstandingItems] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<{ type: string; id: string } | null>(null);
  const [matchSubmitting, setMatchSubmitting] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [rematching, setRematching] = useState(false);
  const [rematchResult, setRematchResult] = useState<{ matched: number } | null>(null);

  // Payment voucher / official receipt creation (shared supplier+category lists)
  const [showVoucherForm, setShowVoucherForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [voucherSuppliers, setVoucherSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [voucherCategories, setVoucherCategories] = useState<{ id: string; name: string }[]>([]);
  const [voucherData, setVoucherData] = useState({ supplier_id: '', category_id: '', reference: '', notes: '' });
  const [creatingVoucher, setCreatingVoucher] = useState(false);
  const [voucherError, setVoucherError] = useState('');

  const loadStatement = () => {
    fetch(`/api/bank-reconciliation/statements/${id}`)
      .then((r) => r.json())
      .then((j) => { setStatement(j.data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadStatement(); }, [id]);

  // Auto-rematch when statement loads with unmatched transactions
  const [autoRematched, setAutoRematched] = useState(false);
  useEffect(() => {
    if (!statement || autoRematched || rematching) return;
    const unmatched = statement.transactions.filter(t => t.recon_status === 'unmatched').length;
    if (unmatched > 0) {
      setAutoRematched(true);
      doRematch();
    }
  }, [statement]);


  const filteredTxns = statement?.transactions.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'suggested') return t.recon_status === 'matched';
    if (filter === 'confirmed') return t.recon_status === 'manually_matched';
    return t.recon_status === filter;
  }) ?? [];

  const suggestedCount = statement?.transactions.filter((t) => t.recon_status === 'matched').length ?? 0;
  const confirmedCount = statement?.transactions.filter((t) => t.recon_status === 'manually_matched').length ?? 0;

  const doConfirm = async (txnIds: string[]) => {
    setConfirming(true);
    setConfirmError('');
    try {
      const res = await fetch('/api/bank-reconciliation/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionIds: txnIds }),
      });
      const json = await res.json();
      if (!res.ok) {
        setConfirmError(json.error || 'Failed to confirm');
      } else {
        loadStatement();
      }
    } catch (e) { console.error(e); }
    finally { setConfirming(false); }
  };

  const doConfirmAll = () => {
    const suggestedIds = (statement?.transactions ?? [])
      .filter((t) => t.recon_status === 'matched')
      .map((t) => t.id);
    if (suggestedIds.length > 0) doConfirm(suggestedIds);
  };

  const closeMatchModal = () => {
    setMatchingTxn(null);
    setShowVoucherForm(false);
    setShowReceiptForm(false);
    setVoucherData({ supplier_id: '', category_id: '', reference: '', notes: '' });
    setVoucherError('');
  };

  const openMatchModal = async (txn: BankTxn) => {
    // Require firm selection
    const firmId = selectedFirmId || statement?.firm_id;
    if (!firmId) {
      window.dispatchEvent(new Event('highlight-firm-selector'));
      return;
    }
    setMatchingTxn(txn);
    setShowVoucherForm(false);
    setShowReceiptForm(false);
    setVoucherError('');
    setMatchError('');
    setSelectedItem(null);
    setLoadingCandidates(true);

    const amount = txn.debit ?? txn.credit ?? '';
    const direction = txn.debit ? 'outgoing' : 'incoming'; // debit in bank = money out (withdrawal), credit = money in (deposit)

    // Fetch outstanding invoices/claims
    const params = new URLSearchParams({ firmId, direction });
    if (amount) params.set('amount', amount);
    const res = await fetch(`/api/bank-reconciliation/outstanding-items?${params}`);
    const json = await res.json();
    setOutstandingItems(json.data ?? []);
    setLoadingCandidates(false);
  };

  const _doMatch = async (paymentId: string) => {
    if (!matchingTxn) return;
    await fetch('/api/bank-reconciliation/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: matchingTxn.id, paymentId }),
    });
    closeMatchModal();
    loadStatement();
  };

  const doMatchItem = async (item: { type: string; id: string }) => {
    if (!matchingTxn) return;
    setMatchSubmitting(true);
    setMatchError('');
    try {
      const body: Record<string, string> = { bankTransactionId: matchingTxn.id };
      if (item.type === 'invoice') body.invoiceId = item.id;
      else if (item.type === 'sales_invoice') body.salesInvoiceId = item.id;
      else if (item.type === 'claim') body.claimId = item.id;

      const res = await fetch('/api/bank-reconciliation/match-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMatchError(json.error || 'Match failed');
        setMatchSubmitting(false);
        return;
      }
      closeMatchModal();
      loadStatement();
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : 'Network error');
    }
    setMatchSubmitting(false);
  };

  const openVoucherForm = async () => {
    setShowVoucherForm(true);
    setVoucherError('');
    const firmId = statement?.firm_id;
    if (!firmId) return;
    const [suppRes, catRes] = await Promise.all([
      fetch(`/api/suppliers?firmId=${firmId}`).then((r) => r.json()),
      fetch(`/api/categories?firmId=${firmId}`).then((r) => r.json()),
    ]);
    const suppliers = (suppRes.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    setVoucherSuppliers(suppliers);
    setVoucherCategories(catRes.data ?? []);
    // Pre-select "Walk-in Customer" if it exists
    const walkIn = suppliers.find((s: { name: string }) => s.name === 'Walk-in Customer');
    if (walkIn) setVoucherData((prev) => ({ ...prev, supplier_id: walkIn.id }));
  };

  const doCreateVoucher = async () => {
    if (!matchingTxn || !voucherData.supplier_id || !voucherData.category_id) return;
    setCreatingVoucher(true);
    setVoucherError('');
    try {
      const res = await fetch('/api/bank-reconciliation/create-voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: matchingTxn.id, ...voucherData }),
      });
      const json = await res.json();
      if (!res.ok) { setVoucherError(json.error || 'Failed to create payment voucher'); return; }
      if (json.data?.jv_warning) setVoucherError(`Created, but JV warning: ${json.data.jv_warning}`);
      closeMatchModal();
      loadStatement();
    } finally { setCreatingVoucher(false); }
  };

  const openReceiptForm = async () => {
    setShowReceiptForm(true);
    setVoucherError('');
    const firmId = statement?.firm_id;
    if (!firmId) return;
    const [suppRes, catRes] = await Promise.all([
      fetch(`/api/suppliers?firmId=${firmId}`).then((r) => r.json()),
      fetch(`/api/categories?firmId=${firmId}`).then((r) => r.json()),
    ]);
    const suppliers = (suppRes.data ?? []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }));
    setVoucherSuppliers(suppliers);
    setVoucherCategories(catRes.data ?? []);
    const walkIn = suppliers.find((s: { name: string }) => s.name === 'Walk-in Customer');
    if (walkIn) setVoucherData((prev) => ({ ...prev, supplier_id: walkIn.id }));
  };

  const doCreateReceipt = async () => {
    if (!matchingTxn || !voucherData.supplier_id || !voucherData.category_id) return;
    setCreatingVoucher(true);
    setVoucherError('');
    try {
      const res = await fetch('/api/bank-reconciliation/create-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankTransactionId: matchingTxn.id, ...voucherData }),
      });
      const json = await res.json();
      if (!res.ok) { setVoucherError(json.error || 'Failed to create official receipt'); return; }
      if (json.data?.jv_warning) setVoucherError(`Created, but JV warning: ${json.data.jv_warning}`);
      closeMatchModal();
      loadStatement();
    } finally { setCreatingVoucher(false); }
  };

  const doUnmatch = async (txnId: string) => {
    await fetch('/api/bank-reconciliation/unmatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankTransactionId: txnId }),
    });
    loadStatement();
  };


  const doRematch = async () => {
    setRematching(true);
    setRematchResult(null);
    try {
      const res = await fetch('/api/bank-reconciliation/rematch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bankStatementId: id }),
      });
      const j = await res.json();
      if (j.data) setRematchResult(j.data);
      loadStatement();
    } catch (e) { console.error(e); }
    setRematching(false);
    setTimeout(() => setRematchResult(null), 5000);
  };
  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">
      <Sidebar role="accountant" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <div className="flex items-center gap-3">
            <Link href="/accountant/bank-reconciliation" className="text-[#8E9196] hover:text-[#434654] transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">
              {statement ? `${statement.bank_name} — ${statement.account_number ?? 'N/A'} — ${formatDate(statement.statement_date)}` : 'Loading...'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {rematchResult && (
              <span className="text-body-sm text-green-600 font-medium">{rematchResult.matched} new match{rematchResult.matched !== 1 ? 'es' : ''} found</span>
            )}
            <button
              onClick={doRematch}
              disabled={rematching}
              className="flex items-center gap-1.5 px-3 py-1.5 text-body-md font-medium btn-blue rounded-lg text-white disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              {rematching ? 'Matching...' : 'Re-match'}
            </button>
            {statement?.file_url && (
              <a href={statement.file_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-body-md font-medium btn-primary rounded-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download PDF
              </a>
            )}
          </div>
        </header>

        {/* ── Static summary + filter tabs ── */}
        {!loading && statement && (
          <div className="flex-shrink-0 px-6 pt-4 pb-1 bg-[#F7F9FB]">

              {/* Summary cards */}
              <div className="grid grid-cols-7 gap-3 mb-4">
                {(() => {
                  const totalDebit = statement.transactions.reduce((s, t) => s + Number(t.debit ?? 0), 0);
                  const totalCredit = statement.transactions.reduce((s, t) => s + Number(t.credit ?? 0), 0);
                  return [
                    { label: 'Opening Balance', value: formatRM(statement.opening_balance), color: 'text-[#191C1E]' },
                    { label: 'Total Debit', value: formatRM(totalDebit), color: 'text-red-600' },
                    { label: 'Total Credit', value: formatRM(totalCredit), color: 'text-green-600' },
                    { label: 'Closing Balance', value: formatRM(statement.closing_balance), color: 'text-[#191C1E]' },
                    { label: 'Confirmed', value: `${confirmedCount} / ${statement.summary.total}`, color: 'text-green-600' },
                    { label: 'Suggested', value: String(suggestedCount), color: suggestedCount > 0 ? 'text-amber-600' : 'text-green-600' },
                    { label: 'Unmatched', value: String(statement.summary.unmatched), color: statement.summary.unmatched > 0 ? 'text-red-600' : 'text-green-600' },
                  ];
                })().map((c) => (
                  <div key={c.label} className="bg-white rounded-lg p-3">
                    <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">{c.label}</p>
                    <p className={`text-title-md font-bold tabular-nums ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Filter tabs + Confirm All */}
              <div className="flex items-center gap-1 mb-3">
                {([
                  { key: 'all', label: 'All' },
                  { key: 'unmatched', label: `Unmatched (${statement.summary.unmatched})` },
                  { key: 'suggested', label: `Suggested (${suggestedCount})` },
                  { key: 'confirmed', label: `Confirmed (${confirmedCount})` },
                ] as const).map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-body-sm font-medium rounded-lg transition-colors ${filter === f.key ? 'bg-gray-900 text-white' : 'bg-white text-[#434654] border border-gray-200 hover:bg-gray-50'}`}
                  >
                    {f.label}
                  </button>
                ))}

                {suggestedCount > 0 && (
                  <button
                    onClick={doConfirmAll}
                    disabled={confirming}
                    className="ml-auto btn-approve px-4 py-1.5 text-body-sm font-medium rounded-lg disabled:opacity-50"
                  >
                    {confirming ? 'Confirming...' : `Confirm All (${suggestedCount})`}
                  </button>
                )}
              </div>

              {confirmError && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 whitespace-pre-line">{confirmError}</div>
              )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-6 pt-2 pb-6 animate-in">
          {loading || !statement ? (
            <div className="text-center text-sm text-[#8E9196] py-12">Loading...</div>
          ) : (
            <>
              {/* Transaction table */}
              <div className="bg-white rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header">
                      <th className="px-4 py-2.5 text-left w-[70px]">Status</th>
                      <th className="px-3 py-2.5 text-left w-[80px]">Date</th>
                      <th className="px-3 py-2.5 text-left">Description</th>
                      <th className="px-3 py-2.5 text-right w-[110px]">Debit</th>
                      <th className="px-3 py-2.5 text-right w-[110px]">Credit</th>
                      <th className="px-3 py-2.5 text-right w-[110px]">Balance</th>
                      <th className="px-3 py-2.5 text-left">Matched To</th>
                      <th className="px-3 py-2.5 text-right w-[120px]">
                        <div className="flex items-center justify-end gap-1.5">
                          Actions
                          <HelpTooltip items={[
                            { label: 'Confirm', description: 'Accept a suggested match and create a journal entry.' },
                            { label: 'Match', description: 'Manually link an unmatched bank transaction to a payment.' },
                            { label: 'Unmatch', description: 'Remove the match. Reverses the journal entry if confirmed.' },
                          ]} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map((txn) => {
                      const cfg = STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched;
                      const isExpanded = previewTxn?.id === txn.id;
                      const mp = txn.matched_payment;
                      return (
                        <React.Fragment key={txn.id}>
                        <tr className={`group transition-colors cursor-pointer hover:bg-blue-50/40 ${isExpanded ? 'bg-blue-50/60' : txn.recon_status === 'matched' || txn.recon_status === 'manually_matched' ? 'bg-green-50/30' : ''}`}
                          onClick={() => setPreviewTxn(isExpanded ? null : txn)}
                        >
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                className={`text-[#8E9196] flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                <path d="M9 18l6-6-6-6" />
                              </svg>
                              <span className={cfg.cls}>{cfg.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-body-sm text-[#434654] tabular-nums">{formatDate(txn.transaction_date)}</td>
                          <td className="px-3 py-2.5 text-body-sm text-[#191C1E] max-w-[250px] truncate" title={txn.description}>
                            {txn.description.split(' | ')[0]}
                            {txn.reference && <span className="ml-1 text-[#8E9196] text-label-sm">({txn.reference})</span>}
                          </td>
                          <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-red-600">{txn.debit ? formatRM(txn.debit) : '-'}</td>
                          <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-green-600">{txn.credit ? formatRM(txn.credit) : '-'}</td>
                          <td className="px-3 py-2.5 text-body-sm text-right tabular-nums text-[#434654]">{txn.balance ? formatRM(txn.balance) : '-'}</td>
                          <td className="px-3 py-2.5 text-body-sm text-[#434654]">
                            {mp ? (
                              <span>{mp.supplier_name} {mp.reference ? `(${mp.reference})` : ''}</span>
                            ) : txn.notes ? (
                              <span className="text-[#8E9196] italic">{txn.notes}</span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            {txn.recon_status === 'unmatched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); openMatchModal(txn); }} className="text-label-sm w-[70px] py-1.5 text-white btn-blue rounded-lg transition-all duration-200 text-center">Match</button>
                              </div>
                            )}
                            {txn.recon_status === 'matched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); doConfirm([txn.id]); }} disabled={confirming} className="text-label-sm w-[70px] py-1.5 text-white btn-approve rounded-lg transition-all duration-200 text-center disabled:opacity-50">Confirm</button>
                                <button onClick={(e) => { e.stopPropagation(); doUnmatch(txn.id); }} className="text-label-sm w-[70px] py-1.5 text-white btn-danger rounded-lg transition-all duration-200 text-center">Unmatch</button>
                              </div>
                            )}
                            {txn.recon_status === 'manually_matched' && (
                              <div className="flex gap-1 justify-end">
                                <button onClick={(e) => { e.stopPropagation(); doUnmatch(txn.id); }} className="text-label-sm w-[70px] py-1.5 text-white btn-danger rounded-lg transition-all duration-200 text-center">Unmatch</button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-blue-50/30">
                            <td colSpan={8} className="px-6 py-4">
                              <div className={`grid ${mp ? 'grid-cols-3' : 'grid-cols-2'} gap-4 mb-3`}>
                                <div>
                                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Bank Description</p>
                                  {txn.description.split(' | ').map((line, i) => (
                                    <p key={i} className="text-body-sm text-[#434654]">{line}</p>
                                  ))}
                                  {txn.reference && <p className="text-label-sm text-[#8E9196] mt-1">Ref: {txn.reference}</p>}
                                  {txn.cheque_number && <p className="text-label-sm text-[#8E9196]">Cheque: {txn.cheque_number}</p>}
                                  {txn.notes && <p className="text-label-sm text-[#8E9196] italic mt-1">{txn.notes}</p>}
                                </div>
                                <div>
                                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Transaction Details</p>
                                  <p className="text-body-sm text-[#434654]">Date: {formatDate(txn.transaction_date)}</p>
                                  {txn.debit ? <p className="text-body-sm text-red-600">Debit: {formatRM(txn.debit)}</p> : null}
                                  {txn.credit ? <p className="text-body-sm text-green-600">Credit: {formatRM(txn.credit)}</p> : null}
                                  <p className="text-body-sm text-[#434654]">Balance: {txn.balance ? formatRM(txn.balance) : '-'}</p>
                                  <p className="text-label-sm text-[#8E9196] mt-1">Status: <span className={cfg.cls}>{cfg.label}</span></p>
                                  {txn.matched_at && <p className="text-label-sm text-[#8E9196]">Matched: {formatDate(txn.matched_at)}</p>}
                                </div>
                                {/* Matched invoice/claim block */}
                                {txn.matched_invoice && (
                                  <div>
                                    <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Matched Invoice</p>
                                    <div className="bg-white rounded-lg border border-blue-100 p-3">
                                      <p className="text-body-sm font-semibold text-[#191C1E]">{txn.matched_invoice.vendor_name}</p>
                                      <p className="text-body-sm text-[#434654]">{txn.matched_invoice.invoice_number} · {formatDate(txn.matched_invoice.issue_date)}</p>
                                      <p className="text-body-sm font-medium text-[#191C1E] mt-1">{formatRM(txn.matched_invoice.total_amount)}</p>
                                      {txn.matched_invoice.file_url && (
                                        <a href={txn.matched_invoice.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 mt-2 text-label-sm text-blue-600 hover:text-blue-800">
                                          View Invoice PDF &rarr;
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {txn.matched_sales_invoice && (
                                  <div>
                                    <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Matched Sales Invoice</p>
                                    <div className="bg-white rounded-lg border border-green-100 p-3">
                                      <p className="text-body-sm font-semibold text-[#191C1E]">{txn.matched_sales_invoice.buyer_name}</p>
                                      <p className="text-body-sm text-[#434654]">{txn.matched_sales_invoice.invoice_number} · {formatDate(txn.matched_sales_invoice.issue_date)}</p>
                                      <p className="text-body-sm font-medium text-[#191C1E] mt-1">{formatRM(txn.matched_sales_invoice.total_amount)}</p>
                                    </div>
                                  </div>
                                )}
                                {txn.matched_claim && (
                                  <div>
                                    <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Matched Claim</p>
                                    <div className="bg-white rounded-lg border border-amber-100 p-3">
                                      <p className="text-body-sm font-semibold text-[#191C1E]">{txn.matched_claim.employee_name} — {txn.matched_claim.merchant}</p>
                                      <p className="text-body-sm text-[#434654]">{txn.matched_claim.category_name} · {formatDate(txn.matched_claim.claim_date)}</p>
                                      <p className="text-body-sm font-medium text-[#191C1E] mt-1">{formatRM(txn.matched_claim.amount)}</p>
                                      {txn.matched_claim.file_url && (
                                        <a href={txn.matched_claim.file_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                          className="inline-flex items-center gap-1 mt-2 text-label-sm text-blue-600 hover:text-blue-800">
                                          View Receipt &rarr;
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {mp && (
                                <div>
                                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Matched Payment</p>
                                  <p className="text-body-md font-medium text-[#191C1E]">{mp.supplier_name}</p>
                                  <p className="text-body-sm text-[#434654]">{formatDate(mp.payment_date)} — {formatRM(mp.amount)} — {mp.direction}</p>
                                  {mp.reference && <p className="text-label-sm text-[#8E9196]">Ref: {mp.reference}</p>}
                                  {mp.notes && <p className="text-label-sm text-[#8E9196] italic">{mp.notes}</p>}
                                </div>
                                )}
                              </div>

                              {mp && mp.allocations.length > 0 && (
                                <div className="mb-3">
                                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1.5">Linked Invoices ({mp.allocations.length})</p>
                                  <div className="space-y-1">
                                    {mp.allocations.map((a) => (
                                      <div key={a.invoice_id}
                                        onClick={(e) => { e.stopPropagation(); setPreviewInvoice(a); }}
                                        className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer">
                                        <div>
                                          <span className="text-body-sm font-medium text-blue-700">{a.invoice_number ?? 'No number'}</span>
                                          <span className="text-label-sm text-[#8E9196] ml-2">{a.vendor_name} — {formatDate(a.issue_date)}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-body-sm font-semibold tabular-nums text-[#191C1E]">{formatRM(a.allocated_amount)}</span>
                                          <span className="text-label-sm text-[#8E9196] ml-1">/ {formatRM(a.total_amount)}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mp && mp.receipts.length > 0 && (
                                <div>
                                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1.5">Linked Receipts ({mp.receipts.length})</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    {mp.receipts.map((r) => (
                                      <div key={r.id}
                                        onClick={(e) => { e.stopPropagation(); setPreviewReceipt(r); }}
                                        className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer">
                                        {r.thumbnail_url && <img src={r.thumbnail_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />}
                                        <div className="min-w-0">
                                          <p className="text-body-sm font-medium text-blue-700 truncate">{r.merchant}</p>
                                          <p className="text-label-sm text-[#8E9196]">{r.receipt_number ?? 'No #'} — {formatDate(r.claim_date)} — {formatRM(r.amount)}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {mp && mp.allocations.length === 0 && mp.receipts.length === 0 && (
                                <p className="text-body-sm text-[#8E9196] italic">No invoices or receipts linked to this payment yet.</p>
                              )}

                              {/* JV Preview for suggested matches */}
                              {mp && (txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') && (() => {
                                const receipt = mp.receipts[0];
                                const hasExplicitGl = !!(receipt?.gl_label && receipt?.contra_gl_label);
                                const bankGl = statement.bank_gl_label;
                                const amount = txn.credit ?? txn.debit;

                                // When receipt has explicit GL, use as-is (Expense=Debit, Contra=Credit)
                                const debitLabel = hasExplicitGl ? receipt.gl_label! : (txn.credit ? (bankGl ?? `${statement.bank_name} (no GL mapped)`) : (receipt?.gl_label ?? 'Trade Payables (default)'));
                                const creditLabel = hasExplicitGl ? receipt.contra_gl_label! : (txn.credit ? (receipt?.gl_label ?? 'Staff Claims Payable (default)') : (bankGl ?? `${statement.bank_name} (no GL mapped)`));

                                // Mismatch warning: receipt has explicit GL but neither side matches the bank statement GL
                                const glMismatch = hasExplicitGl && bankGl && receipt.gl_label !== bankGl && receipt.contra_gl_label !== bankGl;

                                return (
                                  <div className="mt-3 bg-white rounded-lg border border-gray-200 p-3">
                                    <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-2">Journal Entry Preview</p>
                                    <table className="w-full text-body-sm">
                                      <thead>
                                        <tr className="text-left text-label-sm text-[#8E9196] uppercase">
                                          <th className="py-1">Account</th>
                                          <th className="py-1 text-right">Debit</th>
                                          <th className="py-1 text-right">Credit</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        <tr><td className="py-1 text-[#191C1E] font-medium">{debitLabel}</td><td className="py-1 text-right tabular-nums">{formatRM(amount)}</td><td className="py-1 text-right">-</td></tr>
                                        <tr><td className="py-1 text-[#191C1E] font-medium">{creditLabel}</td><td className="py-1 text-right">-</td><td className="py-1 text-right tabular-nums">{formatRM(amount)}</td></tr>
                                      </tbody>
                                    </table>
                                    {glMismatch && (
                                      <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5">
                                        Warning: Receipt GL does not reference this bank statement&apos;s GL ({bankGl}). Verify the GL accounts are correct before confirming.
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    {(() => {
                      const allTxns = statement.transactions;
                      const totalDr = allTxns.reduce((s, t) => s + Number(t.debit ?? 0), 0);
                      const totalCr = allTxns.reduce((s, t) => s + Number(t.credit ?? 0), 0);
                      const opening = Number(statement.opening_balance ?? 0);
                      const closing = Number(statement.closing_balance ?? 0);
                      const expected = opening - totalDr + totalCr;
                      const diff = Math.abs(expected - closing);
                      const mismatch = diff > 0.01;
                      return (
                        <>
                          <tr className="bg-gray-50 border-t-2 border-gray-200">
                            <td colSpan={3} className="px-4 py-2.5 text-body-sm font-semibold text-[#191C1E]">Total</td>
                            <td className="px-3 py-2.5 text-body-sm text-right tabular-nums font-bold text-red-600 whitespace-nowrap">{formatRM(totalDr)}</td>
                            <td className="px-3 py-2.5 text-body-sm text-right tabular-nums font-bold text-green-600 whitespace-nowrap">{formatRM(totalCr)}</td>
                            <td colSpan={3} />
                          </tr>
                          {mismatch && (
                            <tr className="bg-amber-50 border-t border-amber-200">
                              <td colSpan={8} className="px-4 py-2.5 text-body-sm text-amber-700">
                                <span className="font-semibold">Balance mismatch:</span> Opening ({formatRM(opening)}) − Debit ({formatRM(totalDr)}) + Credit ({formatRM(totalCr)}) = {formatRM(expected)}, but closing balance is {formatRM(closing)}. Difference: <strong>{formatRM(diff)}</strong> — the bank statement may have been parsed incorrectly.
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })()}
                  </tfoot>
                </table>
                {filteredTxns.length === 0 && (
                  <div className="text-center py-8 text-sm text-[#8E9196]">No transactions in this filter.</div>
                )}
              </div>

            </>
          )}

          {/* Match modal */}
          {matchingTxn && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-center justify-center" onClick={closeMatchModal}>
              <div className="bg-white rounded-lg shadow-xl p-6 w-[600px] max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-title-md font-semibold text-[#191C1E] mb-3">
                  {matchingTxn.debit ? 'Match Outgoing Payment' : 'Match Incoming Payment'}
                </h2>
                <div className="bg-gray-50 rounded-lg p-3 mb-4 text-body-sm">
                  <p className="font-medium text-[#191C1E]">{matchingTxn.description.split(' | ')[0]}</p>
                  <p className="text-[#434654] mt-1">
                    {formatDate(matchingTxn.transaction_date)} — {matchingTxn.debit ? `Debit ${formatRM(matchingTxn.debit)}` : `Credit ${formatRM(matchingTxn.credit)}`}
                  </p>
                </div>

                {/* Outstanding items list */}
                <p className="text-body-sm font-medium text-[#434654] mb-2">
                  {matchingTxn.debit ? 'Outstanding Invoices & Claims' : 'Outstanding Sales Invoices'}
                </p>
                {loadingCandidates ? (
                  <p className="text-sm text-[#8E9196] py-4 text-center">Loading...</p>
                ) : outstandingItems.length === 0 ? (
                  <p className="text-sm text-[#8E9196] py-4 text-center">No outstanding items found.</p>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {outstandingItems.map((item: { type: string; id: string; reference: string | null; name: string; totalAmount: number; remaining: number; date: string; categoryName?: string }) => {
                      const isSelected = selectedItem?.id === item.id;
                      return (
                        <div
                          key={`${item.type}-${item.id}`}
                          onClick={() => setSelectedItem(isSelected ? null : { type: item.type, id: item.id })}
                          className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-blue-300 hover:bg-blue-50/50'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                                item.type === 'invoice' ? 'bg-amber-100 text-amber-700' : item.type === 'claim' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                              }`}>
                                {item.type === 'invoice' ? 'INV' : item.type === 'claim' ? 'CLAIM' : 'SALES'}
                              </span>
                              <p className="text-body-sm font-medium text-[#191C1E] truncate">{item.name}</p>
                            </div>
                            <p className="text-label-sm text-[#8E9196] mt-0.5">
                              {item.reference ?? ''} {item.reference ? '·' : ''} {formatDate(item.date)}
                              {item.categoryName ? ` · ${item.categoryName}` : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-body-md font-semibold tabular-nums text-[#191C1E]">{formatRM(String(item.remaining))}</p>
                            {item.remaining !== item.totalAmount && (
                              <p className="text-label-sm text-[#8E9196]">of {formatRM(String(item.totalAmount))}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Match error */}
                {matchError && <p className="text-sm text-red-600 mt-2">{matchError}</p>}

                {/* Confirm match button */}
                {selectedItem && (
                  <button
                    onClick={() => doMatchItem(selectedItem)}
                    disabled={matchSubmitting}
                    className="btn-approve w-full mt-3 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {matchSubmitting ? 'Matching...' : 'Confirm & Create JV'}
                  </button>
                )}

                {/* Official receipt option — debit (money received) transactions only */}
                {matchingTxn.debit && (
                  <>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-label-sm text-[#8E9196]">or</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {!showReceiptForm ? (
                      <button
                        onClick={openReceiptForm}
                        className="w-full px-3 py-2 text-body-md font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 transition-colors"
                      >
                        + Create Official Receipt
                      </button>
                    ) : (
                      <div className="space-y-3 border border-green-100 rounded-lg p-4 bg-green-50/30">
                        <h3 className="text-body-md font-semibold text-[#191C1E]">Create Official Receipt</h3>
                        <div className="bg-white rounded-lg p-2.5 text-body-sm text-[#434654] flex gap-3">
                          <span>Amount: <strong>{formatRM(matchingTxn.debit)}</strong></span>
                          <span>Date: <strong>{formatDate(matchingTxn.transaction_date)}</strong></span>
                        </div>
                        <div>
                          <label className="input-label">Received From</label>
                          <select
                            value={voucherData.supplier_id}
                            onChange={(e) => setVoucherData({ ...voucherData, supplier_id: e.target.value })}
                            className="input-field w-full"
                          >
                            <option value="">Walk-in Customer (default)</option>
                            {voucherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Category</label>
                          <select
                            value={voucherData.category_id}
                            onChange={(e) => setVoucherData({ ...voucherData, category_id: e.target.value })}
                            className="input-field w-full"
                          >
                            <option value="">Select category...</option>
                            {voucherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Receipt No. (optional)</label>
                          <input
                            type="text"
                            value={voucherData.reference}
                            onChange={(e) => setVoucherData({ ...voucherData, reference: e.target.value })}
                            className="input-field w-full"
                            placeholder="e.g. OR-001"
                          />
                        </div>
                        <div>
                          <label className="input-label">Notes (optional)</label>
                          <input
                            type="text"
                            value={voucherData.notes}
                            onChange={(e) => setVoucherData({ ...voucherData, notes: e.target.value })}
                            className="input-field w-full"
                            placeholder="e.g. Payment received for invoice #123"
                          />
                        </div>
                        {voucherError && <p className="text-sm text-red-600">{voucherError}</p>}
                        <div className="flex gap-3">
                          <button
                            onClick={doCreateReceipt}
                            disabled={creatingVoucher || !voucherData.category_id}
                            className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {creatingVoucher ? 'Creating...' : 'Create & Match'}
                          </button>
                          <button
                            onClick={() => setShowReceiptForm(false)}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Payment voucher option — credit (outgoing) transactions only */}
                {matchingTxn.credit && (
                  <>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-label-sm text-[#8E9196]">or</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>

                    {!showVoucherForm ? (
                      <button
                        onClick={openVoucherForm}
                        className="w-full px-3 py-2 text-body-md font-medium text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        + Create Payment Voucher
                      </button>
                    ) : (
                      <div className="space-y-3 border border-blue-100 rounded-lg p-4 bg-blue-50/30">
                        <h3 className="text-body-md font-semibold text-[#191C1E]">Create Payment Voucher</h3>
                        <div className="bg-white rounded-lg p-2.5 text-body-sm text-[#434654] flex gap-3">
                          <span>Amount: <strong>{formatRM(matchingTxn.credit)}</strong></span>
                          <span>Date: <strong>{formatDate(matchingTxn.transaction_date)}</strong></span>
                        </div>
                        <div>
                          <label className="input-label">Supplier</label>
                          <select
                            value={voucherData.supplier_id}
                            onChange={(e) => setVoucherData({ ...voucherData, supplier_id: e.target.value })}
                            className="input-field w-full"
                          >
                            <option value="">Walk-in Customer (default)</option>
                            {voucherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Category</label>
                          <select
                            value={voucherData.category_id}
                            onChange={(e) => setVoucherData({ ...voucherData, category_id: e.target.value })}
                            className="input-field w-full"
                          >
                            <option value="">Select category...</option>
                            {voucherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="input-label">Reference (optional)</label>
                          <input
                            type="text"
                            value={voucherData.reference}
                            onChange={(e) => setVoucherData({ ...voucherData, reference: e.target.value })}
                            className="input-field w-full"
                            placeholder="e.g. PV-001"
                          />
                        </div>
                        <div>
                          <label className="input-label">Notes (optional)</label>
                          <input
                            type="text"
                            value={voucherData.notes}
                            onChange={(e) => setVoucherData({ ...voucherData, notes: e.target.value })}
                            className="input-field w-full"
                            placeholder="e.g. Customer payment for order #123"
                          />
                        </div>
                        {voucherError && <p className="text-sm text-red-600">{voucherError}</p>}
                        <div className="flex gap-3">
                          <button
                            onClick={doCreateVoucher}
                            disabled={creatingVoucher || !voucherData.category_id}
                            className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {creatingVoucher ? 'Creating...' : 'Create & Match'}
                          </button>
                          <button
                            onClick={() => setShowVoucherForm(false)}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                <button onClick={closeMatchModal} className="mt-4 w-full px-3 py-2 text-body-md text-[#434654] border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancel
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* === Invoice Preview Modal === */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <dl className="space-y-3">
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Invoice No.</dt><dd className="text-body-md text-[#191C1E] font-medium">{previewInvoice.invoice_number ?? '-'}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Vendor</dt><dd className="text-body-md text-[#191C1E]">{previewInvoice.vendor_name}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Issue Date</dt><dd className="text-body-md text-[#191C1E]">{formatDate(previewInvoice.issue_date)}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Total Amount</dt><dd className="text-title-md font-bold text-[#191C1E] tabular-nums">{formatRM(previewInvoice.total_amount)}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Allocated to Payment</dt><dd className="text-title-md font-bold text-green-600 tabular-nums">{formatRM(previewInvoice.allocated_amount)}</dd></div>
              </dl>

              {previewTxn && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Reconciled via Bank Transaction</p>
                  <p className="text-body-sm text-[#434654]">{previewTxn.description.split(' | ')[0]}</p>
                  <p className="text-label-sm text-[#8E9196]">{formatDate(previewTxn.transaction_date)} — {previewTxn.debit ? `Debit ${formatRM(previewTxn.debit)}` : `Credit ${formatRM(previewTxn.credit)}`}</p>
                </div>
              )}
            </div>
            <div className="p-4 flex-shrink-0">
              <button
                onClick={() => window.open(`/accountant/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--sidebar)' }}
              >
                Open in Invoices
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* === Receipt Preview Modal === */}
      {previewReceipt && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewReceipt(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewReceipt(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Receipt Details</h2>
              <button onClick={() => setPreviewReceipt(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                previewReceipt.file_url ? (
                  <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
                )
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image</div>
              )}
              {previewReceipt.file_url && (
                <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">View full document</a>
              )}
              <dl className="space-y-3">
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Merchant</dt><dd className="text-body-md text-[#191C1E] font-medium">{previewReceipt.merchant}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Receipt No.</dt><dd className="text-body-md text-[#191C1E]">{previewReceipt.receipt_number ?? '-'}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Date</dt><dd className="text-body-md text-[#191C1E]">{formatDate(previewReceipt.claim_date)}</dd></div>
                <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">Amount</dt><dd className="text-title-md font-bold text-[#191C1E] tabular-nums">{formatRM(previewReceipt.amount)}</dd></div>
                {previewReceipt.gl_label && (
                  <div><dt className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider">GL Account</dt><dd className="text-body-md text-[#191C1E]">{previewReceipt.gl_label}</dd></div>
                )}
              </dl>

              {previewTxn && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">Reconciled via Bank Transaction</p>
                  <p className="text-body-sm text-[#434654]">{previewTxn.description.split(' | ')[0]}</p>
                  <p className="text-label-sm text-[#8E9196]">{formatDate(previewTxn.transaction_date)} — {previewTxn.debit ? `Debit ${formatRM(previewTxn.debit)}` : `Credit ${formatRM(previewTxn.credit)}`}</p>
                </div>
              )}
            </div>
            <div className="p-4 flex-shrink-0">
              <button
                onClick={() => window.open(`/accountant/claims?search=${encodeURIComponent(previewReceipt.receipt_number ?? previewReceipt.merchant)}`, '_blank')}
                className="w-full py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--sidebar)' }}
              >
                Open in Claims
              </button>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
