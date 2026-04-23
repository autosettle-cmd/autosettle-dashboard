'use client';

import { useState, useEffect, useCallback } from 'react';
import Field from '@/components/forms/Field';
import { STATUS_CFG, PAYMENT_CFG } from '@/lib/badge-config';
import { formatRM } from '@/lib/formatters';
import type { ClaimsPageConfig } from '@/components/pages/ClaimsPageContent';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_id: string;
  employee_name: string;
  firm_name: string;
  firm_id: string;
  merchant: string;
  description: string | null;
  category_id: string;
  category_name: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  payment_status: 'unpaid' | 'paid';
  rejection_reason: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  receipt_number: string | null;
  type: 'claim' | 'receipt' | 'mileage';
  from_location?: string | null;
  to_location?: string | null;
  distance_km?: string | null;
  trip_purpose?: string | null;
  gl_account_id?: string | null;
  gl_account_label?: string | null;
  contra_gl_account_id?: string | null;
  linked_payment_count: number;
  linked_payments: { payment_id: string; amount: string; payment_date: string; reference: string | null; supplier_name: string }[];
}

interface EditDataShape {
  claim_date: string;
  merchant: string;
  amount: string;
  category_id: string;
  receipt_number: string;
  description: string;
  employee_id: string;
}

interface LinkedInvoice {
  id: string;
  invoice_id: string;
  amount: number;
  invoice_number: string;
  vendor_name: string;
}

interface InvoiceSearchResult {
  id: string;
  invoice_number: string;
  vendor_name_raw: string;
  total_amount: number;
  amount_paid: number;
  issue_date: string;
}

interface SuggestedInvoice extends InvoiceSearchResult {
  match_reason: string;
}

