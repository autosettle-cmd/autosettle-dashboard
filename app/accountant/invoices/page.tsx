'use client';

import Sidebar from '@/components/Sidebar';
import SalesInvoicesContent from '@/components/SalesInvoicesContent';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import { useSearchParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  gl_account_id: string | null;
  gl_account_label: string | null;
}

interface FirmOption {
  id: string;
  name: string;
}

interface SupplierOption {
  id: string;
  name: string;
  firm_id: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'badge-amber' },
  reviewed:       { label: 'Reviewed',       cls: 'badge-blue'  },
};

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:         { label: 'Unpaid',         cls: 'badge-gray'   },
  partially_paid: { label: 'Partial',        cls: 'badge-amber'  },
  paid:           { label: 'Paid',           cls: 'badge-purple' },
};

const LINK_CFG: Record<string, { label: string; cls: string }> = {
  confirmed:    { label: 'Confirmed',    cls: 'badge-green' },
  auto_matched: { label: 'Suggested',    cls: 'badge-amber' },
  unmatched:    { label: 'Unconfirmed',  cls: 'badge-red'   },
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

function getDateRange(range: string, customFrom: string, customTo: string) {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().split('T')[0];
  switch (range) {
    case 'this_week': {
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return { from: iso(monday), to: iso(now) };
    }
    case 'this_month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case 'last_month':
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to:   iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case 'custom':
      return { from: customFrom, to: customTo };
    default:
      return { from: '', to: '' };
  }
}

// ─── AG Grid cell renderers ──────────────────────────────────────────────────

function StatusCell({ value }: { value: string }) {
  const cfg = STATUS_CFG[value];
  return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
}

function PaymentCell({ value }: { value: string }) {
  const cfg = PAYMENT_CFG[value];
  return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
}

function LinkCell({ value }: { value: string }) {
  const cfg = LINK_CFG[value];
  return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
}

// ─── Preview field helper ─────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AccountantInvoicesPageWrapper() {
  return <Suspense><AccountantInvoicesPage /></Suspense>;
}

