'use client';

import React from 'react';
import Field from '@/components/forms/Field';
import { formatRM } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alias {
  id: string;
  alias: string;
  is_confirmed: boolean;
}

interface Supplier {
  id: string;
  name: string;
  firm_name?: string;
  invoice_count: number;
  total_outstanding: string;
  overdue_amount: string;
  aliases: Alias[];
}

interface GlAccount {
  id: string;
  account_code: string;
  name: string;
  account_type: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SupplierEditModalProps {
  supplier: Supplier;
  editName: string;
  editEmail: string;
  editPhone: string;
  editNotes: string;
  editSaving: boolean;
  newAlias: string;
  showFirmColumn: boolean;
  showGlMapping: boolean;
  editExpenseGlId: string;
  editContraGlId: string;
  editGlAccounts: GlAccount[];
  onClose: () => void;
  onNameChange: (val: string) => void;
  onEmailChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onNewAliasChange: (val: string) => void;
  onExpenseGlIdChange: (val: string) => void;
  onContraGlIdChange: (val: string) => void;
  onAddAlias: () => void;
  onRemoveAlias: (aliasId: string) => void;
  onSave: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplierEditModal({
  supplier,
  editName,
  editEmail,
  editPhone,
  editNotes,
  editSaving,
  newAlias,
  showFirmColumn,
  showGlMapping,
  editExpenseGlId,
  editContraGlId,
  editGlAccounts,
  onClose,
  onNameChange,
  onEmailChange,
  onPhoneChange,
  onNotesChange,
  onNewAliasChange,
  onExpenseGlIdChange,
  onContraGlIdChange,
  onAddAlias,
  onRemoveAlias,
  onSave,
}: SupplierEditModalProps) {
  return (
    <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-5 border-b bg-[var(--primary)]">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">Edit Supplier</h2>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Supplier Name</label>
              <input type="text" value={editName} onChange={(e) => onNameChange(e.target.value)} className="input-recessed w-full" />
            </div>
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Email</label>
              <input type="email" value={editEmail} onChange={(e) => onEmailChange(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
            </div>
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Phone</label>
              <input type="text" value={editPhone} onChange={(e) => onPhoneChange(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
            </div>
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Notes</label>
              <textarea value={editNotes} onChange={(e) => onNotesChange(e.target.value)} className="input-recessed w-full" rows={3} placeholder="Optional" />
            </div>
          </div>

          <div>
            <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Vendor Name Aliases</h3>
            <div className="space-y-1.5">
              {supplier.aliases.map((a) => (
                <div key={a.id} className="flex items-center justify-between bg-[var(--surface-low)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">{a.alias}</span>
                    {a.is_confirmed && <span className="badge-green text-label-sm">Confirmed</span>}
                  </div>
                  <button onClick={() => onRemoveAlias(a.id)} className="text-[var(--text-secondary)] hover:text-[var(--reject-red)] text-xs transition-colors">Remove</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newAlias}
                onChange={(e) => onNewAliasChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onAddAlias(); }}
                className="input-recessed flex-1"
                placeholder="Add alias..."
              />
              <button onClick={onAddAlias} className="btn-thick-navy px-3 py-1.5 text-xs font-medium">
                Add
              </button>
            </div>
          </div>

          {/* GL Account Mapping (accountant only) */}
          {showGlMapping && editGlAccounts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">GL Account Mapping</h3>
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Expense GL (Debit)</label>
                <select value={editExpenseGlId} onChange={(e) => onExpenseGlIdChange(e.target.value)} className="input-recessed w-full text-sm">
                  <option value="">Not assigned</option>
                  {editGlAccounts.filter(a => ['Expense', 'CostOfSales'].includes(a.account_type)).map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Contra GL (Credit — Supplier Account)</label>
                <select value={editContraGlId} onChange={(e) => onContraGlIdChange(e.target.value)} className="input-recessed w-full text-sm">
                  <option value="">Not assigned</option>
                  {editGlAccounts.filter(a => a.account_type === 'Liability').map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="bg-[var(--surface-low)] p-3 space-y-2">
            {showFirmColumn && supplier.firm_name && <Field label="Firm" value={supplier.firm_name} />}
            <Field label="Invoices" value={String(supplier.invoice_count)} />
            <Field label="Outstanding" value={formatRM(supplier.total_outstanding)} />
            {Number(supplier.overdue_amount) > 0 && (
              <Field label="Overdue" value={formatRM(supplier.overdue_amount)} />
            )}
          </div>
        </div>

        <div className="p-4 flex-shrink-0 bg-[var(--surface-low)] flex gap-3">
          <button onClick={onSave} disabled={editSaving} className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
            {editSaving ? 'Saving...' : 'Save Changes'}
          </button>
          <button onClick={onClose} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
