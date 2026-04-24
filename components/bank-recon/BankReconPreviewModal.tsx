'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { BankReconDetailConfig } from '@/components/pages/BankReconDetailContent';
import GlAccountSelect from '@/components/GlAccountSelect';

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
  matched_invoice: { id: string; invoice_number: string; vendor_name: string; total_amount: string; amount_paid: string; issue_date: string; file_url: string | null; thumbnail_url: string | null; allocation_amount?: string; contra_gl_account_id?: string | null; supplier_default_contra_gl_id?: string | null } | null;
  matched_invoice_allocations?: { invoice_id: string; invoice_number: string; vendor_name: string; total_amount: string; allocation_amount: string; issue_date: string }[];
  matched_sales_invoice: { id: string; invoice_number: string; total_amount: string; amount_paid: string; issue_date: string; buyer_name: string; contra_gl_account_id?: string | null } | null;
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
  onConfirm: (txnIds: string[], glOverride?: { debitGlId?: string; creditGlId?: string }) => void;
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

const STATUS_CFG: Record<string, { label: string; cls: string; tooltip?: string }> = {
  matched:          { label: 'Suggested',  cls: 'badge-amber', tooltip: 'AI auto-matched this transaction. Review and confirm the match.' },
  manually_matched: { label: 'Confirmed',  cls: 'badge-green', tooltip: 'Match confirmed by user. Ready for journal entry creation.' },
  unmatched:        { label: 'Unmatched',  cls: 'badge-red',   tooltip: 'No matching document found. Drag an invoice or claim to match.' },
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

  // ─── GL Account editing for suggested matches ──────────────────────────
  const [glAccounts, setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [selectedDebitGl, setSelectedDebitGl] = useState('');
  const [selectedCreditGl, setSelectedCreditGl] = useState('');
  const glCacheRef = useRef<Record<string, { accounts: { id: string; account_code: string; name: string; account_type: string }[]; firmDefault: string }>>({});
  const isSuggested = txn.recon_status === 'matched';
  const firmId = statement?.firm_id;

  // Fetch GL accounts + auto-suggest when preview opens for suggested match
  useEffect(() => {
    if (!firmId) { setGlAccounts([]); return; }
    const cached = glCacheRef.current[firmId];

    const resolveGl = (accounts: typeof glAccounts, firmDefaultContra: string) => {
      setGlAccounts(accounts);
      // Auto-suggest debit GL from matched invoice/claim
      const mi = txn.matched_invoice;
      const mia = txn.matched_invoice_allocations;
      const msi = txn.matched_sales_invoice;
      if (txn.debit) {
        // Outgoing: debit = Trade Payables (contra), credit = Bank
        const invoiceContraGl = mi?.contra_gl_account_id || mi?.supplier_default_contra_gl_id;
        if (invoiceContraGl) setSelectedDebitGl(invoiceContraGl);
        else if (firmDefaultContra) setSelectedDebitGl(firmDefaultContra);
        // Credit GL = bank (auto, not editable)
      } else {
        // Incoming: debit = Bank (auto), credit = Trade Receivables
        if (msi?.contra_gl_account_id) setSelectedCreditGl(msi.contra_gl_account_id);
        else {
          const trGl = accounts.find(a => a.name.toLowerCase().includes('trade receivable'));
          if (trGl) setSelectedCreditGl(trGl.id);
          else if (firmDefaultContra) setSelectedCreditGl(firmDefaultContra);
        }
      }
    };

    if (cached) {
      setGlAccounts(cached.accounts);
      resolveGl(cached.accounts, cached.firmDefault);
    } else {
      Promise.all([
        fetch(`/api/gl-accounts?firmId=${firmId}`).then(r => r.json()),
        fetch(`/api/accounting-settings?firmId=${firmId}`).then(r => r.json()),
      ]).then(([glJson, settingsJson]) => {
        const accounts = glJson.data ?? [];
        const firmDefault = txn.debit
          ? (settingsJson.data?.gl_defaults?.trade_payables?.id || '')
          : (settingsJson.data?.gl_defaults?.trade_receivables?.id || '');
        glCacheRef.current[firmId] = { accounts, firmDefault };
        resolveGl(accounts, firmDefault);
      }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn.id, firmId]);

  // Auto-expand document preview for suggested matches
  useEffect(() => {
    if (!isSuggested) return;
    const docUrl = txn.matched_invoice?.file_url ?? null;
    if (docUrl && !expandedDocUrl) onSetExpandedDocUrl(docUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn.id, isSuggested]);

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
          {/* Left: Transaction Details + Invoice Info */}
          <div className="w-1/2 overflow-y-auto p-5 space-y-3 border-r border-[#E0E3E5]">
            <div className="flex items-center gap-2">
              <span className={cfg.cls} data-tooltip={cfg.tooltip}>{cfg.label}</span>
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

            {/* Matched invoice info + GL select + JV preview — all states */}
            {hasInvoices && txn.matched_invoice && (
              <div className="border-t border-[#E0E3E5] pt-3 space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Matched Invoice</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{txn.matched_invoice.vendor_name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{txn.matched_invoice.invoice_number} · {formatDate(txn.matched_invoice.issue_date)}</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">{formatRM(txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount)}</p>
                </div>
                {glAccounts.length > 0 && (
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                      {txn.debit ? 'Contra GL (Trade Payables)' : 'Contra GL (Trade Receivables)'}
                    </label>
                    <GlAccountSelect
                      value={txn.debit ? selectedDebitGl : selectedCreditGl}
                      onChange={txn.debit ? setSelectedDebitGl : setSelectedCreditGl}
                      accounts={glAccounts}
                      firmId={firmId}
                      placeholder={txn.debit ? 'Select Trade Payables GL' : 'Select Trade Receivables GL'}
                      preferredType="Liability"
                      defaultType="Liability"
                      defaultBalance="Credit"
                      suggestedName={txn.matched_invoice.vendor_name}
                      disabled={txn.recon_status === 'manually_matched'}
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  </div>
                )}
                {/* JV Preview */}
                {(() => {
                  const bankGl = statement?.bank_gl_label;
                  const amt = txn.matched_invoice!.allocation_amount ?? txn.matched_invoice!.total_amount;
                  const contraLabel = (txn.debit ? selectedDebitGl : selectedCreditGl) && glAccounts.length > 0
                    ? `${glAccounts.find(a => a.id === (txn.debit ? selectedDebitGl : selectedCreditGl))?.account_code ?? ''} — ${glAccounts.find(a => a.id === (txn.debit ? selectedDebitGl : selectedCreditGl))?.name ?? ''}`
                    : `Trade Payables — ${txn.matched_invoice!.vendor_name}`;
                  return (
                    <div className="border border-[#E0E3E5] p-2">
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Journal Entry Preview</p>
                      <table className="w-full text-xs">
                        <thead><tr className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest"><th className="py-1 text-left">Account</th><th className="py-1 text-right w-20">Debit</th><th className="py-1 text-right w-20">Credit</th></tr></thead>
                        <tbody>
                          {txn.debit ? (
                            <>
                              <tr><td className="py-1 text-[var(--text-primary)]">{contraLabel}</td><td className="py-1 text-right tabular-nums">{formatRM(amt)}</td><td className="py-1 text-right tabular-nums">-</td></tr>
                              <tr><td className="py-1 text-[var(--text-primary)]">{bankGl ?? 'Bank (no GL)'}</td><td className="py-1 text-right tabular-nums">-</td><td className="py-1 text-right tabular-nums">{formatRM(amt)}</td></tr>
                            </>
                          ) : (
                            <>
                              <tr><td className="py-1 text-[var(--text-primary)]">{bankGl ?? 'Bank (no GL)'}</td><td className="py-1 text-right tabular-nums">{formatRM(amt)}</td><td className="py-1 text-right tabular-nums">-</td></tr>
                              <tr><td className="py-1 text-[var(--text-primary)]">{contraLabel}</td><td className="py-1 text-right tabular-nums">-</td><td className="py-1 text-right tabular-nums">{formatRM(amt)}</td></tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Matched sales invoice info in left panel */}
            {hasSalesInvoice && txn.matched_sales_invoice && (
              <div className="border-t border-[#E0E3E5] pt-3 space-y-3">
                <div>
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Matched Sales Invoice</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{txn.matched_sales_invoice.buyer_name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{txn.matched_sales_invoice.invoice_number} · {formatDate(txn.matched_sales_invoice.issue_date)}</p>
                  <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums mt-0.5">{formatRM(txn.matched_sales_invoice.total_amount)}</p>
                </div>
                {glAccounts.length > 0 && (
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contra GL (Trade Receivables)</label>
                    <GlAccountSelect
                      value={selectedCreditGl}
                      onChange={setSelectedCreditGl}
                      accounts={glAccounts}
                      firmId={firmId}
                      placeholder="Select Trade Receivables GL"
                      preferredType="Liability"
                      defaultType="Liability"
                      defaultBalance="Credit"
                      suggestedName={txn.matched_sales_invoice.buyer_name}
                      disabled={txn.recon_status === 'manually_matched'}
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  </div>
                )}
                {/* JV Preview */}
                {(() => {
                  const bankGl = statement?.bank_gl_label;
                  const amt = txn.matched_sales_invoice!.total_amount;
                  const contraLabel = selectedCreditGl && glAccounts.length > 0
                    ? `${glAccounts.find(a => a.id === selectedCreditGl)?.account_code ?? ''} — ${glAccounts.find(a => a.id === selectedCreditGl)?.name ?? ''}`
                    : `Trade Receivables — ${txn.matched_sales_invoice!.buyer_name}`;
                  return (
                    <div className="border border-[#E0E3E5] p-2">
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Journal Entry Preview</p>
                      <table className="w-full text-xs">
                        <thead><tr className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest"><th className="py-1 text-left">Account</th><th className="py-1 text-right w-20">Debit</th><th className="py-1 text-right w-20">Credit</th></tr></thead>
                        <tbody>
                          <tr><td className="py-1 text-[var(--text-primary)]">{bankGl ?? 'Bank (no GL)'}</td><td className="py-1 text-right tabular-nums">{formatRM(amt)}</td><td className="py-1 text-right tabular-nums">-</td></tr>
                          <tr><td className="py-1 text-[var(--text-primary)]">{contraLabel}</td><td className="py-1 text-right tabular-nums">-</td><td className="py-1 text-right tabular-nums">{formatRM(amt)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Matched claims info in left panel */}
            {hasClaims && (
              <div className="border-t border-[#E0E3E5] pt-3 space-y-2">
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Matched Claim{txn.matched_claims.length > 1 ? 's' : ''}</p>
                {txn.matched_claims.map((claim) => (
                  <div key={claim.id} className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{claim.employee_name} — {claim.merchant}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{claim.category_name} · {formatDate(claim.claim_date)}</p>
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(claim.amount)}</p>
                  </div>
                ))}
                {/* JV Preview for claims */}
                {(() => {
                  const bankGl = statement?.bank_gl_label;
                  const totalClaims = txn.matched_claims.reduce((s, c) => s + Number(c.amount), 0);
                  return (
                    <div className="border border-[#E0E3E5] p-2">
                      <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Journal Entry Preview</p>
                      <table className="w-full text-xs">
                        <thead><tr className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest"><th className="py-1 text-left">Account</th><th className="py-1 text-right w-20">Debit</th><th className="py-1 text-right w-20">Credit</th></tr></thead>
                        <tbody>
                          {txn.matched_claims.map((c) => (
                            <tr key={c.id}><td className="py-1 text-[var(--text-primary)]">{c.category_name} — {c.merchant}</td><td className="py-1 text-right tabular-nums">{formatRM(c.amount)}</td><td className="py-1 text-right tabular-nums">-</td></tr>
                          ))}
                          <tr><td className="py-1 text-[var(--text-primary)]">{bankGl ?? 'Bank (no GL)'}</td><td className="py-1 text-right tabular-nums">-</td><td className="py-1 text-right tabular-nums">{formatRM(totalClaims.toFixed(2))}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Legacy matched payment info in left panel */}
            {mp && (
              <div className="border-t border-[#E0E3E5] pt-3">
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Matched Payment</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">{mp.supplier_name}</p>
                <p className="text-xs text-[var(--text-secondary)]">{formatDate(mp.payment_date)} — {formatRM(mp.amount)} — {mp.direction}</p>
                {mp.reference && <p className="text-xs text-[var(--text-secondary)]">Ref: {mp.reference}</p>}
              </div>
            )}
          </div>

          {/* Right panel: Document preview + Action buttons */}
          <div className="w-1/2 flex flex-col min-h-0">
            {/* Document preview area */}
            <div className="flex-1 min-h-0 bg-[var(--surface-low)] relative">
              {(() => {
                // Find the best document to preview
                const docUrl = txn.matched_invoice?.file_url ?? null;
                const thumbUrl = txn.matched_invoice?.thumbnail_url ?? txn.matched_claims?.[0]?.thumbnail_url ?? null;
                const claimDocUrl = txn.matched_claims?.[0]?.file_url ?? null;
                const driveMatch = (docUrl ?? claimDocUrl)?.match(/\/d\/([^/]+)/);
                const fileId = driveMatch?.[1];

                if (fileId) return <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-full border-none" title="Document Preview" allow="autoplay" />;
                if (thumbUrl) return (
                  <div className="w-full h-full overflow-auto p-4 flex items-start justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbUrl} alt="Document" className="max-w-full object-contain" />
                  </div>
                );
                return (
                  <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                    {hasMatches ? 'No document attached' : 'No matched items'}
                  </div>
                );
              })()}
              {(txn.matched_invoice?.file_url) && (
                <a href={txn.matched_invoice.file_url} target="_blank" rel="noreferrer"
                  className="absolute top-3 right-3 bg-white/90 hover:bg-white p-1.5 shadow transition-colors" title="Open in new tab">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                </a>
              )}
            </div>

            {/* Action buttons — same for all states */}
            <div className="flex-shrink-0 p-3 bg-[var(--surface-low)] border-t border-[#E0E3E5]">
              <div className="flex gap-2">
                {txn.recon_status === 'matched' && (
                  <>
                    <button onClick={() => { onConfirm([txn.id], selectedDebitGl || selectedCreditGl ? { debitGlId: selectedDebitGl || undefined, creditGlId: selectedCreditGl || undefined } : undefined); }} disabled={confirming || matchingDisabled} className={`btn-thick-green flex-1 py-1.5 text-xs disabled:opacity-50 ${matchingDisabled ? 'cursor-not-allowed' : ''}`}>
                      Confirm
                    </button>
                    <button onClick={() => { onUnmatch(txn.id); onClose(); }} disabled={matchingDisabled} className={`btn-thick-red flex-1 py-1.5 text-xs ${matchingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Unmatch
                    </button>
                  </>
                )}
                {txn.recon_status === 'manually_matched' && (
                  <>
                    <div className="flex-1 flex items-center justify-center py-1.5 text-xs font-semibold text-[var(--match-green)] bg-green-50 border border-green-200">
                      Confirmed
                    </div>
                    <button onClick={() => { onUnmatch(txn.id); onClose(); }} disabled={matchingDisabled} className={`btn-thick-red flex-1 py-1.5 text-xs ${matchingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      Unmatch
                    </button>
                  </>
                )}
                {txn.recon_status === 'unmatched' && (
                  <button onClick={() => { onClose(); onOpenMatchModal(txn); }} disabled={matchingDisabled} className={`btn-thick-navy flex-1 py-1.5 text-xs ${matchingDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
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
