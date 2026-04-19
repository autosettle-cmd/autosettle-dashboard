'use client';

import React from 'react';
import type { BankReconDetailConfig } from '@/components/pages/BankReconDetailContent';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentAllocation {
  invoice_id: string;
  invoice_number: string | null;
  vendor_name: string;
  total_amount: string;
  issue_date: string;
  allocated_amount: string;
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
}: BankReconPreviewModalProps) {
  const cfg = STATUS_CFG[txn.recon_status] ?? STATUS_CFG.unmatched;
  const mp = txn.matched_payment;
  const hasInvoices = !!(txn.matched_invoice || (txn.matched_invoice_allocations && txn.matched_invoice_allocations.length > 0));
  const hasSalesInvoice = !!txn.matched_sales_invoice;
  const hasClaims = txn.matched_claims && txn.matched_claims.length > 0;
  const hasMatches = hasInvoices || hasSalesInvoice || hasClaims || !!mp;

  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-[1100px] max-h-[85vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="h-12 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
          <h2 className="text-white font-bold text-xs uppercase tracking-widest">Transaction Details</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
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
                              <p className="text-xs text-[var(--text-secondary)] normal-case tracking-normal">{alloc.invoice_number} · {formatDate(alloc.issue_date)}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-[var(--text-primary)] tabular-nums">{formatRM(String(alloc.allocation_amount))}</p>
                              <p className="text-[10px] text-[var(--text-secondary)] tabular-nums normal-case tracking-normal">of {formatRM(alloc.total_amount)}</p>
                            </div>
                          </button>
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
                    const amount = txn.debit ?? txn.credit;

                    const jvLines: { account: string; debit: string | null; credit: string | null }[] = [];

                    if (txn.debit) {
                      const invoiceAllocs = txn.matched_invoice_allocations?.length
                        ? txn.matched_invoice_allocations
                        : txn.matched_invoice ? [{ vendor_name: txn.matched_invoice.vendor_name, allocation_amount: txn.matched_invoice.allocation_amount ?? txn.matched_invoice.total_amount }] : [];
                      for (const alloc of invoiceAllocs) {
                        jvLines.push({ account: `Trade Payables — ${alloc.vendor_name}`, debit: formatRM(String(alloc.allocation_amount)), credit: null });
                      }
                      if (txn.matched_claims?.length) {
                        for (const c of txn.matched_claims) {
                          jvLines.push({ account: `${c.category_name} — ${c.merchant}`, debit: formatRM(c.amount), credit: null });
                        }
                      }
                      jvLines.push({ account: bankGl ?? `${statement?.bank_name ?? 'Bank'} (no GL)`, debit: null, credit: formatRM(amount) });
                    } else {
                      jvLines.push({ account: bankGl ?? `${statement?.bank_name ?? 'Bank'} (no GL)`, debit: formatRM(amount), credit: null });
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
                    <button onClick={() => { onConfirm([txn.id]); onClose(); }} disabled={confirming} className="btn-thick-green flex-1 py-1.5 text-xs disabled:opacity-50">
                      Confirm
                    </button>
                    <button onClick={() => { onUnmatch(txn.id); onClose(); }} className="btn-thick-red flex-1 py-1.5 text-xs">
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
                    <button onClick={() => { onUnmatch(txn.id); onClose(); }} className="btn-thick-red flex-1 py-1.5 text-xs">
                      Unmatch
                    </button>
                  </>
                )}
                {txn.recon_status === 'unmatched' && (
                  <button onClick={() => { onClose(); onOpenMatchModal(txn); }} className="btn-thick-navy flex-1 py-1.5 text-xs">
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
