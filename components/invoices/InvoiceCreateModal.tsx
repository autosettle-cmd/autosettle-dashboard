'use client';

import GlAccountSelect from '@/components/GlAccountSelect';
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

interface NewInvState {
  firm_id: string;
  vendor_name: string;
  supplier_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount: string;
  category_id: string;
  payment_terms: string;
  notes: string;
}

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
  vendorDropdownOpen,
  setVendorDropdownOpen,
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
}: InvoiceCreateModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white shadow-2xl w-full max-w-[800px] max-h-[90vh] overflow-y-scroll" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: 'var(--primary)' }}>
            <h2 className="text-white font-bold text-sm uppercase tracking-widest">Submit New Invoice</h2>
            <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
          </div>

          <div className="p-5 space-y-4">

            {/* Document preview */}
            {newInvFile && (() => {
              const url = URL.createObjectURL(newInvFile);
              const isPdf = newInvFile.type === 'application/pdf' || newInvFile.name.toLowerCase().endsWith('.pdf');
              return (
                <div className="border border-[#E0E3E5] overflow-hidden bg-[var(--surface-low)]">
                  {isPdf ? (
                    <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-[300px]" title="Invoice preview" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="Invoice preview" className="w-full max-h-[300px] object-contain" />
                  )}
                </div>
              );
            })()}

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

            <div className="relative">
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Vendor Name *</label>
              <input
                ref={vendorInputRef}
                type="text"
                value={newInv.vendor_name}
                onChange={(e) => {
                  setNewInv({ ...newInv, vendor_name: e.target.value, supplier_id: '' });
                  setVendorDropdownOpen(true);
                }}
                onFocus={() => setVendorDropdownOpen(true)}
                onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 150)}
                className="input-recessed w-full"
                placeholder="Type or select existing supplier"
                autoComplete="off"
              />
              {newInv.supplier_id && (
                <span className="absolute right-3 top-[calc(50%+4px)] badge-green text-label-sm">Linked</span>
              )}
              {vendorDropdownOpen && newInv.vendor_name.length >= 1 && (() => {
                const q = newInv.vendor_name.toLowerCase();
                const firmSuppliers = config.role === 'accountant' && newInv.firm_id ? suppliers.filter((s) => s.firm_id === newInv.firm_id) : suppliers;
                const filtered = firmSuppliers.filter((s) => s.name.toLowerCase().includes(q));
                if (filtered.length === 0) return (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#E0E3E5] shadow-lg p-3">
                    <p className="text-xs text-[var(--text-secondary)]">No matching suppliers -- a new one will be created</p>
                  </div>
                );
                return (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#E0E3E5] shadow-lg max-h-40 overflow-y-auto">
                    {filtered.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewInv({ ...newInv, vendor_name: s.name, supplier_id: s.id });
                          setVendorDropdownOpen(false);
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

          </div>

          {depositWarning && <div className="px-5 pt-3"><p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">{depositWarning}</p></div>}
          {newInvError && <div className="px-5 pt-3"><p className="text-sm text-[var(--reject-red)] bg-red-50 border border-red-200 px-3 py-2">{newInvError}</p></div>}
          <div className="flex gap-3 px-5 py-4 bg-[var(--surface-low)]">
            <button
              onClick={submitNewInvoice}
              disabled={newInvSubmitting || ocrScanning}
              className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ocrScanning ? 'Scanning...' : newInvSubmitting ? 'Submitting...' : 'Submit Invoice'}
            </button>
            <button
              onClick={onClose}
              className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
