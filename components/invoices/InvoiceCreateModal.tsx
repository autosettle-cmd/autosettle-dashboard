'use client';

import { useState } from 'react';
import GlAccountSelect from '@/components/GlAccountSelect';
import { LINK_CFG } from '@/lib/badge-config';
import { type RefObject } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

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

type DocType = 'PI' | 'SI' | 'CN' | 'DN' | 'PV' | 'OR';

interface NewInvState {
  firm_id: string;
  vendor_name: string;
  supplier_id: string;
  supplier_link_status: 'confirmed' | 'auto_matched' | 'unmatched';
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: string;
  category_id: string;
  payment_terms: string;
  notes: string;
  doc_type: DocType;
}

const DOC_TYPE_BADGES: Record<DocType, { label: string; color: string; bg: string; desc: string }> = {
  PI: { label: 'PI', color: '#234B6E', bg: '#E3EDF6', desc: 'Purchase Invoice' },
  SI: { label: 'SI', color: '#0E6027', bg: '#DEF2E4', desc: 'Sales Invoice' },
  CN: { label: 'CN', color: '#9A3412', bg: '#FEE2E2', desc: 'Credit Note' },
  DN: { label: 'DN', color: '#4338CA', bg: '#E0E7FF', desc: 'Debit Note' },
  PV: { label: 'PV', color: '#7C3A00', bg: '#FEF0DB', desc: 'Payment Voucher' },
  OR: { label: 'OR', color: '#5C2D91', bg: '#EEDDF9', desc: 'Official Receipt' },
};

interface InvoiceCreateModalConfig {
  role: 'accountant' | 'admin';
  showGlFields: boolean;
  firms?: { id: string; name: string }[];
}

export interface InvoiceCreateModalProps {
  config: InvoiceCreateModalConfig;
  newInv: NewInvState;
  setNewInv: (inv: NewInvState) => void;
  newInvFile: File | null;
  setNewInvFile: (file: File | null) => void;
  ocrScanning: boolean;
  newInvSubmitting: boolean;
  newInvError: string;
  depositWarning: string;
  vendorDropdownOpen: boolean;
  setVendorDropdownOpen: (open: boolean) => void;
  vendorInputRef: RefObject<HTMLInputElement>;
  suppliers: SupplierOption[];
  categories: { id: string; name: string }[];
  newInvGlAccounts: GlAccount[];
  setNewInvGlAccounts: React.Dispatch<React.SetStateAction<GlAccount[]>>;
  newInvExpenseGlId: string;
  setNewInvExpenseGlId: (id: string) => void;
  newInvContraGlId: string;
  setNewInvContraGlId: (id: string) => void;
  handleInvFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  submitNewInvoice: () => void;
  onClose: () => void;
  pvMatch?: { id: string; invoice_number: string; vendor_name_raw: string; total_amount: string; issue_date: string } | null;
  pvAttaching?: boolean;
  attachToPV?: () => void;
  dismissPvMatch?: () => void;
  wrongDocType?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function InvoiceCreateModal({
  config,
  newInv,
  setNewInv,
  newInvFile,
  setNewInvFile,
  ocrScanning,
  newInvSubmitting,
  newInvError,
  depositWarning,
  vendorDropdownOpen: _vendorDropdownOpen,
  setVendorDropdownOpen: _setVendorDropdownOpen,
  vendorInputRef,
  suppliers,
  categories,
  newInvGlAccounts,
  setNewInvGlAccounts,
  newInvExpenseGlId,
  setNewInvExpenseGlId,
  newInvContraGlId,
  setNewInvContraGlId,
  handleInvFileChange,
  submitNewInvoice,
  onClose,
  pvMatch,
  pvAttaching,
  attachToPV,
  dismissPvMatch,
  wrongDocType,
}: InvoiceCreateModalProps) {

  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierDropdownOpen, setSupplierDropdownOpen] = useState(false);
  const hasPreview = !!newInvFile;