interface PendingLinkInvoice {
  id: string;
  invoice_number: string;
  vendor_name_raw: string;
  total_amount: number;
  amount_paid: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ClaimPreviewPanelProps {
  config: ClaimsPageConfig;
  previewClaim: ClaimRow;
  setPreviewClaim: (claim: ClaimRow | null) => void;
  showFirm: boolean;

  // Edit state
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  editData: EditDataShape | null;
  setEditData: (v: EditDataShape | null) => void;
  editSaving: boolean;
  saveEdit: () => void;
  categories: { id: string; name: string }[];
  modalCategories: { id: string; name: string }[];
  modalEmployees: { id: string; name: string }[];

  // Invoice linking
  invoiceLinkSearch: string;
  setInvoiceLinkSearch: (v: string) => void;
  invoiceLinkResults: InvoiceSearchResult[];
  setInvoiceLinkResults: (v: InvoiceSearchResult[]) => void;
  invoiceLinkLoading: boolean;
  setInvoiceLinkLoading: (v: boolean) => void;
  linkedInvoices: LinkedInvoice[];
  setLinkedInvoices: React.Dispatch<React.SetStateAction<LinkedInvoice[]>>;
  suggestedInvoices: SuggestedInvoice[];
  setSuggestedInvoices: React.Dispatch<React.SetStateAction<SuggestedInvoice[]>>;
  pendingLinkInvoice: PendingLinkInvoice | null;
  setPendingLinkInvoice: (v: PendingLinkInvoice | null) => void;
  linkingInvoice: boolean;
  confirmLinkInvoice: () => void;

  // Actions
  batchReview: (ids: string[]) => void;
  deleteClaims: (ids: string[]) => void;
  refresh: () => void;

  // Navigation
  onPrev?: () => void;
  onNext?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateDot(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClaimPreviewPanel({
  config,
  previewClaim,
  setPreviewClaim,
  showFirm,
  editMode,
  setEditMode,
  editData,
  setEditData,
  editSaving,
  saveEdit,
  categories,
  modalCategories,
  modalEmployees,
  invoiceLinkSearch,
  setInvoiceLinkSearch,
  invoiceLinkResults,
  setInvoiceLinkResults,
  invoiceLinkLoading,
  setInvoiceLinkLoading,
  linkedInvoices,
  setLinkedInvoices,
  suggestedInvoices,
  pendingLinkInvoice,
  setPendingLinkInvoice,
  linkingInvoice,
  confirmLinkInvoice,
  batchReview,
  deleteClaims,
  refresh,
  onPrev,
  onNext,
}: ClaimPreviewPanelProps) {
  const isAccountant = config.role === 'accountant';
  const driveMatch = previewClaim.file_url?.match(/\/d\/([^/]+)/);
  const fileId = driveMatch?.[1];

  // Keyboard navigation with visual press feedback
  const [pressedDir, setPressedDir] = useState<'left' | 'right' | null>(null);
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (editMode) return;
    if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); setPressedDir('left'); onPrev(); }
    if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); setPressedDir('right'); onNext(); }
  }, [editMode, onPrev, onNext]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!pressedDir) return;
    const t = setTimeout(() => setPressedDir(null), 150);
    return () => clearTimeout(t);
  }, [pressedDir]);

  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
      <div className="relative bg-white shadow-2xl w-full max-w-[1100px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
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
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">
            {previewClaim.type === 'mileage' ? 'Mileage Claim' : previewClaim.type === 'receipt' ? 'Receipt Details' : 'Claim Details'}
          </h2>
          <button onClick={() => setPreviewClaim(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
        </div>

        {/* Body — two panels */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel — details */}
          <div className="w-2/5 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4">
            {editMode && editData ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt>
                  <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-recessed w-full mt-0.5" />
                </div>
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</dt>
                  <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-recessed w-full mt-0.5" />
                </div>
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</dt>
                  <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-recessed w-full mt-0.5" />
                </div>
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</dt>
                  <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-recessed w-full mt-0.5">
                    <option value="">Select category</option>
                    {(isAccountant ? categories : modalCategories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt Number</dt>
                  <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-recessed w-full mt-0.5" />
                </div>
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description</dt>
                  <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-recessed w-full mt-0.5" />
                </div>
                <div>
                  <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee</dt>
                  <select value={editData.employee_id} onChange={(e) => setEditData({ ...editData, employee_id: e.target.value })} className="input-recessed w-full mt-0.5">
                    {modalEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
                {showFirm && <Field label="Firm" value={previewClaim.firm_name} />}
                {previewClaim.type === 'receipt' && (
                  <div className="bg-[var(--surface-low)] p-3 space-y-2">
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Linked Invoices</dt>
                    {linkedInvoices.length > 0 && (
                      <div className="space-y-1.5">
                        {linkedInvoices.map(li => (
                          <div key={li.id} className="flex items-center justify-between bg-white px-2.5 py-1.5">
                            <div className="text-sm">
                              <span className="font-medium text-[var(--text-secondary)]">{li.invoice_number || 'No number'}</span>
                              <span className="text-[var(--text-muted)] ml-1.5">{li.vendor_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">{formatRM(li.amount)}</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm('Unlink this receipt from the invoice?')) return;
                                  try {
                                    const res = await fetch(`/api/invoices/${li.invoice_id}/receipt-link`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId: previewClaim.id }) });
                                    if (res.ok) { setLinkedInvoices(prev => prev.filter(x => x.id !== li.id)); refresh(); }
                                  } catch (e) { console.error(e); }
                                }}
                                className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80"
                              >&times;</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <input type="text" placeholder="Search invoice number or supplier..." value={invoiceLinkSearch}
                      onChange={(e) => {
                        const q = e.target.value; setInvoiceLinkSearch(q);
                        if (q.length < 2) { setInvoiceLinkResults([]); return; }
                        setInvoiceLinkLoading(true);
                        const searchUrl = isAccountant ? `${config.apiInvoices}?search=${encodeURIComponent(q)}&firmId=${previewClaim.firm_id}&take=10` : `${config.apiInvoices}?search=${encodeURIComponent(q)}&take=10`;
                        fetch(searchUrl).then(r => r.json()).then(j => { const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id)); setInvoiceLinkResults((j.data ?? []).filter((inv: { id: string }) => !alreadyLinked.has(inv.id))); }).catch(console.error).finally(() => setInvoiceLinkLoading(false));
                      }}
                      className="input-recessed w-full text-sm"
                    />
                    {(() => {
                      const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id));
                      const displayList = invoiceLinkSearch.length >= 2 ? invoiceLinkResults : suggestedInvoices.filter(s => !alreadyLinked.has(s.id));
                      if (displayList.length === 0) return null;
                      return (
                        <div>
                          {invoiceLinkSearch.length < 2 && <p className="text-xs text-[var(--text-muted)] mb-1">Suggested matches:</p>}
                          <div className="max-h-36 overflow-y-auto space-y-1">
                            {displayList.map(inv => (
                              <button type="button" key={inv.id} onClick={() => setPendingLinkInvoice({ id: inv.id, invoice_number: inv.invoice_number, vendor_name_raw: inv.vendor_name_raw, total_amount: inv.total_amount, amount_paid: inv.amount_paid })}
                                className={`w-full text-left px-2.5 py-1.5 transition-colors ${pendingLinkInvoice?.id === inv.id ? 'bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]' : 'hover:bg-[var(--primary)]/5'}`}>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-[var(--text-secondary)]">{inv.invoice_number || 'No number'}</span>
                                  <span className="text-xs text-[var(--text-muted)] tabular-nums">{formatRM(inv.total_amount)}</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)]">{inv.vendor_name_raw} &middot; Balance: {formatRM(Number(inv.total_amount) - Number(inv.amount_paid))}{'match_reason' in inv && inv.match_reason ? ` · ${inv.match_reason}` : ''}</p>
                              </button>
                            ))}
                          </div>
                          {pendingLinkInvoice && (
                            <button onClick={confirmLinkInvoice} disabled={linkingInvoice} className="btn-thick-green w-full py-2 mt-2 text-sm">
                              {linkingInvoice ? 'Linking...' : `Confirm Link to ${pendingLinkInvoice.invoice_number || 'Invoice'}`}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2">
                  Saving will reset status to Pending Review and approval to Pending.
                </p>
              </dl>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {[STATUS_CFG[previewClaim.status], PAYMENT_CFG[previewClaim.payment_status]].filter(Boolean).map((cfg) => (
                    <span key={cfg!.label} className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${cfg!.cls}`} style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>{cfg!.label}</span>
                  ))}
                  <span className={`text-xs font-semibold ${previewClaim.confidence === 'HIGH' ? 'text-[var(--match-green)]' : previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'}`}>{previewClaim.confidence}</span>
                </div>

                <dl className="space-y-3">
                  <Field label="Date"        value={formatDateDot(previewClaim.claim_date)} />
                  <Field label="Merchant"    value={previewClaim.merchant} />
                  <Field label="Employee"    value={previewClaim.employee_name} />
                  {showFirm && <Field label="Firm" value={previewClaim.firm_name} />}
                  <Field label="Category"    value={previewClaim.category_name} />
                  <Field label="Amount"      value={formatRM(previewClaim.amount)} />
                  <Field label="Receipt No." value={previewClaim.receipt_number} />
                  <Field label="Description" value={previewClaim.description} />
                </dl>

                {previewClaim.type === 'receipt' && previewClaim.linked_payments.length > 0 && (
                  <div className="bg-[var(--primary)]/10 p-3 space-y-2">
                    <p className="text-[10px] font-label font-bold text-[var(--primary)] uppercase tracking-widest">Linked Payment</p>
                    {previewClaim.linked_payments.map((lp) => (
                      <div key={lp.payment_id} className="text-sm text-[var(--primary)]">
                        <p className="font-medium">{lp.supplier_name}</p>
                        <p className="text-xs text-[var(--primary)]/70 tabular-nums">{formatRM(lp.amount)} &middot; {formatDateDot(lp.payment_date)}{lp.reference ? ` · ${lp.reference}` : ''}</p>
                      </div>
                    ))}
                    <button
                      onClick={async () => {
                        if (!confirm('Unlink this receipt from its payment?\n\nThis will:\n• Remove the payment link\n• Unmatch the bank transaction (if matched)\n• Reverse any posted journal entries from bank reconciliation')) return;
                        try { const res = await fetch(`${config.apiClaims}/${previewClaim.id}/payment-link`, { method: 'DELETE' }); if (res.ok) { refresh(); setPreviewClaim({ ...previewClaim, linked_payment_count: 0, linked_payments: [], payment_status: 'unpaid' }); } } catch (e) { console.error(e); }
                      }}
                      className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80 font-medium"
                    >Unlink from Payment</button>
                  </div>
                )}

                {/* Invoice Linking for receipts */}
                {previewClaim.type === 'receipt' && (
                  <div className="bg-[var(--surface-low)] p-3 space-y-2">
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Linked Invoices</p>
                    {linkedInvoices.length > 0 ? (
                      <div className="space-y-1.5">
                        {linkedInvoices.map(li => (
                          <div key={li.id} className="flex items-center justify-between bg-white px-2.5 py-1.5">
                            <div className="text-sm">
                              <span className="font-medium text-[var(--text-secondary)]">{li.invoice_number || 'No number'}</span>
                              <span className="text-[var(--text-muted)] ml-1.5">{li.vendor_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">{formatRM(li.amount)}</span>
                              <button onClick={async () => { if (!confirm('Unlink?')) return; try { const res = await fetch(`/api/invoices/${li.invoice_id}/receipt-link`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ claimId: previewClaim.id }) }); if (res.ok) { setLinkedInvoices(prev => prev.filter(x => x.id !== li.id)); refresh(); } } catch (e) { console.error(e); } }}
                                className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80">&times;</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--text-muted)]">No invoices linked yet.</p>
                    )}
                    <div className="relative">
                      <input type="text" placeholder="Search invoice number or supplier..." value={invoiceLinkSearch}
                        onChange={(e) => {
                          const q = e.target.value; setInvoiceLinkSearch(q);
                          if (q.length < 2) { setInvoiceLinkResults([]); return; }
                          setInvoiceLinkLoading(true);
                          const searchUrl = isAccountant ? `${config.apiInvoices}?search=${encodeURIComponent(q)}&firmId=${previewClaim.firm_id}&paymentStatus=unpaid&take=10` : `${config.apiInvoices}?search=${encodeURIComponent(q)}&paymentStatus=unpaid&take=10`;
                          fetch(searchUrl).then(r => r.json()).then(j => { const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id)); setInvoiceLinkResults((j.data ?? []).filter((inv: { id: string }) => !alreadyLinked.has(inv.id))); }).catch(console.error).finally(() => setInvoiceLinkLoading(false));
                        }}
                        className="input-recessed w-full text-sm"
                      />
                      {invoiceLinkLoading && <span className="absolute right-2 top-2 text-xs text-[var(--text-muted)]">Searching...</span>}
                    </div>
                    {(() => {
                      const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id));
                      const displayList = invoiceLinkSearch.length >= 2 ? invoiceLinkResults : suggestedInvoices.filter(s => !alreadyLinked.has(s.id));
                      if (displayList.length === 0) return null;
                      return (
                        <div>
                          {invoiceLinkSearch.length < 2 && <p className="text-xs text-[var(--text-muted)] mb-1">Suggested matches:</p>}
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {displayList.map(inv => (
                              <button key={inv.id} onClick={() => setPendingLinkInvoice({ id: inv.id, invoice_number: inv.invoice_number, vendor_name_raw: inv.vendor_name_raw, total_amount: inv.total_amount, amount_paid: inv.amount_paid })}
                                className={`w-full text-left px-2.5 py-1.5 transition-colors ${pendingLinkInvoice?.id === inv.id ? 'bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]' : 'hover:bg-[var(--primary)]/5'}`}>
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-medium text-[var(--text-secondary)]">{inv.invoice_number || 'No number'}</span>
                                  <span className="text-xs text-[var(--text-muted)] tabular-nums">{formatRM(inv.total_amount)}</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)]">{inv.vendor_name_raw} &middot; Balance: {formatRM(Number(inv.total_amount) - Number(inv.amount_paid))}{'match_reason' in inv && inv.match_reason ? ` · ${inv.match_reason}` : ''}</p>
                              </button>
                            ))}
                          </div>
                          {pendingLinkInvoice && (
                            <button onClick={confirmLinkInvoice} disabled={linkingInvoice} className="btn-thick-green w-full py-2 mt-2 text-sm">
                              {linkingInvoice ? 'Linking...' : `Confirm Link to ${pendingLinkInvoice.invoice_number || 'Invoice'}`}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {previewClaim.rejection_reason && (
                  <div className="bg-[var(--reject-red)]/10 p-3">
                    <p className="text-[10px] font-label font-bold text-[var(--reject-red)] uppercase tracking-widest mb-1">Rejection Reason</p>
                    <p className="text-sm text-[var(--reject-red)]">{previewClaim.rejection_reason}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right panel — document preview */}
          <div className="w-3/5 flex flex-col">
            <div className="flex-1 flex items-center justify-center bg-[var(--surface-low)] overflow-hidden">
              {fileId ? (
                <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-full" title="Document Preview" allow="autoplay" />
              ) : previewClaim.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewClaim.thumbnail_url} alt="Receipt" className="max-w-full max-h-[60vh] object-contain" />
              ) : (
                <p className="text-[var(--text-muted)] text-sm">No document available</p>
              )}
            </div>

            {/* Action buttons at bottom of right panel */}
            <div className="p-4 flex gap-3 flex-shrink-0 bg-[var(--surface-low)] border-t border-[var(--surface-header)]">
              {editMode ? (
                <>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy flex-1 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="btn-thick-white flex-1 py-2 text-sm">Cancel</button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setEditMode(true); setEditData({ claim_date: previewClaim.claim_date.split('T')[0], merchant: previewClaim.merchant, amount: previewClaim.amount, category_id: previewClaim.category_id, receipt_number: previewClaim.receipt_number ?? '', description: previewClaim.description ?? '', employee_id: previewClaim.employee_id ?? '' }); }}
                    className="btn-thick-navy flex-1 py-2 text-sm"
                  >Edit</button>
                  {!isAccountant && (
                    <button onClick={() => batchReview([previewClaim.id])} disabled={previewClaim.status === 'reviewed'} className="btn-thick-green flex-1 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">Mark as Reviewed</button>
                  )}
                  {isAccountant && (
                    <button onClick={() => setPreviewClaim(null)} className="btn-thick-white flex-1 py-2 text-sm font-semibold">Close</button>
                  )}
                </>
              )}
              <button onClick={() => deleteClaims([previewClaim.id])} className="btn-thick-red px-4 py-2 text-xs">Delete</button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