function AccountantInvoicesPage() {
  const [activeTab, setActiveTab] = useState<'received' | 'issued'>('received');

  // Data
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

  // UI
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [glAccounts, setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [selectedGlAccountId, setSelectedGlAccountId] = useState<string>('');

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{
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
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);

  // Create new supplier
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Submit new invoice modal
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [newInvSubmitting, setNewInvSubmitting] = useState(false);
  const [newInvError, setNewInvError] = useState('');
  const [newInv, setNewInv] = useState({
    firm_id: '',
    vendor_name: '',
    supplier_id: '',
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    total_amount: '',
    category_id: '',
    payment_terms: '',
  });
  const [newInvFile, setNewInvFile] = useState<File | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  // Fetch categories when modal opens
  useEffect(() => {
    if (showNewInvoice) {
      fetch('/api/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
    }
  }, [showNewInvoice]);

  const handleInvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setNewInvFile(file);
    if (!file) return;

    setOcrScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categories', JSON.stringify(categories.map((c) => c.name)));

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();

      if (res.ok && json.fields) {
        const f = json.fields;
        const updates: typeof newInv = { ...newInv };
        if (json.documentType === 'invoice') {
          if (f.vendor) updates.vendor_name = f.vendor;
          if (f.invoiceNumber) updates.invoice_number = f.invoiceNumber;
          if (f.issueDate) updates.issue_date = f.issueDate;
          if (f.dueDate) updates.due_date = f.dueDate;
          if (f.totalAmount) updates.total_amount = String(f.totalAmount);
          if (f.paymentTerms) updates.payment_terms = f.paymentTerms;
        } else {
          if (f.merchant) updates.vendor_name = f.merchant;
          if (f.date) updates.issue_date = f.date;
          if (f.amount) updates.total_amount = String(f.amount);
          if (f.receiptNumber) updates.invoice_number = f.receiptNumber;
        }
        if (f.category) {
          const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
          if (match) updates.category_id = match.id;
        }
        // Try to match vendor to existing supplier
        if (updates.vendor_name) {
          const vLower = updates.vendor_name.toLowerCase();
          const firmSuppliers = newInv.firm_id ? suppliers.filter((s) => s.firm_id === newInv.firm_id) : suppliers;
          const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
          if (supplierMatch) updates.supplier_id = supplierMatch.id;
        }
        setNewInv(updates);
      }
    } catch (err) {
      console.error('OCR extraction failed:', err);
    } finally {
      setOcrScanning(false);
    }
  };

  const submitNewInvoice = async () => {
    if (!newInv.firm_id || !newInv.vendor_name || !newInv.issue_date || !newInv.total_amount || !newInv.category_id) {
      setNewInvError('Please fill in all required fields including Firm.');
      return;
    }
    setNewInvSubmitting(true);
    setNewInvError('');
    try {
      const fd = new FormData();
      fd.append('firm_id', newInv.firm_id);
      fd.append('vendor_name', newInv.vendor_name);
      if (newInv.supplier_id) fd.append('supplier_id', newInv.supplier_id);
      if (newInv.invoice_number) fd.append('invoice_number', newInv.invoice_number);
      fd.append('issue_date', newInv.issue_date);
      if (newInv.due_date) fd.append('due_date', newInv.due_date);
      fd.append('total_amount', newInv.total_amount);
      fd.append('category_id', newInv.category_id);
      if (newInv.payment_terms) fd.append('payment_terms', newInv.payment_terms);
      if (newInvFile) fd.append('file', newInvFile);

      const res = await fetch('/api/invoices', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { setNewInvError(j.error || 'Failed to create invoice'); return; }

      setShowNewInvoice(false);
      setNewInv({ firm_id: '', vendor_name: '', supplier_id: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', total_amount: '', category_id: '', payment_terms: '' });
      setNewInvFile(null);
      refresh();
    } catch (e) { console.error(e); setNewInvError('Network error'); }
    finally { setNewInvSubmitting(false); }
  };

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); setCreatingSupplier(false); }, [previewInvoice]);

  // Fetch GL accounts + pre-fill suggestion
  useEffect(() => {
    if (previewInvoice) {
      Promise.all([
        fetch(`/api/gl-accounts?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
        fetch(`/api/categories?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
      ])
        .then(([glJson, catJson]) => {
          setGlAccounts(glJson.data ?? []);
          if (previewInvoice.gl_account_id) {
            setSelectedGlAccountId(previewInvoice.gl_account_id);
          } else {
            const catData = catJson.data ?? [];
            const match = catData.find((c: { id: string; gl_account_id?: string }) => c.id === previewInvoice.category_id);
            setSelectedGlAccountId(match?.gl_account_id ?? '');
          }
        })
        .catch(console.error);
    } else {
      setGlAccounts([]);
      setSelectedGlAccountId('');
    }
  }, [previewInvoice]);

  // Fetch categories for edit
  useEffect(() => {
    if (editMode) {
      fetch('/api/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
    }
  }, [editMode]);

  // Fetch suppliers
  useEffect(() => {
    fetch('/api/suppliers').then((r) => r.json()).then((j) => setSuppliers((j.data ?? []).map((s: { id: string; name: string; firm_id: string }) => ({ id: s.id, name: s.name, firm_id: s.firm_id })))).catch(console.error);
  }, [refreshKey]);

  const saveEdit = async () => {
    if (!previewInvoice || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/invoices/${previewInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) { setEditMode(false); setEditData(null); setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const markAsReviewed = async (id: string, glAccountId?: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed', ...(glAccountId && { gl_account_id: glAccountId }) }),
      });
      if (res.ok) {
        refresh();
        if (previewInvoice) {
          const glMatch = glAccountId ? glAccounts.find(a => a.id === glAccountId) : null;
          setPreviewInvoice({
            ...previewInvoice,
            status: 'reviewed',
            ...(glAccountId ? { gl_account_id: glAccountId, gl_account_label: glMatch ? `${glMatch.account_code} — ${glMatch.name}` : null } : {}),
          });
          if (glAccountId) setSelectedGlAccountId(glAccountId);
        }
      }
    } catch (e) { console.error(e); }
  };

  const confirmSupplier = async (invoiceId: string, supplierId: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, supplier_link_status: 'confirmed' }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  const createAndAssignSupplier = async () => {
    if (!previewInvoice || !newSupplierName.trim()) return;
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim(), firm_id: previewInvoice.firm_id }),
      });
      const j = await res.json();
      if (j.data?.id) {
        await confirmSupplier(previewInvoice.id, j.data.id);
        setCreatingSupplier(false);
        setNewSupplierName('');
      }
    } catch (e) { console.error(e); }
  };

  // Firms
  const [firms, setFirms] = useState<FirmOption[]>([]);
  const [firmFilter, setFirmFilter] = useState('');

  // Filters
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';
  const initialPayment = searchParams.get('paymentStatus') ?? '';

  const [dateRange,       setDateRange]      = useState(initialStatus || initialPayment ? '' : 'this_month');
  const [customFrom,      setCustomFrom]     = useState('');
  const [customTo,        setCustomTo]       = useState('');
  const [statusFilter,    setStatusFilter]   = useState(initialStatus);
  const [paymentFilter,   setPaymentFilter]  = useState(initialPayment);
  const [search,          setSearch]         = useState('');

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

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

  // Load invoices
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (firmFilter)    p.set('firmId',        firmFilter);
    if (from)          p.set('dateFrom',      from);
    if (to)            p.set('dateTo',        to);
    if (statusFilter)  p.set('status',        statusFilter);
    if (paymentFilter) p.set('paymentStatus', paymentFilter);
    if (search)        p.set('search',        search);
    if (takeLimit)     p.set('take',          String(takeLimit));

    fetch(`/api/invoices?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setInvoices(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmFilter, dateRange, customFrom, customTo, statusFilter, paymentFilter, search, refreshKey, takeLimit]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const { sorted: sortedInvoices, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(invoices, 'issue_date', 'desc');
  useEffect(() => { setPage(0); }, [sortField, sortDir]);
  const pagedInvoices = sortedInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedInvoices.length / PAGE_SIZE);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="flex-shrink-0 bg-white">
          <div className="h-16 flex items-center justify-between px-6">
            <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Invoices</h1>
            <p className="text-[#8E9196] text-xs">
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex px-6 gap-0">
            <button onClick={() => setActiveTab('received')} className={`px-4 py-2 text-body-md font-medium border-b-2 transition-colors ${activeTab === 'received' ? 'border-[var(--accent)] text-[#191C1E]' : 'border-transparent text-[#8E9196] hover:text-[#434654]'}`}>
              Received
            </button>
            <button onClick={() => setActiveTab('issued')} className={`px-4 py-2 text-body-md font-medium border-b-2 transition-colors ${activeTab === 'issued' ? 'border-[var(--accent)] text-[#191C1E]' : 'border-transparent text-[#8E9196] hover:text-[#434654]'}`}>
              Issued
            </button>
          </div>
        </header>

        {activeTab === 'issued' ? (
          <main className="flex-1 overflow-hidden flex flex-col p-6 animate-in">
            <SalesInvoicesContent role="accountant" />
          </main>
        ) : (
        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <Select value={firmFilter} onChange={setFirmFilter}>
                <option value="">All Firms</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            )}

            <Select value={dateRange} onChange={setDateRange}>
              <option value="">All Time</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom</option>
            </Select>

            {dateRange === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input-field" />
                <span className="text-[#8E9196] text-sm">–</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input-field" />
              </>
            )}

            <Select value={statusFilter} onChange={setStatusFilter}>
              <option value="">All Status</option>
              <option value="pending_review">Pending Review</option>
              <option value="reviewed">Reviewed</option>
            </Select>

            <Select value={paymentFilter} onChange={setPaymentFilter}>
              <option value="">All Payments</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partial</option>
              <option value="paid">Paid</option>
            </Select>

            <input
              type="text"
              placeholder="Search vendor or invoice #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[210px]"
            />

            <div className="ml-auto">
              <button
                onClick={() => setShowNewInvoice(true)}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold"
              >
                + Submit New Invoice
              </button>
            </div>
          </div>

          {/* ── Load More ─────────────────────────────────── */}
          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={invoices.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Invoice Table ────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto bg-white rounded-lg">
            {loading ? (
              <div className="text-center text-sm text-[#8E9196] py-12">Loading...</div>
            ) : invoices.length === 0 ? (
              <div className="text-center text-sm text-[#8E9196] py-12">No invoices found for the selected filters.</div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('issue_date')}>Issue Date{sortIndicator('issue_date')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('vendor_name_raw')}>Vendor{sortIndicator('vendor_name_raw')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('invoice_number')}>Invoice #{sortIndicator('invoice_number')}</th>
                      {!firmFilter && <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('due_date')}>Due Date{sortIndicator('due_date')}</th>
                      <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('total_amount')}>Amount (RM){sortIndicator('total_amount')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('supplier_link_status')}>Supplier{sortIndicator('supplier_link_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => setPreviewInvoice(inv)}
                        className="text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50"
                      >
                        <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(inv.issue_date)}</td>
                        <td className="px-3 py-3 text-[#191C1E] font-medium">{inv.vendor_name_raw}</td>
                        <td className="px-3 py-3 text-[#434654]">{inv.invoice_number ?? '-'}</td>
                        {!firmFilter && <td className="px-3 py-3 text-[#434654]">{inv.firm_name}</td>}
                        <td className="px-3 py-3 text-[#434654] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                        <td className="px-3 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                        <td className="px-3 py-3"><StatusCell value={inv.status} /></td>
                        <td className="px-3 py-3"><PaymentCell value={inv.payment_status} /></td>
                        <td className="px-3 py-3"><LinkCell value={inv.supplier_link_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                    <p className="text-body-sm text-[#8E9196]">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedInvoices.length)} of {sortedInvoices.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                      <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </main>
        )}
      </div>

      {/* ═══ SUBMIT NEW INVOICE MODAL ═══ */}
      {showNewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50" onClick={() => setShowNewInvoice(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewInvoice(false)}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
                <h2 className="text-white font-semibold text-sm">Submit New Invoice</h2>
                <button onClick={() => setShowNewInvoice(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>

              <div className="p-5 space-y-4">
                {newInvError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{newInvError}</p>}

                <div>
                  <label className="input-label">Firm *</label>
                  <select value={newInv.firm_id} onChange={(e) => setNewInv({ ...newInv, firm_id: e.target.value })} className="input-field w-full">
                    <option value="">Select firm</option>
                    {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                <div className="relative">
                  <label className="input-label">Vendor Name *</label>
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
                    className="input-field w-full"
                    placeholder="Type or select existing supplier"
                    autoComplete="off"
                  />
                  {newInv.supplier_id && (
                    <span className="absolute right-3 top-[calc(50%+4px)] badge-green text-label-sm">Linked</span>
                  )}
                  {vendorDropdownOpen && newInv.vendor_name.length >= 1 && (() => {
                    const q = newInv.vendor_name.toLowerCase();
                    const firmSuppliers = newInv.firm_id ? suppliers.filter((s) => s.firm_id === newInv.firm_id) : suppliers;
                    const filtered = firmSuppliers.filter((s) => s.name.toLowerCase().includes(q));
                    if (filtered.length === 0) return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                        <p className="text-xs text-[#8E9196]">No matching suppliers — a new one will be created</p>
                      </div>
                    );
                    return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filtered.slice(0, 8).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewInv({ ...newInv, vendor_name: s.name, supplier_id: s.id });
                              setVendorDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="input-label">Invoice Number</label>
                  <input type="text" value={newInv.invoice_number} onChange={(e) => setNewInv({ ...newInv, invoice_number: e.target.value })} className="input-field w-full" placeholder="Optional" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">Issue Date *</label>
                    <input type="date" value={newInv.issue_date} onChange={(e) => setNewInv({ ...newInv, issue_date: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Due Date</label>
                    <input type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} className="input-field w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">Total Amount (RM) *</label>
                    <input type="number" step="0.01" value={newInv.total_amount} onChange={(e) => setNewInv({ ...newInv, total_amount: e.target.value })} className="input-field w-full" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="input-label">Payment Terms</label>
                    <input type="text" value={newInv.payment_terms} onChange={(e) => setNewInv({ ...newInv, payment_terms: e.target.value })} className="input-field w-full" placeholder="e.g. Net 30" />
                  </div>
                </div>

                <div>
                  <label className="input-label">Category *</label>
                  <select value={newInv.category_id} onChange={(e) => setNewInv({ ...newInv, category_id: e.target.value })} className="input-field w-full">
                    <option value="">Select category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="input-label">Invoice Image</label>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleInvFileChange}
                    className="input-field w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-[#434654] hover:file:bg-gray-200"
                  />
                  {ocrScanning && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scanning document... fields will auto-fill shortly
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 px-5 py-4 border-t">
                <button
                  onClick={submitNewInvoice}
                  disabled={newInvSubmitting || ocrScanning}
                  className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ocrScanning ? 'Scanning...' : newInvSubmitting ? 'Submitting...' : 'Submit Invoice'}
                </button>
                <button
                  onClick={() => setShowNewInvoice(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ INVOICE PREVIEW PANEL ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-64 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image available</div>
              )}

              {editMode && editData ? (
                <div className="space-y-3">
                  <div>
                    <label className="input-label">Vendor</label>
                    <input type="text" value={editData.vendor_name_raw} onChange={(e) => setEditData({ ...editData, vendor_name_raw: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Invoice Number</label>
                    <input type="text" value={editData.invoice_number} onChange={(e) => setEditData({ ...editData, invoice_number: e.target.value })} className="input-field w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="input-label">Issue Date</label>
                      <input type="date" value={editData.issue_date} onChange={(e) => setEditData({ ...editData, issue_date: e.target.value })} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="input-label">Due Date</label>
                      <input type="date" value={editData.due_date} onChange={(e) => setEditData({ ...editData, due_date: e.target.value })} className="input-field w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="input-label">Payment Terms</label>
                    <input type="text" value={editData.payment_terms} onChange={(e) => setEditData({ ...editData, payment_terms: e.target.value })} className="input-field w-full" placeholder="e.g. Net 30" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="input-label">Subtotal</label>
                      <input type="number" step="0.01" value={editData.subtotal} onChange={(e) => setEditData({ ...editData, subtotal: e.target.value })} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="input-label">Tax</label>
                      <input type="number" step="0.01" value={editData.tax_amount} onChange={(e) => setEditData({ ...editData, tax_amount: e.target.value })} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="input-label">Total</label>
                      <input type="number" step="0.01" value={editData.total_amount} onChange={(e) => setEditData({ ...editData, total_amount: e.target.value })} className="input-field w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="input-label">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-field w-full">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Supplier Account</label>
                    <select
                      value={editData.supplier_id}
                      onChange={(e) => setEditData({ ...editData, supplier_id: e.target.value })}
                      className="input-field w-full"
                    >
                      <option value="">No supplier assigned</option>
                      {suppliers.filter((s) => s.firm_id === previewInvoice.firm_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-3">
                    <Field label="Vendor"        value={previewInvoice.vendor_name_raw} />
                    <Field label="Invoice No."   value={previewInvoice.invoice_number} />
                    <Field label="Issue Date"    value={formatDate(previewInvoice.issue_date)} />
                    <Field label="Due Date"      value={previewInvoice.due_date ? formatDate(previewInvoice.due_date) : null} />
                    <Field label="Payment Terms" value={previewInvoice.payment_terms} />
                    <Field label="Subtotal"      value={previewInvoice.subtotal ? formatRM(previewInvoice.subtotal) : null} />
                    <Field label="Tax"           value={previewInvoice.tax_amount ? formatRM(previewInvoice.tax_amount) : null} />
                    <Field label="Total Amount"  value={formatRM(previewInvoice.total_amount)} />
                    <Field label="Amount Paid"   value={formatRM(previewInvoice.amount_paid)} />
                    <Field label="Category"      value={previewInvoice.category_name} />
                    <Field label="Uploaded By"   value={previewInvoice.uploader_name} />
                    <Field label="Firm"          value={previewInvoice.firm_name} />
                  </dl>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                  </div>

                  {/* Supplier link */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Supplier Account</span>
                      {(() => {
                        const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                        return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                      })()}
                    </div>
                    <p className="text-sm font-medium text-[#191C1E]">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
                    {previewInvoice.supplier_link_status !== 'confirmed' && (
                      <div className="flex gap-2 pt-1">
                        {previewInvoice.supplier_id && (
                          <button
                            onClick={() => confirmSupplier(previewInvoice.id, previewInvoice.supplier_id!)}
                            className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-opacity hover:opacity-85"
                            style={{ backgroundColor: '#22C55E' }}
                          >
                            Confirm
                          </button>
                        )}
                        <select
                          className="input-field text-xs"
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
                          {suppliers.filter((s) => s.firm_id === previewInvoice.firm_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          <option value="__new__">+ Create new supplier</option>
                        </select>
                        {creatingSupplier && (
                          <div className="flex gap-2 mt-2">
                            <input
                              type="text"
                              value={newSupplierName}
                              onChange={(e) => setNewSupplierName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') createAndAssignSupplier(); }}
                              className="input-field flex-1 text-xs"
                              placeholder="Supplier name"
                            />
                            <button onClick={createAndAssignSupplier} className="text-xs px-3 py-1.5 rounded-md font-medium text-white transition-opacity hover:opacity-85" style={{ backgroundColor: '#22C55E' }}>
                              Create
                            </button>
                            <button onClick={() => setCreatingSupplier(false)} className="text-xs px-2 py-1.5 rounded-md font-medium text-[#434654] hover:text-[#434654] border border-gray-200">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-label-sm text-[#8E9196] uppercase tracking-wide font-medium">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewInvoice.confidence === 'HIGH' ? 'text-green-600' :
                      previewInvoice.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    }`}>{previewInvoice.confidence}</span>
                  </div>

                  {previewInvoice.file_url && (
                    <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                      View full document &rarr;
                    </a>
                  )}
                </>
              )}
            </div>

            {/* GL Account Assignment */}
            {!editMode && glAccounts.length > 0 && (
              <div className="px-5 pb-2">
                <label className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide block mb-1">GL Account</label>
                {previewInvoice.status === 'reviewed' ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-[#F5F6F8] rounded-lg border border-gray-200">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F6F3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                    </svg>
                    <span className="text-sm font-medium text-[#191C1E]">{previewInvoice.gl_account_label ?? 'Not assigned'}</span>
                  </div>
                ) : (
                  <select
                    value={selectedGlAccountId}
                    onChange={(e) => setSelectedGlAccountId(e.target.value)}
                    className="input-field w-full text-sm"
                  >
                    <option value="">Select GL Account</option>
                    {glAccounts.filter(a => a.account_type === 'Expense').map(a => (
                      <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                    ))}
                    <option disabled>──────────</option>
                    {glAccounts.filter(a => a.account_type !== 'Expense').map(a => (
                      <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            <div className="p-4 flex-shrink-0 flex gap-3">
              {editMode ? (
                <>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </>
              ) : (
                <>
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
                    className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold"
                  >
                    Edit
                  </button>
                  {previewInvoice.status === 'reviewed' ? (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/invoices/${previewInvoice.id}`, {
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
                      className="btn-reject flex-1 py-2 rounded-lg text-sm"
                    >
                      Revert to Pending
                    </button>
                  ) : (
                    <button
                      onClick={() => markAsReviewed(previewInvoice.id, selectedGlAccountId || undefined)}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
                      style={{ backgroundColor: 'var(--sidebar)' }}
                    >
                      Mark as Reviewed
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          </div>
        </>
      )}

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
