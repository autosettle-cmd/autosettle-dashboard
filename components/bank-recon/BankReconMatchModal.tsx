'use client';

import React, { useState } from 'react';
import GlAccountSelect from '@/components/GlAccountSelect';
import Field from '@/components/forms/Field';
import type { BankReconDetailConfig } from '@/components/pages/BankReconDetailContent';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matched_payment: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matched_invoice: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matched_invoice_allocations?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matched_sales_invoice: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matched_claims: any[];
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

interface StatementDetail {
  firm_id: string;
  bank_name: string;
  account_number: string | null;
  bank_gl_label: string | null;
}

interface VoucherData {
  supplier_id: string;
  category_id: string;
  reference: string;
  notes: string;
  new_supplier_name: string;
  gl_account_id: string;
}

export interface BankReconMatchModalProps {
  matchingTxn: BankTxn;
  config: BankReconDetailConfig;
  statement: StatementDetail | null;

  // Search & items
  claimSearch: string;
  onClaimSearchChange: (val: string) => void;
  onSearchOutstandingItems: (searchTerm: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  outstandingItems: any[];
  candidates: CandidatePayment[];
  loadingCandidates: boolean;

  // Selection state
  selectedItem: { type: string; id: string } | null;
  onSetSelectedItem: (item: { type: string; id: string } | null) => void;
  selectedClaimIds: Set<string>;
  onSetSelectedClaimIds: (updater: (prev: Set<string>) => Set<string>) => void;
  matchTab: 'invoices' | 'claims';
  onSetMatchTab: (tab: 'invoices' | 'claims') => void;

  // Description editing
  txnDescDraft: string;
  onSetTxnDescDraft: (val: string) => void;
  onSaveDescription: () => void;
  onResetDescription: () => void;
  descriptionChanged: boolean;

  // Doc preview
  expandedDocUrl: string | null;
  onSetExpandedDocUrl: (url: string | null) => void;

  // Match actions
  matchSubmitting: boolean;
  matchError: string;
  onMatchItem: (item?: { type: string; id: string }, invoiceIds?: string[]) => void;
  onMatchLegacy: (paymentId: string) => void;
  onClose: () => void;

  // Voucher form
  showVoucherForm: boolean;
  showReceiptForm: boolean;
  voucherSuppliers: { id: string; name: string }[];
  voucherCategories: { id: string; name: string }[];
  voucherData: VoucherData;
  onSetVoucherData: (data: VoucherData) => void;
  creatingVoucher: boolean;
  creatingNewSupplier: boolean;
  onSetCreatingNewSupplier: (val: boolean) => void;
  voucherError: string;
  receiptGlAccounts: { id: string; account_code: string; name: string; account_type: string }[];

  // Voucher/receipt actions
  onOpenVoucherForm: () => void;
  onOpenReceiptForm: () => void;
  onCreateVoucher: () => void;
  onCreateReceipt: () => void;
  onCloseVoucherForm: () => void;
  onCloseReceiptForm: () => void;
  onFetchNextVoucherNumber: (name: string, supplierId?: string) => void;
  onFetchNextReceiptNumber: (name: string, supplierId?: string) => void;
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function BankReconMatchModal({
  matchingTxn,
  config,
  statement,
  claimSearch,
  onClaimSearchChange,
  onSearchOutstandingItems,
  outstandingItems,
  candidates,
  loadingCandidates,
  selectedItem,
  onSetSelectedItem,
  selectedClaimIds,
  onSetSelectedClaimIds,
  matchTab,
  onSetMatchTab,
  txnDescDraft,
  onSetTxnDescDraft,
  onSaveDescription,
  onResetDescription,
  descriptionChanged,
  expandedDocUrl,
  onSetExpandedDocUrl,
  matchSubmitting,
  matchError,
  onMatchItem,
  onMatchLegacy,
  onClose,
  showVoucherForm,
  showReceiptForm,
  voucherSuppliers,
  voucherCategories,
  voucherData,
  onSetVoucherData,
  creatingVoucher,
  creatingNewSupplier,
  onSetCreatingNewSupplier,
  voucherError,
  receiptGlAccounts,
  onOpenVoucherForm,
  onOpenReceiptForm,
  onCreateVoucher,
  onCreateReceipt,
  onCloseVoucherForm,
  onCloseReceiptForm,
  onFetchNextVoucherNumber,
  onFetchNextReceiptNumber,
}: BankReconMatchModalProps) {
  const [showJvConfirm, setShowJvConfirm] = useState(false);
  const [showVoucherConfirm, setShowVoucherConfirm] = useState(false);
  const [showReceiptConfirm, setShowReceiptConfirm] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  // Resolve JV preview labels for confirmation modal
  const isOutgoing = !!matchingTxn.debit;
  const txnAmount = isOutgoing ? matchingTxn.debit! : matchingTxn.credit!;
  const bankGlLabel = statement?.bank_gl_label || 'Bank GL';

  // JV amount = matched item amount (not bank transaction amount — could be partial match)
  // Outstanding items use camelCase: { remaining, totalAmount, amount }
  const getJvAmount = () => {
    if (selectedInvoiceIds.size > 0) {
      const total = outstandingItems
        .filter((i) => selectedInvoiceIds.has(i.id))
        .reduce((sum, i) => sum + Math.abs(Number(i.remaining ?? i.totalAmount ?? 0)), 0);
      return total.toFixed(2);
    }
    if (selectedClaimIds.size > 0) {
      const total = outstandingItems
        .filter((i) => selectedClaimIds.has(i.id))
        .reduce((sum, i) => sum + Math.abs(Number(i.remaining ?? i.amount ?? i.totalAmount ?? 0)), 0);
      return total.toFixed(2);
    }
    if (!selectedItem) return txnAmount;
    const found = outstandingItems.find((i) => i.id === selectedItem.id);
    if (!found) return txnAmount;
    const remaining = Number(found.remaining ?? found.amount ?? found.totalAmount ?? 0);
    return Math.abs(remaining).toFixed(2);
  };

  const isPartialMatch = () => {
    const jvAmt = Number(getJvAmount());
    const bankAmt = Number(txnAmount);
    return Math.abs(jvAmt - bankAmt) > 0.01;
  };

  const getMatchedLabel = () => {
    if (selectedInvoiceIds.size > 0) {
      const items = outstandingItems.filter((i) => selectedInvoiceIds.has(i.id));
      if (items.length === 1) {
        const name = items[0].name || '';
        const num = items[0].reference || '';
        return `${name}${num ? ` — ${num}` : ''}`;
      }
      const suppliers = new Set(items.map((i) => i.name));
      return `${items.length} Invoices${suppliers.size === 1 ? ` — ${items[0].name}` : ''}`;
    }
    if (selectedClaimIds.size > 1) return `${selectedClaimIds.size} Expense Claims`;
    if (!selectedItem) return '';
    const found = outstandingItems.find((i) => i.id === selectedItem.id);
    if (!found) return selectedItem.type === 'invoice' ? 'Invoice' : selectedItem.type === 'sales_invoice' ? 'Sales Invoice' : 'Claim';
    const name = found.supplier_name || found.buyer_name || found.employee_name || found.merchant || found.name || '';
    const num = found.invoice_number || found.receipt_number || found.reference || '';
    return `${name}${num ? ` — ${num}` : ''}`;
  };

  const getContraLabel = () => {
    if (isOutgoing) return 'Trade Payables / Expense GL';
    return 'Trade Receivables / Income GL';
  };

  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className={`bg-white shadow-2xl w-full ${config.showDescriptionEdit ? 'max-w-[1200px]' : 'max-w-[720px]'} max-h-[90vh] flex flex-col animate-in`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">
            {matchingTxn.debit ? 'Match Outgoing Payment' : 'Match Incoming Payment'}
          </h2>
          <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel — transaction details (accountant: editable description + rich details; admin: simple summary) */}
          {config.showDescriptionEdit ? (
            <div className="w-[360px] flex-shrink-0 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4 self-stretch">
              <div>
                <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Description</p>
                <textarea
                  value={txnDescDraft}
                  onChange={(e) => onSetTxnDescDraft(e.target.value)}
                  className="input-recessed w-full text-sm"
                  rows={6}
                />
                {descriptionChanged && (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={onSaveDescription}
                      className="btn-thick-green px-3 py-1 text-[10px]"
                    >
                      Save
                    </button>
                    <button
                      onClick={onResetDescription}
                      className="btn-thick-white px-3 py-1 text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Field label="Date" value={formatDate(matchingTxn.transaction_date)} />
                <Field label="Amount" value={matchingTxn.debit ? `Debit ${formatRM(matchingTxn.debit)}` : `Credit ${formatRM(matchingTxn.credit)}`} />
                {matchingTxn.reference && <Field label="Reference" value={matchingTxn.reference} />}
              </div>

              <div className={`p-3 card-popped ${matchingTxn.debit ? 'bg-red-50/60' : 'bg-green-50/60'}`}>
                <p className="text-[10px] font-label font-bold uppercase tracking-widest leading-none" style={{ color: matchingTxn.debit ? 'var(--reject-red)' : 'var(--match-green)' }}>
                  {matchingTxn.debit ? 'Outgoing' : 'Incoming'}
                </p>
                <p className={`text-xl font-extrabold tabular-nums mt-1 ${matchingTxn.debit ? 'text-[var(--reject-red)]' : 'text-[var(--match-green)]'}`}>
                  {formatRM(matchingTxn.debit ?? matchingTxn.credit ?? '0')}
                </p>
              </div>

              {statement && (
                <div className="space-y-2">
                  <Field label="Bank" value={statement.bank_name} />
                  {statement.account_number && <Field label="Account" value={statement.account_number} />}
                  {statement.bank_gl_label && <Field label="Bank GL" value={statement.bank_gl_label} />}
                </div>
              )}
            </div>
          ) : (
            // Admin: simple inline summary (no left panel, summary at top of right)
            null
          )}

          {/* Right panel — search & match */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className={`${config.showDescriptionEdit ? 'p-5 pb-0' : 'p-6 pb-0'} flex-shrink-0`}>
              {/* Admin: inline transaction summary */}
              {!config.showDescriptionEdit && (
                <div className="bg-[var(--surface-low)] p-4 mb-4">
                  <p className="text-body-md font-medium text-[var(--text-primary)]">{matchingTxn.description.split(' | ')[0]}</p>
                  <div className="flex items-center gap-4 mt-1.5 text-body-sm text-[var(--text-secondary)]">
                    <span className="tabular-nums">{formatDate(matchingTxn.transaction_date)}</span>
                    <span className="font-semibold text-[var(--text-primary)] tabular-nums">{matchingTxn.debit ? `Debit ${formatRM(matchingTxn.debit)}` : `Credit ${formatRM(matchingTxn.credit)}`}</span>
                    {matchingTxn.reference && <span>Ref: {matchingTxn.reference}</span>}
                  </div>
                </div>
              )}

              {/* Search */}
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search by name, invoice number, or amount..."
                  value={claimSearch}
                  onChange={(e) => {
                    const val = e.target.value;
                    onClaimSearchChange(val);
                    onSearchOutstandingItems(val);
                  }}
                  className="input-recessed w-full"
                />
              </div>

              {/* Tabs */}
              {matchingTxn.debit && (
                <div className="flex border-b border-[var(--surface-header)]">
                  {(() => {
                    const invoiceCount = outstandingItems.filter((i: { type: string }) => i.type !== 'claim').length;
                    const claimCount = outstandingItems.filter((i: { type: string }) => i.type === 'claim').length;
                    return (
                      <>
                        <button
                          onClick={() => { onSetMatchTab('invoices'); onSetSelectedClaimIds(() => new Set()); }}
                          className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors ${
                            matchTab === 'invoices' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          Invoices ({invoiceCount})
                        </button>
                        <button
                          onClick={() => { onSetMatchTab('claims'); onSetSelectedItem(null); }}
                          className={`px-4 py-2.5 text-body-sm font-medium border-b-2 transition-colors ${
                            matchTab === 'claims' ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          Claims ({claimCount})
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Scrollable items list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
        {loadingCandidates ? (
          <p className="text-sm text-[var(--text-secondary)] py-8 text-center">Loading...</p>
        ) : outstandingItems.length === 0 && candidates.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] py-8 text-center">No outstanding items found.</p>
        ) : (
          <div className="space-y-1.5">
            {(() => {
              const invoiceItems = outstandingItems.filter((i: { type: string }) => i.type !== 'claim');
              const claimItems = outstandingItems.filter((i: { type: string }) => i.type === 'claim');

              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const employeeGroups = new Map<string, { employeeName: string; claims: any[]; total: number }>();
              for (const c of claimItems) {
                const key = c.employeeId || c.name;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const group = employeeGroups.get(key) ?? { employeeName: c.employeeName || c.name, claims: [] as any[], total: 0 };
                group.claims.push(c);
                group.total += c.remaining;
                employeeGroups.set(key, group);
              }

              const showInvoices = !matchingTxn.debit || matchTab === 'invoices';
              const showClaims = matchingTxn.debit && matchTab === 'claims';

              // Group invoices by supplier for multi-select
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const supplierGroups = new Map<string, { supplierName: string; invoices: any[]; total: number }>();
              for (const inv of invoiceItems) {
                const key = inv.name || 'Unknown';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const group = supplierGroups.get(key) ?? { supplierName: inv.name, invoices: [] as any[], total: 0 };
                group.invoices.push(inv);
                group.total += inv.remaining;
                supplierGroups.set(key, group);
              }

              const toggleInvoice = (invId: string) => {
                onSetSelectedItem(null);
                onSetSelectedClaimIds(() => new Set());
                setSelectedInvoiceIds(prev => {
                  const next = new Set(prev);
                  if (next.has(invId)) next.delete(invId); else next.add(invId);
                  return next;
                });
              };

              const toggleSupplierAll = (ids: Set<string>, allSelected: boolean) => {
                onSetSelectedItem(null);
                onSetSelectedClaimIds(() => new Set());
                setSelectedInvoiceIds(prev => {
                  const next = new Set(prev);
                  if (allSelected) { ids.forEach(id => next.delete(id)); }
                  else { ids.forEach(id => next.add(id)); }
                  return next;
                });
              };

              return (
                <>
                  {/* Invoice / Sales Invoice items — grouped by supplier with checkboxes */}
                  {showInvoices && config.showDescriptionEdit && invoiceItems.length > 0 && (
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                      {matchingTxn.debit ? 'Outstanding Invoices' : 'Outstanding Sales Invoices'} ({invoiceItems.length})
                      {selectedInvoiceIds.size > 0 && (
                        <span className="ml-2 text-[var(--primary)]">
                          — {selectedInvoiceIds.size} selected · {formatRM(outstandingItems.filter(i => selectedInvoiceIds.has(i.id)).reduce((s, i) => s + i.remaining, 0).toFixed(2))}
                        </span>
                      )}
                    </p>
                  )}
                  {showInvoices && Array.from(supplierGroups.entries()).map(([supplierKey, group]) => {
                    const allIds = new Set(group.invoices.map((inv: { id: string }) => inv.id));
                    const allSelected = group.invoices.every((inv: { id: string }) => selectedInvoiceIds.has(inv.id));
                    const someSelected = group.invoices.some((inv: { id: string }) => selectedInvoiceIds.has(inv.id));
                    const isOpen = expandedSupplier === supplierKey || group.invoices.length === 1;
                    const isSingleInvoice = group.invoices.length === 1;

                    // Accountant: collapsible keycap cards grouped by supplier
                    if (config.showDescriptionEdit) {
                      return (
                        <div key={supplierKey} className="mb-1.5">
                          {/* Supplier card — btn-thick-white keycap, click to expand */}
                          <button
                            onClick={(e) => {
                              if (isSingleInvoice) {
                                // Single invoice: toggle selection directly
                                toggleInvoice(group.invoices[0].id);
                              } else {
                                // Multi-invoice: toggle expand/collapse
                                setExpandedSupplier(isOpen ? null : supplierKey);
                              }
                              e.stopPropagation();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`btn-thick-white w-full flex items-center justify-between px-3 py-2.5 text-left ${
                              allSelected ? '!bg-blue-50' : someSelected ? '!bg-blue-50/50' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSingleInvoice ? selectedInvoiceIds.has(group.invoices[0].id) : allSelected}
                                ref={(el) => { if (el) el.indeterminate = !isSingleInvoice && someSelected && !allSelected; }}
                                onChange={() => {}}
                                className="ds-table-checkbox"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isSingleInvoice) { toggleInvoice(group.invoices[0].id); }
                                  else { toggleSupplierAll(allIds, allSelected); }
                                }}
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${isSingleInvoice ? 'badge-amber' : 'badge-blue'}`}>
                                    {isSingleInvoice ? 'INV' : 'ACCOUNT'}
                                  </span>
                                  <p className="text-sm font-medium text-[var(--text-primary)] truncate normal-case tracking-normal">{group.supplierName}</p>
                                  {!isSingleInvoice && <span className="text-label-sm text-[var(--text-secondary)] normal-case tracking-normal">({group.invoices.length})</span>}
                                </div>
                                {isSingleInvoice && (
                                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 normal-case tracking-normal">
                                    {group.invoices[0].reference ?? ''} {group.invoices[0].reference ? '·' : ''} {formatDate(group.invoices[0].date)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                              <div className="text-right">
                                <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(isSingleInvoice ? String(group.invoices[0].remaining) : group.total.toFixed(2))}</p>
                                {isSingleInvoice && group.invoices[0].remaining !== group.invoices[0].totalAmount && (
                                  <p className="text-[10px] text-[var(--text-secondary)] tabular-nums normal-case tracking-normal">of {formatRM(String(group.invoices[0].totalAmount))}</p>
                                )}
                              </div>
                              {!isSingleInvoice && (
                                <svg className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              )}
                            </div>
                          </button>

                          {/* Expanded invoice list (multi-invoice suppliers only) */}
                          {!isSingleInvoice && isOpen && (
                            <div className="border-x border-b border-[#E0E3E5] bg-[var(--surface-low)]">
                              {group.invoices.map((item: { type: string; id: string; reference: string | null; name: string; totalAmount: number; remaining: number; date: string; fileUrl?: string | null }) => {
                                const isInvSelected = selectedInvoiceIds.has(item.id);
                                const docUrl = item.fileUrl;
                                const driveMatch = docUrl?.match(/\/d\/([^/]+)/);
                                const fileId = driveMatch?.[1];
                                const isItemExpanded = expandedDocUrl === `match-${item.id}`;
                                return (
                                  <div key={`${item.type}-${item.id}`}>
                                    <div
                                      onClick={() => {
                                        toggleInvoice(item.id);
                                        if (docUrl || fileId) onSetExpandedDocUrl(isItemExpanded ? null : `match-${item.id}`);
                                      }}
                                      className={`flex items-center justify-between px-3 py-2 pl-10 cursor-pointer transition-colors border-t border-[#E0E3E5] first:border-t-0 ${
                                        isInvSelected ? 'bg-blue-50' : 'hover:bg-white'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <input type="checkbox" checked={isInvSelected} onChange={() => {}} className="ds-table-checkbox" onClick={e => { e.stopPropagation(); toggleInvoice(item.id); }} />
                                        <div className="min-w-0">
                                          <p className="text-xs text-[var(--text-secondary)]">
                                            {item.reference ?? ''} {item.reference ? '·' : ''} {formatDate(item.date)}
                                          </p>
                                        </div>
                                      </div>
                                      <div className="text-right flex-shrink-0 ml-3">
                                        <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(String(item.remaining))}</p>
                                        {item.remaining !== item.totalAmount && (
                                          <p className="text-[10px] text-[var(--text-secondary)] tabular-nums">of {formatRM(String(item.totalAmount))}</p>
                                        )}
                                      </div>
                                    </div>
                                    {isItemExpanded && fileId && (
                                      <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-[300px] border-t border-[#E0E3E5]" title="Document Preview" allow="autoplay" />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Admin: simple click-to-select (single invoice only)
                    return group.invoices.map((item: { type: string; id: string; reference: string | null; name: string; totalAmount: number; remaining: number; date: string }) => {
                      const isSelected = selectedItem?.id === item.id;
                      return (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => { onSetSelectedItem(isSelected ? null : { type: item.type, id: item.id }); onSetSelectedClaimIds(() => new Set()); setSelectedInvoiceIds(new Set()); }}
                        className={`flex items-center justify-between p-3 border-b cursor-pointer transition-colors ${
                          isSelected ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--surface-low)] hover:bg-[var(--surface-low)]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${
                              item.type === 'invoice' ? 'badge-amber' : 'badge-green'
                            }`}>
                              {item.type === 'invoice' ? 'INV' : 'SALES'}
                            </span>
                            <p className="text-body-sm font-medium text-[var(--text-primary)] truncate">{item.name}</p>
                          </div>
                          <p className="text-label-sm text-[var(--text-secondary)] mt-0.5">
                            {item.reference ?? ''} {item.reference ? '·' : ''} {formatDate(item.date)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-body-md font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(String(item.remaining))}</p>
                          {item.remaining !== item.totalAmount && (
                            <p className="text-label-sm text-[var(--text-secondary)] tabular-nums">of {formatRM(String(item.totalAmount))}</p>
                          )}
                        </div>
                      </div>
                    );
                    });
                  })}

                  {showInvoices && invoiceItems.length === 0 && (
                    <p className="text-sm text-[var(--text-secondary)] py-4 text-center">No outstanding invoices.</p>
                  )}

                  {/* Claims grouped by employee — collapsible keycap cards */}
                  {showClaims && Array.from(employeeGroups.entries()).map(([empKey, group]) => {
                    const allIds = new Set(group.claims.map((c: { id: string }) => c.id));
                    const allSelected = group.claims.every((c: { id: string }) => selectedClaimIds.has(c.id));
                    const someSelected = group.claims.some((c: { id: string }) => selectedClaimIds.has(c.id));
                    const isSingleClaim = group.claims.length === 1;
                    const isEmpOpen = expandedEmployee === empKey || isSingleClaim;

                    const toggleAll = () => {
                      onSetSelectedItem(null);
                      setSelectedInvoiceIds(new Set());
                      onSetSelectedClaimIds(prev => {
                        const next = new Set(prev);
                        if (allSelected) { allIds.forEach(aid => next.delete(aid)); }
                        else { allIds.forEach(aid => next.add(aid)); }
                        return next;
                      });
                    };

                    const toggleOne = (claimId: string) => {
                      onSetSelectedItem(null);
                      setSelectedInvoiceIds(new Set());
                      onSetSelectedClaimIds(prev => {
                        const next = new Set(prev);
                        if (next.has(claimId)) next.delete(claimId); else next.add(claimId);
                        return next;
                      });
                    };

                    return (
                      <div key={empKey} className="mb-1.5">
                        {/* Employee card — btn-thick-white keycap */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSingleClaim) {
                              toggleOne(group.claims[0].id);
                            } else {
                              setExpandedEmployee(isEmpOpen ? null : empKey);
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          className={`btn-thick-white w-full flex items-center justify-between px-3 py-2.5 text-left ${
                            allSelected ? '!bg-blue-50' : someSelected ? '!bg-blue-50/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={isSingleClaim ? selectedClaimIds.has(group.claims[0].id) : allSelected}
                              ref={(el) => { if (el) el.indeterminate = !isSingleClaim && someSelected && !allSelected; }}
                              onChange={() => {}}
                              className="ds-table-checkbox"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isSingleClaim) { toggleOne(group.claims[0].id); }
                                else { toggleAll(); }
                              }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${isSingleClaim ? 'badge-purple' : 'badge-blue'}`}>
                                  {isSingleClaim ? 'CLAIM' : 'CLAIMS'}
                                </span>
                                <p className="text-sm font-medium text-[var(--text-primary)] truncate normal-case tracking-normal">
                                  {isSingleClaim ? group.claims[0].merchant : group.employeeName}
                                </p>
                                {!isSingleClaim && <span className="text-label-sm text-[var(--text-secondary)] normal-case tracking-normal">({group.claims.length})</span>}
                              </div>
                              {isSingleClaim && (
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5 normal-case tracking-normal">
                                  {group.claims[0].reference ?? ''}{group.claims[0].reference ? ' · ' : ''}{formatDate(group.claims[0].date)}
                                  {group.claims[0].categoryName ? ` · ${group.claims[0].categoryName}` : ''}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                            <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(isSingleClaim ? String(group.claims[0].remaining) : String(group.total.toFixed(2)))}</p>
                            {!isSingleClaim && (
                              <svg className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${isEmpOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                        </button>

                        {/* Expanded claims list */}
                        {!isSingleClaim && isEmpOpen && (
                          <div className="border-x border-b border-[#E0E3E5] bg-[var(--surface-low)]">
                            {group.claims.map((c: { id: string; merchant: string; remaining: number; date: string; categoryName?: string; reference: string | null; fileUrl?: string | null; thumbnailUrl?: string | null }) => {
                              const claimDocUrl = c.fileUrl;
                              const claimDriveMatch = claimDocUrl?.match(/\/d\/([^/]+)/);
                              const claimFileId = claimDriveMatch?.[1];
                              const isClaimExpanded = config.showDescriptionEdit && expandedDocUrl === `match-claim-${c.id}`;

                              return (
                                <div key={c.id}>
                                  <div
                                    onClick={() => {
                                      toggleOne(c.id);
                                      if (config.showDescriptionEdit && (claimDocUrl || c.thumbnailUrl)) onSetExpandedDocUrl(isClaimExpanded ? null : `match-claim-${c.id}`);
                                    }}
                                    className={`flex items-center justify-between px-3 py-2 pl-10 cursor-pointer transition-colors border-t border-[#E0E3E5] first:border-t-0 ${
                                      selectedClaimIds.has(c.id) ? 'bg-blue-50' : 'hover:bg-white'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <input type="checkbox" checked={selectedClaimIds.has(c.id)} onChange={() => {}} className="ds-table-checkbox" onClick={e => { e.stopPropagation(); toggleOne(c.id); }} />
                                      <div className="min-w-0">
                                        <p className="text-sm text-[var(--text-primary)]">{c.merchant}</p>
                                        <p className="text-xs text-[var(--text-secondary)]">
                                          {c.reference ?? ''}{c.reference ? ' · ' : ''}{formatDate(c.date)}
                                          {c.categoryName ? ` · ${c.categoryName}` : ''}
                                        </p>
                                      </div>
                                    </div>
                                    <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)] ml-3">{formatRM(String(c.remaining))}</p>
                                  </div>
                                  {isClaimExpanded && claimFileId && (
                                    <iframe src={`https://drive.google.com/file/d/${claimFileId}/preview`} className="w-full h-[250px] border-t border-[#E0E3E5]" title="Claim Preview" allow="autoplay" />
                                  )}
                                  {isClaimExpanded && c.thumbnailUrl && !claimFileId && (
                                    <div className="border-t border-[#E0E3E5] p-2">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={c.thumbnailUrl} alt="Claim" className="w-full object-contain max-h-[250px]" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {showClaims && employeeGroups.size === 0 && (
                    <p className="text-sm text-[var(--text-secondary)] py-4 text-center">No outstanding claims.</p>
                  )}

                  {/* Legacy payment candidates (admin only) */}
                  {!config.useFirmScope && showInvoices && candidates.length > 0 && invoiceItems.length === 0 && candidates.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => onMatchLegacy(p.id)}
                      className="flex items-center justify-between p-3 border-b border-[var(--surface-low)] hover:bg-[var(--surface-low)] cursor-pointer transition-colors"
                    >
                      <div>
                        <p className="text-body-sm font-medium text-[var(--text-primary)]">{p.supplier_name}</p>
                        <p className="text-label-sm text-[var(--text-secondary)]">{formatDate(p.payment_date)} {p.reference ? `· ${p.reference}` : ''} · {p.direction}</p>
                      </div>
                      <p className="text-body-md font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(p.amount)}</p>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )}
            </div>

            {/* Footer actions */}
            <div className="flex-shrink-0 px-5 pb-5 pt-2 bg-[var(--surface-low)]">
        {matchError && <p className="text-sm text-[var(--reject-red)] mb-2">{matchError}</p>}

        {(selectedItem || selectedClaimIds.size > 0 || selectedInvoiceIds.size > 0) && (
          <button
            onClick={() => setShowJvConfirm(true)}
            disabled={matchSubmitting}
            className="btn-thick-green w-full py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {matchSubmitting ? 'Matching...' : selectedInvoiceIds.size > 1 ? `Match ${selectedInvoiceIds.size} Invoices` : selectedClaimIds.size > 1 ? `Match ${selectedClaimIds.size} Claims` : 'Confirm & Create JV'}
          </button>
        )}

        {/* Official receipt option — credit (money coming in) */}
        {matchingTxn.credit && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--surface-header)]" />
              <span className="text-label-sm text-[var(--text-secondary)]">or</span>
              <div className="flex-1 h-px bg-[var(--surface-header)]" />
            </div>

            {!showReceiptForm ? (
              <button onClick={onOpenReceiptForm} className="btn-thick-green w-full px-3 py-2 text-body-md font-medium">
                + Create Official Receipt
              </button>
            ) : (
              <div className="space-y-3 bg-white p-4">
                <h3 className="text-body-md font-semibold text-[var(--text-primary)]">Create Official Receipt</h3>
                <div className="bg-[var(--surface-low)] p-2.5 text-body-sm text-[var(--text-secondary)] flex gap-3">
                  <span>Amount: <strong className="tabular-nums">{formatRM(matchingTxn.credit)}</strong></span>
                  <span>Date: <strong>{formatDate(matchingTxn.transaction_date)}</strong></span>
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Received From</label>
                  {!creatingNewSupplier ? (
                    <div className="flex gap-2">
                      <select
                        value={voucherData.supplier_id}
                        onChange={(e) => {
                          const sid = e.target.value;
                          onSetVoucherData({ ...voucherData, supplier_id: sid, new_supplier_name: '', gl_account_id: '' });
                          const name = voucherSuppliers.find(s => s.id === sid)?.name || 'Walk-in Customer';
                          onFetchNextReceiptNumber(name, sid || undefined);
                        }}
                        className="input-recessed flex-1"
                      >
                        <option value="">Walk-in Customer (default)</option>
                        {voucherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => { onSetCreatingNewSupplier(true); onSetVoucherData({ ...voucherData, supplier_id: '', new_supplier_name: '' }); }}
                        className="btn-thick-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                      >
                        + New
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={voucherData.new_supplier_name}
                        onChange={(e) => onSetVoucherData({ ...voucherData, new_supplier_name: e.target.value, supplier_id: '' })}
                        onBlur={() => { if (voucherData.new_supplier_name.trim()) onFetchNextReceiptNumber(voucherData.new_supplier_name); }}
                        className="input-recessed flex-1"
                        placeholder="Enter new supplier name..."
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { onSetCreatingNewSupplier(false); onSetVoucherData({ ...voucherData, new_supplier_name: '' }); }}
                        className="btn-thick-white px-2.5 py-1.5 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt No.</label>
                  <input type="text" value={voucherData.reference} onChange={(e) => onSetVoucherData({ ...voucherData, reference: e.target.value })} className="input-recessed w-full" placeholder="Auto-generated" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">CR Account (Sales/Income GL)</label>
                  <GlAccountSelect
                    value={voucherData.gl_account_id}
                    onChange={(gid) => onSetVoucherData({ ...voucherData, gl_account_id: gid })}
                    accounts={receiptGlAccounts}
                    firmId={statement?.firm_id}
                    placeholder="Select GL account..."
                    preferredType="Revenue"
                  />
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">DR Bank Account (auto) / CR this account</p>
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes (optional)</label>
                  <input type="text" value={voucherData.notes} onChange={(e) => onSetVoucherData({ ...voucherData, notes: e.target.value })} className="input-recessed w-full" placeholder="e.g. Payment received for invoice #123" />
                </div>
                {voucherError && <p className="text-sm text-[var(--reject-red)]">{voucherError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setShowReceiptConfirm(true)} disabled={creatingVoucher} className="btn-thick-green flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                    {creatingVoucher ? 'Creating...' : 'Create & Match'}
                  </button>
                  <button onClick={onCloseReceiptForm} className="btn-thick-white flex-1 py-2 text-sm font-semibold">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Payment voucher option — debit (money going out) */}
        {matchingTxn.debit && (
          <>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-[var(--surface-header)]" />
              <span className="text-label-sm text-[var(--text-secondary)]">or</span>
              <div className="flex-1 h-px bg-[var(--surface-header)]" />
            </div>

            {!showVoucherForm ? (
              <button onClick={onOpenVoucherForm} className="btn-thick-red w-full px-3 py-2 text-body-md font-medium">
                + Create Payment Voucher
              </button>
            ) : (
              <div className="space-y-3 bg-white p-4">
                <h3 className="text-body-md font-semibold text-[var(--text-primary)]">Create Payment Voucher</h3>
                <div className="bg-[var(--surface-low)] p-2.5 text-body-sm text-[var(--text-secondary)] flex gap-3">
                  <span>Amount: <strong className="tabular-nums">{formatRM(matchingTxn.debit)}</strong></span>
                  <span>Date: <strong>{formatDate(matchingTxn.transaction_date)}</strong></span>
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Paid To</label>
                  {!creatingNewSupplier ? (
                    <div className="flex gap-2">
                      <select
                        value={voucherData.supplier_id}
                        onChange={(e) => {
                          const sid = e.target.value;
                          onSetVoucherData({ ...voucherData, supplier_id: sid, new_supplier_name: '', gl_account_id: '' });
                          const name = voucherSuppliers.find(s => s.id === sid)?.name || 'Walk-in Customer';
                          onFetchNextVoucherNumber(name, sid || undefined);
                        }}
                        className="input-recessed flex-1"
                      >
                        <option value="">Walk-in Customer (default)</option>
                        {voucherSuppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => { onSetCreatingNewSupplier(true); onSetVoucherData({ ...voucherData, supplier_id: '', new_supplier_name: '' }); }}
                        className="btn-thick-white px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                      >+ New</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={voucherData.new_supplier_name}
                        onChange={(e) => onSetVoucherData({ ...voucherData, new_supplier_name: e.target.value, supplier_id: '' })}
                        onBlur={() => { if (voucherData.new_supplier_name.trim()) onFetchNextVoucherNumber(voucherData.new_supplier_name); }}
                        className="input-recessed flex-1"
                        placeholder="Enter new supplier name..."
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => { onSetCreatingNewSupplier(false); onSetVoucherData({ ...voucherData, new_supplier_name: '' }); }}
                        className="btn-thick-white px-2.5 py-1.5 text-xs font-medium"
                      >Cancel</button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Voucher No.</label>
                  <input type="text" value={voucherData.reference} onChange={(e) => onSetVoucherData({ ...voucherData, reference: e.target.value })} className="input-recessed w-full" placeholder="Auto-generated" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                  <select value={voucherData.category_id} onChange={(e) => onSetVoucherData({ ...voucherData, category_id: e.target.value })} className="input-recessed w-full">
                    <option value="">Select category...</option>
                    {voucherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">DR Account (Expense GL)</label>
                  <GlAccountSelect
                    value={voucherData.gl_account_id}
                    onChange={(gid) => onSetVoucherData({ ...voucherData, gl_account_id: gid })}
                    accounts={receiptGlAccounts}
                    firmId={statement?.firm_id}
                    placeholder="Select GL account..."
                    preferredType="Expense"
                  />
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">DR this account / CR Bank Account (auto)</p>
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes (optional)</label>
                  <input type="text" value={voucherData.notes} onChange={(e) => onSetVoucherData({ ...voucherData, notes: e.target.value })} className="input-recessed w-full" placeholder="e.g. Supplier payment for invoice #123" />
                </div>
                {voucherError && <p className="text-sm text-[var(--reject-red)]">{voucherError}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setShowVoucherConfirm(true)} disabled={creatingVoucher} className="btn-thick-red flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                    {creatingVoucher ? 'Creating...' : 'Create & Match'}
                  </button>
                  <button onClick={onCloseVoucherForm} className="btn-thick-white flex-1 py-2 text-sm font-semibold">Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        <button onClick={onClose} className="btn-thick-white mt-4 w-full px-3 py-2 text-body-md">
          Cancel
        </button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ JV CONFIRMATION MODAL ═══ */}
      {showJvConfirm && (
        <div className="fixed inset-0 bg-[#070E1B]/50 backdrop-blur-[2px] z-[70] flex items-center justify-center p-4" onClick={() => setShowJvConfirm(false)}>
          <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 bg-[var(--match-green)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Confirm & Create JV</h3>
              <p className="text-xs text-white/80 mt-1">A Journal Entry will be posted with the following:</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Transaction summary */}
              <div className="bg-[var(--surface-low)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">{getMatchedLabel()}</p>
                <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatRM(getJvAmount())}</p>
                {isPartialMatch() && (
                  <p className="text-xs text-amber-600">
                    Partial match — bank transaction is {formatRM(txnAmount)}, remaining {formatRM((Number(txnAmount) - Number(getJvAmount())).toFixed(2))} unmatched
                  </p>
                )}
              </div>

              {/* JV Preview */}
              <table className="w-full text-sm">
                <thead>
                  <tr className="ds-table-header text-left">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Build per-item debit/credit lines
                    const selectedItems = selectedInvoiceIds.size > 0
                      ? outstandingItems.filter(i => selectedInvoiceIds.has(i.id))
                      : selectedClaimIds.size > 0
                      ? outstandingItems.filter(i => selectedClaimIds.has(i.id))
                      : selectedItem ? [outstandingItems.find(i => i.id === selectedItem.id)].filter(Boolean) : [];

                    if (selectedItems.length > 1) {
                      // Multi-item: one line per item + bank GL total
                      return isOutgoing ? (
                        <>
                          {selectedItems.map((item, i) => (
                            <tr key={i} className="border-b border-[var(--surface-low)]">
                              <td className="px-3 py-2 text-[var(--text-primary)] font-medium text-xs">
                                Trade Payables — {item.name || item.merchant}
                                {item.reference ? <span className="text-[var(--text-secondary)] font-normal ml-1">({item.reference})</span> : null}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">{formatRM(String(item.remaining ?? item.amount))}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] text-xs">—</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{bankGlLabel}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(getJvAmount())}</td>
                          </tr>
                        </>
                      ) : (
                        <>
                          <tr className="border-b border-[var(--surface-low)]">
                            <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{bankGlLabel}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(getJvAmount())}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                          </tr>
                          {selectedItems.map((item, i) => (
                            <tr key={i} className="border-b border-[var(--surface-low)] last:border-b-0">
                              <td className="px-3 py-2 text-[var(--text-primary)] font-medium text-xs">
                                Trade Receivables — {item.name || item.merchant}
                                {item.reference ? <span className="text-[var(--text-secondary)] font-normal ml-1">({item.reference})</span> : null}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] text-xs">—</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-[var(--text-primary)] text-xs">{formatRM(String(item.remaining ?? item.amount))}</td>
                            </tr>
                          ))}
                        </>
                      );
                    }

                    // Single item: simple 2-line preview
                    return isOutgoing ? (
                      <>
                        <tr className="border-b border-[var(--surface-low)]">
                          <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{getContraLabel()}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(getJvAmount())}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{bankGlLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(getJvAmount())}</td>
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-b border-[var(--surface-low)]">
                          <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{bankGlLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(getJvAmount())}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{getContraLabel()}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(getJvAmount())}</td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={() => {
                  setShowJvConfirm(false);
                  if (selectedInvoiceIds.size > 0) {
                    onMatchItem(undefined, Array.from(selectedInvoiceIds));
                  } else {
                    onMatchItem(selectedItem ?? undefined);
                  }
                }}
                disabled={matchSubmitting}
                className="btn-thick-green flex-1 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {matchSubmitting ? 'Posting...' : 'Confirm & Post JV'}
              </button>
              <button
                onClick={() => setShowJvConfirm(false)}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ PAYMENT VOUCHER CONFIRMATION MODAL ═══ */}
      {showVoucherConfirm && (
        <div className="fixed inset-0 bg-[#070E1B]/50 backdrop-blur-[2px] z-[70] flex items-center justify-center p-4" onClick={() => setShowVoucherConfirm(false)}>
          <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Confirm Payment Voucher</h3>
              <p className="text-xs text-white/80 mt-1">A Journal Entry will be posted with the following:</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[var(--surface-low)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">
                  {voucherData.supplier_id ? voucherSuppliers.find(s => s.id === voucherData.supplier_id)?.name : voucherData.new_supplier_name || 'Walk-in Customer'}
                  {voucherData.reference ? ` — ${voucherData.reference}` : ''}
                </p>
                <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatRM(matchingTxn.debit!)}</p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="ds-table-header text-left">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--surface-low)]">
                    <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">
                      {(() => {
                        const gl = receiptGlAccounts.find(a => a.id === voucherData.gl_account_id);
                        return gl ? `${gl.account_code} — ${gl.name}` : 'Expense GL';
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(matchingTxn.debit!)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{bankGlLabel}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(matchingTxn.debit!)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={() => { setShowVoucherConfirm(false); onCreateVoucher(); }}
                disabled={creatingVoucher}
                className="btn-thick-green flex-1 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {creatingVoucher ? 'Creating...' : 'Confirm & Post JV'}
              </button>
              <button onClick={() => setShowVoucherConfirm(false)} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ OFFICIAL RECEIPT CONFIRMATION MODAL ═══ */}
      {showReceiptConfirm && (
        <div className="fixed inset-0 bg-[#070E1B]/50 backdrop-blur-[2px] z-[70] flex items-center justify-center p-4" onClick={() => setShowReceiptConfirm(false)}>
          <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Confirm Official Receipt</h3>
              <p className="text-xs text-white/80 mt-1">A Journal Entry will be posted with the following:</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[var(--surface-low)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">
                  {voucherData.supplier_id ? voucherSuppliers.find(s => s.id === voucherData.supplier_id)?.name : voucherData.new_supplier_name || 'Walk-in Customer'}
                  {voucherData.reference ? ` — ${voucherData.reference}` : ''}
                </p>
                <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatRM(matchingTxn.credit!)}</p>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="ds-table-header text-left">
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--surface-low)]">
                    <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">{bankGlLabel}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(matchingTxn.credit!)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">
                      {(() => {
                        const gl = receiptGlAccounts.find(a => a.id === voucherData.gl_account_id);
                        return gl ? `${gl.account_code} — ${gl.name}` : 'Income / Revenue GL';
                      })()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">—</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">{formatRM(matchingTxn.credit!)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={() => { setShowReceiptConfirm(false); onCreateReceipt(); }}
                disabled={creatingVoucher}
                className="btn-thick-green flex-1 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {creatingVoucher ? 'Creating...' : 'Confirm & Post JV'}
              </button>
              <button onClick={() => setShowReceiptConfirm(false)} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
