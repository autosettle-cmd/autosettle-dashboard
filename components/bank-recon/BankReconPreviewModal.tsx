'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { BankReconDetailConfig } from '@/components/pages/BankReconDetailContent';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentAllocation {
  invoice_id: string;
  invoice_number: string | null;
  vendor_name: string;
  total_amount: string;
  issue_date: string;
  allocated_amount: string;
  file_url: string | null;
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
  matched_payment: {
    id: string;
    reference: string | null;
    payment_date: string;
    amount: string;
    direction: string;
    notes: string | null;
    supplier_name: string;
    allocations: PaymentAllocation[];
    receipts: { id: string; merchant: string; receipt_number: string | null; amount: string; claim_date: string; thumbnail_url: string | null; file_url: string | null; gl_label: string | null; contra_gl_label: string | null }[];
  } | null;
  matched_invoice: { id: string; invoice_number: string; vendor_name: string; total_amount: string; amount_paid: string; issue_date: string; file_url: string | null; thumbnail_url: string | null; allocation_amount?: string } | null;
  matched_invoice_allocations?: { invoice_id: string; invoice_number: string; vendor_name: string; total_amount: string; allocation_amount: string; issue_date: string }[];
  matched_sales_invoice: { id: string; invoice_number: string; total_amount: string; amount_paid: string; issue_date: string; buyer_name: string } | null;
  matched_claims: { id: string; merchant: string; amount: string; claim_date: string; receipt_number: string | null; file_url: string | null; thumbnail_url: string | null; employee_id: string; employee_name: string; category_name: string }[];
}

interface StatementDetail {
  firm_id?: string;
  bank_name: string;
  account_number: string | null;
  bank_gl_label: string | null;
}

