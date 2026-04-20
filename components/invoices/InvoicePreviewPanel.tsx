'use client';

import { useState, useEffect, useCallback } from 'react';
import Field from '@/components/forms/Field';
import GlAccountSelect from '@/components/GlAccountSelect';
import { STATUS_CFG, PAYMENT_CFG, LINK_CFG, APPROVAL_CFG } from '@/lib/badge-config';
import { formatRM } from '@/lib/formatters';
import type { InvoicesPageConfig } from '@/components/pages/InvoicesPageContent';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLineRow {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_amount: string;
  line_total: string;
  gl_account_id: string | null;
  gl_account_label: string | null;
  sort_order: number;
}

interface InvoiceRow {
  id: string;
  vendor_name_raw: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  payment_terms: string | null;
  subtotal: string | null;
  tax_amount: string | null;
  total_amount: string;
  amount_paid: string;
  category_name: string;
  category_id: string;
  status: 'pending_review' | 'reviewed';
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_link_status: 'auto_matched' | 'unmatched' | 'confirmed';
  uploader_name: string;
  firm_name: string;
  firm_id: string;
  confidence: string;
  file_url: string | null;
  thumbnail_url: string | null;
  notes: string | null;
  gl_account_id: string | null;
  gl_account_label: string | null;
  contra_gl_account_id: string | null;
  contra_gl_account_label: string | null;
  supplier_default_gl_id: string | null;
  supplier_default_contra_gl_id: string | null;
  approval: 'pending_approval' | 'approved' | 'not_approved';
  rejection_reason: string | null;
  lines: InvoiceLineRow[];
}

interface LineDraft {
  description: string;
  unit_price: string;
  tax_amount: string;
  line_total: string;
  gl_account_id: string;
}

interface EditDataShape {
  vendor_name_raw: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  payment_terms: string;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  category_id: string;
  supplier_id: string;
}

interface GlAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
}

