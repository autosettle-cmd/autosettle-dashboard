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
  uploader_name: string;
  firm_name: string;
  firm_id: string;
  merchant: string;
  category_name: string;
  amount: string;
  approval: 'pending_approval' | 'approved' | 'not_approved';
  receipt_number: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  file_download_url: string | null;
}

interface Firm {
  id: string;
  name: string;
}

interface Stats {
  totalThisMonth: number;
  pendingApproval: number;
  approvedThisMonth: number;
  approvedAmountThisMonth: string;
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

function ActionCell({ data, context }: { data: ReceiptRow; context: { openPreview: (r: ReceiptRow) => void } }) {
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
  { label: 'Dashboard',  href: '/accountant/dashboard'   },
  { label: 'Claims',     href: '/accountant/claims'      },
  { label: 'Receipts',   href: '/accountant/receipts'    },
  { label: 'Clients',    href: '/accountant/clients'     },
  { label: 'Employees',  href: '/accountant/employees'   },
  { label: 'Categories', href: '/accountant/categories'  },
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

// ─── Stat card helper ─────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-semibold text-gray-900 mt-1">{value}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReceiptsPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // Data
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [firms, setFirms]       = useState<Firm[]>([]);
  const [stats, setStats]       = useState<Stats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // UI
  const [selectedRows, setSelectedRows]     = useState<ReceiptRow[]>([]);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptRow | null>(null);
  const [rejectModal, setRejectModal]       = useState({ open: false, receiptIds: [] as string[], reason: '' });

  // Filters
  const [firmId,         setFirmId]        = useState('');
  const [dateRange,      setDateRange]     = useState('this_month');
  const [customFrom,     setCustomFrom]    = useState('');
  const [customTo,       setCustomTo]      = useState('');
  const [approvalFilter, setApprovalFilter]= useState('');
  const [search,         setSearch]        = useState('');

  const gridApiRef = useRef<GridApi<ReceiptRow> | null>(null);

  // Load firms (once)
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => { if (j.data) setFirms(j.data); })
      .catch(console.error);
  }, []);

  // Load stats
  useEffect(() => {
    fetch('/api/receipts/stats')
      .then((r) => r.json())
      .then((j) => { if (j.data) setStats(j.data); })
      .catch(console.error);
  }, [refreshKey]);

  // Load receipts
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (firmId)        p.set('firmId',   firmId);
    if (from)          p.set('dateFrom', from);
    if (to)            p.set('dateTo',   to);
    if (approvalFilter) p.set('approval', approvalFilter);
    if (search)        p.set('search',   search);

    fetch(`/api/receipts?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setReceipts(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmId, dateRange, customFrom, customTo, approvalFilter, search, refreshKey]);

  // Toggle firm column visibility
  useEffect(() => {
    gridApiRef.current?.setColumnsVisible(['firm_name'], !firmId);
  }, [firmId]);

  // Column definitions
  const columnDefs = useMemo<ColDef<ReceiptRow>[]>(() => [
    {
      checkboxSelection: true,
      headerCheckboxSelection: true,
      width: 48, minWidth: 48, maxWidth: 48,
      pinned: 'left',
      resizable: false,
      sortable: false,
      suppressHeaderMenuButton: true,
    },
    {
      field: 'receipt_date',
      headerName: 'Date',
      width: 110,
      sort: 'desc',
      valueFormatter: (p) => formatDate(p.value),
      comparator: (a, b) => new Date(a).getTime() - new Date(b).getTime(),
    },
    { field: 'uploader_name', headerName: 'Uploaded By', flex: 1, minWidth: 120 },
    { field: 'firm_name',     headerName: 'Firm',        width: 160             },
    { field: 'merchant',      headerName: 'Merchant',    flex: 1, minWidth: 120 },
    { field: 'category_name', headerName: 'Category',    width: 110             },
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
      cellRenderer: ActionCell,
    },
  ], []);

  const gridContext = useMemo(() => ({ openPreview: setPreviewReceipt }), []);

  const onGridReady = (e: GridReadyEvent<ReceiptRow>) => {
    gridApiRef.current = e.api;
    e.api.setColumnsVisible(['firm_name'], !firmId);
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const batchAction = async (receiptIds: string[], action: 'approve' | 'reject', reason?: string) => {
    try {
      const res = await fetch('/api/receipts/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptIds, action, reason }),
      });
      if (res.ok) {
        refresh();
        gridApiRef.current?.deselectAll();
        if (previewReceipt && receiptIds.includes(previewReceipt.id)) setPreviewReceipt(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const confirmReject = async () => {
    if (!rejectModal.reason.trim()) return;
    await batchAction(rejectModal.receiptIds, 'reject', rejectModal.reason);
    setRejectModal({ open: false, receiptIds: [], reason: '' });
  };

  const exportCSV = () => {
    gridApiRef.current?.exportDataAsCsv({
      fileName: `receipts-${new Date().toISOString().split('T')[0]}.csv`,
    });
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
          <p className="text-white/50 text-xs mt-0.5 capitalize">{session?.user?.role ?? 'accountant'}</p>
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

          {/* ── Stats cards ──────────────────────────────── */}
          {stats && (
            <div className="grid grid-cols-4 gap-4 flex-shrink-0">
              <StatCard label="Total Receipts This Month" value={stats.totalThisMonth} />
              <StatCard label="Pending Approval" value={stats.pendingApproval} />
              <StatCard label="Approved This Month" value={stats.approvedThisMonth} />
              <StatCard label="Total Approved (RM)" value={formatRM(stats.approvedAmountThisMonth)} />
            </div>
          )}

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <Select value={firmId} onChange={setFirmId}>
              <option value="">All Firms</option>
              {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>

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
              <option value="">All Statuses</option>
              <option value="pending_approval">Pending</option>
              <option value="approved">Approved</option>
              <option value="not_approved">Not Approved</option>
            </Select>

            <input
              type="text"
              placeholder="Search merchant or uploader…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} min-w-[210px]`}
            />

            <button
              onClick={exportCSV}
              className="ml-auto text-sm px-4 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
            >
              Export CSV
            </button>
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
              rowSelection="multiple"
              suppressRowClickSelection
              onSelectionChanged={(e) => setSelectedRows(e.api.getSelectedRows())}
              context={gridContext}
              overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:14px'>No receipts found for the selected filters.</span>"
            />
          </div>

        </main>
      </div>

      {/* ═══════════════════════ BATCH BAR ═══════════════════════ */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl text-white" style={{ backgroundColor: '#152237' }}>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} receipt{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={() => batchAction(selectedRows.map((r) => r.id), 'approve')}
            className="text-sm px-4 py-1.5 rounded-full font-medium transition-opacity hover:opacity-85"
            style={{ backgroundColor: '#A60201' }}
          >
            Approve
          </button>
          <button
            onClick={() => setRejectModal({ open: true, receiptIds: selectedRows.map((r) => r.id), reason: '' })}
            className="text-sm px-4 py-1.5 rounded-full border border-white/35 font-medium hover:bg-white/10 transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() => gridApiRef.current?.deselectAll()}
            className="text-sm text-white/55 hover:text-white transition-colors"
          >
            Clear
          </button>
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
                <Field label="Uploaded By" value={previewReceipt.uploader_name} />
                <Field label="Firm"        value={previewReceipt.firm_name} />
                <Field label="Category"    value={previewReceipt.category_name} />
                <Field label="Amount"      value={formatRM(previewReceipt.amount)} />
                <Field label="Receipt No." value={previewReceipt.receipt_number} />
              </dl>

              <div className="flex flex-wrap gap-2 pt-1">
                {(() => {
                  const cfg = APPROVAL_CFG[previewReceipt.approval];
                  if (!cfg) return null;
                  return (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  );
                })()}
              </div>

              {previewReceipt.file_url && (
                <a href={previewReceipt.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>

            <div className="p-4 border-t flex gap-3 flex-shrink-0">
              <button
                onClick={() => batchAction([previewReceipt.id], 'approve')}
                disabled={previewReceipt.approval === 'approved'}
                className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                Approve
              </button>
              <button
                onClick={() => setRejectModal({ open: true, receiptIds: [previewReceipt.id], reason: '' })}
                disabled={previewReceipt.approval === 'not_approved'}
                className="flex-1 py-2 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ REJECT MODAL ═══════════════════════ */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Reject {rejectModal.receiptIds.length} Receipt{rejectModal.receiptIds.length !== 1 ? 's' : ''}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Please provide a reason for rejecting.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter rejection reason…"
              rows={4}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#152237]/20 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={confirmReject}
                disabled={!rejectModal.reason.trim()}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                Confirm Reject
              </button>
              <button
                onClick={() => setRejectModal({ open: false, receiptIds: [], reason: '' })}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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
