'use client';

import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { Suspense, useState, useEffect, useRef, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';

ModuleRegistry.registerModules([AllCommunityModule]);

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/accountant/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/accountant/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/accountant/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/accountant/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Clients',    href: '/accountant/clients',    icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/accountant/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/accountant/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Preview field helper ─────────────────────────────────────────────────────

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

export default function AccountantInvoicesPageWrapper() {
  return <Suspense><AccountantInvoicesPage /></Suspense>;
}

function AccountantInvoicesPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // Data
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // UI
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);

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
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    total_amount: '',
    category_id: '',
    payment_terms: '',
  });
  const [newInvFile, setNewInvFile] = useState<File | null>(null);

  // Fetch categories when modal opens
  useEffect(() => {
    if (showNewInvoice) {
      fetch('/api/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
    }
  }, [showNewInvoice]);

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
      setNewInv({ firm_id: '', vendor_name: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', total_amount: '', category_id: '', payment_terms: '' });
      setNewInvFile(null);
      refresh();
    } catch (e) { console.error(e); setNewInvError('Network error'); }
    finally { setNewInvSubmitting(false); }
  };

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); setCreatingSupplier(false); }, [previewInvoice]);

  // Fetch categories for edit
  useEffect(() => {
    if (editMode) {
      fetch('/api/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
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

  const markAsReviewed = async (id: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
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

  const gridApiRef = useRef<GridApi<InvoiceRow> | null>(null);

  // Load firms for filter
  useEffect(() => {
    fetch('/api/firms/details')
      .then((r) => r.json())
      .then((j) => setFirms((j.data ?? []).map((f: FirmOption) => ({ id: f.id, name: f.name }))))
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

    fetch(`/api/invoices?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setInvoices(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmFilter, dateRange, customFrom, customTo, statusFilter, paymentFilter, search, refreshKey]);

  // Column definitions
  const columnDefs = useMemo<ColDef<InvoiceRow>[]>(() => [
    {
      field: 'issue_date',
      headerName: 'Issue Date',
      width: 110,
      sort: 'desc',
      valueFormatter: (p) => formatDate(p.value),
      comparator: (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    },
    { field: 'vendor_name_raw', headerName: 'Vendor',     flex: 1, minWidth: 140 },
    { field: 'invoice_number',  headerName: 'Invoice #',  width: 130 },
    { field: 'firm_name',       headerName: 'Firm',        width: 150, hide: !!firmFilter },
    {
      field: 'due_date',
      headerName: 'Due Date',
      width: 110,
      valueFormatter: (p) => p.value ? formatDate(p.value) : '-',
    },
    {
      field: 'total_amount',
      headerName: 'Amount (RM)',
      width: 125,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? Number(p.value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      comparator: (a, b) => Number(a) - Number(b),
    },
    { field: 'status',              headerName: 'Status',   width: 140, cellRenderer: StatusCell },
    { field: 'payment_status',      headerName: 'Payment',  width: 110, cellRenderer: PaymentCell },
    { field: 'supplier_link_status', headerName: 'Supplier', width: 120, cellRenderer: LinkCell },
  ], [firmFilter]);

  const onGridReady = (e: GridReadyEvent<InvoiceRow>) => { gridApiRef.current = e.api; };
  const refresh = () => setRefreshKey((k) => k + 1);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ backgroundColor: '#152237' }}>
        <div className="h-14 flex items-center gap-2 px-5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#A60201' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white font-bold text-base tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map(({ label, href, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  active ? 'text-white bg-white/[0.1]' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-bold">
              {(session?.user?.name ?? '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '—'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left">
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Invoices</h1>
          <p className="text-gray-400 text-xs">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Select value={firmFilter} onChange={setFirmFilter}>
              <option value="">All Firms</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>

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
                <span className="text-gray-400 text-sm">–</span>
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
                className="px-4 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                + Submit New Invoice
              </button>
            </div>
          </div>

          {/* ── AG Grid ───────────────────────────────────── */}
          <div className="flex-1 min-h-0 ag-theme-alpine overflow-hidden rounded-md border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: '100%' }}>
            <AgGridReact<InvoiceRow>
              onGridReady={onGridReady}
              rowData={invoices}
              columnDefs={columnDefs}
              loading={loading}
              pagination
              paginationPageSize={50}
              onRowClicked={(e) => { if (e.data) setPreviewInvoice(e.data); }}
              overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:14px'>No invoices found for the selected filters.</span>"
            />
          </div>

        </main>
      </div>

      {/* ═══ SUBMIT NEW INVOICE MODAL ═══ */}
      {showNewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowNewInvoice(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ backgroundColor: '#152237' }}>
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

                <div>
                  <label className="input-label">Vendor Name *</label>
                  <input type="text" value={newInv.vendor_name} onChange={(e) => setNewInv({ ...newInv, vendor_name: e.target.value })} className="input-field w-full" placeholder="e.g. ABC Supplies Sdn Bhd" />
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
                    onChange={(e) => setNewInvFile(e.target.files?.[0] ?? null)}
                    className="input-field w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                  />
                </div>
              </div>

              <div className="flex gap-3 px-5 py-4 border-t">
                <button
                  onClick={submitNewInvoice}
                  disabled={newInvSubmitting}
                  className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                  style={{ backgroundColor: '#A60201' }}
                >
                  {newInvSubmitting ? 'Submitting...' : 'Submit Invoice'}
                </button>
                <button
                  onClick={() => setShowNewInvoice(false)}
                  className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
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
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image available</div>
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
                  <dl className="space-y-3">
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
                  <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Supplier Account</span>
                      {(() => {
                        const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                        return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                      })()}
                    </div>
                    <p className="text-sm font-medium text-gray-900">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
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
                            <button onClick={() => setCreatingSupplier(false)} className="text-xs px-2 py-1.5 rounded-md font-medium text-gray-500 hover:text-gray-700 border border-gray-200">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Confidence</span>
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

            <div className="p-4 border-t flex-shrink-0 flex gap-3">
              {editMode ? (
                <>
                  <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85" style={{ backgroundColor: '#A60201' }}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
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
                    className="flex-1 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-85"
                    style={{ backgroundColor: '#A60201' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => markAsReviewed(previewInvoice.id)}
                    disabled={previewInvoice.status === 'reviewed'}
                    className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                    style={{ backgroundColor: '#152237' }}
                  >
                    Mark as Reviewed
                  </button>
                </>
              )}
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