export interface BankReconPreviewModalProps {
  txn: BankTxn;
  statement: StatementDetail | null;
  config: BankReconDetailConfig;
  expandedDocUrl: string | null;
  confirming: boolean;
  onClose: () => void;
  onConfirm: (txnIds: string[]) => void;
  onUnmatch: (txnId: string) => void;
  onOpenMatchModal: (txn: BankTxn) => void;
  onSetExpandedDocUrl: (url: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSetPreviewInvoice: (inv: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSetPreviewClaim: (claim: any) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onRefresh?: () => void;
  matchingDisabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string) {
  const d = new Date(val);
  return [d.getUTCFullYear(), (d.getUTCMonth() + 1).toString().padStart(2, '0'), d.getUTCDate().toString().padStart(2, '0')].join('.');
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function BankReconPreviewModal({
  txn,
  statement,
  config: _config,
  expandedDocUrl,
  confirming,
  onClose,
  onConfirm,
  onUnmatch,
  onOpenMatchModal,
  onSetExpandedDocUrl,
  onSetPreviewInvoice,
  onSetPreviewClaim,
  onPrev,
  onNext,
  onRefresh,
  matchingDisabled,
}: BankReconPreviewModalProps) {
  const [pressedDir, setPressedDir] = useState<'left' | 'right' | null>(null);
  const [attachingFile, setAttachingFile] = useState(false);
  const [attachError, setAttachError] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [invoiceSearchResults, setInvoiceSearchResults] = useState<{ id: string; invoice_number: string; vendor_name: string; issue_date: string; total_amount: string; thumbnail_url: string | null }[]>([]);
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('');
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  const isPV = txn.matched_invoice?.invoice_number?.startsWith('PV-');
  const _canAttachFromRecon = isPV && !txn.matched_invoice?.file_url;

  const handleAttachFile = async (file: File) => {
    if (!txn.matched_invoice) return;
    setAttachingFile(true);
    setAttachError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/invoices/${txn.matched_invoice.id}/attach`, { method: 'PATCH', body: fd });
      const json = await res.json();
      if (!res.ok) { setAttachError(json.error || 'Failed to attach'); return; }
      if (json.data?.warnings?.length > 0) setAttachError(`Attached with warnings: ${json.data.warnings.join('; ')}`);
      onRefresh?.();
    } catch { setAttachError('Failed to attach document'); }
    finally { setAttachingFile(false); }
  };

  const handleLinkExisting = async (sourceInvoiceId: string) => {
    if (!txn.matched_invoice) return;
    setAttachingFile(true);
    setAttachError('');
    try {
      const res = await fetch(`/api/invoices/${txn.matched_invoice.id}/link-document`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceInvoiceId }),
      });
      const json = await res.json();
      if (!res.ok) { setAttachError(json.error || 'Failed to link'); return; }
      setShowInvoicePicker(false);
      onRefresh?.();
    } catch { setAttachError('Failed to link document'); }
    finally { setAttachingFile(false); }
  };

  const searchInvoices = async (term: string) => {
    setInvoiceSearchTerm(term);
    if (!term.trim()) { setInvoiceSearchResults([]); return; }
    setLoadingInvoices(true);
    try {
      const firmId = (statement as { firm_id?: string } | null)?.firm_id;
      const params = new URLSearchParams({ search: term, hasFile: 'true', take: '10' });
      if (firmId) params.set('firmId', firmId);
      const res = await fetch(`/api/invoices?${params}`);
      const json = await res.json();
      setInvoiceSearchResults((json.data ?? []).filter((inv: { file_url: string | null }) => inv.file_url).map((inv: { id: string; invoice_number: string; vendor_name_raw: string; issue_date: string; total_amount: string; thumbnail_url: string | null }) => ({
        id: inv.id, invoice_number: inv.invoice_number, vendor_name: inv.vendor_name_raw, issue_date: inv.issue_date, total_amount: inv.total_amount, thumbnail_url: inv.thumbnail_url,
      })));
    } catch { setInvoiceSearchResults([]); }
    finally { setLoadingInvoices(false); }
  };
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); setPressedDir('left'); onPrev(); }
    if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); setPressedDir('right'); onNext(); }
  }, [onPrev, onNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!pressedDir) return;
    const t = setTimeout(() => setPressedDir(null), 150);
    return () => clearTimeout(t);
  }, [pressedDir]);

  const mp = txn.matched_payment;
  const hasInvoices = !!(txn.matched_invoice || (txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 0));
  const hasSalesInvoice = !!txn.matched_sales_invoice;
  const hasClaims = txn.matched_claims && txn.matched_claims.length > 0;

  // Detect partial match: matched amount < bank transaction amount
  const bankAmt = Number(txn.debit ?? txn.credit ?? 0);
  const matchedAmt = (() => {
    let total = 0;
    if (txn.matched_invoice_allocations?.length) {
      for (const a of txn.matched_invoice_allocations) total += Number(a.allocation_amount);
    } else if (txn.matched_invoice) {
      total += Number(txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount);
    }
    if (txn.matched_sales_invoice) total += Number(txn.matched_sales_invoice.total_amount);
    if (txn.matched_claims?.length) {
      for (const c of txn.matched_claims) total += Number(c.amount);
    }
    if (mp) total += Number(mp.amount);
    return total;
  })();
  const isPartial = txn.recon_status === 'manually_matched' && matchedAmt > 0 && Math.abs(matchedAmt - bankAmt) > 0.01;

  const cfg = isPartial
    ? { label: 'Partial', cls: 'badge-amber' }
    : (STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched);
  const hasMatches = hasInvoices || hasSalesInvoice || hasClaims || !!mp;

  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="relative bg-white shadow-2xl w-full max-w-[1100px] max-h-[85vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
        {onPrev && (
          <div onClick={onPrev} className={`nav-actuator nav-actuator-left${pressedDir === 'left' ? ' nav-actuator-pressed' : ''}`} style={{ position: 'absolute', left: '-3.5rem', top: '0', bottom: '0', width: '3rem', zIndex: 60 }} title="Previous (←)" role="button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </div>
        )}
        {onNext && (
          <div onClick={onNext} className={`nav-actuator nav-actuator-right${pressedDir === 'right' ? ' nav-actuator-pressed' : ''}`} style={{ position: 'absolute', right: '-3.5rem', top: '0', bottom: '0', width: '3rem', zIndex: 60 }} title="Next (→)" role="button">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </div>
        )}
        <div className="h-12 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
          <h2 className="text-white font-bold text-xs uppercase tracking-widest">Transaction Details</h2>
          <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Left: Transaction Details */}
          <div className="w-2/5 overflow-y-auto p-5 space-y-3 border-r border-[#E0E3E5]">
            <div className="flex items-center gap-2">
              <span className={cfg.cls}>{cfg.label}</span>
              {txn.matched_at && <span className="text-[10px] text-[var(--text-secondary)]">Matched {formatDate(txn.matched_at)}</span>}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
              <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt><dd className="text-sm text-[var(--text-primary)] tabular-nums">{formatDate(txn.transaction_date)}</dd></div>
              {txn.debit && <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Debit</dt><dd className="text-sm font-medium text-[var(--reject-red)] tabular-nums">{formatRM(txn.debit)}</dd></div>}
              {txn.credit && <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Credit</dt><dd className="text-sm font-medium text-[var(--match-green)] tabular-nums">{formatRM(txn.credit)}</dd></div>}
              <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Balance</dt><dd className="text-sm text-[var(--text-secondary)] tabular-nums">{txn.balance ? formatRM(txn.balance) : '-'}</dd></div>
            </dl>

            <div className="border-t border-[#E0E3E5] pt-2">
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Description</p>
              {txn.description.split(' | ').map((line, i) => (
                <p key={i} className="text-sm text-[var(--text-primary)]">{line}</p>
              ))}
              {txn.reference && <p className="text-xs text-[var(--text-secondary)] mt-1">Ref: {txn.reference}</p>}
              {txn.cheque_number && <p className="text-xs text-[var(--text-secondary)]">Cheque: {txn.cheque_number}</p>}
            </div>

            {txn.notes && (
              <p className="text-xs text-[var(--text-secondary)] border-l-2 border-[var(--outline)] pl-3 py-1">{txn.notes}</p>
            )}
          </div>

          {/* Right: Matched Items + Actions */}
          <div className="w-3/5 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {hasMatches ? (
                <>
                  {/* Matched invoices */}
                  {hasInvoices && (
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Invoice{txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 1 ? 's' : ''}</p>
                      {(txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 0
                        ? txn.matched_invoice_allocations
                        : txn.matched_invoice ? [{ invoice_id: txn.matched_invoice.id, invoice_number: txn.matched_invoice.invoice_number, vendor_name: txn.matched_invoice.vendor_name, total_amount: txn.matched_invoice.total_amount, allocation_amount: txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount, issue_date: txn.matched_invoice.issue_date }] : []
                      ).map((alloc, aIdx) => {
                        const docUrl = txn.matched_invoice?.file_url ?? null;
                        const driveMatch = docUrl?.match(/\/d\/([^/]+)/);
                        const fileId = driveMatch?.[1];
                        const isDocExpanded = expandedDocUrl === (docUrl ?? `inv-${aIdx}`);
                        return (
                        <div key={aIdx} className="mb-1.5">
                          <button
                            onClick={() => {
                              if (docUrl) onSetExpandedDocUrl(isDocExpanded ? null : docUrl);
                              else onSetPreviewInvoice({ invoice_id: 'invoice_id' in alloc ? alloc.invoice_id : txn.matched_invoice!.id, invoice_number: alloc.invoice_number, vendor_name: alloc.vendor_name, total_amount: alloc.total_amount, issue_date: alloc.issue_date, allocated_amount: String(alloc.allocation_amount) });
                            }}
                            className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${isDocExpanded ? '!bg-blue-50' : ''}`}>
                            <div>
                              <p className="text-sm font-medium text-[var(--text-primary)]">{alloc.vendor_name}</p>
                              <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">
                                {alloc.invoice_number} · {formatDate(alloc.issue_date)}
                                {alloc.invoice_number?.startsWith('PV-') && !docUrl && (
                                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">No doc</span>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(String(alloc.allocation_amount))}</p>
                                <p className="text-[10px] text-[var(--text-secondary)] tabular-nums normal-case tracking-normal">of {formatRM(alloc.total_amount)}</p>
                              </div>
                              {alloc.invoice_number?.startsWith('PV-') && !docUrl && (
                                <span className="relative" onClick={e => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className={`btn-thick-navy px-2 py-1.5 text-[10px] font-semibold flex items-center gap-1 normal-case tracking-normal text-white ${attachingFile ? 'opacity-50 pointer-events-none' : ''}`}
                                    onClick={() => setShowAttachMenu(!showAttachMenu)}
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                                    {attachingFile ? 'Scanning...' : 'Attach'}
                                  </button>
                                  {showAttachMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-[200px] bg-white border border-[var(--surface-header)] shadow-lg z-30">
                                      <button
                                        className="w-full px-3 py-2 text-left text-body-sm text-[var(--text-primary)] hover:bg-[var(--surface-low)] flex items-center gap-2"
                                        onClick={() => {
                                          setShowAttachMenu(false);
                                          const input = document.createElement('input');
                                          input.type = 'file';
                                          input.accept = '.pdf,.jpg,.jpeg,.png';
                                          input.onchange = () => { const f = input.files?.[0]; if (f) handleAttachFile(f); };
                                          input.click();
                                        }}
                                      >
                                        <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        Upload from computer
                                      </button>
                                      <button
                                        className="w-full px-3 py-2 text-left text-body-sm text-[var(--text-primary)] hover:bg-[var(--surface-low)] flex items-center gap-2 border-t border-[var(--surface-header)]"
                                        onClick={() => { setShowAttachMenu(false); setShowInvoicePicker(true); searchInvoices(txn.matched_invoice?.vendor_name || ''); }}
                                      >
                                        <svg className="w-3.5 h-3.5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        Link existing invoice
                                      </button>
                                    </div>
                                  )}
                                </span>
                              )}
                            </div>
                          </button>
                          {attachError && alloc.invoice_number?.startsWith('PV-') && !docUrl && (
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 mt-0.5">{attachError}</p>
                          )}
                          {showInvoicePicker && alloc.invoice_number?.startsWith('PV-') && !docUrl && (
                            <div className="border border-[var(--surface-header)] bg-white mt-1 p-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Link existing invoice</p>
                                <button onClick={() => setShowInvoicePicker(false)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs">Cancel</button>
                              </div>
                              <input
                                type="text"
                                className="input-field w-full text-body-sm mb-2"
                                placeholder="Search by invoice number, supplier..."
                                value={invoiceSearchTerm}
                                onChange={e => searchInvoices(e.target.value)}
                                autoFocus
                              />
                              <div className="max-h-[200px] overflow-y-auto space-y-1">
                                {loadingInvoices && <p className="text-xs text-[var(--text-secondary)] py-2 text-center">Searching...</p>}
                                {!loadingInvoices && invoiceSearchResults.length === 0 && invoiceSearchTerm && (
                                  <p className="text-xs text-[var(--text-secondary)] py-2 text-center">No invoices with documents found</p>
                                )}
                                {invoiceSearchResults.map(inv => (
                                  <button
                                    key={inv.id}
                                    onClick={() => handleLinkExisting(inv.id)}
                                    disabled={attachingFile}
                                    className="w-full text-left px-2 py-1.5 hover:bg-[var(--surface-low)] flex items-center justify-between gap-2 disabled:opacity-50"
                                  >
                                    <div>
                                      <p className="text-body-sm font-medium text-[var(--text-primary)]">{inv.invoice_number}</p>
                                      <p className="text-[10px] text-[var(--text-secondary)]">{inv.vendor_name} · {formatDate(inv.issue_date)}</p>
                                    </div>
                                    <span className="text-body-sm tabular-nums font-medium text-[var(--text-primary)]">{formatRM(inv.total_amount)}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {isDocExpanded && fileId && (
                            <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-[350px] border border-t-0 border-[#E0E3E5]" title="Invoice Preview" allow="autoplay" />
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Matched sales invoice */}
                  {hasSalesInvoice && txn.matched_sales_invoice && (
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Sales Invoice</p>
                      {(() => {
                        const si = txn.matched_sales_invoice!;
                        const siKey = `si-${si.id}`;
                        const isSiExpanded = expandedDocUrl === siKey;
                        return (
                          <div>
                            <button
                              onClick={() => onSetExpandedDocUrl(isSiExpanded ? null : siKey)}
                              className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${isSiExpanded ? '!bg-blue-50' : ''}`}>
                              <div>
                                <p className="text-sm font-medium text-[var(--text-primary)]">{si.buyer_name}</p>
                                <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{si.invoice_number} · {formatDate(si.issue_date)}</p>
                              </div>
                              <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(si.total_amount)}</p>
                            </button>
                            {isSiExpanded && (
                              <div className="border border-t-0 border-[#E0E3E5] p-3 bg-[var(--surface-low)] space-y-1">
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                  <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Invoice No.</dt><dd className="text-[var(--text-primary)]">{si.invoice_number}</dd></div>
                                  <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Issue Date</dt><dd className="text-[var(--text-primary)]">{formatDate(si.issue_date)}</dd></div>
                                  <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Total</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(si.total_amount)}</dd></div>
                                  <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Paid</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(si.amount_paid)}</dd></div>
                                </dl>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Matched claims */}
                  {hasClaims && (
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Claim{txn.matched_claims.length > 1 ? 's' : ''}</p>
                      {txn.matched_claims.map((claim) => {
                        const claimDocUrl = claim.file_url;
                        const claimDriveMatch = claimDocUrl?.match(/\/d\/([^/]+)/);
                        const claimFileId = claimDriveMatch?.[1];
                        const isClaimDocExpanded = expandedDocUrl === (claimDocUrl ?? `claim-${claim.id}`);
                        return (
                        <div key={claim.id} className="mb-1.5">
                          <button
                            onClick={() => {
                              if (claimDocUrl) onSetExpandedDocUrl(isClaimDocExpanded ? null : claimDocUrl);
                              else if (claim.thumbnail_url) onSetExpandedDocUrl(isClaimDocExpanded ? null : (claim.thumbnail_url ?? `claim-${claim.id}`));
                              else onSetPreviewClaim(claim);
                            }}
                            className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${isClaimDocExpanded ? '!bg-blue-50' : ''}`}>
                            <div>
                              <p className="text-sm font-medium text-[var(--text-primary)]">{claim.employee_name} — {claim.merchant}</p>
                              <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{claim.category_name} · {formatDate(claim.claim_date)}</p>
                            </div>
                            <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(claim.amount)}</p>
                          </button>
                          {isClaimDocExpanded && claimFileId && (
                            <iframe src={`https://drive.google.com/file/d/${claimFileId}/preview`} className="w-full h-[350px] border border-t-0 border-[#E0E3E5]" title="Claim Preview" allow="autoplay" />
                          )}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {isClaimDocExpanded && claim.thumbnail_url && !claimFileId && (
                            <div className="border border-t-0 border-[#E0E3E5] p-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={claim.thumbnail_url} alt="Claim" className="w-full object-contain max-h-[350px]" />
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Legacy matched payment */}
                  {mp && (
                    <div>
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Matched Payment</p>
                      <div className="btn-thick-white w-full px-3 py-2 text-left cursor-default">
                        <p className="text-sm font-medium text-[var(--text-primary)]">{mp.supplier_name}</p>
                        <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{formatDate(mp.payment_date)} — {formatRM(mp.amount)} — {mp.direction}</p>
                        {mp.reference && <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">Ref: {mp.reference}</p>}
                      </div>
                    </div>
                  )}

                  {/* Rich JV Preview (accountant) */}
                  {(txn.recon_status === 'matched' || txn.recon_status === 'manually_matched') && hasMatches && (() => {
                    const bankGl = statement?.bank_gl_label;

                    const jvLines: { account: string; debit: string | null; credit: string | null }[] = [];
                    let matchedTotal = 0;

                    if (txn.debit) {
                      const invoiceAllocs = txn.matched_invoice_allocations?.length
                        ? txn.matched_invoice_allocations
                        : txn.matched_invoice ? [{ vendor_name: txn.matched_invoice.vendor_name, allocation_amount: txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount }] : [];
                      for (const alloc of invoiceAllocs) {
                        const amt = Number(alloc.allocation_amount);
                        matchedTotal += amt;
                        jvLines.push({ account: `Trade Payables — ${alloc.vendor_name}`, debit: formatRM(String(alloc.allocation_amount)), credit: null });
                      }
                      if (txn.matched_claims?.length) {
                        for (const c of txn.matched_claims) {
                          matchedTotal += Number(c.amount);
                          jvLines.push({ account: `${c.category_name} — ${c.merchant}`, debit: formatRM(c.amount), credit: null });
                        }
                      }
                      jvLines.push({ account: bankGl ?? `${statement?.bank_name ?? 'Bank'} (no GL)`, debit: null, credit: formatRM(matchedTotal.toFixed(2)) });
                    } else {
                      if (txn.matched_sales_invoice) {
                        matchedTotal += Number(txn.matched_sales_invoice.total_amount);
                      }
                      if (txn.matched_claims?.length) {
                        for (const c of txn.matched_claims) {
                          matchedTotal += Number(c.amount);
                        }
                      }
                      jvLines.push({ account: bankGl ?? `${statement?.bank_name ?? 'Bank'} (no GL)`, debit: formatRM(matchedTotal > 0 ? matchedTotal.toFixed(2) : (txn.credit ?? '0')), credit: null });
                      if (txn.matched_sales_invoice) {
                        jvLines.push({ account: `Trade Receivables — ${txn.matched_sales_invoice.buyer_name}`, debit: null, credit: formatRM(txn.matched_sales_invoice.total_amount) });
                      }
                      if (txn.matched_claims?.length) {
                        for (const c of txn.matched_claims) {
                          jvLines.push({ account: `${c.category_name} — ${c.merchant}`, debit: null, credit: formatRM(c.amount) });
                        }
                      }
                    }

                    if (jvLines.length < 2) return null;

                    return (
                      <div className="border border-[#E0E3E5] p-3 mt-1">
                        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Journal Entry Preview</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                              <th className="py-1 text-left">Account</th>
                              <th className="py-1 text-right w-24">Debit</th>
                              <th className="py-1 text-right w-24">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {jvLines.map((line, i) => (
                              <tr key={i}>
                                <td className="py-1 text-[var(--text-primary)]">{line.account}</td>
                                <td className="py-1 text-right tabular-nums">{line.debit ?? '-'}</td>
                                <td className="py-1 text-right tabular-nums">{line.credit ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!bankGl && (
                          <p className="mt-1.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-1">
                            Bank account has no GL mapped — JV will fail on confirm.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-sm">
                  No matched items
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="p-3 flex-shrink-0 bg-[var(--surface-low)] border-t border-[#E0E3E5] space-y-1.5">
              <div className="flex gap-2">
                {txn.recon_status === 'matched' && (
                  <>
                    <div className="flex-1 relative group/confirm">
                      <button onClick={() => { onConfirm([txn.id]); }} disabled={confirming || matchingDisabled} title={matchingDisabled ? 'Fix balance mismatch before confirming' : undefined} className={`btn-thick-green w-full py-1.5 text-xs disabled:opacity-50 ${matchingDisabled ? 'cursor-not-allowed' : ''}`}>
                        Confirm
                      </button>
                      {!matchingDisabled && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 bg-[var(--reject-red)] text-white text-[10px] font-bold uppercase tracking-wide whitespace-nowrap opacity-0 group-hover/confirm:opacity-100 transition-opacity duration-75 pointer-events-none shadow-lg">
                          Auto-suggested match — review before confirming
                        </div>
                      )}
                    </div>
                    <button onClick={() => { onUnmatch(txn.id); onClose(); }} disabled={matchingDisabled} title={matchingDisabled ? 'Fix balance mismatch before unmatching' : undefined} className={`btn-thick-red flex-1 py-1.5 text-xs ${matchingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Unmatch
                    </button>
                  </>
                )}
                {txn.recon_status === 'manually_matched' && (
                  <>
                    <div className="flex-1 flex items-center justify-center py-1.5 text-xs font-semibold text-[var(--match-green)] bg-green-50 border border-green-200">
                      Confirmed
                    </div>
                    <div className="flex-1 relative group">
                      <button disabled className="btn-thick-white w-full py-1.5 text-xs opacity-40 cursor-not-allowed">
                        Edit
                      </button>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[var(--text-primary)] text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        Unmatch first to edit
                      </div>
                    </div>
                    <button onClick={() => { onUnmatch(txn.id); onClose(); }} disabled={matchingDisabled} title={matchingDisabled ? 'Fix balance mismatch before unmatching' : undefined} className={`btn-thick-red flex-1 py-1.5 text-xs ${matchingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Unmatch
                    </button>
                  </>
                )}
                {txn.recon_status === 'unmatched' && (
                  <button onClick={() => { onClose(); onOpenMatchModal(txn); }} disabled={matchingDisabled} title={matchingDisabled ? 'Fix balance mismatch before matching' : undefined} className={`btn-thick-navy flex-1 py-1.5 text-xs ${matchingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    Match
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