  // Required fields validation
  const missingFields: string[] = [];
  if (!newInv.issue_date) missingFields.push('Issue Date');
  if (!newInv.total_amount || newInv.total_amount === '0') missingFields.push('Total Amount');
  if (config.showGlFields && !newInvExpenseGlId) missingFields.push('Expense GL');
  if (config.showGlFields && !newInvContraGlId) missingFields.push('Contra GL');
  const canSubmit = missingFields.length === 0;

  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className={`bg-white shadow-2xl ${hasPreview ? 'w-full max-w-[1100px]' : 'w-full max-w-[800px]'} max-h-[90vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">Submit New Invoice</h2>
            <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
          </div>

          <div className={`flex-1 flex min-h-0 ${hasPreview ? '' : 'flex-col'}`}>
            {/* Left: Form */}
            <div className={`${hasPreview ? 'w-1/2 border-r border-[var(--surface-header)]' : 'w-full'} flex flex-col min-h-0`}>
              <div className="flex-1 overflow-y-auto p-5 space-y-4">

                {/* Firm selector (accountant only) */}
                {config.role === 'accountant' && config.firms && (
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Firm *</label>
                    <select value={newInv.firm_id} onChange={(e) => setNewInv({ ...newInv, firm_id: e.target.value })} className="input-recessed w-full">
                      <option value="">Select firm</option>
                      {config.firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Invoice file upload */}
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice Image{config.role === 'accountant' ? '(s)' : ''}</label>
                  {newInvFile ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200">
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-sm text-blue-700 truncate flex-1">{newInvFile.name}</span>
                      <button type="button" onClick={() => setNewInvFile(null)} className="text-xs text-blue-500 hover:text-blue-700">Remove</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        {...(config.role === 'accountant' ? { multiple: true } : {})}
                        onChange={handleInvFileChange}
                        className="input-recessed w-full text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:text-sm file:font-medium file:bg-[var(--surface-low)] file:text-[var(--text-secondary)] hover:file:bg-[var(--surface-header)]"
                      />
                      {config.role === 'accountant' && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1">Select multiple files to batch upload with auto OCR</p>
                      )}
                    </>
                  )}
                  {ocrScanning && (
                    <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'var(--primary)' }}>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scanning document... fields will auto-fill shortly
                    </div>
                  )}
                </div>

                {/* Error/warning messages — shown immediately after file upload */}
                {newInvError && <p className="text-sm text-[var(--reject-red)] bg-red-50 border border-red-200 px-3 py-2">{newInvError}</p>}
                {depositWarning && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2" dangerouslySetInnerHTML={{ __html: depositWarning }} />}

                {/* Document type selector — auto-suggested by OCR, user can override */}
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Document Type</label>
                  <div className="flex gap-1 mt-1">
                    {(['PI', 'SI', 'CN', 'DN', 'PV', 'OR'] as DocType[]).map((t) => {
                      const b = DOC_TYPE_BADGES[t];
                      const active = newInv.doc_type === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setNewInv({ ...newInv, doc_type: t })}
                          className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-100 btn-texture ${active ? 'type-toggle-on' : 'type-toggle-off'}`}
                          style={{
                            '--tt-bg': active ? b.bg : undefined,
                            '--tt-color': active ? b.color : undefined,
                          } as React.CSSProperties}
                          title={b.desc}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                    {['SI', 'DN', 'OR'].includes(newInv.doc_type) ? 'Customer / Buyer *' : 'Vendor Name *'}
                  </label>
                  <input
                    ref={vendorInputRef}
                    type="text"
                    value={newInv.vendor_name}
                    onChange={(e) => {
                      setNewInv({ ...newInv, vendor_name: e.target.value, supplier_id: '', supplier_link_status: 'unmatched' });
                    }}
                    className="input-recessed w-full"
                    placeholder="Vendor name from invoice"
                    autoComplete="off"
                  />
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier Account</label>
                    {newInv.supplier_id && (() => {
                      const cfg = LINK_CFG[newInv.supplier_link_status];
                      return cfg ? <span className={`text-label-sm ${cfg.cls}`} data-tooltip={cfg.tooltip}>{cfg.label}</span> : null;
                    })()}
                  </div>
                  <input
                    type="text"
                    value={newInv.supplier_id ? suppliers.find(s => s.id === newInv.supplier_id)?.name || '' : supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value);
                      setSupplierDropdownOpen(true);
                      if (newInv.supplier_id) {
                        setNewInv({ ...newInv, supplier_id: '', supplier_link_status: 'unmatched' });
                      }
                    }}
                    onFocus={() => setSupplierDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setSupplierDropdownOpen(false), 150)}
                    className="input-recessed w-full"
                    placeholder="Search existing supplier or leave empty for new"
                    autoComplete="off"
                  />
                  {newInv.supplier_id && (
                    <button
                      type="button"
                      onClick={() => { setNewInv({ ...newInv, supplier_id: '', supplier_link_status: 'unmatched' }); setSupplierSearch(''); }}
                      className="absolute right-3 top-[calc(50%+4px)] text-xs text-[var(--text-secondary)] hover:text-[var(--reject-red)]"
                    >
                      &times;
                    </button>
                  )}
                  {supplierDropdownOpen && !newInv.supplier_id && (() => {
                    const firmSuppliers = config.role === 'accountant' && newInv.firm_id ? suppliers.filter(s => s.firm_id === newInv.firm_id) : suppliers;
                    const q = supplierSearch.toLowerCase();
                    const filtered = q ? firmSuppliers.filter(s => s.name.toLowerCase().includes(q)) : firmSuppliers;
                    return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#E0E3E5] shadow-lg max-h-40 overflow-y-auto">
                        <div className="px-4 py-2 text-xs text-[var(--text-secondary)] bg-[var(--surface-low)] border-b border-[#E0E3E5]">
                          {filtered.length > 0 ? `${filtered.length} supplier${filtered.length > 1 ? 's' : ''}` : 'No match — a new supplier will be created'}
                        </div>
                        {filtered.slice(0, 10).map(s => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => {
                              setNewInv({ ...newInv, supplier_id: s.id, supplier_link_status: 'confirmed' });
                              setSupplierSearch('');
                              setSupplierDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-low)] transition-colors"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice Number</label>
                  <input type="text" value={newInv.invoice_number} onChange={(e) => setNewInv({ ...newInv, invoice_number: e.target.value })} className="input-recessed w-full" placeholder="Optional" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Issue Date *</label>
                    <input type="date" value={newInv.issue_date} onChange={(e) => setNewInv({ ...newInv, issue_date: e.target.value })} className="input-recessed w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Due Date</label>
                    <input type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} className="input-recessed w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Amount (RM) *</label>
                    <input type="number" step="0.01" value={newInv.total_amount} onChange={(e) => setNewInv({ ...newInv, total_amount: e.target.value })} className="input-recessed w-full tabular-nums" placeholder="0.00" />
                    {parseFloat(newInv.total_amount) < 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 mt-1">Credit Note -- negative amount will offset against this supplier</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Payment Terms</label>
                    <input type="text" value={newInv.payment_terms} onChange={(e) => setNewInv({ ...newInv, payment_terms: e.target.value })} className="input-recessed w-full" placeholder="e.g. Net 30" />
                  </div>
                </div>

                {/* GL Account Selection (accountant only) */}
                {config.showGlFields && newInvGlAccounts.length > 0 && (
                  <>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Expense GL (Debit)</label>
                      <GlAccountSelect
                        value={newInvExpenseGlId}
                        onChange={setNewInvExpenseGlId}
                        accounts={newInvGlAccounts}
                        firmId={newInv.firm_id}
                        placeholder="Select Expense GL"
                        preferredType="Expense"
                        defaultType="Expense"
                        onAccountCreated={(a) => setNewInvGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contra GL (Credit -- Trade Payables)</label>
                      <GlAccountSelect
                        value={newInvContraGlId}
                        onChange={setNewInvContraGlId}
                        accounts={newInvGlAccounts}
                        firmId={newInv.firm_id}
                        placeholder="Select Trade Payables GL"
                        preferredType="Liability"
                        defaultType="Liability"
                        defaultBalance="Credit"
                        suggestedName={newInv.vendor_name}
                        onAccountCreated={(a) => setNewInvGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                      />
                    </div>
                  </>
                )}

                {/* Category (admin shows it before notes, accountant doesn't need it in this position since it uses GL) */}
                {!config.showGlFields && (
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category *</label>
                    <select value={newInv.category_id} onChange={(e) => setNewInv({ ...newInv, category_id: e.target.value })} className="input-recessed w-full">
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes</label>
                  <textarea
                    value={newInv.notes}
                    onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })}
                    className="input-recessed w-full text-sm"
                    rows={2}
                    placeholder="Phone number, account details, service period, etc."
                  />
                </div>

                {/* PV Match Banner */}
                {pvMatch && (
                  <div className="border border-blue-300 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-800 mb-1">Payment voucher match found</p>
                    <p className="text-xs text-blue-700 mb-3">
                      This matches <strong>{pvMatch.invoice_number}</strong> — RM {Number(pvMatch.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2 })}, {pvMatch.vendor_name_raw} ({pvMatch.issue_date?.split('T')[0]}). Attach document to existing record instead of creating a new invoice?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={attachToPV}
                        disabled={pvAttaching}
                        className="btn-thick-navy px-4 py-1.5 text-xs font-semibold disabled:opacity-40"
                      >
                        {pvAttaching ? 'Attaching...' : 'Yes, attach to this PV'}
                      </button>
                      <button
                        onClick={dismissPvMatch}
                        className="btn-thick-white px-4 py-1.5 text-xs font-semibold"
                      >
                        No, create new invoice
                      </button>
                    </div>
                  </div>
                )}

              </div>

              {/* Footer */}
              <div className="flex gap-3 px-5 py-4 bg-[var(--surface-low)] flex-shrink-0">
                <div className="flex-1 relative group/submit">
                  <button
                    onClick={submitNewInvoice}
                    disabled={newInvSubmitting || ocrScanning || !!wrongDocType || !canSubmit}
                    className="btn-thick-navy w-full py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {ocrScanning ? 'Scanning...' : newInvSubmitting ? 'Submitting...' : 'Submit Invoice'}
                  </button>
                  {!canSubmit && !ocrScanning && !newInvSubmitting && (
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#191C1E] text-white text-[11px] px-3 py-2 whitespace-nowrap opacity-0 pointer-events-none group-hover/submit:opacity-100 transition-opacity z-30 shadow-lg" style={{ borderRadius: '2px' }}>
                      <span className="block font-bold text-[10px] uppercase tracking-wider text-white/50 mb-1">Required fields missing</span>
                      {missingFields.map(f => <span key={f} className="block">• {f}</span>)}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Right: Document Preview (only when file uploaded) */}
            {hasPreview && (() => {
              const url = URL.createObjectURL(newInvFile!);
              const isPdf = newInvFile!.type === 'application/pdf' || newInvFile!.name.toLowerCase().endsWith('.pdf');
              return (
                <div className="w-1/2 flex flex-col min-h-0 relative">
                  <div className="flex-1 overflow-y-auto bg-[var(--surface-low)]">
                    {isPdf ? (
                      <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-full min-h-[400px]" title="Invoice preview" />
                    ) : (
                      <div className="flex items-center justify-center h-full p-5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Invoice preview" className="max-w-full max-h-[80vh] object-contain" />
                      </div>
                    )}
                  </div>
                  {/* Error overlay — covers preview when wrong document type detected */}
                  {wrongDocType && (
                    <div className="absolute inset-0 bg-[#070E1B]/80 flex items-center justify-center z-10">
                      <div className="bg-white p-8 max-w-[320px] text-center space-y-4">
                        <div className="w-14 h-14 mx-auto rounded-full bg-red-50 flex items-center justify-center">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--reject-red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                        </div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{wrongDocType}</p>
                        <button onClick={onClose} className="btn-thick-red px-6 py-2 text-sm font-semibold w-full">Close</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
