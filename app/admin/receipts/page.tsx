'use client';

import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect, useRef, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  receipt_date: string;
  merchant: string;
  category_id: string;
  category_name: string;
  amount: string;
  approval: 'pending_approval' | 'approved' | 'not_approved';
  receipt_number: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  description: string | null;
}

interface Category {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',  cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  approved:         { label: 'Approved', cls: 'bg-green-100 text-green-800 border border-green-200' },
  not_approved:     { label: 'Rejected', cls: 'bg-red-100   text-red-800   border border-red-200'   },
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

function ApprovalCell({ value }: { value: string }) {
  const cfg = APPROVAL_CFG[value];
  if (!cfg) return null;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function EditCell({ data, context }: { data: ReceiptRow; context: { openEdit: (r: ReceiptRow) => void } }) {
  return (
    <button
      onClick={() => context.openEdit(data)}
      className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
      title="Edit receipt"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    </button>
  );
}

function PreviewCell({ data, context }: { data: ReceiptRow; context: { openPreview: (r: ReceiptRow) => void } }) {
  return (
    <button
      onClick={() => context.openPreview(data)}
      className="flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
      title="View receipt"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard'   },
  { label: 'Claims',     href: '/admin/claims'      },
  { label: 'Receipts',   href: '/admin/receipts'    },
  { label: 'Employees',  href: '/admin/employees'   },
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

export default function AdminReceiptsPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // Data
  const [receipts, setReceipts]       = useState<ReceiptRow[]>([]);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshKey, setRefreshKey]   = useState(0);

  // UI
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRow | null>(null);

  // Edit modal
  const [editReceipt, setEditReceipt]     = useState<ReceiptRow | null>(null);
  const [editDate, setEditDate]           = useState('');
  const [editMerchant, setEditMerchant]   = useState('');
  const [editAmount, setEditAmount]       = useState('');
  const [editCategory, setEditCategory]   = useState('');
  const [editReceiptNo, setEditReceiptNo] = useState('');
  const [editSaving, setEditSaving]       = useState(false);
  const [editError, setEditError]         = useState('');

  // Filters
  const [dateRange,       setDateRange]      = useState('this_month');
  const [customFrom,      setCustomFrom]     = useState('');
  const [customTo,        setCustomTo]       = useState('');
  const [approvalFilter,  setApprovalFilter] = useState('');
  const [search,          setSearch]         = useState('');

  const gridApiRef = useRef<GridApi<ReceiptRow> | null>(null);

  // Load categories (once)
  useEffect(() => {
    fetch('/api/admin/categories')
      .then((r) => r.json())
      .then((j) => { if (j.data) setCategories(j.data); })
      .catch(console.error);
  }, []);

  // Load receipts
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (from)           p.set('dateFrom',  from);
    if (to)             p.set('dateTo',    to);
    if (approvalFilter) p.set('approval',  approvalFilter);
    if (search)         p.set('search',    search);

    fetch(`/api/admin/receipts?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setReceipts(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [dateRange, customFrom, customTo, approvalFilter, search, refreshKey]);

  // Column definitions
  const columnDefs = useMemo<ColDef<ReceiptRow>[]>(() => [
    {
      field: 'receipt_date',
      headerName: 'Date',
      width: 110,
      sort: 'desc',
      valueFormatter: (p) => formatDate(p.value),
      comparator: (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    },
    { field: 'merchant',      headerName: 'Merchant',   flex: 1, minWidth: 120 },
    { field: 'category_name', headerName: 'Category',   width: 130             },
    {
      field: 'amount',
      headerName: 'Amount (RM)',
      width: 125,
      type: 'rightAligned',
      valueFormatter: (p) => p.value != null ? Number(p.value).toFixed(2) : '',
      comparator: (a, b) => Number(a) - Number(b),
    },
    { field: 'approval', headerName: 'Approval', width: 125, cellRenderer: ApprovalCell },
    {
      headerName: '',
      width: 56, minWidth: 56, maxWidth: 56,
      sortable: false, resizable: false,
      suppressHeaderMenuButton: true,
      cellRenderer: EditCell,
    },
    {
      headerName: '',
      width: 56, minWidth: 56, maxWidth: 56,
      sortable: false, resizable: false,
      suppressHeaderMenuButton: true,
      cellRenderer: PreviewCell,
    },
  ], []);

  const gridContext = useMemo(() => ({
    openEdit: (r: ReceiptRow) => openEditModal(r),
    openPreview: setPreviewReceipt,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const onGridReady = (e: GridReadyEvent<ReceiptRow>) => {
    gridApiRef.current = e.api;
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const openEditModal = (r: ReceiptRow) => {
    setEditReceipt(r);
    // Format date for input (YYYY-MM-DD)
    const d = new Date(r.receipt_date);
    setEditDate(d.toISOString().split('T')[0]);
    setEditMerchant(r.merchant);
    setEditAmount(r.amount);
    setEditCategory(r.category_id);
    setEditReceiptNo(r.receipt_number ?? '');
    setEditError('');
    setEditSaving(false);
  };

  const submitEdit = async () => {
    if (!editReceipt) return;
    if (!editDate || !editMerchant.trim() || !editAmount || !editCategory) {
      setEditError('Date, Merchant, Amount, and Category are required.');
      return;
    }

    setEditSaving(true);
    setEditError('');

    try {
      const res = await fetch(`/api/admin/receipts/${editReceipt.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt_date: editDate,
          merchant: editMerchant.trim(),
          amount: editAmount,
          category_id: editCategory,
          receipt_number: editReceiptNo.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        setEditError(json.error || 'Failed to update receipt');
        setEditSaving(false);
        return;
      }

      setEditReceipt(null);
      refresh();
    } catch {
      setEditError('Network error. Please try again.');
      setEditSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#152237' }}>
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <span className="text-white font-bold text-xl tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center h-10 px-6 text-sm transition-colors ${
                  active ? 'text-white bg-white/10' : 'text-white/65 hover:text-white hover:bg-white/5'
                }`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r"
                    style={{ backgroundColor: '#A60201' }}
                  />
                )}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-white text-sm font-medium truncate">{session?.user?.name ?? '—'}</p>
          <p className="text-white/50 text-xs mt-0.5 capitalize">{session?.user?.role ?? 'admin'}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs text-white/60 hover:text-white py-1.5 px-3 rounded border border-white/20 hover:border-white/40 transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center px-6" style={{ backgroundColor: '#152237' }}>
          <h1 className="text-white font-semibold text-lg">Receipts</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 bg-white">

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
                  className={inputCls}
                />
                <span className="text-gray-400 text-sm">–</span>
                <input
                  type="date" value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className={inputCls}
                />
              </>
            )}

            <Select value={approvalFilter} onChange={setApprovalFilter}>
              <option value="">All</option>
              <option value="pending_approval">Pending</option>
              <option value="approved">Approved</option>
              <option value="not_approved">Rejected</option>
            </Select>

            <input
              type="text"
              placeholder="Search merchant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} min-w-[210px]`}
            />
          </div>

          {/* ── AG Grid ───────────────────────────────────── */}
          <div className="flex-1 min-h-0 ag-theme-alpine overflow-hidden rounded-md border border-gray-200" style={{ height: '100%' }}>
            <AgGridReact<ReceiptRow>
              onGridReady={onGridReady}
              rowData={receipts}
              columnDefs={columnDefs}
              loading={loading}
              pagination
              paginationPageSize={50}
              context={gridContext}
              overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:14px'>No receipts found for the selected filters.</span>"
            />
          </div>

        </main>
      </div>

      {/* ═══════════════════════ EDIT MODAL ═══════════════════════ */}
      {editReceipt && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Edit Receipt</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Update receipt details below.</p>

            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-700">Editing this receipt will reset its approval status to Pending.</p>
            </div>

            {editError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{editError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt Date *</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Merchant *</label>
                <input
                  type="text"
                  value={editMerchant}
                  onChange={(e) => setEditMerchant(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="Merchant name"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Category *</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={`${inputCls} w-full`}
                >
                  <option value="">Select a category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt Number</label>
                <input
                  type="text"
                  value={editReceiptNo}
                  onChange={(e) => setEditReceiptNo(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitEdit}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditReceipt(null)}
                disabled={editSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ RECEIPT PREVIEW ═══════════════════════ */}
      {previewReceipt && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPreviewReceipt(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Receipt Preview</h2>
              <button onClick={() => setPreviewReceipt(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewReceipt.thumbnail_url ? (
                <img
                  src={previewReceipt.thumbnail_url}
                  alt="Receipt"
                  className="w-full max-h-52 object-contain rounded-lg border border-gray-200"
                />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
                  No image available
                </div>
              )}

              <dl className="space-y-3">
                <Field label="Date"        value={formatDate(previewReceipt.receipt_date)} />
                <Field label="Merchant"    value={previewReceipt.merchant} />
                <Field label="Category"    value={previewReceipt.category_name} />
                <Field label="Amount"      value={formatRM(previewReceipt.amount)} />
                <Field label="Receipt No." value={previewReceipt.receipt_number} />
                <Field label="Description" value={previewReceipt.description} />
              </dl>

              <div className="flex flex-wrap gap-2 pt-1">
                {(() => {
                  const cfg = APPROVAL_CFG[previewReceipt.approval];
                  return cfg ? (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  ) : null;
                })()}
              </div>

              {previewReceipt.file_url && (
                <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── Small reusable sub-components ────────────────────────────────────────────

const inputCls = 'text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#152237]/20';

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {children}
    </select>
  );
}