interface SupplierOption {
  id: string;
  name: string;
  firm_id: string;
  default_gl_account_id?: string | null;
  default_contra_gl_account_id?: string | null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface InvoicePreviewPanelProps {
  config: InvoicesPageConfig;
  previewInvoice: InvoiceRow;
  setPreviewInvoice: (inv: InvoiceRow | null) => void;

  // Edit state
  editMode: boolean;
  setEditMode: (v: boolean) => void;
  editData: EditDataShape | null;
  setEditData: (v: EditDataShape | null) => void;
  editSaving: boolean;
  saveEdit: () => void;

  // GL state
  selectedGlAccountId: string;
  setSelectedGlAccountId: (v: string) => void;
  selectedContraGlId: string;
  setSelectedContraGlId: (v: string) => void;
  glAccounts: GlAccount[];
  setGlAccounts: React.Dispatch<React.SetStateAction<GlAccount[]>>;

  // Lookups
  categories: { id: string; name: string }[];
  suppliers: SupplierOption[];
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierOption[]>>;

  // Supplier creation
  creatingSupplier: boolean;
  setCreatingSupplier: (v: boolean) => void;
  newSupplierName: string;
  setNewSupplierName: (v: string) => void;
  confirmSupplier: (invoiceId: string, supplierId: string) => void;
  createAndAssignSupplier: () => void;

  // Line items
  showLineItems: boolean;
  setShowLineItems: (v: boolean) => void;
  lineItems: LineDraft[];
  lineSaving: boolean;
  lineItemsTotal: number;
  addLineItem: () => void;
  removeLineItem: (idx: number) => void;
  updateLineItem: (idx: number, field: keyof LineDraft, value: string) => void;
  saveLineItems: () => void;
  removeAllLineItems: () => void;

  // Actions
  markAsReviewed: (id: string, glAccountId?: string) => void;
  batchAction: (ids: string[], action: 'approve' | 'reject' | 'revert', reason?: string, glAccountId?: string, contraGlId?: string) => void;
  setRejectModal: (v: { open: boolean; invoiceIds: string[]; reason: string }) => void;
  deleteInvoice: (id: string) => void;
  refresh: () => void;

  // Navigation
  onPrev?: () => void;
  onNext?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateDot(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InvoicePreviewPanel({
  config,
  previewInvoice,
  setPreviewInvoice,
  editMode,
  setEditMode,
  editData,
  setEditData,
  editSaving,
  saveEdit,
  selectedGlAccountId,
  setSelectedGlAccountId,
  selectedContraGlId,
  setSelectedContraGlId,
  glAccounts,
  setGlAccounts,
  categories,
  suppliers,
  setSuppliers,
  creatingSupplier,
  setCreatingSupplier,
  newSupplierName,
  setNewSupplierName,
  confirmSupplier,
  createAndAssignSupplier,
  showLineItems,
  setShowLineItems,
  lineItems,
  lineSaving,
  lineItemsTotal,
  addLineItem,
  removeLineItem,
  updateLineItem,
  saveLineItems,
  removeAllLineItems,
  markAsReviewed,
  batchAction,
  setRejectModal,
  deleteInvoice,
  refresh,
  onPrev,
  onNext,
}: InvoicePreviewPanelProps) {
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRevertConfirm, setShowRevertConfirm] = useState(false);

  // Keyboard navigation (left/right arrows) with visual press feedback
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

  const amount = Math.abs(Number(previewInvoice.total_amount));
  const isCreditNote = Number(previewInvoice.total_amount) < 0;
  const debitLabel = selectedGlAccountId
    ? glAccounts.find(a => a.id === selectedGlAccountId)
    : previewInvoice.gl_account_id
    ? glAccounts.find(a => a.id === previewInvoice.gl_account_id)
    : null;
  const contraLabel = selectedContraGlId
    ? glAccounts.find(a => a.id === selectedContraGlId)
    : previewInvoice.contra_gl_account_id
    ? glAccounts.find(a => a.id === previewInvoice.contra_gl_account_id)
    : null;

  return (
    <>
      {/* Prev/Next actuator strips — outside modal flex container */}
      {onPrev && (
        <div onClick={onPrev} className={`nav-actuator nav-actuator-left${pressedDir === 'left' ? ' nav-actuator-pressed' : ''}`} style={{ position: 'fixed', left: '0.5rem', top: '6vh', bottom: '6vh', width: '3rem', zIndex: 60 }} title="Previous (←)" role="button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </div>
      )}
      {onNext && (
        <div onClick={onNext} className={`nav-actuator nav-actuator-right${pressedDir === 'right' ? ' nav-actuator-pressed' : ''}`} style={{ position: 'fixed', right: '0.5rem', top: '6vh', bottom: '6vh', width: '3rem', zIndex: 60 }} title="Next (→)" role="button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      )}
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
      <div className="bg-white shadow-2xl w-full max-w-[1200px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invoice Details</h2>
          <button onClick={() => setPreviewInvoice(null)} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 flex min-h-0">
        {/* Left: Details + GL */}
        <div className={`${config.showGlFields ? 'w-1/2' : 'w-2/5'} flex-shrink-0 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4`}>

          {editMode && editData ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Vendor</label>
                <input type="text" value={editData.vendor_name_raw} onChange={(e) => setEditData({ ...editData, vendor_name_raw: e.target.value })} className="input-recessed w-full" />
              </div>
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice Number</label>
                <input type="text" value={editData.invoice_number} onChange={(e) => setEditData({ ...editData, invoice_number: e.target.value })} className="input-recessed w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Issue Date</label>
                  <input type="date" value={editData.issue_date} onChange={(e) => setEditData({ ...editData, issue_date: e.target.value })} className="input-recessed w-full" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Due Date</label>
                  <input type="date" value={editData.due_date} onChange={(e) => setEditData({ ...editData, due_date: e.target.value })} className="input-recessed w-full" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Payment Terms</label>
                <input type="text" value={editData.payment_terms} onChange={(e) => setEditData({ ...editData, payment_terms: e.target.value })} className="input-recessed w-full" placeholder="e.g. Net 30" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Subtotal</label>
                  <input type="number" step="0.01" value={editData.subtotal} onChange={(e) => setEditData({ ...editData, subtotal: e.target.value })} className="input-recessed w-full tabular-nums" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Tax</label>
                  <input type="number" step="0.01" value={editData.tax_amount} onChange={(e) => setEditData({ ...editData, tax_amount: e.target.value })} className="input-recessed w-full tabular-nums" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total</label>
                  <input type="number" step="0.01" value={editData.total_amount} onChange={(e) => setEditData({ ...editData, total_amount: e.target.value })} className="input-recessed w-full tabular-nums" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-recessed w-full">
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier Account</label>
                {config.role === 'accountant' && creatingSupplier ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSupplierName}
                      onChange={(e) => setNewSupplierName(e.target.value)}
                      placeholder="New supplier name"
                      className="input-recessed flex-1"
                      autoFocus
                    />
                    <button
                      onClick={async () => {
                        if (!newSupplierName.trim()) return;
                        try {
                          const res = await fetch(config.apiSuppliers, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newSupplierName.trim(), firm_id: previewInvoice.firm_id }),
                          });
                          const j = await res.json();
                          if (j.data?.id) {
                            setSuppliers(prev => [...prev, { id: j.data.id, name: j.data.name, firm_id: previewInvoice.firm_id }]);
                            setEditData({ ...editData, supplier_id: j.data.id });
                            setCreatingSupplier(false);
                            setNewSupplierName('');
                          }
                        } catch (e) { console.error(e); }
                      }}
                      className="btn-thick-green px-3 py-1.5 text-sm font-medium"
                    >
                      Create
                    </button>
                    <button onClick={() => { setCreatingSupplier(false); setNewSupplierName(''); }} className="btn-thick-white px-3 py-1.5 text-sm">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <select value={editData.supplier_id} onChange={(e) => setEditData({ ...editData, supplier_id: e.target.value })} className="input-recessed w-full">
                      <option value="">{config.role === 'accountant' ? '-- Not assigned --' : 'No supplier assigned'}</option>
                      {(config.role === 'accountant' ? suppliers.filter(s => s.firm_id === previewInvoice.firm_id) : suppliers).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {config.role === 'accountant' && (
                      <button onClick={() => setCreatingSupplier(true)} className="text-xs hover:underline mt-1" style={{ color: 'var(--primary)' }}>+ Create new supplier</button>
                    )}
                  </>
                )}
              </div>
              {config.showGlFields && glAccounts.length > 0 && (
                <>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Expense GL (Debit)</label>
                    <GlAccountSelect
                      value={selectedGlAccountId}
                      onChange={setSelectedGlAccountId}
                      accounts={glAccounts}
                      firmId={previewInvoice.firm_id}
                      placeholder="Select Expense GL"
                      preferredType="Expense"
                      defaultType="Expense"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contra GL (Credit)</label>
                    <GlAccountSelect
                      value={selectedContraGlId}
                      onChange={setSelectedContraGlId}
                      accounts={glAccounts}
                      firmId={previewInvoice.firm_id}
                      placeholder="Select Contra GL"
                      preferredType="Liability"
                      defaultType="Liability"
                      defaultBalance="Credit"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Status row */}
              <div className="flex flex-wrap items-center gap-1.5">
                {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                  <span key={cfg!.label} className={`${cfg!.cls} inline-flex items-center gap-1`}>
                    <span className={cfg!.label === 'Reviewed' || cfg!.label === 'Paid' ? 'led-green' : cfg!.label === 'Unpaid' ? 'led-off' : 'led-amber'} />
                    {cfg!.label}
                  </span>
                ))}
                {config.showApproval && APPROVAL_CFG[previewInvoice.approval] && (
                  <span className={`${APPROVAL_CFG[previewInvoice.approval].cls} inline-flex items-center gap-1`}>
                    <span className={previewInvoice.approval === 'approved' ? 'led-green' : previewInvoice.approval === 'not_approved' ? 'led-red' : 'led-amber'} />
                    {APPROVAL_CFG[previewInvoice.approval].label}
                  </span>
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                  previewInvoice.confidence === 'HIGH' ? 'text-[var(--match-green)]' :
                  previewInvoice.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'
                }`}>{previewInvoice.confidence}</span>
              </div>

              {/* Fields */}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="Vendor"        value={previewInvoice.vendor_name_raw} />
                <Field label="Invoice No."   value={previewInvoice.invoice_number} />
                <Field label="Issue Date"    value={formatDateDot(previewInvoice.issue_date)} />
                <Field label="Due Date"      value={previewInvoice.due_date ? formatDateDot(previewInvoice.due_date) : null} />
                {!config.showGlFields && <Field label="Payment Terms" value={previewInvoice.payment_terms} />}
                {!config.showGlFields && <Field label="Subtotal" value={previewInvoice.subtotal ? formatRM(previewInvoice.subtotal) : null} />}
                {!config.showGlFields && <Field label="Tax" value={previewInvoice.tax_amount ? formatRM(previewInvoice.tax_amount) : null} />}
                <Field label="Total Amount"  value={formatRM(previewInvoice.total_amount)} />
                <Field label="Amount Paid"   value={formatRM(previewInvoice.amount_paid)} />
                <Field label="Category"      value={previewInvoice.category_name} />
                {config.showFirmColumn && <Field label="Firm" value={previewInvoice.firm_name} />}
                {!config.showGlFields && <Field label="Uploaded By" value={previewInvoice.uploader_name} />}
              </dl>

              {previewInvoice.notes && (
                config.showGlFields ? (
                  <p className="text-xs text-[var(--text-secondary)] whitespace-pre-line border-l-2 border-[var(--outline)] pl-3 py-1">{previewInvoice.notes}</p>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 px-3 py-2 mt-2">
                    <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Notes</p>
                    <p className="text-sm text-amber-900 whitespace-pre-line">{previewInvoice.notes}</p>
                  </div>
                )
              )}

              {/* Supplier */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier</span>
                  {(() => {
                    const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                    return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                  })()}
                </div>
                <p className="text-sm text-[var(--text-primary)]">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
                {previewInvoice.supplier_link_status !== 'confirmed' && (
                  <div className="flex items-center gap-2">
                    {previewInvoice.supplier_id && (
                      <button
                        onClick={() => confirmSupplier(previewInvoice.id, previewInvoice.supplier_id!)}
                        className={`${config.showGlFields ? 'btn-thick-green text-[10px] px-2.5 py-1' : 'btn-thick-green text-xs px-3 py-1.5 font-medium'}`}
                      >
                        Confirm
                      </button>
                    )}
                    <select
                      className={`input-recessed text-xs ${config.showGlFields ? 'flex-1' : ''}`}
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setCreatingSupplier(true);
                          setNewSupplierName(previewInvoice.vendor_name_raw);
                        } else if (e.target.value) {
                          confirmSupplier(previewInvoice.id, e.target.value);
                        }
                      }}
                    >
                      <option value="">Assign to...</option>
                      {(config.role === 'accountant' ? suppliers.filter((s) => s.firm_id === previewInvoice.firm_id) : suppliers).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      <option value="__new__">+ Create new supplier</option>
                    </select>
                    {creatingSupplier && (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={newSupplierName}
                          onChange={(e) => setNewSupplierName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') createAndAssignSupplier(); }}
                          className="input-recessed flex-1 text-xs"
                          placeholder="Supplier name"
                        />
                        <button onClick={createAndAssignSupplier} className={`${config.showGlFields ? 'btn-thick-green text-[10px] px-2.5 py-1' : 'btn-thick-green text-xs px-3 py-1.5 font-medium'}`}>
                          Create
                        </button>
                        <button onClick={() => setCreatingSupplier(false)} className={`${config.showGlFields ? 'btn-thick-white text-[10px] px-2 py-1' : 'btn-thick-white text-xs px-2 py-1.5 font-medium'}`}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Admin: Confidence */}
              {!config.showGlFields && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Confidence</span>
                  <span className={`text-xs font-semibold ${
                    previewInvoice.confidence === 'HIGH' ? 'text-[var(--match-green)]' :
                    previewInvoice.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'
                  }`}>{previewInvoice.confidence}</span>
                </div>
              )}
            </>
          )}

        {/* GL Account Assignment (accountant only) — keywell container */}
        {config.showGlFields && !editMode && glAccounts.length > 0 && (
          <div className="space-y-2 pt-3 mt-2 px-3 pb-3 keywell-rimmed">
            {config.showLineItems && showLineItems ? (
              /* Editing line items */
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Line Items</label>
                  <div className="flex gap-3">
                    <button onClick={() => { setShowLineItems(false); }} className="text-[10px] text-[var(--text-secondary)] hover:underline">Cancel</button>
                    <button onClick={removeAllLineItems} disabled={lineSaving} className="text-[10px] text-[var(--reject-red)] hover:underline">
                      Remove All Lines
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {lineItems.map((line, i) => (
                    <div key={i} className="bg-[var(--surface-low)] border border-[#E0E3E5] p-2 space-y-1.5">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={line.description}
                          onChange={(e) => updateLineItem(i, 'description', e.target.value)}
                          placeholder="Description"
                          className="input-recessed flex-1 text-sm"
                        />
                        <button onClick={() => removeLineItem(i)} className="text-[var(--reject-red)] hover:opacity-70 px-1" title="Remove line">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[9px] font-label text-[var(--text-secondary)] uppercase">Amount</label>
                          <input
                            type="number"
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => updateLineItem(i, 'unit_price', e.target.value)}
                            placeholder="0.00"
                            className="input-recessed w-full text-sm tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-label text-[var(--text-secondary)] uppercase">Tax</label>
                          <input
                            type="number"
                            step="0.01"
                            value={line.tax_amount}
                            onChange={(e) => updateLineItem(i, 'tax_amount', e.target.value)}
                            placeholder="0.00"
                            className="input-recessed w-full text-sm tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-label text-[var(--text-secondary)] uppercase">Line Total</label>
                          <div className="input-recessed w-full text-sm tabular-nums bg-[var(--surface-base)] cursor-default">
                            {Number(line.line_total || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-label text-[var(--text-secondary)] uppercase">GL Account</label>
                        <GlAccountSelect
                          value={line.gl_account_id}
                          onChange={(val) => updateLineItem(i, 'gl_account_id', val)}
                          accounts={glAccounts}
                          firmId={previewInvoice.firm_id}
                          placeholder="Select GL"
                          preferredType="Expense"
                          defaultType="Expense"
                          onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                        />
                      </div>
                    </div>
                  ))}
                  <button onClick={addLineItem} className="text-xs font-medium hover:underline w-full text-left py-1" style={{ color: 'var(--primary)' }}>
                    + Add Line Item
                  </button>
                  <div className="flex items-center justify-between px-1 pt-1 border-t border-[#E0E3E5]">
                    <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase">Total</span>
                    <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">{formatRM(lineItemsTotal.toFixed(2))}</span>
                  </div>
                  <button
                    onClick={saveLineItems}
                    disabled={lineSaving || lineItems.length === 0 || lineItems.some(l => !l.description || !l.unit_price)}
                    className="btn-thick-navy w-full py-1.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {lineSaving ? 'Saving...' : 'Save Line Items'}
                  </button>
                </div>
              </div>
            ) : config.showLineItems && previewInvoice.lines.length > 0 ? (
              /* Read-only line items */
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Line Items</label>
                  {previewInvoice.approval !== 'approved' && (
                    <button onClick={() => setShowLineItems(true)} className="text-[10px] hover:underline" style={{ color: 'var(--primary)' }}>
                      Edit Lines
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {previewInvoice.lines.map((line, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[#E0E3E5] text-sm">
                      <span className="flex-1 text-[var(--text-primary)]">{line.description}</span>
                      <span className="tabular-nums font-medium text-[var(--text-primary)] w-24 text-right">{formatRM(line.line_total)}</span>
                      <div className="flex items-center gap-1 w-48">
                        {previewInvoice.approval === 'approved' && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--match-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                          </svg>
                        )}
                        <span className="text-xs text-[var(--text-secondary)] truncate">{line.gl_account_label ?? 'No GL'}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-end px-3 py-1 text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                    Total: {formatRM(previewInvoice.total_amount)}
                  </div>
                </div>
              </div>
            ) : (
              /* Single GL mode */
              <>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1 label-stamped">Expense GL (Debit)</label>
                  {previewInvoice.approval === 'approved' ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[#E0E3E5]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--match-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--text-primary)]">{previewInvoice.gl_account_label ?? 'Not assigned'}</span>
                    </div>
                  ) : (
                    <GlAccountSelect
                      value={selectedGlAccountId}
                      onChange={setSelectedGlAccountId}
                      accounts={glAccounts}
                      firmId={previewInvoice.firm_id}
                      placeholder="Select GL Account"
                      preferredType="Expense"
                      defaultType="Expense"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  )}
                </div>
                {config.showLineItems && previewInvoice.approval !== 'approved' && (
                  <button
                    onClick={() => { setShowLineItems(true); if (lineItems.length === 0) addLineItem(); }}
                    className="text-xs font-medium hover:underline py-1"
                    style={{ color: 'var(--primary)' }}
                  >
                    + Split into line items (different GL per line)
                  </button>
                )}
              </>
            )}

            {/* Contra GL */}
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1 label-stamped">Contra GL (Credit)</label>
              {previewInvoice.approval === 'approved' ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[#E0E3E5]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--match-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{(() => {
                    if (previewInvoice.contra_gl_account_label) return previewInvoice.contra_gl_account_label;
                    const gl = glAccounts.find(a => a.id === selectedContraGlId);
                    return gl ? `${gl.account_code} — ${gl.name}` : 'Not assigned';
                  })()}</span>
                </div>
              ) : (
                <GlAccountSelect
                  value={selectedContraGlId}
                  onChange={setSelectedContraGlId}
                  accounts={glAccounts}
                  firmId={previewInvoice.firm_id}
                  placeholder="Select Contra GL Account"
                  preferredType="Liability"
                  defaultType="Liability"
                  defaultBalance="Credit"
                  onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                />
              )}
            </div>
          </div>
        )}

        </div>{/* close left panel */}

        {/* Right: Document Preview + Actions */}
        <div className={`${config.showGlFields ? 'w-1/2' : 'w-3/5'} flex flex-col min-h-0`}>
          <div className="flex-1 overflow-y-auto">
            {(() => {
              const driveMatch = previewInvoice.file_url?.match(/\/d\/([^/]+)/);
              const fileId = driveMatch?.[1];
              if (fileId) {
                return <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-full min-h-[400px]" title="Document Preview" allow="autoplay" />;
              }
              if (previewInvoice.thumbnail_url) {
                return (
                  <div className="flex items-center justify-center h-full p-5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewInvoice.thumbnail_url} alt="Invoice" className="max-w-full max-h-[60vh] object-contain" />
                  </div>
                );
              }
              return <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">No document available</div>;
            })()}
          </div>

          {/* Action buttons — keywell recessed container */}
          <div className="p-3 flex-shrink-0 border-t border-[#E0E3E5] space-y-1.5 keywell-rimmed">
            {editMode ? (
              <div className="flex gap-2">
                <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy flex-1 py-1.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => { setEditMode(false); setEditData(null); }} className="btn-thick-white flex-1 py-1.5 text-xs font-semibold">
                  Cancel
                </button>
              </div>
            ) : config.showApproval ? (
              /* Accountant action buttons */
              <>
                <div className="flex gap-2">
                  {previewInvoice.status === 'pending_review' && previewInvoice.approval === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => markAsReviewed(previewInvoice.id, selectedGlAccountId || undefined)}
                        className="btn-thick-navy flex-1 py-1.5 text-xs font-semibold"
                      >
                        Mark as Reviewed
                      </button>
                      <button
                        onClick={() => setShowApproveConfirm(true)}
                        className="btn-thick-green flex-1 py-1.5 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectModal({ open: true, invoiceIds: [previewInvoice.id], reason: '' })}
                        className="btn-thick-red flex-1 py-1.5 text-xs"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {previewInvoice.status === 'reviewed' && previewInvoice.approval === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => setShowApproveConfirm(true)}
                        className="btn-thick-green flex-1 py-1.5 text-xs"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectModal({ open: true, invoiceIds: [previewInvoice.id], reason: '' })}
                        className="btn-thick-red flex-1 py-1.5 text-xs"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {previewInvoice.approval === 'approved' && (
                    <div className="flex-1 flex items-center justify-center py-1.5 text-xs font-semibold text-[var(--match-green)] bg-green-50 border border-green-200">
                      Approved
                    </div>
                  )}
                  {previewInvoice.approval === 'not_approved' && (
                    <div className="flex-1 flex items-center justify-center py-1.5 text-xs font-semibold text-[var(--reject-red)] bg-red-50 border border-red-200">
                      Rejected
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {previewInvoice.approval !== 'approved' && (
                    <button
                      onClick={() => {
                        setEditMode(true);
                        setEditData({
                          vendor_name_raw: previewInvoice.vendor_name_raw,
                          invoice_number: previewInvoice.invoice_number ?? '',
                          issue_date: previewInvoice.issue_date.split('T')[0],
                          due_date: previewInvoice.due_date?.split('T')[0] ?? '',
                          payment_terms: previewInvoice.payment_terms ?? '',
                          subtotal: previewInvoice.subtotal ?? '',
                          tax_amount: previewInvoice.tax_amount ?? '',
                          total_amount: previewInvoice.total_amount,
                          category_id: previewInvoice.category_id,
                          supplier_id: previewInvoice.supplier_id ?? '',
                        });
                      }}
                      className="btn-thick-white flex-1 py-1.5 text-xs font-semibold"
                    >
                      Edit
                    </button>
                  )}
                  {previewInvoice.status === 'reviewed' && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`${config.apiInvoices}/${previewInvoice.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'pending_review' }),
                          });
                          if (res.ok) {
                            refresh();
                            setPreviewInvoice({ ...previewInvoice, status: 'pending_review' });
                          }
                        } catch (e) { console.error(e); }
                      }}
                      className="btn-thick-white flex-1 py-1.5 text-xs font-semibold"
                    >
                      Revert Review
                    </button>
                  )}
                  {(previewInvoice.approval === 'approved' || previewInvoice.approval === 'not_approved') && (() => {
                    const hasBankRecon = previewInvoice.payment_status === 'paid' || previewInvoice.payment_status === 'partially_paid';
                    return hasBankRecon ? (
                      <div className="flex-1 relative group">
                        <button disabled className="btn-thick-white w-full py-1.5 text-xs font-semibold opacity-40 cursor-not-allowed">
                          Revert Approval
                        </button>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[var(--text-primary)] text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none">
                          Unmatch in Bank Recon first
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowRevertConfirm(true)}
                        className="btn-thick-white flex-1 py-1.5 text-xs font-semibold"
                      >
                        Revert Approval
                      </button>
                    );
                  })()}
                </div>
              </>
            ) : (
              /* Admin action buttons */
              <>
                <div className="flex gap-3">
                  {previewInvoice.status === 'pending_review' ? (
                    <button onClick={() => markAsReviewed(previewInvoice.id)} className="btn-thick-navy flex-1 py-2 text-sm font-semibold">
                      Mark as Reviewed
                    </button>
                  ) : (
                    <div className="flex-1 flex items-center justify-center py-2 text-sm font-semibold text-[var(--primary)] bg-[var(--surface-low)] border border-[var(--primary)]">
                      Reviewed
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setEditData({
                        vendor_name_raw: previewInvoice.vendor_name_raw,
                        invoice_number: previewInvoice.invoice_number ?? '',
                        issue_date: previewInvoice.issue_date.split('T')[0],
                        due_date: previewInvoice.due_date?.split('T')[0] ?? '',
                        payment_terms: previewInvoice.payment_terms ?? '',
                        subtotal: previewInvoice.subtotal ?? '',
                        tax_amount: previewInvoice.tax_amount ?? '',
                        total_amount: previewInvoice.total_amount,
                        category_id: previewInvoice.category_id,
                        supplier_id: previewInvoice.supplier_id ?? '',
                      });
                    }}
                    className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                  >
                    Edit
                  </button>
                  {previewInvoice.status === 'reviewed' && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`${config.apiInvoices}/${previewInvoice.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: 'pending_review' }),
                          });
                          if (res.ok) {
                            refresh();
                            setPreviewInvoice({ ...previewInvoice, status: 'pending_review' });
                          }
                        } catch (e) { console.error(e); }
                      }}
                      className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                    >
                      Revert Review
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="px-5 py-3 border-t border-[#E0E3E5] flex-shrink-0">
            {(() => {
              const hasPayments = previewInvoice.payment_status !== 'unpaid';
              const isApproved = config.showApproval && previewInvoice.approval === 'approved';
              const blocked = hasPayments || isApproved;
              const reason = hasPayments ? 'Remove payments/bank recon first' : 'Revert approval first';
              return blocked ? (
                <div className="relative group inline-block">
                  <button disabled className="btn-thick-red text-xs px-3 py-1 font-medium" style={{ opacity: 0.4, cursor: 'not-allowed', color: 'var(--text-muted)', backgroundColor: 'var(--surface-header)' }}>
                    Delete
                  </button>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-[var(--text-primary)] text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-75 pointer-events-none">
                    {reason}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => deleteInvoice(previewInvoice.id)}
                  className="btn-thick-red text-xs px-3 py-1 font-medium"
                >
                  Delete
                </button>
              );
            })()}
          </div>
        </div>

        </div>{/* close flex row */}
      </div>{/* close modal */}
      </div>{/* close centering */}
      {/* ═══ APPROVE CONFIRMATION MODAL ═══ */}
      {showApproveConfirm && (
        <div className="fixed inset-0 bg-[#070E1B]/50 backdrop-blur-[2px] z-[70] flex items-center justify-center p-4" onClick={() => setShowApproveConfirm(false)}>
          <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 bg-[var(--match-green)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Confirm Approval</h3>
              <p className="text-xs text-white/80 mt-1">A Journal Entry will be posted with the following:</p>
            </div>

            <div className="p-6 space-y-4">
              {/* Invoice summary */}
              <div className="bg-[var(--surface-low)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">{previewInvoice.vendor_name_raw} — {previewInvoice.invoice_number || 'No #'}</p>
                <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatRM(previewInvoice.total_amount)}</p>
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
                  {previewInvoice.lines.length > 0 ? (
                    /* Multi-line: show grouped debit lines + contra */
                    <>
                      {(() => {
                        const fallbackGlId = selectedGlAccountId || previewInvoice.gl_account_id;
                        const glTotals = new Map<string, number>();
                        for (const line of previewInvoice.lines) {
                          const lineGlId = line.gl_account_id || fallbackGlId || '';
                          glTotals.set(lineGlId, (glTotals.get(lineGlId) || 0) + Math.abs(Number(line.line_total)));
                        }
                        const entries = Array.from(glTotals.entries());
                        return entries.map(([glId, amt], i) => {
                          const gl = glId ? glAccounts.find(a => a.id === glId) : null;
                          return (
                            <tr key={`line-${i}`} className="border-b border-[var(--surface-low)]">
                              <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">
                                {gl ? `${gl.account_code} — ${gl.name}` : 'Expense GL'}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                                {isCreditNote ? '—' : formatRM(amt)}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                                {isCreditNote ? formatRM(amt) : '—'}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      <tr>
                        <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">
                          {contraLabel ? `${contraLabel.account_code} — ${contraLabel.name}` : 'Trade Payables GL'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {isCreditNote ? formatRM(amount) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                          {isCreditNote ? '—' : formatRM(amount)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    /* Single GL: simple 2-line preview */
                    <>
                      <tr className="border-b border-[var(--surface-low)]">
                        <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">
                          {debitLabel ? `${debitLabel.account_code} — ${debitLabel.name}` : 'Expense GL'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                          {isCreditNote ? '—' : formatRM(amount)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {isCreditNote ? formatRM(amount) : '—'}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 text-[var(--text-primary)] font-medium">
                          {contraLabel ? `${contraLabel.account_code} — ${contraLabel.name}` : 'Trade Payables GL'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                          {isCreditNote ? formatRM(amount) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--text-primary)]">
                          {isCreditNote ? '—' : formatRM(amount)}
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>

              {(!debitLabel || !contraLabel) && (
                <div className="bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                  Missing GL account — the system will use supplier/firm defaults if available.
                </div>
              )}
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={() => {
                  setShowApproveConfirm(false);
                  batchAction([previewInvoice.id], 'approve', undefined, selectedGlAccountId || undefined, selectedContraGlId || undefined);
                }}
                className="btn-thick-green flex-1 py-2.5 text-sm font-semibold"
              >
                Confirm & Post JV
              </button>
              <button
                onClick={() => setShowApproveConfirm(false)}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ REVERT APPROVAL CONFIRMATION MODAL ═══ */}
      {showRevertConfirm && (
        <div className="fixed inset-0 bg-[#070E1B]/50 backdrop-blur-[2px] z-[70] flex items-center justify-center p-4" onClick={() => setShowRevertConfirm(false)}>
          <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 bg-[var(--reject-red)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Confirm Revert Approval</h3>
              <p className="text-xs text-white/80 mt-1">This will reverse the Journal Entry posted on approval:</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-[var(--surface-low)] p-3 space-y-1">
                <p className="text-xs text-[var(--text-secondary)]">{previewInvoice.vendor_name_raw} — {previewInvoice.invoice_number || 'No #'}</p>
                <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{formatRM(previewInvoice.total_amount)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">The following will be reversed:</p>
                <ul className="space-y-1.5 text-sm text-[var(--text-primary)]">
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                    <span>Journal Entry will be <strong>reversed</strong> (DR/CR flipped, both stay posted)</span>
                  </li>
                  {previewInvoice.gl_account_label && (
                    <li className="flex items-start gap-2">
                      <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                      <span>Expense GL: {previewInvoice.gl_account_label}</span>
                    </li>
                  )}
                  {(previewInvoice.contra_gl_account_label || contraLabel) && (
                    <li className="flex items-start gap-2">
                      <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                      <span>Contra GL: {previewInvoice.contra_gl_account_label || (contraLabel ? `${contraLabel.account_code} — ${contraLabel.name}` : 'Trade Payables')}</span>
                    </li>
                  )}
                  <li className="flex items-start gap-2">
                    <span className="text-[var(--reject-red)] font-bold mt-0.5">-</span>
                    <span>Approval status reset to <strong>Pending Approval</strong></span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={() => {
                  setShowRevertConfirm(false);
                  batchAction([previewInvoice.id], 'revert');
                }}
                className="btn-thick-red flex-1 py-2.5 text-sm font-semibold"
              >
                Confirm Revert
              </button>
              <button
                onClick={() => setShowRevertConfirm(false)}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
