'use client';

import React from 'react';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import Field from '@/components/forms/Field';
import Sidebar from '@/components/Sidebar';
import SupplierPreviewPanel from '@/components/suppliers/SupplierPreviewPanel';
import SupplierPaymentModal from '@/components/suppliers/SupplierPaymentModal';
import SupplierEditModal from '@/components/suppliers/SupplierEditModal';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePageTitle } from '@/lib/use-page-title';
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

// ─── Config ──────────────────────────────────────────────────────────────────

export interface SuppliersPageConfig {
  role: 'accountant' | 'admin';
  /** API base for suppliers, e.g. '/api/suppliers' or '/api/admin/suppliers' */
  apiSuppliers: string;
  /** API for aging report, e.g. '/api/invoices/aging' or '/api/admin/invoices/aging' */
  apiAging: string;
  /** API for payments, e.g. '/api/payments' or '/api/admin/payments' */
  apiPayments: string;
  /** API for receipts, e.g. '/api/receipts' or '/api/admin/receipts' */
  apiReceipts: string;
  /** Link prefix for supplier routes, e.g. '/accountant' or '/admin' */
  linkPrefix: string;
  /** Whether to show firm column and GL mapping (accountant = true) */
  showFirmColumn: boolean;
  /** Whether to show GL mapping in edit/preview (accountant = true) */
  showGlMapping: boolean;
  /** Firm filter from FirmContext (accountant passes firmId, admin passes undefined) */
  firmId?: string;
  /** Whether firms are loaded (accountant uses FirmContext, admin always true) */
  firmsLoaded: boolean;
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

function AgingCell({ value, warn, col }: { value: number; warn?: boolean; col?: string }) {
  if (value === 0) return <td data-col={col} className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums text-body-sm">-</td>;
  return (
    <td data-col={col} className={`px-3 py-2.5 text-right tabular-nums text-body-sm font-semibold ${warn && value > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
      {formatRM(value)}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SuppliersPageContent({ config }: { config: SuppliersPageConfig }) {
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

  // Supplier preview modal
  const [previewSupplierId, setPreviewSupplierId] = useState<string | null>(null);
  const [expandedInvoices, setExpandedInvoices] = useState<InvoiceRow[]>([]);
  const [expandedSalesInvoices, setExpandedSalesInvoices] = useState<SalesInvoiceRow[]>([]);
  const [orphanedPayments, setOrphanedPayments] = useState<{ id: string; amount: string; payment_date: string; reference: string | null; receipts: { claim_id: string; merchant: string; receipt_number: string | null }[] }[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);

  // Preview panels
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptInfo | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // Edit side panel
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [newAlias, setNewAlias] = useState('');

  // GL edit (accountant only)
  const [editExpenseGlId, setEditExpenseGlId] = useState('');
  const [editContraGlId, setEditContraGlId] = useState('');
  const [editGlAccounts, setEditGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);

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

  const refreshInPlace = async () => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (config.firmId) p.set('firmId', config.firmId);
    if (takeLimit) p.set('take', String(takeLimit));

    const agingUrl = config.firmId ? `${config.apiAging}?firmId=${config.firmId}` : config.apiAging;
    const [suppRes, agingRes] = await Promise.all([
      fetch(`${config.apiSuppliers}?${p}`).then(r => r.json()),
      fetch(agingUrl).then(r => r.json()),
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
    if (previewSupplierId) {
      try {
        const res = await fetch(`${config.apiSuppliers}/${previewSupplierId}`);
        const j = await res.json();
        setExpandedInvoices(j.data?.invoices ?? []);
        setExpandedSalesInvoices(j.data?.salesInvoices ?? []);
        setOrphanedPayments(j.data?.orphanedPayments ?? []);
      } catch (e) { console.error(e); }
    }
  };

  // Load suppliers
  useEffect(() => {
    if (!config.firmsLoaded) return;
    const controller = new AbortController();
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (config.firmId) p.set('firmId', config.firmId);
    if (takeLimit) p.set('take', String(takeLimit));

    fetch(`${config.apiSuppliers}?${p}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => { setSuppliers(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { console.error(e); setLoading(false); } });
    return () => controller.abort();
  }, [config.firmsLoaded, config.firmId, config.apiSuppliers, search, refreshKey, takeLimit]);

  // Load aging report
  useEffect(() => {
    if (!config.firmsLoaded) return;
    const controller = new AbortController();
    const p = new URLSearchParams();
    if (config.firmId) p.set('firmId', config.firmId);
    fetch(`${config.apiAging}?${p}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setAgingData(j.data.suppliers);
          setAgingSummary(j.data.summary);
        }
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') console.error(e); });
    return () => controller.abort();
  }, [config.firmsLoaded, config.firmId, config.apiAging, refreshKey]);

  // Open supplier preview modal
  const openPreview = async (supplierId: string) => {
    setPreviewSupplierId(supplierId);
    setLoadingInvoices(true);
    setExpandedInvoices([]);
    setExpandedSalesInvoices([]);
    setOrphanedPayments([]);
    try {
      const res = await fetch(`${config.apiSuppliers}/${supplierId}`);
      const j = await res.json();
      setExpandedInvoices(j.data?.invoices ?? []);
      setExpandedSalesInvoices(j.data?.salesInvoices ?? []);
      setOrphanedPayments(j.data?.orphanedPayments ?? []);
    } catch (e) { console.error(e); }
    finally { setLoadingInvoices(false); }
  };

  const closePreview = () => {
    setPreviewSupplierId(null);
    setExpandedInvoices([]);
    setExpandedSalesInvoices([]);
    setOrphanedPayments([]);
    setExpandedDocId(null);
  };

  // Open edit panel
  const openEdit = (s: Supplier) => {
    setEditSupplier(s);
    setEditName(s.name);
    setEditEmail(s.contact_email ?? '');
    setEditPhone(s.contact_phone ?? '');
    setEditNotes(s.notes ?? '');
    setNewAlias('');
    if (config.showGlMapping) {
      setEditExpenseGlId(s.default_gl_account_id ?? '');
      setEditContraGlId(s.default_contra_gl_account_id ?? '');
      if (s.firm_id) {
        fetch(`/api/gl-accounts?firmId=${s.firm_id}`).then(r => r.json()).then(j => setEditGlAccounts(j.data ?? [])).catch(console.error);
      }
    }
  };

  const saveSupplier = async () => {
    if (!editSupplier) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: editName.trim(),
        contact_email: editEmail.trim(),
        contact_phone: editPhone.trim(),
        notes: editNotes.trim(),
      };
      if (config.showGlMapping) {
        body.default_gl_account_id = editExpenseGlId || null;
        body.default_contra_gl_account_id = editContraGlId || null;
      }
      const res = await fetch(`${config.apiSuppliers}/${editSupplier.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) { setEditSupplier(null); refresh(); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const addAlias = async () => {
    if (!editSupplier || !newAlias.trim()) return;
    try {
      await fetch(`${config.apiSuppliers}/${editSupplier.id}/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: newAlias.trim() }),
      });
      setNewAlias('');
      const res = await fetch(`${config.apiSuppliers}/${editSupplier.id}`);
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
      const invRes = await fetch(`${config.apiSuppliers}/${s.id}`);
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
      const res = await fetch(config.apiPayments, {
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
      await fetch(`${config.apiSuppliers}/${editSupplier.id}/aliases`, {
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
    <div className="flex h-screen overflow-hidden paper-texture">
      <Sidebar role={config.role} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex-shrink-0 flex items-center justify-between pl-14 pr-6 bg-white border-b border-[#E0E3E5]">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Suppliers</h1>
          {config.role === 'accountant' && (
            <p className="text-[var(--text-secondary)] text-xs">
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}
        </header>

        {/* ── Static top section (aging cards + filters) ── */}
        <div className="flex-shrink-0 px-8 pl-14 pt-4 pb-3">
          {agingSummary && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-body-md font-semibold text-[var(--text-primary)]">Aging Report — Accounts Payable</h2>
                <button
                  onClick={() => setShowAging(!showAging)}
                  className="btn-thick-navy text-label-sm px-3 py-1.5 font-medium"
                >
                  {showAging ? 'Collapse' : 'Expand'}
                </button>
              </div>

              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: '0-30 Days', value: agingSummary.days0_30, color: agingSummary.days0_30 > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]' },
                  { label: '31-60 Days', value: agingSummary.days31_60, color: agingSummary.days31_60 > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]' },
                  { label: '61-90 Days', value: agingSummary.days61_90, color: agingSummary.days61_90 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]' },
                  { label: '90+ Days', value: agingSummary.days90plus, color: agingSummary.days90plus > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]' },
                  { label: 'Total Payable', value: agingSummary.total, color: 'text-[var(--text-primary)]' },
                ].map((b) => (
                  <div key={b.label} className="bg-white card-popped p-3">
                    <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">{b.label}</p>
                    <p className={`text-title-md font-bold tabular-nums ${b.color}`}>{formatRM(b.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 pb-3">
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

        <main className="flex-1 overflow-y-auto p-8 pl-14 animate-in ledger-binding">
          {/* ── Aging expanded table ── */}
          {showAging && agingData.length > 0 && agingSummary && (
            <div className="mb-4">
              <div className="bg-white card-popped overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="px-4 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Supplier</th>
                        <th className="px-3 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">0-30</th>
                        <th className="px-3 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">31-60</th>
                        <th className="px-3 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">61-90</th>
                        <th className="px-3 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">90+</th>
                        <th className="px-3 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agingData.map((s, idx) => (
                        <React.Fragment key={s.supplier_id}>
                          <tr
                            onClick={() => setAgingExpanded(agingExpanded === s.supplier_id ? null : s.supplier_id)}
                            className={`hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}
                          >
                            <td data-col="Supplier" className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                  className={`text-[var(--text-secondary)] transition-transform duration-200 ${agingExpanded === s.supplier_id ? 'rotate-90' : ''}`}
                                >
                                  <path d="M9 18l6-6-6-6" />
                                </svg>
                                <span className="text-body-sm font-semibold text-[var(--text-primary)]">{s.supplier_name}</span>
                                <span className="text-label-sm text-[var(--text-secondary)]">({s.invoices.length})</span>
                              </div>
                            </td>
                            <AgingCell value={s.days0_30} warn col="0-30" />
                            <AgingCell value={s.days31_60} warn col="31-60" />
                            <AgingCell value={s.days61_90} warn col="61-90" />
                            <AgingCell value={s.days90plus} warn col="90+" />
                            <td data-col="Total" className="px-3 py-2.5 text-right tabular-nums text-body-sm font-bold text-[var(--text-primary)]">{formatRM(s.total)}</td>
                          </tr>
                          {agingExpanded === s.supplier_id && s.invoices.map((inv) => (
                            <tr
                              key={inv.id}
                              className="bg-[var(--surface-low)] text-label-sm cursor-pointer hover:bg-[var(--surface-header)] transition-colors"
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
                              <td data-col="Supplier" className="px-4 py-2 pl-10 text-[var(--text-secondary)]">
                                {formatDate(inv.issue_date)} · <span className="text-[var(--text-secondary)] font-medium">{inv.invoice_number ?? '-'}</span> · {inv.category_name}
                              </td>
                              <td data-col="0-30" className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{(inv.bucket === 'current' || inv.bucket === '0-30' || inv.bucket === '1-30') ? formatRM(inv.balance) : '-'}</td>
                              <td data-col="31-60" className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{inv.bucket === '31-60' ? formatRM(inv.balance) : '-'}</td>
                              <td data-col="61-90" className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{inv.bucket === '61-90' ? formatRM(inv.balance) : '-'}</td>
                              <td data-col="90+" className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{inv.bucket === '90+' ? formatRM(inv.balance) : '-'}</td>
                              <td data-col="Total" className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] font-medium">{formatRM(inv.balance)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--surface-header)] bg-[var(--surface-low)] font-bold text-body-sm">
                        <td data-col="Supplier" className="px-4 py-2.5 text-[var(--text-primary)]">Total</td>
                        <td data-col="0-30" className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days0_30 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days0_30)}</td>
                        <td data-col="31-60" className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days31_60 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days31_60)}</td>
                        <td data-col="61-90" className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days61_90 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days61_90)}</td>
                        <td data-col="90+" className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days90plus > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days90plus)}</td>
                        <td data-col="Total" className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">{formatRM(agingSummary.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={suppliers.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Supplier list ── */}
          {loading ? (
            <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
          ) : suppliers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--text-secondary)]">No suppliers found</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Suppliers are auto-created when invoices are uploaded.</p>
            </div>
          ) : (
            <div className="bg-white card-popped overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Supplier</th>
                    {config.showFirmColumn && <th className="px-3 py-2.5 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Firm</th>}
                    <th className="px-3 py-2.5 text-right w-[80px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Invoices</th>
                    <th className="px-3 py-2.5 text-right w-[130px] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Net Outstanding</th>
                    <th className="px-3 py-2.5 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSuppliers.map((s) => {
                    const payable = Number(s.total_outstanding);
                    const receivable = Number(s.receivable_amount);
                    const net = payable - receivable;
                    const isSelected = previewSupplierId === s.id;
                    const rowBg = isSelected ? 'bg-blue-50/60' : net > 0 ? 'bg-red-50/40' : net < 0 ? 'bg-green-50/30' : 'bg-white';
                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors cursor-pointer hover:bg-[var(--surface-header)] ${rowBg}`}
                        onClick={() => openPreview(s.id)}
                      >
                        <td data-col="Supplier" className="px-4 py-2.5">
                          <p className="text-body-sm font-semibold text-[var(--text-primary)]">{s.name}</p>
                          <p className="text-label-sm text-[var(--text-secondary)]">
                            {s.aliases.length} alias{s.aliases.length !== 1 ? 'es' : ''}
                            {config.showGlMapping && (s.expense_gl_label || s.contra_gl_label) && (
                              <>
                                {s.expense_gl_label && <> · <span title={s.expense_gl_label}>DR: {s.expense_gl_label.length > 20 ? s.expense_gl_label.slice(0, 20) + '…' : s.expense_gl_label}</span></>}
                                {s.contra_gl_label && <> · <span title={s.contra_gl_label}>CR: {s.contra_gl_label.length > 20 ? s.contra_gl_label.slice(0, 20) + '…' : s.contra_gl_label}</span></>}
                              </>
                            )}
                          </p>
                        </td>
                        {config.showFirmColumn && <td data-col="Firm" className="px-3 py-2.5 text-body-sm text-[var(--text-secondary)]">{s.firm_name || '-'}</td>}
                        <td data-col="Invoices" className="px-3 py-2.5 text-right text-body-sm tabular-nums text-[var(--text-secondary)]">
                          {s.invoice_count + s.sales_invoice_count}
                        </td>
                        <td data-col="Outstanding" className="px-3 py-2.5 text-right">
                          <span className={`text-sm font-bold tabular-nums ${net > 0 ? 'text-[var(--reject-red)]' : net < 0 ? 'text-[var(--match-green)]' : 'text-[var(--text-primary)]'}`}>
                            {formatRM(Math.abs(net))}{net > 0 ? ' owed' : net < 0 ? ' due' : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); openPayment(s); }}
                              className="btn-thick-green text-label-sm w-[70px] py-1.5 text-white text-center"
                            >
                              Pay
                            </button>
                            <Link
                              href={`${config.linkPrefix}/suppliers/${s.id}/statement`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              className="btn-thick-white text-label-sm w-[80px] py-1.5 text-center"
                            >
                              Statement
                            </Link>
                            <button
                              onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                              className="btn-thick-navy text-label-sm w-[70px] py-1.5 text-white text-center"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* ═══ SUPPLIER PREVIEW MODAL ═══ */}
      {previewSupplierId && (() => {
        const s = suppliers.find((sup) => sup.id === previewSupplierId);
        if (!s) return null;
        return (
          <SupplierPreviewPanel
            supplier={s}
            expandedInvoices={expandedInvoices}
            expandedSalesInvoices={expandedSalesInvoices}
            orphanedPayments={orphanedPayments}
            loadingInvoices={loadingInvoices}
            expandedDocId={expandedDocId}
            showFirmColumn={config.showFirmColumn}
            showGlMapping={config.showGlMapping}
            linkPrefix={config.linkPrefix}
            apiPayments={config.apiPayments}
            onClose={closePreview}
            onExpandDoc={setExpandedDocId}
            onPreviewReceipt={setPreviewReceipt}
            onOpenPayment={openPayment}
            onOpenEdit={openEdit}
            onRefreshInPlace={refreshInPlace}
          />
        );
      })()}

      {/* ═══ PAYMENT MODAL ═══ */}
      {paymentSupplier && (
        <SupplierPaymentModal
          supplier={paymentSupplier}
          paymentAmount={paymentAmount}
          paymentDate={paymentDate}
          paymentRef={paymentRef}
          paymentNotes={paymentNotes}
          paymentInvoices={paymentInvoices}
          paymentSaving={paymentSaving}
          loadingPaymentInvoices={loadingPaymentInvoices}
          selectedReceiptIds={selectedReceiptIds}
          firmId={config.firmId}
          apiReceipts={config.apiReceipts}
          apiPayments={config.apiPayments}
          onClose={() => setPaymentSupplier(null)}
          onPaymentAmountChange={setPaymentAmount}
          onPaymentDateChange={setPaymentDate}
          onPaymentRefChange={setPaymentRef}
          onPaymentNotesChange={setPaymentNotes}
          onPaymentInvoicesChange={setPaymentInvoices}
          onSelectionChange={(ids, total) => {
            setSelectedReceiptIds(ids);
            const amt = total > 0 ? total.toFixed(2) : '';
            setPaymentAmount(amt);
            if (total > 0) autoAllocateWith(total);
            else setPaymentInvoices(prev => prev.map(inv => ({ ...inv, allocation: '' })));
          }}
          onAutoAllocate={autoAllocate}
          onAutoAllocateWith={autoAllocateWith}
          onSubmitPayment={submitPayment}
          onPreviewReceipt={setPreviewReceipt}
          onRefreshInPlace={refreshInPlace}
        />
      )}

      {/* ═══ EDIT SUPPLIER MODAL ═══ */}
      {editSupplier && (
        <SupplierEditModal
          supplier={editSupplier}
          editName={editName}
          editEmail={editEmail}
          editPhone={editPhone}
          editNotes={editNotes}
          editSaving={editSaving}
          newAlias={newAlias}
          showFirmColumn={config.showFirmColumn}
          showGlMapping={config.showGlMapping}
          editExpenseGlId={editExpenseGlId}
          editContraGlId={editContraGlId}
          editGlAccounts={editGlAccounts}
          onClose={() => setEditSupplier(null)}
          onNameChange={setEditName}
          onEmailChange={setEditEmail}
          onPhoneChange={setEditPhone}
          onNotesChange={setEditNotes}
          onNewAliasChange={setNewAlias}
          onExpenseGlIdChange={setEditExpenseGlId}
          onContraGlIdChange={setEditContraGlId}
          onAddAlias={addAlias}
          onRemoveAlias={removeAlias}
          onSave={saveSupplier}
        />
      )}

      {/* ═══ INVOICE PREVIEW ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                previewInvoice.file_url ? (
                  <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-64 object-contain border border-[var(--surface-header)] cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-64 object-contain border border-[var(--surface-header)]" />
                )
              ) : (
                <div className="w-full h-40 border border-[var(--surface-header)] bg-[var(--surface-low)] flex items-center justify-center text-[var(--text-secondary)] text-sm">No image</div>
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
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Payment History</p>
                  <div className="space-y-1.5">
                    {previewInvoice.allocations.map((a) => (
                      <div key={a.id} className="text-xs text-[var(--text-secondary)] bg-[var(--surface-low)] px-3 py-2 flex justify-between">
                        <span>{formatDate(a.payment_date)}{a.reference ? ` · ${a.reference}` : ''}</span>
                        <span className="font-semibold tabular-nums">{formatRM(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {previewInvoice.file_url && (
                <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--primary)] hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)] space-y-2">
              <div className="flex gap-3">
                <button
                  onClick={() => window.open(`${config.linkPrefix}/invoices?search=${encodeURIComponent(previewInvoice.invoice_number ?? '')}`, '_blank')}
                  className="btn-thick-navy flex-1 py-2 text-sm font-semibold"
                >
                  Open in Invoices
                </button>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPreviewInvoice(null)} className="btn-thick-white flex-1 py-2 text-sm font-semibold">
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
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setPreviewReceipt(null)}>
          <div className="bg-white shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 border-b bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Receipt Details</h2>
              <button onClick={() => setPreviewReceipt(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                previewReceipt.file_url ? (
                  <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--surface-header)] cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewReceipt.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--surface-header)]" />
                )
              ) : (
                <div className="w-full h-40 border border-[var(--surface-header)] bg-[var(--surface-low)] flex items-center justify-center text-[var(--text-secondary)] text-sm">No image</div>
              )}
              <dl className="space-y-3">
                <Field label="Merchant" value={previewReceipt.merchant} />
                <Field label="Receipt No." value={previewReceipt.receipt_number} />
                {previewReceipt.amount && <Field label="Amount" value={formatRM(previewReceipt.amount)} />}
                {previewReceipt.claim_date && <Field label="Date" value={formatDate(previewReceipt.claim_date)} />}
              </dl>
              {previewReceipt.file_url && (
                <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--primary)] hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)]">
              <button onClick={() => setPreviewReceipt(null)} className="btn-thick-white w-full py-2.5 text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
