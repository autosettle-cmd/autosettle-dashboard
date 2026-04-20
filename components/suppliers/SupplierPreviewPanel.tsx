'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Field from '@/components/forms/Field';
import { formatRM } from '@/lib/formatters';
import { PAYMENT_CFG } from '@/lib/badge-config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alias {
  id: string;
  alias: string;
  is_confirmed: boolean;
}

interface AllocationRow {
  id: string;
  amount: string;
  payment_date: string;
  reference: string | null;
  receipts?: { id: string; merchant: string; receipt_number: string | null }[];
}

interface ReceiptInfo {
  id: string;
  merchant: string;
  receipt_number: string | null;
  amount?: string;
  claim_date?: string;
  thumbnail_url?: string | null;
  file_url?: string | null;
}

interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  total_amount: string;
  amount_paid: string;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  status: string;
  category_name: string;
  supplier_link_status: string;
  vendor_name_raw?: string;
  file_url?: string | null;
  thumbnail_url?: string | null;
  confidence?: string;
  allocations?: AllocationRow[];
}

interface SalesInvoiceRow {
  id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  total_amount: string;
  amount_paid: string;
  payment_status: 'unpaid' | 'partially_paid' | 'paid';
  notes: string | null;
  allocations?: { id: string; amount: string; payment_date: string; reference: string | null }[];
}

