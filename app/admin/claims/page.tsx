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

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_name: string;
  merchant: string;
  description: string | null;
  category_name: string;
  category_id: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  payment_status: 'unpaid' | 'paid';
  rejection_reason: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  receipt_number: string | null;
  type: 'claim' | 'receipt';
  linked_payment_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'badge-amber' },
  reviewed:       { label: 'Reviewed',       cls: 'badge-blue'  },
};

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',  cls: 'badge-amber' },
  approved:         { label: 'Approved', cls: 'badge-green' },
  not_approved:     { label: 'Rejected', cls: 'badge-red'   },
};

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Unpaid', cls: 'badge-gray'   },
  paid:   { label: 'Paid',   cls: 'badge-purple' },
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
  if (!cfg) return null;
  return <span className={cfg.cls}>{cfg.label}</span>;
}

function ApprovalCell({ value }: { value: string }) {
  const cfg = APPROVAL_CFG[value];
  if (!cfg) return null;
  return <span className={cfg.cls}>{cfg.label}</span>;
}

function LinkedCell({ value }: { value: number }) {
  return value > 0
    ? <span className="badge-green">Linked</span>
    : <span className="badge-gray">Unlinked</span>;
}

function PaymentStatusCell({ value }: { value: string }) {
  const cfg = PAYMENT_CFG[value];
  if (!cfg) return null;
  return <span className={cfg.cls}>{cfg.label}</span>;
}


// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/admin/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },

  { label: 'Invoices',   href: '/admin/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/admin/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/admin/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/admin/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
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

export default function AdminClaimsPageWrapper() {
  return <Suspense><AdminClaimsPage /></Suspense>;
}

function AdminClaimsPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // Tab
  const [claimTab, setClaimTab] = useState<'claim' | 'receipt'>('claim');
  const [claimCount, setClaimCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);

  // Data
  const [claims, setClaims]   = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // UI
  const [selectedRows, setSelectedRows] = useState<ClaimRow[]>([]);
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{
    claim_date: string;
    merchant: string;
    amount: string;
    category_id: string;
    receipt_number: string;
    description: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editCategories, setEditCategories] = useState<{ id: string; name: string }[]>([]);

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  // Fetch categories for edit dropdown
  useEffect(() => {
    if (editMode) {
      fetch('/api/admin/categories')
        .then((r) => r.json())
        .then((j) => setEditCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [editMode]);

  const saveEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/claims/${previewClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditMode(false);
        setEditData(null);
        refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEditSaving(false);
    }
  };

  // Read initial filters from URL query params (e.g. ?status=pending_review)
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';

  // Filters
  const [dateRange,     setDateRange]    = useState(initialStatus ? '' : 'this_month');
  const [customFrom,    setCustomFrom]   = useState('');
  const [customTo,      setCustomTo]     = useState('');
  const [statusFilter,  setStatusFilter] = useState(initialStatus);
  const [search,        setSearch]       = useState('');

  const gridApiRef = useRef<GridApi<ClaimRow> | null>(null);

  // Load claims
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    p.set('type', claimTab);
    if (from)         p.set('dateFrom', from);
    if (to)           p.set('dateTo',   to);
    if (statusFilter) p.set('status',   statusFilter);
    if (search)       p.set('search',   search);

    fetch(`/api/admin/claims?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setClaims(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [claimTab, dateRange, customFrom, customTo, statusFilter, search, refreshKey]);

  // Fetch tab counts
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/claims?type=claim').then((r) => r.json()),
      fetch('/api/admin/claims?type=receipt').then((r) => r.json()),
    ]).then(([claimJ, receiptJ]) => {
      setClaimCount(claimJ.meta?.count ?? 0);
      setReceiptCount(receiptJ.meta?.count ?? 0);
    }).catch(console.error);
  }, [refreshKey]);

  // Column definitions
  const columnDefs = useMemo<ColDef<ClaimRow>[]>(() => {
    const checkboxCol: ColDef<ClaimRow> = {
      checkboxSelection: true,
      headerCheckboxSelection: true,
      width: 48, minWidth: 48, maxWidth: 48,
      pinned: 'left',
      resizable: false,
      sortable: false,
      suppressHeaderMenuButton: true,
    };
    const dateCol: ColDef<ClaimRow> = {
      field: 'claim_date',
      headerName: 'Date',
      width: 110,
      sort: 'desc',
      valueFormatter: (p) => formatDate(p.value),
      comparator: (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    };
    const merchantCol: ColDef<ClaimRow> = { field: 'merchant', headerName: 'Merchant', flex: 1, minWidth: 120 };
    const categoryCol: ColDef<ClaimRow> = { field: 'category_name', headerName: 'Category', width: 110 };
    const amountCol: ColDef<ClaimRow> = {
      field: 'amount',
      headerName: 'Amount (RM)',
      width: 125,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? Number(p.value).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
      comparator: (a, b) => Number(a) - Number(b),
    };
    const statusCol: ColDef<ClaimRow> = { field: 'status', headerName: 'Status', width: 145, cellRenderer: StatusCell };

    if (claimTab === 'claim') {
      return [
        checkboxCol, dateCol,
        { field: 'employee_name', headerName: 'Employee', flex: 1, minWidth: 120 },
        merchantCol, categoryCol, amountCol, statusCol,
        { field: 'approval', headerName: 'Approval', width: 125, cellRenderer: ApprovalCell },
      ];
    } else {
      return [
        checkboxCol, dateCol,
        merchantCol, categoryCol, amountCol, statusCol,
        { field: 'payment_status', headerName: 'Payment', width: 110, cellRenderer: PaymentStatusCell },
        { field: 'linked_payment_count', headerName: 'Linked', width: 110, cellRenderer: LinkedCell },
      ];
    }
  }, [claimTab]);

  const onGridReady = (e: GridReadyEvent<ClaimRow>) => {
    gridApiRef.current = e.api;
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const batchReview = async (claimIds: string[]) => {
    try {
      const res = await fetch('/api/admin/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds, action: 'review' }),
      });
      if (res.ok) {
        refresh();
        gridApiRef.current?.deselectAll();
        if (previewClaim && claimIds.includes(previewClaim.id)) setPreviewClaim(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

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
                  active
                    ? 'text-white bg-white/[0.1]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />
                )}
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
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Claims</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Tabs ─────────────────────────────────────── */}
          <div className="flex gap-1 flex-shrink-0">
            {([['claim', 'Employee Claims', claimCount], ['receipt', 'Receipts', receiptCount]] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => { setClaimTab(key); setPreviewClaim(null); gridApiRef.current?.deselectAll(); }}
                className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all ${
                  claimTab === key
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                style={claimTab === key ? { backgroundColor: '#152237' } : undefined}
              >
                {label}
                <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                  claimTab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              </button>
            ))}
          </div>

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Select value={dateRange} onChange={setDateRange}>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom</option>
            </Select>

            {dateRange === 'custom' && (
              <>
                <input
                  type="date" value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="input-field"
                />
                <span className="text-gray-400 text-sm">–</span>
                <input
                  type="date" value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="input-field"
                />
              </>
            )}

            <Select value={statusFilter} onChange={setStatusFilter}>
              <option value="">All Status</option>
              <option value="pending_review">Pending Review</option>
              <option value="reviewed">Reviewed</option>
            </Select>

            <input
              type="text"
              placeholder="Search merchant or employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[210px]"
            />
          </div>

          {/* ── AG Grid ───────────────────────────────────── */}
          <div className="flex-1 min-h-0 ag-theme-alpine overflow-hidden rounded-md border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" style={{ height: '100%' }}>
            <AgGridReact<ClaimRow>
              onGridReady={onGridReady}
              rowData={claims}
              columnDefs={columnDefs}
              loading={loading}
              pagination
              paginationPageSize={50}
              rowSelection="multiple"
              suppressRowClickSelection
              onSelectionChanged={(e) => setSelectedRows(e.api.getSelectedRows())}
              onRowClicked={(e) => { if (e.data) setPreviewClaim(e.data); }}
              overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:14px'>No claims found for the selected filters.</span>"
            />
          </div>

        </main>
      </div>

      {/* ═══ BATCH BAR ═══ */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl text-white" style={{ backgroundColor: '#152237' }}>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={() => batchReview(selectedRows.map((r) => r.id))}
            className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity hover:opacity-85"
            style={{ backgroundColor: '#A60201' }}
          >
            Mark as Reviewed
          </button>
          <button
            onClick={() => gridApiRef.current?.deselectAll()}
            className="text-sm text-white/55 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* ═══ RECEIPT PREVIEW ═══ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewClaim.thumbnail_url ? (
                <img
                  src={previewClaim.thumbnail_url}
                  alt="Receipt"
                  className="w-full max-h-52 object-contain rounded-lg border border-gray-200"
                />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
                  No image available
                </div>
              )}

              {editMode && editData ? (
                <div className="space-y-3">
                  <div>
                    <label className="input-label">Date</label>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Merchant</label>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Amount (RM)</label>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-field w-full">
                      {editCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Receipt Number</label>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="input-label">Description</label>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-field w-full" />
                  </div>
                  <Field label="Employee" value={previewClaim.employee_name} />
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                    Saving will reset status to Pending Review and approval to Pending.
                  </p>
                </div>
              ) : (
                <>
                  <dl className="space-y-3">
                    <Field label="Date"        value={formatDate(previewClaim.claim_date)} />
                    <Field label="Merchant"    value={previewClaim.merchant} />
                    <Field label="Employee"    value={previewClaim.employee_name} />
                    <Field label="Category"    value={previewClaim.category_name} />
                    <Field label="Amount"      value={formatRM(previewClaim.amount)} />
                    <Field label="Receipt No." value={previewClaim.receipt_number} />
                    <Field label="Description" value={previewClaim.description} />
                  </dl>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      STATUS_CFG[previewClaim.status],
                      APPROVAL_CFG[previewClaim.approval],
                      PAYMENT_CFG[previewClaim.payment_status],
                    ].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>
                        {cfg!.label}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH'   ? 'text-green-600' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    }`}>{previewClaim.confidence}</span>
                  </div>

                  {previewClaim.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-700">{previewClaim.rejection_reason}</p>
                    </div>
                  )}

                  {previewClaim.file_url && (
                    <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline block">
                      View full document &rarr;
                    </a>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t flex gap-3 flex-shrink-0">
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
                        claim_date: previewClaim.claim_date.split('T')[0],
                        merchant: previewClaim.merchant,
                        amount: previewClaim.amount,
                        category_id: previewClaim.category_id,
                        receipt_number: previewClaim.receipt_number ?? '',
                        description: previewClaim.description ?? '',
                      });
                    }}
                    className="flex-1 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-85"
                    style={{ backgroundColor: '#A60201' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => batchReview([previewClaim.id])}
                    disabled={previewClaim.status === 'reviewed'}
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
