'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import ReceiptSelector from '@/components/ReceiptSelector';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePageTitle } from '@/lib/use-page-title';

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

interface Supplier {
  id: string;
  name: string;
  firm_name: string;
  firm_id: string;
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

interface FirmOption {
  id: string;
  name: string;
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

function formatRMStr(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AgingCell({ value, warn }: { value: number; warn?: boolean }) {
  if (value === 0) return <td className="px-3 py-2.5 text-right text-[#8E9196] tabular-nums text-body-sm">-</td>;
  return (
    <td className={`px-3 py-2.5 text-right tabular-nums text-body-sm font-semibold ${warn && value > 0 ? 'text-red-600' : 'text-[#191C1E]'}`}>
      {formatRM(value)}
    </td>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}

// ─── Small reusable sub-components ────────────────────────────────────────────

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input-field">
      {children}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountantSuppliersPage() {
  usePageTitle('Suppliers');

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [supplierSort, setSupplierSort] = useState('name|asc');
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

  const sortedSuppliers = useMemo(() => {
    const [field, dir] = supplierSort.split('|') as [string, string];
    return [...suppliers].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const va = (a as any)[field];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vb = (b as any)[field];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === 'string' && isNaN(Number(va))
        ? va.localeCompare(vb, 'en', { sensitivity: 'base' })
        : Number(va) - Number(vb);
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [suppliers, supplierSort]);

  // Aging report
  const [agingData, setAgingData] = useState<AgingSupplier[]>([]);
  const [agingSummary, setAgingSummary] = useState<AgingSummary | null>(null);
  const [agingExpanded, setAgingExpanded] = useState<string | null>(null);
  const [showAging, setShowAging] = useState(false);

  // Firms
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmFilter, setFirmFilter] = useState('');

  // Expanded supplier — shows invoices drill-down
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedInvoices, setExpandedInvoices] = useState<InvoiceRow[]>([]);
  const [orphanedPayments, setOrphanedPayments] = useState<{ id: string; amount: string; payment_date: string; reference: string | null; receipts: { claim_id: string; merchant: string; receipt_number: string | null }[] }[]>([]);
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

  const refresh = () => setRefreshKey((k) => k + 1);

  // Re-fetch supplier list + expanded invoices in-place (no scroll jump)
  const refreshInPlace = async () => {
    const p = new URLSearchParams();
    if (search)     p.set('search', search);
    if (firmFilter) p.set('firmId', firmFilter);
    if (takeLimit)  p.set('take', String(takeLimit));

    const [suppRes, agingRes] = await Promise.all([
      fetch(`/api/suppliers?${p}`).then(r => r.json()),
      fetch(`/api/invoices/aging?${firmFilter ? `firmId=${firmFilter}` : ''}`).then(r => r.json()),
    ]);
    if (suppRes.data) {
      setSuppliers(suppRes.data);
      setHasMore(suppRes.hasMore ?? false);
      setTotalCount(suppRes.totalCount ?? 0);
    }
    if (agingRes.data) {
      setAgingData(agingRes.data.suppliers);
      setAgingSummary(agingRes.data.summary);
    }
    // Re-fetch expanded supplier invoices if one is open
    if (expandedId) {
      try {
        const res = await fetch(`/api/suppliers/${expandedId}`);
        const j = await res.json();
        setExpandedInvoices(j.data?.invoices ?? []);
        setOrphanedPayments(j.data?.orphanedPayments ?? []);
      } catch (e) { console.error(e); }
    }
  };

  // Load firms for filter
  useEffect(() => {
    fetch('/api/firms/details')
      .then((r) => r.json())
      .then((j) => {
        const list = (j.data ?? []).map((f: FirmOption) => ({ id: f.id, name: f.name }));
        setFirms(list);
        if (list.length === 1) setFirmFilter(list[0].id);
      })
      .catch(console.error);
  }, []);

  // Load suppliers
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search)     p.set('search', search);
    if (firmFilter) p.set('firmId', firmFilter);
    if (takeLimit)  p.set('take', String(takeLimit));

    fetch(`/api/suppliers?${p}`)
      .then((r) => r.json())
      .then((j) => { setSuppliers(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, [search, firmFilter, refreshKey, takeLimit]);

  // Load aging report
  useEffect(() => {
    const p = new URLSearchParams();
    if (firmFilter) p.set('firmId', firmFilter);
    fetch(`/api/invoices/aging?${p}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setAgingData(j.data.suppliers);
          setAgingSummary(j.data.summary);
        }
      })
      .catch(console.error);
  }, [firmFilter, refreshKey]);

  // Load invoices when expanding a supplier
  const toggleExpand = async (supplierId: string) => {
    if (expandedId === supplierId) {
      setExpandedId(null);
      setExpandedInvoices([]);
      setOrphanedPayments([]);
      return;
    }
    setExpandedId(supplierId);
    setLoadingInvoices(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`);
      const j = await res.json();
      setExpandedInvoices(j.data?.invoices ?? []);
      setOrphanedPayments(j.data?.orphanedPayments ?? []);
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
      const res = await fetch(`/api/suppliers/${editSupplier.id}`, {
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
      await fetch(`/api/suppliers/${editSupplier.id}/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: newAlias.trim() }),
      });
      setNewAlias('');
      // Refresh the edit panel data
      const res = await fetch(`/api/suppliers/${editSupplier.id}`);
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
    setLoadingPaymentInvoices(true);
    try {
      const invRes = await fetch(`/api/suppliers/${s.id}`);
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

  const submitPayment = async () => {
    if (!paymentSupplier || !paymentAmount) return;
    setPaymentSaving(true);
    try {
      const allocations = paymentInvoices
        .filter((inv) => Number(inv.allocation) > 0)
        .map((inv) => ({ invoice_id: inv.id, amount: Number(inv.allocation) }));
      const res = await fetch('/api/payments', {
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
      if (res.ok) { setPaymentSupplier(null); refreshInPlace(); }
    } catch (e) { console.error(e); }
    finally { setPaymentSaving(false); }
  };

  const removeAlias = async (aliasId: string) => {
    if (!editSupplier) return;
    try {
      await fetch(`/api/suppliers/${editSupplier.id}/aliases`, {
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
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Suppliers</h1>
          <p className="text-[#8E9196] text-xs">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        {/* ── Static top section (aging cards + filters) ── */}
        <div className="flex-shrink-0 px-6 pt-4 pb-3 bg-[#F7F9FB]">
          {/* ── Aging Report ─────────────────────────────── */}
          {agingSummary && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-body-md font-semibold text-[#191C1E]">Aging Report — Accounts Payable</h2>
                <button
                  onClick={() => setShowAging(!showAging)}
                  className="text-label-sm px-3 py-1.5 rounded-lg font-medium text-white btn-blue transition-all duration-200"
                >
                  {showAging ? 'Collapse' : 'Expand'}
                </button>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: '0-30 Days', value: agingSummary.days0_30, color: agingSummary.days0_30 > 0 ? 'text-amber-600' : 'text-[#191C1E]' },
                  { label: '31-60 Days', value: agingSummary.days31_60, color: agingSummary.days31_60 > 0 ? 'text-amber-600' : 'text-[#191C1E]' },
                  { label: '61-90 Days', value: agingSummary.days61_90, color: agingSummary.days61_90 > 0 ? 'text-red-500' : 'text-[#191C1E]' },
                  { label: '90+ Days', value: agingSummary.days90plus, color: agingSummary.days90plus > 0 ? 'text-red-600' : 'text-[#191C1E]' },
                  { label: 'Total Payable', value: agingSummary.total, color: 'text-[#191C1E]' },
                ].map((b) => (
                  <div key={b.label} className="bg-white rounded-lg p-3">
                    <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wider mb-1">{b.label}</p>
                    <p className={`text-title-md font-bold tabular-nums ${b.color}`}>{formatRM(b.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex items-center gap-2.5 pb-3">
            {firms.length > 1 && (
              <Select value={firmFilter} onChange={setFirmFilter}>
                <option value="">All Firms</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            )}

            <input
              type="text"
              placeholder="Search supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[250px]"
            />
            <select
              className="input-field"
              value={supplierSort}
              onChange={(e) => setSupplierSort(e.target.value)}
            >
              <option value="name|asc">Name A-Z</option>
              <option value="name|desc">Name Z-A</option>
              <option value="total_outstanding|desc">Outstanding High-Low</option>
              <option value="total_outstanding|asc">Outstanding Low-High</option>
              <option value="overdue_amount|desc">Overdue High-Low</option>
              <option value="overdue_amount|asc">Overdue Low-High</option>
            </select>
          </div>
        </div>

        <main className="flex-1 overflow-y-auto px-6 py-3 animate-in">
          {/* ── Aging expanded table ────────────────────── */}
          {showAging && agingData.length > 0 && agingSummary && (
            <div className="mb-4">
              <div className="bg-white rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="ds-table-header">
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
                            className="hover:bg-[#F2F4F6] transition-colors cursor-pointer"
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  className={`text-[#8E9196] transition-transform duration-200 ${agingExpanded === s.supplier_id ? 'rotate-90' : ''}`}
                                >
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                                <span className="text-body-sm font-semibold text-[#191C1E]">{s.supplier_name}</span>
                                <span className="text-label-sm text-[#8E9196]">({s.invoices.length})</span>
                              </div>
                            </td>
                            <AgingCell value={s.days0_30} warn />
                            <AgingCell value={s.days31_60} warn />
                            <AgingCell value={s.days61_90} warn />
                            <AgingCell value={s.days90plus} warn />
                            <td className="px-3 py-2.5 text-right tabular-nums text-body-sm font-bold text-[#191C1E]">{formatRM(s.total)}</td>
                          </tr>
                          {agingExpanded === s.supplier_id && s.invoices.map((inv) => (
                            <tr
                              key={inv.id}
                              className="bg-gray-50/50 text-label-sm cursor-pointer hover:bg-gray-100/60 transition-colors"
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
                              <td className="px-4 py-2 pl-10 text-[#434654]">
                                {formatDate(inv.issue_date)} · <span className="text-[#434654] font-medium">{inv.invoice_number ?? '-'}</span> · {inv.category_name}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#8E9196]">{(inv.bucket === 'current' || inv.bucket === '0-30' || inv.bucket === '1-30') ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#8E9196]">{inv.bucket === '31-60' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#8E9196]">{inv.bucket === '61-90' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#8E9196]">{inv.bucket === '90+' ? formatRMStr(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[#434654] font-medium">{formatRMStr(inv.balance)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-body-sm">
                        <td className="px-4 py-2.5 text-[#191C1E]">Total</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days0_30 > 0 ? 'text-red-600' : 'text-[#191C1E]'}`}>{formatRM(agingSummary.days0_30)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days31_60 > 0 ? 'text-red-600' : 'text-[#191C1E]'}`}>{formatRM(agingSummary.days31_60)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days61_90 > 0 ? 'text-red-600' : 'text-[#191C1E]'}`}>{formatRM(agingSummary.days61_90)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days90plus > 0 ? 'text-red-600' : 'text-[#191C1E]'}`}>{formatRM(agingSummary.days90plus)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[#191C1E]">{formatRM(agingSummary.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
            </div>
          )}

          {/* ── Load More ─────────────────────────────────── */}
          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={suppliers.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Supplier list ─────────────────────────────── */}
          {loading ? (
            <div className="text-center text-sm text-[#8E9196] py-12">Loading...</div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[#8E9196]">No suppliers found</p>
              <p className="text-xs text-[#8E9196] mt-1">Suppliers are auto-created when invoices are uploaded.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedSuppliers.map((s) => (
                <div key={s.id} className="bg-white rounded-lg overflow-hidden">
                  {/* Supplier row */}
                  <div
                    className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => toggleExpand(s.id)}
                  >
                    {/* Expand icon */}
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className={`text-[#8E9196] flex-shrink-0 transition-transform duration-200 ${expandedId === s.id ? 'rotate-90' : ''}`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>

                    {/* Name + firm + aliases */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-body-md font-semibold text-[#191C1E] truncate">{s.name}</p>
                        {s.firm_name && (
                          <span className="text-label-sm text-[#8E9196] bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">{s.firm_name}</span>
                        )}
                      </div>
                      <p className="text-label-sm text-[#8E9196] truncate">
                        {s.aliases.length} alias{s.aliases.length !== 1 ? 'es' : ''} · {s.invoice_count} invoice{s.invoice_count !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Outstanding */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-body-md font-semibold text-[#191C1E] tabular-nums">{formatRM(s.total_outstanding)}</p>
                      {Number(s.overdue_amount) > 0 && (
                        <p className="text-label-sm text-red-500 font-medium tabular-nums">{formatRM(s.overdue_amount)} overdue</p>
                      )}
                      {Number(s.credit_balance) > 0 && (
                        <p className="text-label-sm text-green-600 font-medium tabular-nums">Credit: {formatRM(s.credit_balance)}</p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openPayment(s); }}
                      className="flex-shrink-0 text-label-sm px-3 py-1.5 rounded-lg font-medium text-white btn-dark transition-all duration-200"
                    >
                      Pay
                    </button>
                    <Link
                      href={`/accountant/suppliers/${s.id}/statement`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0 text-label-sm px-3 py-1.5 rounded-lg font-medium border border-[#C0C4CC] text-[#434654] hover:bg-[#F2F4F6] transition-all duration-200"
                    >
                      Statement
                    </Link>
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                      className="flex-shrink-0 text-label-sm px-3 py-1.5 rounded-lg font-medium text-white shadow-sm btn-primary transition-opacity hover:opacity-85"
                    >
                      Edit
                    </button>
                  </div>

                  {/* Expanded invoices */}
                  {expandedId === s.id && (
                    <div className="bg-gray-50/50">
                      {loadingInvoices ? (
                        <div className="px-5 py-6 text-center text-sm text-[#8E9196]">Loading invoices...</div>
                      ) : expandedInvoices.length === 0 ? (
                        <div className="px-5 py-6 text-center text-sm text-[#8E9196]">No invoices for this supplier</div>
                      ) : (
                        <table className="w-full">
                          <thead>
                            <tr className="ds-table-header text-left">
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
                            {expandedInvoices.map((inv) => {
                              const pmtCfg = PAYMENT_CFG[inv.payment_status];
                              return (
                                <React.Fragment key={inv.id}>
                                  <tr
                                    className={`text-body-sm hover:bg-white/60 transition-colors cursor-pointer`}
                                    onClick={() => setPreviewInvoice(inv)}
                                  >
                                    <td className="px-5 py-2.5 pl-14 text-[#434654] tabular-nums">{formatDate(inv.issue_date)}</td>
                                    <td className="px-3 py-2.5 text-[#434654] font-medium">{inv.invoice_number ?? '-'}</td>
                                    <td className="px-3 py-2.5 text-[#434654] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                                    <td className="px-3 py-2.5 text-[#434654]">{inv.category_name}</td>
                                    <td className="px-3 py-2.5 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                                    <td className="px-3 py-2.5 text-[#434654] text-right tabular-nums">{formatRM(inv.amount_paid)}</td>
                                    <td className="px-3 py-2.5">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                                    <td className="px-3 py-2.5">
                                      {inv.payment_status !== 'paid' && (
                                        <span className={`text-label-sm font-medium ${
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
                                    <tr key={alloc.id} className="text-label-sm bg-gray-50/50">
                                      <td className="px-5 py-1.5 pl-20 text-[#8E9196]" colSpan={3}>
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
                                      <td colSpan={3} className="px-3 py-1.5 text-right text-[#434654] tabular-nums">
                                        {formatRM(alloc.amount)}
                                      </td>
                                      <td colSpan={2} className="px-3 py-1.5">
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm('Remove this payment allocation?')) return;
                                            try {
                                              const res = await fetch(`/api/payments/allocations/${alloc.id}`, { method: 'DELETE' });
                                              if (res.ok) refreshInPlace();
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
                      {/* Orphaned credit payments */}
                      {orphanedPayments.length > 0 && (
                        <div className="px-5 py-3 border-t border-gray-100">
                          <p className="text-label-sm font-semibold text-amber-700 uppercase tracking-wide mb-2">Unallocated Credit</p>
                          {orphanedPayments.map((op) => (
                            <div key={op.id} className="flex items-center justify-between py-1.5 text-body-sm">
                              <div className="text-[#434654]">
                                <span className="tabular-nums">{formatDate(op.payment_date)}</span>
                                {op.reference && <span className="ml-2 text-[#8E9196]">{op.reference}</span>}
                                {op.receipts.length > 0 && (
                                  <span className="ml-2 text-[#8E9196]">
                                    (Receipt: {op.receipts.map(r => r.receipt_number || r.merchant).join(', ')})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold text-amber-600 tabular-nums">{formatRM(op.amount)}</span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm('Delete this payment and unlink its receipts? Receipts will become unpaid/unlinked.')) return;
                                    try {
                                      const res = await fetch(`/api/payments/${op.id}`, { method: 'DELETE' });
                                      if (res.ok) refreshInPlace();
                                    } catch (err) { console.error(err); }
                                  }}
                                  className="text-red-500 hover:text-red-700 font-medium text-label-sm"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in">
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Record Payment</h2>
              <button onClick={() => setPaymentSupplier(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Supplier name */}
              <div>
                <label className="input-label">Supplier</label>
                <p className="text-sm font-semibold text-[#191C1E]">{paymentSupplier.name}</p>
              </div>

              {/* Credit balance */}
              {Number(paymentSupplier.credit_balance) > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-label-sm font-semibold text-green-700 uppercase tracking-wide">Available Credit</p>
                    <p className="text-lg font-bold text-green-700 tabular-nums">{formatRM(paymentSupplier.credit_balance)}</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/payments/apply-credit', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ supplier_id: paymentSupplier.id }),
                        });
                        if (res.ok) { setPaymentSupplier(null); refreshInPlace(); }
                      } catch (e) { console.error(e); }
                    }}
                    className="text-label-sm px-3 py-1.5 rounded-md font-semibold text-white transition-opacity hover:opacity-85"
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
              <ReceiptSelector
                firmId={paymentSupplier.firm_id}
                apiBasePath="/api/receipts"
                invoiceBalances={paymentInvoices.map(inv => inv.balance)}
                selectedIds={selectedReceiptIds}
                onSelectionChange={(ids, total) => {
                  setSelectedReceiptIds(ids);
                  const amt = total > 0 ? total.toFixed(2) : '';
                  setPaymentAmount(amt);
                  if (total > 0) autoAllocateWith(total);
                  else setPaymentInvoices(prev => prev.map(inv => ({ ...inv, allocation: '' })));
                }}
                onPreview={(r) => setPreviewReceipt(r)}
              />

              {/* Invoice allocation */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide">Allocate to Invoices</h3>
                  <button
                    onClick={autoAllocate}
                    disabled={!paymentAmount || Number(paymentAmount) <= 0}
                    className="text-label-sm px-2.5 py-1 rounded-md font-medium text-white disabled:opacity-40 transition-opacity hover:opacity-85"
                    style={{ backgroundColor: 'var(--sidebar)' }}
                  >
                    Auto-allocate
                  </button>
                </div>

                {loadingPaymentInvoices ? (
                  <div className="text-center text-sm text-[#8E9196] py-4">Loading invoices...</div>
                ) : paymentInvoices.length === 0 ? (
                  <div className="text-center text-sm text-[#8E9196] py-4">No unpaid invoices</div>
                ) : (
                  <div className="rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="ds-table-header">
                          <th className="px-3 py-2 text-left">Invoice #</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">Balance</th>
                          <th className="px-3 py-2 text-right">Allocate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentInvoices.map((inv, i) => (
                          <tr key={inv.id} className={`text-body-sm`}>
                            <td className="px-3 py-2 text-[#434654] font-medium">{inv.invoice_number ?? '-'}</td>
                            <td className="px-3 py-2 text-right text-[#434654] tabular-nums">{formatRM(inv.total_amount)}</td>
                            <td className="px-3 py-2 text-right text-[#191C1E] font-semibold tabular-nums">{formatRM(inv.balance)}</td>
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
                                className="input-field w-[100px] text-right text-body-sm py-1"
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Totals row */}
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-body-sm">
                      <span className="text-[#434654] font-medium">Total allocated</span>
                      <span className={`font-bold tabular-nums ${
                        paymentInvoices.reduce((sum, inv) => sum + Number(inv.allocation || 0), 0) > Number(paymentAmount || 0)
                          ? 'text-red-600' : 'text-[#191C1E]'
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

            <div className="p-4 flex-shrink-0 flex gap-3">
              <button
                onClick={submitPayment}
                disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0}
                className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paymentSaving ? 'Saving...' : 'Save Payment'}
              </button>
              <button onClick={() => setPaymentSupplier(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                Cancel
              </button>
            </div>
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
                <h3 className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-2">Vendor Name Aliases</h3>
                <div className="space-y-1.5">
                  {editSupplier.aliases.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[#434654]">{a.alias}</span>
                        {a.is_confirmed && <span className="badge-green text-label-sm">Confirmed</span>}
                      </div>
                      <button onClick={() => removeAlias(a.id)} className="text-[#8E9196] hover:text-red-500 text-xs transition-colors">Remove</button>
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
                    placeholder="Add alias..."
                  />
                  <button onClick={addAlias} className="px-3 py-1.5 text-xs font-medium rounded-md text-white transition-opacity hover:opacity-85" style={{ backgroundColor: 'var(--sidebar)' }}>
                    Add
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <Field label="Firm" value={editSupplier.firm_name} />
                <Field label="Invoices" value={String(editSupplier.invoice_count)} />
                <Field label="Outstanding" value={formatRM(editSupplier.total_outstanding)} />
                {Number(editSupplier.overdue_amount) > 0 && (
                  <Field label="Overdue" value={formatRM(editSupplier.overdue_amount)} />
                )}
              </div>
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3">
              <button onClick={saveSupplier} disabled={editSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditSupplier(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in">
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-64 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image</div>
              )}
              <dl className="grid grid-cols-2 gap-3">
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
                  <p className="text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-2">Payment History</p>
                  <div className="space-y-1.5">
                    {previewInvoice.allocations.map((a) => (
                      <div key={a.id} className="text-xs text-[#434654] bg-gray-50 rounded px-3 py-2 flex justify-between">
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
            <div className="p-4 flex-shrink-0 space-y-2">
              {/* ── Primary action ── */}
              <div className="flex gap-3">
                <button
                  onClick={() => window.open(`/accountant/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                  className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold"
                >
                  Open in Invoices
                </button>
              </div>
              {/* ── Secondary actions ── */}
              <div className="flex gap-3">
                <button onClick={() => setPreviewInvoice(null)} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                  Close
                </button>
              </div>
            </div>
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
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image</div>
              )}
              <dl className="space-y-3">
                <Field label="Merchant" value={previewReceipt.merchant} />
                <Field label="Receipt No." value={previewReceipt.receipt_number} />
                {previewReceipt.amount && <Field label="Amount" value={formatRM(previewReceipt.amount)} />}
                {previewReceipt.claim_date && <Field label="Date" value={formatDate(previewReceipt.claim_date)} />}
              </dl>
              {previewReceipt.file_url && (
                <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 flex-shrink-0">
              <button onClick={() => setPreviewReceipt(null)} className="w-full py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
