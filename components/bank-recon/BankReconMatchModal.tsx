'use client';

import React from 'react';
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
  onMatchItem: (item?: { type: string; id: string }) => void;
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
  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className={`bg-white shadow-2xl w-full ${config.showDescriptionEdit ? 'max-w-[1200px]' : 'max-w-[720px]'} max-h-[90vh] flex flex-col animate-in`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">
            {matchingTxn.debit ? 'Match Outgoing Payment' : 'Match Incoming Payment'}
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel — transaction details (accountant: editable description + rich details; admin: simple summary) */}
          {config.showDescriptionEdit ? (
            <div className="w-[360px] flex-shrink-0 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4">
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

              return (
                <>
                  {/* Invoice / Sales Invoice items */}
                  {showInvoices && config.showDescriptionEdit && invoiceItems.length > 0 && (
                    <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">
                      {matchingTxn.debit ? 'Outstanding Invoices' : 'Outstanding Sales Invoices'} ({invoiceItems.length})
                    </p>
                  )}
                  {showInvoices && invoiceItems.map((item: { type: string; id: string; reference: string | null; name: string; totalAmount: number; remaining: number; date: string; fileUrl?: string | null }) => {
                    const isSelected = selectedItem?.id === item.id;

                    // Accountant: expandable doc preview
                    if (config.showDescriptionEdit) {
                      const docUrl = item.fileUrl;
                      const driveMatch = docUrl?.match(/\/d\/([^/]+)/);
                      const fileId = driveMatch?.[1];
                      const isItemExpanded = expandedDocUrl === `match-${item.id}`;
                      return (
                        <div key={`${item.type}-${item.id}`} className="mb-1.5">
                          <button
                            onClick={() => {
                              onSetSelectedItem(isSelected ? null : { type: item.type, id: item.id });
                              onSetSelectedClaimIds(() => new Set());
                              onSetExpandedDocUrl(isItemExpanded ? null : `match-${item.id}`);
                            }}
                            className={`btn-thick-white w-full flex items-center justify-between px-3 py-2 text-left ${
                              isSelected ? '!bg-blue-50' : ''
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${
                                  item.type === 'invoice' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                }`}>
                                  {item.type === 'invoice' ? 'INV' : 'SALES'}
                                </span>
                                <p className="text-sm font-medium text-[var(--text-primary)] truncate normal-case tracking-normal">{item.name}</p>
                              </div>
                              <p className="text-xs text-[var(--text-secondary)] mt-0.5 normal-case tracking-normal">
                                {item.reference ?? ''} {item.reference ? '·' : ''} {formatDate(item.date)}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0 ml-3">
                              <p className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(String(item.remaining))}</p>
                              {item.remaining !== item.totalAmount && (
                                <p className="text-[10px] text-[var(--text-secondary)] tabular-nums normal-case tracking-normal">of {formatRM(String(item.totalAmount))}</p>
                              )}
                            </div>
                          </button>
                          {isItemExpanded && fileId && (
                            <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-[300px] border border-t-0 border-[#E0E3E5]" title="Document Preview" allow="autoplay" />
                          )}
                          {isItemExpanded && !fileId && (
                            <div className="border border-t-0 border-[#E0E3E5] p-3 bg-[var(--surface-low)] space-y-1">
                              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Type</dt><dd className="text-[var(--text-primary)]">{item.type === 'invoice' ? 'Purchase Invoice' : 'Sales Invoice'}</dd></div>
                                <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">{item.type === 'invoice' ? 'Invoice No.' : 'Receipt No.'}</dt><dd className="text-[var(--text-primary)]">{item.reference ?? '—'}</dd></div>
                                <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Date</dt><dd className="text-[var(--text-primary)]">{formatDate(item.date)}</dd></div>
                                <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Total</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(String(item.totalAmount))}</dd></div>
                                <div><dt className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Remaining</dt><dd className="text-[var(--text-primary)] tabular-nums">{formatRM(String(item.remaining))}</dd></div>
                              </dl>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Admin: simple click-to-select
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => { onSetSelectedItem(isSelected ? null : { type: item.type, id: item.id }); onSetSelectedClaimIds(() => new Set()); }}
                        className={`flex items-center justify-between p-3 border-b cursor-pointer transition-colors ${
                          isSelected ? 'border-[var(--primary)] bg-blue-50' : 'border-[var(--surface-low)] hover:bg-[var(--surface-low)]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 ${
                              item.type === 'invoice' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
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
                  })}

                  {showInvoices && invoiceItems.length === 0 && (
                    <p className="text-sm text-[var(--text-secondary)] py-4 text-center">No outstanding invoices.</p>
                  )}

                  {/* Claims grouped by employee */}
                  {showClaims && Array.from(employeeGroups.entries()).map(([empKey, group]) => {
                    const allIds = new Set(group.claims.map((c: { id: string }) => c.id));
                    const allSelected = group.claims.every((c: { id: string }) => selectedClaimIds.has(c.id));
                    const someSelected = group.claims.some((c: { id: string }) => selectedClaimIds.has(c.id));

                    const toggleAll = () => {
                      onSetSelectedItem(null);
                      onSetSelectedClaimIds(prev => {
                        const next = new Set(prev);
                        if (allSelected) { allIds.forEach(aid => next.delete(aid)); }
                        else { allIds.forEach(aid => next.add(aid)); }
                        return next;
                      });
                    };

                    const toggleOne = (claimId: string) => {
                      onSetSelectedItem(null);
                      onSetSelectedClaimIds(prev => {
                        const next = new Set(prev);
                        if (next.has(claimId)) next.delete(claimId); else next.add(claimId);
                        return next;
                      });
                    };

                    return (
                      <div key={empKey} className="border-b border-[var(--surface-low)] overflow-hidden">
                        <div
                          onClick={toggleAll}
                          className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                            allSelected ? 'bg-blue-50' : someSelected ? 'bg-blue-50/50' : 'hover:bg-[var(--surface-low)]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input type="checkbox" checked={allSelected} onChange={() => {}} className="border-gray-300 text-[var(--primary)]" onClick={e => e.stopPropagation()} />
                            <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700">CLAIMS</span>
                            <p className="text-body-sm font-medium text-[var(--text-primary)]">{group.employeeName}</p>
                            <span className="text-label-sm text-[var(--text-secondary)]">({group.claims.length})</span>
                          </div>
                          <p className="text-body-md font-semibold tabular-nums text-[var(--text-primary)]">{formatRM(String(group.total))}</p>
                        </div>
                        <div className="border-t border-[var(--surface-low)]">
                          {group.claims.map((c: { id: string; merchant: string; remaining: number; date: string; categoryName?: string; reference: string | null; fileUrl?: string | null; thumbnailUrl?: string | null }) => {
                            // Accountant: expandable doc preview for claims
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
                                className={`flex items-center justify-between px-3 py-2 pl-10 cursor-pointer transition-colors border-t border-[var(--surface-low)] first:border-t-0 ${
                                  selectedClaimIds.has(c.id) ? 'bg-blue-50' : 'hover:bg-[var(--surface-low)]'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <input type="checkbox" checked={selectedClaimIds.has(c.id)} onChange={() => {}} className="border-gray-300 text-[var(--primary)]" onClick={e => e.stopPropagation()} />
                                  <div className="min-w-0">
                                    <p className="text-body-sm text-[var(--text-primary)] truncate">{c.merchant}</p>
                                    <p className="text-label-sm text-[var(--text-secondary)]">
                                      {c.reference ?? ''}{c.reference ? ' · ' : ''}{formatDate(c.date)}
                                      {c.categoryName ? ` · ${c.categoryName}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <p className="text-body-sm font-medium tabular-nums text-[var(--text-primary)] ml-3">{formatRM(String(c.remaining))}</p>
                              </div>
                              {isClaimExpanded && claimFileId && (
                                <iframe src={`https://drive.google.com/file/d/${claimFileId}/preview`} className="w-full h-[250px] border border-t-0 border-[var(--surface-low)]" title="Claim Preview" allow="autoplay" />
                              )}
                              {isClaimExpanded && c.thumbnailUrl && !claimFileId && (
                                <div className="border border-t-0 border-[var(--surface-low)] p-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={c.thumbnailUrl} alt="Claim" className="w-full object-contain max-h-[250px]" />
                                </div>
                              )}
                            </div>
                            );
                          })}
                        </div>
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

        {(selectedItem || selectedClaimIds.size > 0) && (
          <button
            onClick={() => onMatchItem(selectedItem ?? undefined)}
            disabled={matchSubmitting}
            className="btn-thick-green w-full py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {matchSubmitting ? 'Matching...' : selectedClaimIds.size > 1 ? `Match ${selectedClaimIds.size} Claims` : 'Confirm & Create JV'}
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
                  <button onClick={onCreateReceipt} disabled={creatingVoucher} className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
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
              <button onClick={onOpenVoucherForm} className="btn-thick-navy w-full px-3 py-2 text-body-md font-medium">
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
                  <button onClick={onCreateVoucher} disabled={creatingVoucher || !voucherData.category_id} className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
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
    </div>
  );
}
