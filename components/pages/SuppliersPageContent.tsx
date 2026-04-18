'use client';

import React from 'react';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import ReceiptSelector from '@/components/ReceiptSelector';
import Field from '@/components/forms/Field';
import Sidebar from '@/components/Sidebar';
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

function AgingCell({ value, warn }: { value: number; warn?: boolean }) {
  if (value === 0) return <td className="px-3 py-2.5 text-right text-[var(--text-secondary)] tabular-nums text-body-sm">-</td>;
  return (
    <td className={`px-3 py-2.5 text-right tabular-nums text-body-sm font-semibold ${warn && value > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>
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
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (config.firmId) p.set('firmId', config.firmId);
    if (takeLimit) p.set('take', String(takeLimit));

    fetch(`${config.apiSuppliers}?${p}`)
      .then((r) => r.json())
      .then((j) => { setSuppliers(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); })
      .catch((e) => { console.error(e); setLoading(false); });
  }, [config.firmsLoaded, config.firmId, config.apiSuppliers, search, refreshKey, takeLimit]);

  // Load aging report
  useEffect(() => {
    if (!config.firmsLoaded) return;
    const p = new URLSearchParams();
    if (config.firmId) p.set('firmId', config.firmId);
    fetch(`${config.apiAging}?${p}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setAgingData(j.data.suppliers);
          setAgingSummary(j.data.summary);
        }
      })
      .catch(console.error);
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
                  <table className="w-full ds-table-chassis">
                    <thead>
                      <tr className="ds-table-header">
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
                            className={`ds-table-row hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}
                          >
                            <td className="px-4 py-2.5">
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
                            <AgingCell value={s.days0_30} warn />
                            <AgingCell value={s.days31_60} warn />
                            <AgingCell value={s.days61_90} warn />
                            <AgingCell value={s.days90plus} warn />
                            <td className="px-3 py-2.5 text-right tabular-nums text-body-sm font-bold text-[var(--text-primary)]">{formatRM(s.total)}</td>
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
                              <td className="px-4 py-2 pl-10 text-[var(--text-secondary)]">
                                {formatDate(inv.issue_date)} · <span className="text-[var(--text-secondary)] font-medium">{inv.invoice_number ?? '-'}</span> · {inv.category_name}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{(inv.bucket === 'current' || inv.bucket === '0-30' || inv.bucket === '1-30') ? formatRM(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{inv.bucket === '31-60' ? formatRM(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{inv.bucket === '61-90' ? formatRM(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)]">{inv.bucket === '90+' ? formatRM(inv.balance) : '-'}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-[var(--text-secondary)] font-medium">{formatRM(inv.balance)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-[var(--surface-header)] bg-[var(--surface-low)] font-bold text-body-sm">
                        <td className="px-4 py-2.5 text-[var(--text-primary)]">Total</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days0_30 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days0_30)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days31_60 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days31_60)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days61_90 > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days61_90)}</td>
                        <td className={`px-3 py-2.5 text-right tabular-nums ${agingSummary.days90plus > 0 ? 'text-[var(--reject-red)]' : 'text-[var(--text-primary)]'}`}>{formatRM(agingSummary.days90plus)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-[var(--text-primary)]">{formatRM(agingSummary.total)}</td>
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
              <table className="w-full ds-table-chassis">
                <thead>
                  <tr className="ds-table-header">
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
                        className={`ds-table-row transition-colors cursor-pointer hover:bg-[var(--surface-header)] ${rowBg}`}
                        onClick={() => openPreview(s.id)}
                      >
                        <td className="px-4 py-2.5">
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
                        {config.showFirmColumn && <td className="px-3 py-2.5 text-body-sm text-[var(--text-secondary)]">{s.firm_name || '-'}</td>}
                        <td className="px-3 py-2.5 text-right text-body-sm tabular-nums text-[var(--text-secondary)]">
                          {s.invoice_count + s.sales_invoice_count}
                        </td>
                        <td className="px-3 py-2.5 text-right">
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
        const payable = Number(s.total_outstanding);
        const receivable = Number(s.receivable_amount);
        const net = payable - receivable;
        return (
          <>
            <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={closePreview} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={closePreview}>
              <div className="bg-white shadow-2xl w-full max-w-[1200px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
                <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-white font-bold text-sm uppercase tracking-widest">{s.name}</h2>
                    {config.showFirmColumn && s.firm_name && <span className="text-white/60 text-label-sm">{s.firm_name}</span>}
                  </div>
                  <button onClick={closePreview} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
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
                    {config.showGlMapping && (s.expense_gl_label || s.contra_gl_label) && (
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
                            <table className="w-full ds-table-chassis">
                              <thead>
                                <tr className="ds-table-header text-left">
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
                                        className={`ds-table-row text-body-sm hover:bg-white/60 transition-colors cursor-pointer ${isDocExpanded ? 'bg-blue-50/60' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : ''}`}
                                        onClick={() => setExpandedDocId(isDocExpanded ? null : inv.id)}
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
                                                    onClick={(e) => { e.stopPropagation(); setPreviewReceipt(r); }}
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
                                                  const res = await fetch(`${config.apiPayments}/allocations/${alloc.id}`, { method: 'DELETE' });
                                                  if (res.ok) refreshInPlace();
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
                            <table className="w-full ds-table-chassis">
                              <thead>
                                <tr className="ds-table-header text-left">
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
                                        className={`ds-table-row text-body-sm hover:bg-white/60 transition-colors cursor-pointer ${isSiExpanded ? 'bg-blue-50/60' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : ''}`}
                                        onClick={() => setExpandedDocId(isSiExpanded ? null : `si-${sinv.id}`)}
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
                                        const res = await fetch(`${config.apiPayments}/${op.id}`, { method: 'DELETE' });
                                        if (res.ok) refreshInPlace();
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
                    onClick={() => { closePreview(); openPayment(s); }}
                    className="btn-thick-green text-label-sm px-4 py-2 font-medium"
                  >
                    Pay
                  </button>
                  <Link
                    href={`${config.linkPrefix}/suppliers/${s.id}/statement`}
                    target="_blank"
                    className="btn-thick-white text-label-sm px-4 py-2 font-medium"
                  >
                    Statement
                  </Link>
                  <button
                    onClick={() => { closePreview(); openEdit(s); }}
                    className="btn-thick-navy text-label-sm px-4 py-2 font-medium"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ═══ PAYMENT MODAL ═══ */}
      {paymentSupplier && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPaymentSupplier(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPaymentSupplier(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Record Payment</h2>
              <button onClick={() => setPaymentSupplier(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Supplier</label>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{paymentSupplier.name}</p>
              </div>

              {Number(paymentSupplier.credit_balance) > 0 && (
                <div className="bg-green-50 border border-green-200 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-label font-bold text-[var(--match-green)] uppercase tracking-widest">Available Credit</p>
                    <p className="text-lg font-bold text-[var(--match-green)] tabular-nums">{formatRM(paymentSupplier.credit_balance)}</p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        const res = await fetch(`${config.apiPayments}/apply-credit`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ supplier_id: paymentSupplier.id }),
                        });
                        if (res.ok) { setPaymentSupplier(null); refreshInPlace(); }
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
                  <input type="number" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} className="input-recessed w-full" placeholder="0.00" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Payment Date</label>
                  <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="input-recessed w-full" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Reference (optional)</label>
                <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} className="input-recessed w-full" placeholder="e.g. cheque number, transfer ref" />
              </div>

              <div>
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Notes (optional)</label>
                <textarea value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="input-recessed w-full" rows={2} placeholder="Optional notes" />
              </div>

              <ReceiptSelector
                {...(config.firmId ? { firmId: paymentSupplier.firm_id } : {})}
                apiBasePath={config.apiReceipts}
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Allocate to Invoices</h3>
                  <button
                    onClick={autoAllocate}
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
                    <table className="w-full ds-table-chassis">
                      <thead>
                        <tr className="ds-table-header">
                          <th className="px-3 py-2 text-left text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Invoice #</th>
                          <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Total</th>
                          <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Balance</th>
                          <th className="px-3 py-2 text-right text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]">Allocate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentInvoices.map((inv, i) => (
                          <tr key={inv.id} className={`ds-table-row text-body-sm ${i % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
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
                                  setPaymentInvoices(updated);
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
                onClick={submitPayment}
                disabled={paymentSaving || !paymentAmount || Number(paymentAmount) <= 0}
                className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {paymentSaving ? 'Saving...' : 'Save Payment'}
              </button>
              <button onClick={() => setPaymentSupplier(null)} className="btn-thick-white flex-1 py-2 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ EDIT SUPPLIER MODAL ═══ */}
      {editSupplier && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4" onClick={() => setEditSupplier(null)}>
          <div className="bg-white shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 border-b bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Edit Supplier</h2>
              <button onClick={() => setEditSupplier(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Supplier Name</label>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="input-recessed w-full" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Email</label>
                  <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Phone</label>
                  <input type="text" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} className="input-recessed w-full" placeholder="Optional" />
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Notes</label>
                  <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} className="input-recessed w-full" rows={3} placeholder="Optional" />
                </div>
              </div>

              <div>
                <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Vendor Name Aliases</h3>
                <div className="space-y-1.5">
                  {editSupplier.aliases.map((a) => (
                    <div key={a.id} className="flex items-center justify-between bg-[var(--surface-low)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--text-secondary)]">{a.alias}</span>
                        {a.is_confirmed && <span className="badge-green text-label-sm">Confirmed</span>}
                      </div>
                      <button onClick={() => removeAlias(a.id)} className="text-[var(--text-secondary)] hover:text-[var(--reject-red)] text-xs transition-colors">Remove</button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addAlias(); }}
                    className="input-recessed flex-1"
                    placeholder="Add alias..."
                  />
                  <button onClick={addAlias} className="btn-thick-navy px-3 py-1.5 text-xs font-medium">
                    Add
                  </button>
                </div>
              </div>

              {/* GL Account Mapping (accountant only) */}
              {config.showGlMapping && editGlAccounts.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">GL Account Mapping</h3>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Expense GL (Debit)</label>
                    <select value={editExpenseGlId} onChange={(e) => setEditExpenseGlId(e.target.value)} className="input-recessed w-full text-sm">
                      <option value="">Not assigned</option>
                      {editGlAccounts.filter(a => ['Expense', 'CostOfSales'].includes(a.account_type)).map(a => (
                        <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Contra GL (Credit — Supplier Account)</label>
                    <select value={editContraGlId} onChange={(e) => setEditContraGlId(e.target.value)} className="input-recessed w-full text-sm">
                      <option value="">Not assigned</option>
                      {editGlAccounts.filter(a => a.account_type === 'Liability').map(a => (
                        <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="bg-[var(--surface-low)] p-3 space-y-2">
                {config.showFirmColumn && editSupplier.firm_name && <Field label="Firm" value={editSupplier.firm_name} />}
                <Field label="Invoices" value={String(editSupplier.invoice_count)} />
                <Field label="Outstanding" value={formatRM(editSupplier.total_outstanding)} />
                {Number(editSupplier.overdue_amount) > 0 && (
                  <Field label="Overdue" value={formatRM(editSupplier.overdue_amount)} />
                )}
              </div>
            </div>

            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)] flex gap-3">
              <button onClick={saveSupplier} disabled={editSaving} className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditSupplier(null)} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
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
