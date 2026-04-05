'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'] });

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

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  aliases: Alias[];
  invoice_count: number;
  total_outstanding: string;
  overdue_amount: string;
  credit_balance: string;
}

interface AgingSupplier {
  supplier_id: string;
  supplier_name: string;
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
  invoices: {
    id: string;
    invoice_number: string | null;
    issue_date: string;
    due_date: string | null;
    balance: string;
    payment_status: string;
    category_name: string;
    bucket: string;
  }[];
}

interface AgingSummary {
  days0_30: number;
  days31_60: number;
  days61_90: number;
  days90plus: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray'   },
  partially_paid: { label: 'Partial', cls: 'badge-amber'  },
  paid:           { label: 'Paid',    cls: 'badge-purple' },
};

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear(),
  ].join('/');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatRMStr(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AgingCell({ value, warn }: { value: number; warn?: boolean }) {
  if (value === 0) return <td className="px-3 py-2.5 text-right text-gray-300 tabular-nums text-[12px]">-</td>;
  return (
    <td className={`px-3 py-2.5 text-right tabular-nums text-[12px] font-semibold ${warn && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
      {formatRM(value)}
    </td>
  );
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


// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminSuppliersPage() {

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');

  // Aging report
  const [agingData, setAgingData] = useState<AgingSupplier[]>([]);
  const [agingSummary, setAgingSummary] = useState<AgingSummary | null>(null);
  const [agingExpanded, setAgingExpanded] = useState<string | null>(null);
  const [showAging, setShowAging] = useState(false);

  // Expanded supplier — shows invoices drill-down
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedInvoices, setExpandedInvoices] = useState<InvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Preview panels
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptInfo | null>(null);

  // Edit side panel
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [newAlias, setNewAlias] = useState('');

  // Payment side panel
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentInvoices, setPaymentInvoices] = useState<{ id: string; invoice_number: string | null; total_amount: string; amount_paid: string; balance: number; allocation: string }[]>([]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [loadingPaymentInvoices, setLoadingPaymentInvoices] = useState(false);
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([]);
  const [availableReceipts, setAvailableReceipts] = useState<{ id: string; receipt_number: string | null; merchant: string; amount: string; thumbnail_url: string | null }[]>([]);

  const refresh = () => setRefreshKey((k) => k + 1);

  // Load suppliers
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('search', search);

    fetch(`/api/admin/suppliers?${p}`)
      .then((r) => r.json())
      .then((j) => { setSuppliers(j.data ?? []); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, [search, refreshKey]);

  // Load aging report
  useEffect(() => {
    fetch('/api/admin/invoices/aging')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setAgingData(j.data.suppliers);
          setAgingSummary(j.data.summary);
        }
      })
      .catch(console.error);
  }, [refreshKey]);

  // Load invoices when expanding a supplier
  const toggleExpand = async (supplierId: string) => {
    if (expandedId === supplierId) {
      setExpandedId(null);
      setExpandedInvoices([]);
      return;
    }
    setExpandedId(supplierId);
    setLoadingInvoices(true);
    try {
      const res = await fetch(`/api/admin/suppliers/${supplierId}`);
      const j = await res.json();
      setExpandedInvoices(j.data?.invoices ?? []);
    } catch (e) { console.error(e); }
    finally { setLoadingInvoices(false); }
  };

  // Open edit panel
  const openEdit = (s: Supplier) => {
    setEditSupplier(s);
    setEditName(s.name);
    setEditEmail(s.contact_email ?? '');
    setEditPhone(s.contact_phone ?? '');
    setEditNotes(s.notes ?? '');
    setNewAlias('');
  };

  const saveSupplier = async () => {
    if (!editSupplier) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/suppliers/${editSupplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          contact_email: editEmail.trim(),
          contact_phone: editPhone.trim(),
          notes: editNotes.trim(),
        }),
      });
      if (res.ok) { setEditSupplier(null); refresh(); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const addAlias = async () => {
    if (!editSupplier || !newAlias.trim()) return;
    try {
      await fetch(`/api/admin/suppliers/${editSupplier.id}/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: newAlias.trim() }),
      });
      setNewAlias('');
      // Refresh the edit panel data
      const res = await fetch(`/api/admin/suppliers/${editSupplier.id}`);
      const j = await res.json();
      if (j.data) setEditSupplier({ ...editSupplier, aliases: j.data.aliases });
      refresh();
    } catch (e) { console.error(e); }
  };

  // Open payment panel
  const openPayment = async (s: Supplier) => {
    setPaymentSupplier(s);
    setPaymentAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentRef('');
    setPaymentNotes('');
    setPaymentInvoices([]);
    setSelectedReceiptIds([]);
    setAvailableReceipts([]);
    setLoadingPaymentInvoices(true);
    try {
      const [invRes, rcptRes] = await Promise.all([
        fetch(`/api/admin/suppliers/${s.id}`),
        fetch('/api/admin/receipts/unlinked'),
      ]);
      const invJson = await invRes.json();
      const invoices = (invJson.data?.invoices ?? [])
        .filter((inv: InvoiceRow) => inv.payment_status !== 'paid')
        .map((inv: InvoiceRow) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          total_amount: inv.total_amount,
          amount_paid: inv.amount_paid,
          balance: Number(inv.total_amount) - Number(inv.amount_paid),
          allocation: '',
        }));
      setPaymentInvoices(invoices);
      const rcptJson = await rcptRes.json();
      if (rcptJson.data) setAvailableReceipts(rcptJson.data);
    } catch (e) { console.error(e); }
    finally { setLoadingPaymentInvoices(false); }
  };

  const autoAllocateWith = (amt: number) => {
    let remaining = amt;
    const updated = paymentInvoices.map((inv) => {
      if (remaining <= 0) return { ...inv, allocation: '' };
      const alloc = Math.min(remaining, inv.balance);
      remaining -= alloc;
      return { ...inv, allocation: alloc.toFixed(2) };
    });
    setPaymentInvoices(updated);
  };

  const autoAllocate = () => autoAllocateWith(Number(paymentAmount));

  const toggleReceipt = (id: string) => {
    const next = selectedReceiptIds.includes(id)
      ? selectedReceiptIds.filter((r) => r !== id)
      : [...selectedReceiptIds, id];
    setSelectedReceiptIds(next);
    const total = next.reduce((sum, rid) => {
      const r = availableReceipts.find((x) => x.id === rid);
      return sum + (r ? Number(r.amount) : 0);
    }, 0);
    const amt = total > 0 ? total.toFixed(2) : '';
    setPaymentAmount(amt);
    if (total > 0) autoAllocateWith(total);
    else setPaymentInvoices((prev) => prev.map((inv) => ({ ...inv, allocation: '' })));
  };

  const submitPayment = async () => {
    if (!paymentSupplier || !paymentAmount) return;
    setPaymentSaving(true);
    try {
      const allocations = paymentInvoices
        .filter((inv) => Number(inv.allocation) > 0)
        .map((inv) => ({ invoice_id: inv.id, amount: Number(inv.allocation) }));
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: paymentSupplier.id,
          amount: Number(paymentAmount),
          payment_date: paymentDate,
          reference: paymentRef.trim(),
          notes: paymentNotes.trim(),
          allocations,
          ...(selectedReceiptIds.length ? { claim_ids: selectedReceiptIds } : {}),
        }),
      });
      if (res.ok) { setPaymentSupplier(null); refresh(); }
    } catch (e) { console.error(e); }
    finally { setPaymentSaving(false); }
  };

  const removeAlias = async (aliasId: string) => {
    if (!editSupplier) return;
    try {
      await fetch(`/api/admin/suppliers/${editSupplier.id}/aliases`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliasId }),
      });
      setEditSupplier({ ...editSupplier, aliases: editSupplier.aliases.filter((a) => a.id !== aliasId) });
      refresh();
    } catch (e) { console.error(e); }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex h-screen overflow-hidden bg-[#F5F6F8] ${jakarta.className}`}>

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="admin" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">Suppliers</h1>
        </header>

        {/* ── Static top section (aging cards + search) ── */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 bg-[#F5F6F8] border-b border-gray-100">
          {/* ── Aging Report ─────────────────────────────── */}
          {agingSummary && (
            <div className="mb-3">
              {/* Summary cards */}
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[13px] font-semibold text-gray-900">Aging Report — Accounts Payable</h2>
                <button
                  onClick={() => setShowAging(!showAging)}
                  className="text-[11px] px-3 py-1.5 rounded-xl font-medium text-white btn-blue transition-all duration-200"
                >
                  {showAging ? 'Collapse' : 'Expand'}
                </button>
              </div>

              {/* Bucket summary cards */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: '0-30 Days', value: agingSummary.days0_30, color: agingSummary.days0_30 > 0 ? 'text-amber-600' : 'text-gray-900' },
                  { label: '31-60 Days', value: agingSummary.days31_60, color: agingSummary.days31_60 > 0 ? 'text-amber-600' : 'text-gray-900' },
                  { label: '61-90 Days', value: agingSummary.days61_90, color: agingSummary.days61_90 > 0 ? 'text-red-500' : 'text-gray-900' },
                  { label: '90+ Days', value: agingSummary.days90plus, color: agingSummary.days90plus > 0 ? 'text-red-600' : 'text-gray-900' },
                  { label: 'Total Payable', value: agingSummary.total, color: 'text-gray-900' },
                ].map((b) => (
                  <div key={b.label} className="bg-white rounded-lg border border-gray-100 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)]">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{b.label}</p>
                    <p className={`text-[15px] font-bold tabular-nums ${b.color}`}>{formatRM(b.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Search bar ────────────────────────────────── */}
          <div className="flex items-center gap-2.5 pb-3">
            <input
              type="text"
              placeholder="Search supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[250px]"
            />
          </div>
        </div>

        <main className="flex-1 overflow-y-auto p-6 animate-in">
          {/* Aging detail table */}
          {showAging && agingData.length > 0 && agingSummary && (
            <div className="mb-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="px-4 py-2.5 text-left">Supplier</th>
                        <th className="px-3 py-2.5 text-right">0-30</th>
                        <th className="px-3 py-2.5 text-right">31-60</th>
                        <th className="px-3 py-2.5 text-right">61-90</th>
                        <th className="px-3 py-2.5 text-right">90+</th>
                        <th className="px-3 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.map((s) => (
                        <React.Fragment key={s.supplier_id}>
                          <tr
                            onClick={() => setAgingExpanded(agingExpanded === s.supplier_id ? null : s.supplier_id)}
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer border-b border-gray-50"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  className={`text-gray-400 transition-transform duration-200 ${agingExpanded === s.supplier_id ? 'rotate-90' : ''}`}
                                >
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                                <span className="text-[12px] font-semibold text-gray-900">{s.supplier_name}</span>
                                <span className="text-[10px] text-gray-400">({s.invoices.length})</span>
                              </div>
                            </td>
                            <AgingCell value={s.days0_30} warn />
                            <AgingCell value={s.days31_60} warn />
                            <AgingCell value={s.days61_90} warn />
                            <AgingCell value={s.days90plus} warn />
                            <td className="px-3 py-2.5 text-right tabular-nums text-[12px] font-bold text-gray-900">{formatRM(s.total)}</td>
                          </tr>
                          {agingExpanded === s.supplier_id && s.invoices.map((inv) => (
                            <tr
                              key={inv.id}
                              className="bg-gray-50/50 border-b border-gray-50/80 text-[11px] cursor-pointer hover:bg-gray-100/60 transition-colors"
                              onClick={() => setPreviewInvoice({
                                id: inv.id,
                                invoice_number: inv.invoice_number,
                                issue_date: inv.issue_date,
                                due_date: inv.due_date,
                                total_amount: inv.balance,
                                amount_paid: '0',
                                payment_status: inv.payment_status as 'unpaid' | 'partially_paid' | 'paid',
                                status: '',
                                category_name: inv.category_name,
                                supplier_link_status: '',
                                vendor_name_raw: s.supplier_name,
                              })}
                            >
                              <td className="px-4 py-2 pl-10 text-gray-500">
                                {formatDate(inv.issue_date)} · <span className="text-gray-700 font-medium">{inv.invoice_number ?? '-'}</span> · {inv.category_name}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{inv.bucket === 'current' || inv.bucket === '0-30' || inv.bucket === '1-30' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{inv.bucket === '31-60' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{inv.bucket === '61-90' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-400">{inv.bucket === '90+' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-gray-500 font-medium">{formatRMStr(inv.balance)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-[12px]">
                        <td className="px-4 py-2.5 text-gray-900">Total</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days0_30 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(agingSummary.days0_30)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days31_60 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(agingSummary.days31_60)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days61_90 > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(agingSummary.days61_90)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days90plus > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatRM(agingSummary.days90plus)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{formatRM(agingSummary.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
            </div>
          )}

          {/* ── Supplier list ─────────────────────────────── */}
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-12">Loading...</div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">No suppliers found</p>
              <p className="text-xs text-gray-300 mt-1">Suppliers are auto-created when invoices are uploaded.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suppliers.map((s) => (
                <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.02)] overflow-hidden">
                  {/* Supplier row */}
                  <div
                    className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => toggleExpand(s.id)}
                  >
                    {/* Expand icon */}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-gray-400 flex-shrink-0 transition-transform duration-200 ${expandedId === s.id ? 'rotate-90' : ''}`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>

                    {/* Name + aliases */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{s.name}</p>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate">
                        {s.aliases.length} alias{s.aliases.length !== 1 ? 'es' : ''} · {s.invoice_count} invoice{s.invoice_count !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Outstanding */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-[13px] font-semibold text-gray-900 tabular-nums">{formatRM(s.total_outstanding)}</p>
                      {Number(s.overdue_amount) > 0 && (
                        <p className="text-[11px] text-red-500 font-medium tabular-nums">{formatRM(s.overdue_amount)} overdue</p>
                      )}
                      {Number(s.credit_balance) > 0 && (
                        <p className="text-[11px] text-green-600 font-medium tabular-nums">Credit: {formatRM(s.credit_balance)}</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openPayment(s); }}
                      className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-xl font-medium text-white btn-dark transition-all duration-200"
                    >
                      Pay
                    </button>
                    <Link
                      href={`/admin/suppliers/${s.id}/statement`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-xl font-medium text-white btn-blue transition-all duration-200"
                    >
                      Statement
                    </Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                      className="flex-shrink-0 text-[11px] px-3 py-1.5 rounded-xl shadow-sm font-medium btn-primary"
                    >
                      Edit
                    </button>
                  </div>

                  {/* Expanded invoices */}
                  {expandedId === s.id && (
                    <div className="border-t border-gray-100 bg-gray-50/50">
                      {loadingInvoices ? (
                        <div className="px-5 py-6 text-center text-sm text-gray-400">Loading invoices...</div>
                      ) : expandedInvoices.length === 0 ? (
                        <div className="px-5 py-6 text-center text-sm text-gray-400">No invoices for this supplier</div>
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                              <th className="px-5 py-2 pl-14">Issue Date</th>
                              <th className="px-3 py-2">Invoice #</th>
                              <th className="px-3 py-2">Due Date</th>
                              <th className="px-3 py-2">Category</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-right">Paid</th>
                              <th className="px-3 py-2">Payment</th>
                              <th className="px-3 py-2">Aging</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expandedInvoices.map((inv, i) => {
                              const pmtCfg = PAYMENT_CFG[inv.payment_status];
                              return (
                                <React.Fragment key={inv.id}>
                                  <tr
                                    className={`text-[12px] hover:bg-white/60 transition-colors cursor-pointer ${i < expandedInvoices.length - 1 && !(inv.allocations?.length) ? 'border-b border-gray-100' : ''}`}
                                    onClick={() => setPreviewInvoice(inv)}
                                  >
                                    <td className="px-5 py-2.5 pl-14 text-gray-500 tabular-nums">{formatDate(inv.issue_date)}</td>
                                    <td className="px-3 py-2.5 text-gray-700 font-medium">{inv.invoice_number ?? '-'}</td>
                                    <td className="px-3 py-2.5 text-gray-500 tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                    <td className="px-3 py-2.5 text-gray-500">{inv.category_name}</td>
                                    <td className="px-3 py-2.5 text-gray-900 font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                                    <td className="px-3 py-2.5 text-gray-500 text-right tabular-nums">{formatRM(inv.amount_paid)}</td>
                                    <td className="px-3 py-2.5">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                                    <td className="px-3 py-2.5">
                                      {inv.payment_status !== 'paid' && (
                                        <span className={`text-[11px] font-medium ${
                                          agingBucket(inv.due_date) === 'Current' ? 'text-green-600' :
                                          agingBucket(inv.due_date) === '90+' ? 'text-red-600' :
                                          'text-amber-600'
                                        }`}>
                                          {agingBucket(inv.due_date)}
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                  {inv.allocations && inv.allocations.length > 0 && inv.allocations.map((alloc) => (
                                    <tr key={alloc.id} className="text-[11px] bg-gray-50/50 border-b border-gray-50">
                                      <td className="px-5 py-1.5 pl-20 text-gray-400" colSpan={3}>
                                        <span>Payment: {formatDate(alloc.payment_date)}{alloc.reference ? ` · ${alloc.reference}` : ''}</span>
                                        {alloc.receipts && alloc.receipts.length > 0 && (
                                          <span className="ml-2">
                                            {alloc.receipts.map((r) => (
                                              <button
                                                key={r.id}
                                                onClick={(e) => { e.stopPropagation(); setPreviewReceipt(r); }}
                                                className="inline-flex items-center gap-0.5 text-blue-500 hover:text-blue-700 hover:underline"
                                              >
                                                Receipt: {r.receipt_number || r.merchant}
                                              </button>
                                            ))}
                                          </span>
                                        )}
                                      </td>
                                      <td colSpan={3} className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                                        {formatRM(alloc.amount)}
                                      </td>
                                      <td colSpan={2} className="px-3 py-1.5">
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm('Remove this payment allocation?')) return;
                                            try {
                                              const res = await fetch(`/api/admin/payments/allocations/${alloc.id}`, { method: 'DELETE' });
                                              if (res.ok) refresh();
                                            } catch (err) { console.error(err); }
                                          }}
                                          className="text-red-500 hover:text-red-700 font-medium"
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
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </main>
      </div>

      {/* ═══ PAYMENT SIDE PANEL ═══ */}
      {paymentSupplier && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPaymentSupplier(null)} />
          <div className="fixed right-0 top-0 h-screen w-[480px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Record Payment</h2>
              <button onClick={() => setPaymentSupplier(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Supplier name */}
              <div>
                <label className="input-label">Supplier</label>
                <p className="text-sm font-semibold text-gray-900">{paymentSupplier.name}</p>
              </div>

              {/* Credit balance */}
              {Number(paymentSupplier.credit_balance) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold text-green-700 uppercase tracking-wide">Available Credit</p>
                    <p className="text-lg font-bold text-green-700 tabular-nums">{formatRM(paymentSupplier.credit_balance)}</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/admin/payments/apply-credit', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ supplier_id: paymentSupplier.id }),
                        });
                        if (res.ok) { setPaymentSupplier(null); refresh(); }
                      } catch (e) { console.error(e); }
                    }}
                    className="text-[11px] px-3 py-1.5 rounded-md font-semibold text-white transition-opacity hover:opacity-85"
                    style={{ backgroundColor: 'var(--sidebar)' }}
                  >
                    Apply Credit
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Payment Amount (RM)</label>
                  <input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="input-field w-full" placeholder="0.00" />
                </div>
                <div>
                  <label className="input-label">Payment Date</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="input-field w-full" />
                </div>
              </div>

              <div>
                <label className="input-label">Reference (optional)</label>
                <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="input-field w-full" placeholder="e.g. cheque number, transfer ref" />
              </div>

              <div>
                <label className="input-label">Notes (optional)</label>
                <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="input-field w-full" rows={2} placeholder="Optional notes" />
              </div>

              {/* Attach Receipts */}
              {availableReceipts.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Attach Receipts (optional)</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {availableReceipts.map((r) => {
                      const selected = selectedReceiptIds.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => toggleReceipt(r.id)}
                          className={`relative flex-shrink-0 w-[90px] rounded-lg border-2 p-1.5 text-center transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          {selected && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <span className="text-white text-[10px] leading-none">&#10003;</span>
                            </div>
                          )}
                          {r.thumbnail_url ? (
                            <img src={r.thumbnail_url} alt="" className="w-full h-[56px] object-cover rounded mb-1" />
                          ) : (
                            <div className="w-full h-[56px] bg-gray-100 rounded mb-1 flex items-center justify-center">
                              <span className="text-gray-400 text-[18px]">&#128196;</span>
                            </div>
                          )}
                          <p className="text-[10px] font-medium text-gray-700 truncate">{r.receipt_number || r.merchant}</p>
                          <p className="text-[10px] text-gray-500 tabular-nums">RM {Number(r.amount).toFixed(2)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Invoice allocation */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Allocate to Invoices</h3>
                  <button
                    onClick={autoAllocate}
                    disabled={!paymentAmount || Number(paymentAmount) <= 0}
                    className="text-[11px] px-2.5 py-1 rounded-md font-medium text-white disabled:opacity-40 transition-opacity hover:opacity-85"
                    style={{ backgroundColor: 'var(--sidebar)' }}
                  >
                    Auto-allocate
                  </button>
                </div>

                {loadingPaymentInvoices ? (
                  <div className="text-center text-sm text-gray-400 py-4">Loading invoices...</div>
                ) : paymentInvoices.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-4">No unpaid invoices</div>
                ) : (
                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100">
                          <th className="px-3 py-2 text-left">Invoice #</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Balance</th>
                          <th className="px-3 py-2 text-right">Allocate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentInvoices.map((inv, i) => (
                          <tr key={inv.id} className={`text-[12px] ${i < paymentInvoices.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-700 font-medium">{inv.invoice_number ?? '-'}</td>
                            <td className="px-3 py-2 text-right text-gray-500 tabular-nums">{formatRM(inv.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-gray-900 font-semibold tabular-nums">{formatRM(inv.balance)}</td>
                            <td className="px-3 py-1.5 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={inv.allocation}
                                onChange={(e) => {
                                  const updated = [...paymentInvoices];
                                  updated[i] = { ...inv, allocation: e.target.value };
                                  setPaymentInvoices(updated);
                                }}
                                className="input-field w-[100px] text-right text-[12px] py-1"
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Totals row */}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100 text-[12px]">
                      <span className="text-gray-500 font-medium">Total allocated</span>
                      <span className={`font-bold tabular-nums ${
                        paymentInvoices.reduce((sum, inv) => sum + Number(inv.allocation || 0), 0) > Number(paymentAmount || 0)
                          ? 'text-red-600' : 'text-gray-900'
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

            <div className="p-4 border-t flex-shrink-0 flex gap-3">
              <button
                onClick={submitPayment}
                disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0}
                className="btn-primary flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paymentSaving ? 'Saving...' : 'Save Payment'}
              </button>
              <button onClick={() => setPaymentSupplier(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ EDIT SIDE PANEL ═══ */}
      {editSupplier && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setEditSupplier(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Edit Supplier</h2>
              <button onClick={() => setEditSupplier(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="input-label">Supplier Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field w-full" />
                </div>
                <div>
                  <label className="input-label">Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-field w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Phone</label>
                  <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-field w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Notes</label>
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="input-field w-full" rows={3} placeholder="Optional" />
                </div>
              </div>

              {/* Aliases */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Vendor Name Aliases</h3>
                <div className="space-y-1.5">
                  {editSupplier.aliases.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">{a.alias}</span>
                        {a.is_confirmed && <span className="badge-green text-[10px]">Confirmed</span>}
                      </div>
                      <button onClick={() => removeAlias(a.id)} className="text-gray-400 hover:text-red-500 text-xs transition-colors">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addAlias(); }}
                    className="input-field flex-1"
                    placeholder="Add alias…"
                  />
                  <button onClick={addAlias} className="px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-85" style={{ backgroundColor: 'var(--sidebar)' }}>
                    Add
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
                <Field label="Invoices" value={String(editSupplier.invoice_count)} />
                <Field label="Outstanding" value={formatRM(editSupplier.total_outstanding)} />
                {Number(editSupplier.overdue_amount) > 0 && (
                  <Field label="Overdue" value={formatRM(editSupplier.overdue_amount)} />
                )}
              </div>
            </div>

            <div className="p-4 border-t flex-shrink-0 flex gap-3">
              <button onClick={saveSupplier} disabled={editSaving} className="btn-primary flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditSupplier(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ INVOICE PREVIEW ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image</div>
              )}
              <dl className="space-y-3">
                <Field label="Vendor" value={previewInvoice.vendor_name_raw} />
                <Field label="Invoice No." value={previewInvoice.invoice_number} />
                <Field label="Issue Date" value={formatDate(previewInvoice.issue_date)} />
                <Field label="Due Date" value={previewInvoice.due_date ? formatDate(previewInvoice.due_date) : null} />
                <Field label="Total Amount" value={formatRM(previewInvoice.total_amount)} />
                <Field label="Amount Paid" value={formatRM(previewInvoice.amount_paid)} />
                <Field label="Category" value={previewInvoice.category_name} />
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {PAYMENT_CFG[previewInvoice.payment_status] && (
                  <span className={PAYMENT_CFG[previewInvoice.payment_status].cls}>{PAYMENT_CFG[previewInvoice.payment_status].label}</span>
                )}
              </div>
              {previewInvoice.allocations && previewInvoice.allocations.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Payment History</p>
                  <div className="space-y-1.5">
                    {previewInvoice.allocations.map((a) => (
                      <div key={a.id} className="text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 flex justify-between">
                        <span>{formatDate(a.payment_date)}{a.reference ? ` · ${a.reference}` : ''}</span>
                        <span className="font-semibold tabular-nums">{formatRM(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewInvoice.file_url && (
                <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 border-t flex-shrink-0">
              <button
                onClick={() => window.open(`/admin/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--sidebar)' }}
              >
                Open in Invoices
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══ RECEIPT PREVIEW ═══ */}
      {previewReceipt && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewReceipt(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Receipt Details</h2>
              <button onClick={() => setPreviewReceipt(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image</div>
              )}
              <dl className="space-y-3">
                <Field label="Merchant" value={previewReceipt.merchant} />
                <Field label="Receipt No." value={previewReceipt.receipt_number} />
                {previewReceipt.amount && <Field label="Amount" value={formatRM(previewReceipt.amount)} />}
                {previewReceipt.claim_date && <Field label="Date" value={formatDate(previewReceipt.claim_date)} />}
              </dl>
            </div>
            <div className="p-4 border-t flex-shrink-0">
              <button onClick={() => setPreviewReceipt(null)} className="w-full py-2 rounded-xl text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
