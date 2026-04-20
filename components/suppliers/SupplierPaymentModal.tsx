'use client';

import React from 'react';
import ReceiptSelector from '@/components/ReceiptSelector';
import { formatRM } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptInfo {
  id: string;
  merchant: string;
  receipt_number: string | null;
  amount?: string;
  claim_date?: string;
  thumbnail_url?: string | null;
  file_url?: string | null;
}

interface PaymentInvoice {
  id: string;
  invoice_number: string | null;
  total_amount: string;
  amount_paid: string;
  balance: number;
  allocation: string;
}

interface Supplier {
  id: string;
  name: string;
  firm_id?: string;
  credit_balance: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SupplierPaymentModalProps {
  supplier: Supplier;
  paymentAmount: string;
  paymentDate: string;
  paymentRef: string;
  paymentNotes: string;
  paymentInvoices: PaymentInvoice[];
  paymentSaving: boolean;
  loadingPaymentInvoices: boolean;
  selectedReceiptIds: string[];
  firmId?: string;
  apiReceipts: string;
  apiPayments: string;
  onClose: () => void;
  onPaymentAmountChange: (val: string) => void;
  onPaymentDateChange: (val: string) => void;
  onPaymentRefChange: (val: string) => void;
  onPaymentNotesChange: (val: string) => void;
  onPaymentInvoicesChange: (invoices: PaymentInvoice[]) => void;
  onSelectionChange: (ids: string[], total: number) => void;
  onAutoAllocate: () => void;
  onAutoAllocateWith: (amt: number) => void;
  onSubmitPayment: () => void;
  onPreviewReceipt: (r: ReceiptInfo) => void;
  onRefreshInPlace: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplierPaymentModal({
  supplier,
  paymentAmount,
  paymentDate,
  paymentRef,
  paymentNotes,
  paymentInvoices,
  paymentSaving,
  loadingPaymentInvoices,
  selectedReceiptIds,
  firmId,
  apiReceipts,
  apiPayments,
  onClose,
  onPaymentAmountChange,
  onPaymentDateChange,
  onPaymentRefChange,
  onPaymentNotesChange,
  onPaymentInvoicesChange,
  onSelectionChange,
  onAutoAllocate,
  onAutoAllocateWith,
  onSubmitPayment,
  onPreviewReceipt,
  onRefreshInPlace,
}: SupplierPaymentModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b bg-[var(--primary)]">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">Record Payment</h2>
          <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Supplier</label>
            <p className="text-sm font-semibold text-[var(--text-primary)]">{supplier.name}</p>
          </div>

          {Number(supplier.credit_balance) > 0 && (
            <div className="bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-label font-bold text-[var(--match-green)] uppercase tracking-widest">Available Credit</p>
                <p className="text-lg font-bold text-[var(--match-green)] tabular-nums">{formatRM(supplier.credit_balance)}</p>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${apiPayments}/apply-credit`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ supplier_id: supplier.id }),
                    });
                    if (res.ok) { onClose(); onRefreshInPlace(); }
                  } catch (e) { console.error(e); }
                }}
                className="btn-thick-green text-label-sm px-3 py-1.5 font-semibold"
              >
                Apply Credit
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Payment Amount (RM)</label>
              <input type="number" step="0.01" value={paymentAmount} onChange={(e) => onPaymentAmountChange(e.target.value)} className="input-recessed w-full" placeholder="0.00" />
            </div>
            <div>
              <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Payment Date</label>
              <input type="date" value={paymentDate} onChange={(e) => onPaymentDateChange(e.target.value)} className="input-recessed w-full" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Reference (optional)</label>
            <input type="text" value={paymentRef} onChange={(e) => onPaymentRefChange(e.target.value)} className="input-recessed w-full" placeholder="e.g. cheque number, transfer ref" />
          </div>

          <div>
            <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Notes (optional)</label>
            <textarea value={paymentNotes} onChange={(e) => onPaymentNotesChange(e.target.value)} className="input-recessed w-full" rows={2} placeholder="Optional notes" />
          </div>

          <ReceiptSelector
            {...(firmId ? { firmId: supplier.firm_id } : {})}
            apiBasePath={apiReceipts}
            invoiceBalances={paymentInvoices.map(inv => inv.balance)}
            selectedIds={selectedReceiptIds}
            onSelectionChange={(ids, total) => {
              onSelectionChange(ids, total);
              const amt = total > 0 ? total.toFixed(2) : '';
              onPaymentAmountChange(amt);
              if (total > 0) onAutoAllocateWith(total);
              else onPaymentInvoicesChange(paymentInvoices.map(inv => ({ ...inv, allocation: '' })));
            }}
            onPreview={(r) => onPreviewReceipt(r)}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Allocate to Invoices</h3>
              <button
                onClick={onAutoAllocate}
                disabled={!paymentAmount || Number(paymentAmount) <= 0}
                className="btn-thick-navy text-label-sm px-2.5 py-1 font-medium disabled:opacity-40"
              >
                Auto-allocate
              </button>
            </div>

            {loadingPaymentInvoices ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-4">Loading invoices...</div>
            ) : paymentInvoices.length === 0 ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-4">No unpaid invoices</div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Invoice #</th>
                      <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Total</th>
                      <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                      <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentInvoices.map((inv, i) => (
                      <tr key={inv.id} className={`text-body-sm ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                        <td className="px-3 py-2 text-[var(--text-secondary)] font-medium">{inv.invoice_number ?? '-'}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-secondary)] tabular-nums">{formatRM(inv.total_amount)}</td>
                        <td className="px-3 py-2 text-right text-[var(--text-primary)] font-semibold tabular-nums">{formatRM(inv.balance)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={inv.allocation}
                            onChange={(e) => {
                              const updated = [...paymentInvoices];
                              updated[i] = { ...inv, allocation: e.target.value };
                              onPaymentInvoicesChange(updated);
                            }}
                            className="input-recessed w-[100px] text-right text-body-sm py-1"
                            placeholder="0.00"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between px-3 py-2 bg-[var(--surface-low)] text-body-sm">
                  <span className="text-[var(--text-secondary)] font-medium">Total allocated</span>
                  <span className={`font-bold tabular-nums ${
                    paymentInvoices.reduce((sum, inv) => sum + Number(inv.allocation || 0), 0) > Number(paymentAmount || 0)
                      ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'
                  }`}>
                    {formatRM(paymentInvoices.reduce((sum, inv) => sum + Number(inv.allocation || 0), 0))}
                    {' / '}
                    {formatRM(Number(paymentAmount || 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 flex-shrink-0 bg-[var(--surface-low)] flex gap-3">
          <button
            onClick={onSubmitPayment}
            disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0}
            className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {paymentSaving ? 'Saving...' : 'Save Payment'}
          </button>
          <button onClick={onClose} className="btn-thick-white flex-1 py-2 text-sm font-semibold">
            Cancel
          </button>
        </div>
      </div>
      </div>
    </>
  );
}