interface Supplier {
  id: string;
  name: string;
  firm_name?: string;
  firm_id?: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  aliases: Alias[];
  invoice_count: number;
  sales_invoice_count: number;
  total_outstanding: string;
  overdue_amount: string;
  credit_balance: string;
  receivable_amount: string;
  expense_gl_label?: string | null;
  contra_gl_label?: string | null;
  default_gl_account_id?: string | null;
  default_contra_gl_account_id?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

function agingBucket(dueDate: string | null): string {
  if (!dueDate) return '-';
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Current';
  if (diffDays <= 30) return '1-30';
  if (diffDays <= 60) return '31-60';
  if (diffDays <= 90) return '61-90';
  return '90+';
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SupplierPreviewPanelProps {
  supplier: Supplier;
  expandedInvoices: InvoiceRow[];
  expandedSalesInvoices: SalesInvoiceRow[];
  orphanedPayments: { id: string; amount: string; payment_date: string; reference: string | null; receipts: { claim_id: string; merchant: string; receipt_number: string | null }[] }[];
  loadingInvoices: boolean;
  expandedDocId: string | null;
  showFirmColumn: boolean;
  showGlMapping: boolean;
  linkPrefix: string;
  apiPayments: string;
  onClose: () => void;
  onExpandDoc: (id: string | null) => void;
  onPreviewReceipt: (r: ReceiptInfo) => void;
  onOpenPayment: (s: Supplier) => void;
  onOpenEdit: (s: Supplier) => void;
  onRefreshInPlace: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SupplierPreviewPanel({
  supplier: s,
  expandedInvoices,
  expandedSalesInvoices,
  orphanedPayments,
  loadingInvoices,
  expandedDocId,
  showFirmColumn,
  showGlMapping,
  linkPrefix,
  apiPayments,
  onClose,
  onExpandDoc,
  onPreviewReceipt,
  onOpenPayment,
  onOpenEdit,
  onRefreshInPlace,
  onPrev,
  onNext,
}: SupplierPreviewPanelProps) {
  const payable = Number(s.total_outstanding);
  const receivable = Number(s.receivable_amount);
  const net = payable - receivable;

  const [pressedDir, setPressedDir] = useState<'left' | 'right' | null>(null);
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

  return (
    <>
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
      <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
        <div className="bg-white shadow-2xl w-full max-w-[1200px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
          <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">{s.name}</h2>
              {showFirmColumn && s.firm_name && <span className="text-white/60 text-label-sm">{s.firm_name}</span>}
            </div>
            <button onClick={onClose} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
          </div>

          <div className="flex-1 flex min-h-0">
            {/* Left panel */}
            <div className="w-[340px] flex-shrink-0 overflow-y-auto border-r border-[var(--surface-header)] p-5 space-y-4">
              <div className="space-y-2">
                {s.contact_email && <Field label="Email" value={s.contact_email} />}
                {s.contact_phone && <Field label="Phone" value={s.contact_phone} />}
                {s.notes && <Field label="Notes" value={s.notes} />}
              </div>

              {s.aliases.length > 0 && (
                <div>
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1.5">Aliases</p>
                  <div className="space-y-1">
                    {s.aliases.map((a) => (
                      <div key={a.id} className="flex items-center gap-1.5 text-body-sm text-[var(--text-secondary)] bg-[var(--surface-low)] px-2.5 py-1.5">
                        {a.alias}
                        {a.is_confirmed && <span className="badge-green text-label-sm">Confirmed</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* GL labels (accountant only) */}
              {showGlMapping && (s.expense_gl_label || s.contra_gl_label) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">GL Mapping</p>
                  {s.expense_gl_label && (
                    <div className="text-body-sm text-[var(--text-secondary)] bg-[var(--surface-low)] px-2.5 py-1.5">
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">DR:</span> {s.expense_gl_label}
                    </div>
                  )}
                  {s.contra_gl_label && (
                    <div className="text-body-sm text-[var(--text-secondary)] bg-[var(--surface-low)] px-2.5 py-1.5">
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">CR:</span> {s.contra_gl_label}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {payable > 0 && (
                  <div className="bg-red-50/60 p-2.5 card-popped">
                    <p className="text-[10px] font-label font-bold text-red-400 uppercase tracking-widest leading-none">Payable</p>
                    <p className="text-sm font-bold text-[var(--reject-red)] tabular-nums mt-1">{formatRM(payable)}</p>
                  </div>
                )}
                {receivable > 0 && (
                  <div className="bg-green-50/60 p-2.5 card-popped">
                    <p className="text-[10px] font-label font-bold text-green-400 uppercase tracking-widest leading-none">Receivable</p>
                    <p className="text-sm font-bold text-[var(--match-green)] tabular-nums mt-1">{formatRM(receivable)}</p>
                  </div>
                )}
                <div className={`p-2.5 card-popped ${net > 0 ? 'bg-red-50/60' : net < 0 ? 'bg-green-50/60' : 'bg-white'}`}>
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest leading-none">Net</p>
                  <p className={`text-sm font-bold tabular-nums mt-1 ${net > 0 ? 'text-[var(--reject-red)]' : net < 0 ? 'text-[var(--match-green)]' : 'text-[var(--text-primary)]'}`}>
                    {formatRM(Math.abs(net))}{net > 0 ? ' owed' : net < 0 ? ' due' : ''}
                  </p>
                </div>
                {Number(s.credit_balance) > 0 && (
                  <div className="bg-amber-50/60 p-2.5 card-popped">
                    <p className="text-[10px] font-label font-bold text-amber-500 uppercase tracking-widest leading-none">Credit</p>
                    <p className="text-sm font-bold text-amber-600 tabular-nums mt-1">{formatRM(s.credit_balance)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right panel — invoices */}
            <div className="flex-1 overflow-y-auto">
              {loadingInvoices ? (
                <div className="flex items-center justify-center h-full text-sm text-[var(--text-secondary)]">Loading...</div>
              ) : (
                <>
                  {expandedInvoices.length > 0 && (
                    <div className="bg-red-50/40">
                      <p className="px-5 pt-3 pb-1 text-[10px] font-label font-bold text-[var(--reject-red)] uppercase tracking-widest">Purchase Invoices — Payable</p>
                      <table className="w-full">
                        <thead>
                          <tr className="text-left">
                            <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Issue Date</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Invoice #</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Due Date</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Category</th>
                            <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Amount</th>
                            <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Paid</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Payment</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Aging</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expandedInvoices.map((inv, idx) => {
                            const pmtCfg = PAYMENT_CFG[inv.payment_status];
                            const isDocExpanded = expandedDocId === inv.id;
                            const driveMatch = inv.file_url?.match(/\/d\/([^/]+)/);
                            const fileId = driveMatch?.[1];
                            return (
                              <React.Fragment key={inv.id}>
                                <tr
                                  className={`text-body-sm hover:bg-white/60 transition-colors cursor-pointer ${isDocExpanded ? 'bg-blue-50/60' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : ''}`}
                                  onClick={() => onExpandDoc(isDocExpanded ? null : inv.id)}
                                >
                                  <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{formatDate(inv.issue_date)}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)] font-medium">{inv.invoice_number ?? '-'}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)]">{inv.category_name}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-primary)] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(inv.amount_paid)}</td>
                                  <td className="px-3 py-2.5">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                                  <td className="px-3 py-2.5">
                                    {inv.payment_status !== 'paid' && (
                                      <span className={`text-label-sm font-medium ${
                                        agingBucket(inv.due_date) === 'Current' ? 'text-[var(--match-green)]' :
                                        agingBucket(inv.due_date) === '90+' ? 'text-[var(--reject-red)]' :
                                        'text-amber-600'
                                      }`}>
                                        {agingBucket(inv.due_date)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                {isDocExpanded && (
                                  <tr>
                                    <td colSpan={8} className="p-0">
                                      {fileId ? (
                                        <iframe src={`https://drive.google.com/file/d/${fileId}/preview`} className="w-full h-[350px] border border-t-0 border-[#E0E3E5]" title="Invoice Preview" allow="autoplay" />
                                      ) : (
                                        <div className="px-5 py-3 bg-[var(--surface-low)] border-t border-[var(--surface-header)]">
                                          <dl className="grid grid-cols-4 gap-3 text-body-sm">
                                            <Field label="Vendor" value={inv.vendor_name_raw} />
                                            <Field label="Invoice No." value={inv.invoice_number} />
                                            <Field label="Total" value={formatRM(inv.total_amount)} />
                                            <Field label="Paid" value={formatRM(inv.amount_paid)} />
                                          </dl>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                                {inv.allocations && inv.allocations.length > 0 && inv.allocations.map((alloc) => (
                                  <tr key={alloc.id} className="text-label-sm bg-[var(--surface-low)]">
                                    <td className="px-4 py-1.5 pl-8 text-[var(--text-secondary)]" colSpan={3}>
                                      <span>Payment: {formatDate(alloc.payment_date)}{alloc.reference ? ` · ${alloc.reference}` : ''}</span>
                                      {alloc.receipts && alloc.receipts.length > 0 && (
                                        <span className="ml-2">
                                          {alloc.receipts.map((r) => (
                                            <button
                                              key={r.id}
                                              onClick={(e) => { e.stopPropagation(); onPreviewReceipt(r); }}
                                              className="inline-flex items-center gap-0.5 text-[var(--primary)] hover:underline"
                                            >
                                              Receipt: {r.receipt_number || r.merchant}
                                            </button>
                                          ))}
                                        </span>
                                      )}
                                    </td>
                                    <td colSpan={3} className="px-3 py-1.5 text-right text-[var(--text-secondary)] tabular-nums">
                                      {formatRM(alloc.amount)}
                                    </td>
                                    <td colSpan={2} className="px-3 py-1.5">
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!confirm('Remove this payment allocation?')) return;
                                          try {
                                            const res = await fetch(`${apiPayments}/allocations/${alloc.id}`, { method: 'DELETE' });
                                            if (res.ok) onRefreshInPlace();
                                          } catch (err) { console.error(err); }
                                        }}
                                        className="text-[var(--reject-red)] hover:opacity-80 font-medium"
                                      >
                                        Remove
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {expandedSalesInvoices.length > 0 && (
                    <div className="bg-green-50/40 border-t border-[var(--surface-header)]">
                      <p className="px-5 pt-3 pb-1 text-[10px] font-label font-bold text-[var(--match-green)] uppercase tracking-widest">Sales Invoices — Receivable</p>
                      <table className="w-full">
                        <thead>
                          <tr className="text-left">
                            <th className="px-4 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Issue Date</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Invoice #</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Due Date</th>
                            <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Amount</th>
                            <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Paid</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Payment</th>
                            <th className="px-3 py-2 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Aging</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expandedSalesInvoices.map((sinv, idx) => {
                            const pmtCfg = PAYMENT_CFG[sinv.payment_status];
                            const isSiExpanded = expandedDocId === `si-${sinv.id}`;
                            return (
                              <React.Fragment key={sinv.id}>
                                <tr
                                  className={`text-body-sm hover:bg-white/60 transition-colors cursor-pointer ${isSiExpanded ? 'bg-blue-50/60' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : ''}`}
                                  onClick={() => onExpandDoc(isSiExpanded ? null : `si-${sinv.id}`)}
                                >
                                  <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{formatDate(sinv.issue_date)}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)] font-medium">{sinv.invoice_number}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)] tabular-nums">{sinv.due_date ? formatDate(sinv.due_date) : '-'}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-primary)] font-semibold text-right tabular-nums">{formatRM(sinv.total_amount)}</td>
                                  <td className="px-3 py-2.5 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(sinv.amount_paid)}</td>
                                  <td className="px-3 py-2.5">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                                  <td className="px-3 py-2.5">
                                    {sinv.payment_status !== 'paid' && (
                                      <span className={`text-label-sm font-medium ${
                                        agingBucket(sinv.due_date) === 'Current' ? 'text-[var(--match-green)]' :
                                        agingBucket(sinv.due_date) === '90+' ? 'text-[var(--reject-red)]' :
                                        'text-amber-600'
                                      }`}>
                                        {agingBucket(sinv.due_date)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                                {isSiExpanded && (
                                  <tr>
                                    <td colSpan={7} className="p-0">
                                      <div className="px-5 py-3 bg-[var(--surface-low)] border-t border-[var(--surface-header)]">
                                        <dl className="grid grid-cols-3 gap-3 text-body-sm">
                                          <Field label="Invoice No." value={sinv.invoice_number} />
                                          <Field label="Total" value={formatRM(sinv.total_amount)} />
                                          <Field label="Paid" value={formatRM(sinv.amount_paid)} />
                                        </dl>
                                        {sinv.notes && <p className="text-body-sm text-[var(--text-secondary)] mt-2">{sinv.notes}</p>}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {sinv.allocations && sinv.allocations.length > 0 && sinv.allocations.map((alloc) => (
                                  <tr key={alloc.id} className="text-label-sm bg-[var(--surface-low)]">
                                    <td className="px-4 py-1.5 pl-8 text-[var(--text-secondary)]" colSpan={2}>
                                      <span>Payment: {formatDate(alloc.payment_date)}{alloc.reference ? ` · ${alloc.reference}` : ''}</span>
                                    </td>
                                    <td colSpan={3} className="px-3 py-1.5 text-right text-[var(--text-secondary)] tabular-nums">
                                      {formatRM(alloc.amount)}
                                    </td>
                                    <td colSpan={2} />
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {expandedInvoices.length === 0 && expandedSalesInvoices.length === 0 && (
                    <div className="flex items-center justify-center h-full text-sm text-[var(--text-secondary)] py-12">No invoices for this supplier</div>
                  )}

                  {orphanedPayments.length > 0 && (
                    <div className="px-5 py-3 border-t border-[var(--surface-header)]">
                      <p className="text-[10px] font-label font-bold text-amber-700 uppercase tracking-widest mb-2">Unallocated Credit</p>
                      {orphanedPayments.map((op) => (
                        <div key={op.id} className="flex items-center justify-between py-1.5 text-body-sm">
                          <div className="text-[var(--text-secondary)]">
                            <span className="tabular-nums">{formatDate(op.payment_date)}</span>
                            {op.reference && <span className="ml-2">{op.reference}</span>}
                            {op.receipts.length > 0 && (
                              <span className="ml-2">
                                (Receipt: {op.receipts.map(r => r.receipt_number || r.merchant).join(', ')})
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-amber-600 tabular-nums">{formatRM(op.amount)}</span>
                            <button
                              onClick={async () => {
                                if (!confirm('Delete this payment and unlink its receipts?')) return;
                                try {
                                  const res = await fetch(`${apiPayments}/${op.id}`, { method: 'DELETE' });
                                  if (res.ok) onRefreshInPlace();
                                } catch (err) { console.error(err); }
                              }}
                              className="text-[var(--reject-red)] hover:opacity-80 font-medium text-label-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 p-4 bg-[var(--surface-low)] flex gap-2 justify-end">
            <button
              onClick={() => { onClose(); onOpenPayment(s); }}
              className="btn-thick-green text-label-sm px-4 py-2 font-medium"
            >
              Pay
            </button>
            <Link
              href={`${linkPrefix}/suppliers/${s.id}/statement`}
              target="_blank"
              className="btn-thick-white text-label-sm px-4 py-2 font-medium"
            >
              Statement
            </Link>
            <button
              onClick={() => { onClose(); onOpenEdit(s); }}
              className="btn-thick-navy text-label-sm px-4 py-2 font-medium"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
