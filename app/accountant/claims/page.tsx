'use client';

import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import type { ColDef, GridApi, GridReadyEvent } from 'ag-grid-community';
import { AgGridReact } from 'ag-grid-react';
import { Suspense, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import Sidebar from '@/components/Sidebar';

ModuleRegistry.registerModules([AllCommunityModule]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_name: string;
  firm_name: string;
  firm_id: string;
  merchant: string;
  description: string | null;
  category_id: string;
  category_name: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  payment_status: 'unpaid' | 'paid';
  rejection_reason: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  receipt_number: string | null;
  type: 'claim' | 'receipt' | 'mileage';
  from_location?: string | null;
  to_location?: string | null;
  distance_km?: string | null;
  trip_purpose?: string | null;
  linked_payment_count: number;
  linked_payments: { payment_id: string; amount: string; payment_date: string; reference: string | null; supplier_name: string }[];
}

interface Firm {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'badge-amber' },
  reviewed:       { label: 'Reviewed',       cls: 'badge-blue'  },
};

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',      cls: 'badge-amber' },
  approved:         { label: 'Approved',     cls: 'badge-green' },
  not_approved:     { label: 'Rejected',     cls: 'badge-red'   },
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
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function ApprovalCell({ value }: { value: string }) {
  const cfg = APPROVAL_CFG[value];
  if (!cfg) return null;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

function LinkedCell({ value }: { value: number }) {
  return value > 0
    ? <span className="badge-green">Linked</span>
    : <span className="badge-gray">Unlinked</span>;
}

function PaymentStatusCell({ value }: { value: string }) {
  const cfg = PAYMENT_CFG[value];
  if (!cfg) return null;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Preview field helper ─────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClaimsPageWrapper() {
  return <Suspense><ClaimsPage /></Suspense>;
}

function ClaimsPage() {
  // Tab
  const [claimTab, setClaimTab] = useState<'claim' | 'receipt' | 'mileage'>('claim');
  const [claimCount, setClaimCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [mileageCount, setMileageCount] = useState(0);

  // Data
  const [claims, setClaims]   = useState<ClaimRow[]>([]);
  const [firms, setFirms]     = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

  // UI
  const [selectedRows, setSelectedRows] = useState<ClaimRow[]>([]);
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);
  const [rejectModal, setRejectModal]   = useState({ open: false, claimIds: [] as string[], reason: '' });

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
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  // Submit modal
  const [showModal, setShowModal]               = useState(false);
  const [modalCategories, setModalCategories]   = useState<Category[]>([]);
  const [modalType, setModalType]               = useState<'claim' | 'receipt' | 'mileage'>('claim');
  const [modalFirmId, setModalFirmId]           = useState('');
  const [modalDate, setModalDate]               = useState(todayStr());
  const [modalMerchant, setModalMerchant]       = useState('');
  const [modalAmount, setModalAmount]           = useState('');
  const [modalCategory, setModalCategory]       = useState('');
  const [modalReceipt, setModalReceipt]         = useState('');
  const [modalDesc, setModalDesc]               = useState('');
  const [selectedFile, setSelectedFile]         = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]             = useState<string | null>(null);
  const [modalError, setModalError]             = useState('');
  const [modalSaving, setModalSaving]           = useState(false);
  const [successMsg, setSuccessMsg]             = useState('');
  const [ocrScanning, setOcrScanning]           = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mileage fields
  const [mileageFrom, setMileageFrom]       = useState('');
  const [mileageTo, setMileageTo]           = useState('');
  const [mileageDistance, setMileageDistance] = useState('');
  const [mileagePurpose, setMileagePurpose] = useState('');
  const mileageRate = 0.55;

  // Load categories when modal firm changes
  useEffect(() => {
    if (showModal && modalFirmId) {
      fetch(`/api/categories?firmId=${modalFirmId}`)
        .then((r) => r.json())
        .then((j) => { setModalCategories(j.data ?? []); setModalCategory(''); })
        .catch(console.error);
    } else {
      setModalCategories([]);
    }
  }, [showModal, modalFirmId]);

  // Read initial type from URL
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type');
  useEffect(() => {
    if (initialType === 'receipt') setClaimTab('receipt');
  }, [initialType]);

  // Filters
  const [firmId,         setFirmId]        = useState('');
  const [dateRange,      setDateRange]     = useState('this_month');
  const [customFrom,     setCustomFrom]    = useState('');
  const [customTo,       setCustomTo]      = useState('');
  const [approvalFilter, setApprovalFilter]= useState('');
  const [search,         setSearch]        = useState('');

  const gridApiRef = useRef<GridApi<ClaimRow> | null>(null);

  // Load firms (once)
  useEffect(() => {
    fetch('/api/firms')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setFirms(j.data);
          if (j.data.length === 1) setFirmId(j.data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  // Load claims
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    p.set('type', claimTab);
    if (firmId)        p.set('firmId',   firmId);
    if (from)          p.set('dateFrom', from);
    if (to)            p.set('dateTo',   to);
    if (approvalFilter) p.set('approval', approvalFilter);
    if (search)        p.set('search',   search);
    if (takeLimit)     p.set('take',     String(takeLimit));

    fetch(`/api/claims?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setClaims(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [claimTab, firmId, dateRange, customFrom, customTo, approvalFilter, search, refreshKey, takeLimit]);

  // Fetch tab counts
  useEffect(() => {
    const p = new URLSearchParams();
    if (firmId) p.set('firmId', firmId);
    fetch(`/api/claims/counts?${p}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setClaimCount(j.data.claim ?? 0);
          setReceiptCount(j.data.receipt ?? 0);
          setMileageCount(j.data.mileage ?? 0);
        }
      })
      .catch(console.error);
  }, [firmId, refreshKey]);

  // When previewClaim changes, exit edit mode
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  // Fetch categories for the claim's firm when entering edit mode
  useEffect(() => {
    if (editMode && previewClaim) {
      fetch(`/api/categories?firmId=${previewClaim.firm_id}`)
        .then(r => r.json())
        .then(j => setCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [editMode, previewClaim]);

  // Toggle firm column visibility
  useEffect(() => {
    gridApiRef.current?.setColumnsVisible(['firm_name'], !firmId);
  }, [firmId]);

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
    const firmCol: ColDef<ClaimRow> = { field: 'firm_name', headerName: 'Firm', width: 160 };
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
        firmCol, merchantCol, categoryCol, amountCol, statusCol,
        { field: 'approval', headerName: 'Approval', width: 125, cellRenderer: ApprovalCell },
      ];
    } else if (claimTab === 'mileage') {
      return [
        checkboxCol, dateCol,
        { field: 'employee_name', headerName: 'Employee', flex: 1, minWidth: 120 },
        firmCol,
        { field: 'from_location', headerName: 'From', flex: 1, minWidth: 120 },
        { field: 'to_location', headerName: 'To', flex: 1, minWidth: 120 },
        { field: 'distance_km', headerName: 'Distance (km)', width: 120, type: 'rightAligned' },
        amountCol, statusCol,
        { field: 'approval', headerName: 'Approval', width: 125, cellRenderer: ApprovalCell },
      ];
    } else {
      return [
        checkboxCol, dateCol,
        firmCol, merchantCol, categoryCol, amountCol, statusCol,
        { field: 'payment_status', headerName: 'Payment', width: 110, cellRenderer: PaymentStatusCell },
        { field: 'linked_payment_count', headerName: 'Linked', width: 110, cellRenderer: LinkedCell },
      ];
    }
  }, [claimTab]);

  const gridContext = useMemo(() => ({ openPreview: setPreviewClaim }), []);

  const onGridReady = (e: GridReadyEvent<ClaimRow>) => {
    gridApiRef.current = e.api;
    e.api.setColumnsVisible(['firm_name'], !firmId);
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const batchAction = async (claimIds: string[], action: 'approve' | 'reject', reason?: string) => {
    try {
      const res = await fetch('/api/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds, action, reason }),
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

  const confirmReject = async () => {
    if (!rejectModal.reason.trim()) return;
    await batchAction(rejectModal.claimIds, 'reject', rejectModal.reason);
    setRejectModal({ open: false, claimIds: [], reason: '' });
  };

  const exportCSV = () => {
    gridApiRef.current?.exportDataAsCsv({
      fileName: `claims-${new Date().toISOString().split('T')[0]}.csv`,
    });
  };

  const saveEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/claims/${previewClaim.id}`, {
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

  const openModal = useCallback(() => {
    setModalType(claimTab);
    setModalFirmId(firmId || (firms.length === 1 ? firms[0].id : ''));
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory('');
    setModalReceipt('');
    setModalDesc('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setMileageFrom('');
    setMileageTo('');
    setMileageDistance('');
    setMileagePurpose('');
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  }, [claimTab, firmId, firms]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);

    if (!file) return;

    setOcrScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categories', JSON.stringify(modalCategories.map((c) => c.name)));

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();

      if (res.ok && json.fields) {
        const f = json.fields;
        if (json.documentType === 'invoice') {
          if (f.issueDate) setModalDate(f.issueDate);
          if (f.vendor) setModalMerchant(f.vendor);
          if (f.totalAmount) setModalAmount(String(f.totalAmount));
          if (f.invoiceNumber) setModalReceipt(f.invoiceNumber);
        } else {
          if (f.date) setModalDate(f.date);
          if (f.merchant) setModalMerchant(f.merchant);
          if (f.amount) setModalAmount(String(f.amount));
          if (f.receiptNumber) setModalReceipt(f.receiptNumber);
        }
        if (f.category) {
          const match = modalCategories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
          if (match) setModalCategory(match.id);
        }
      }
    } catch (err) {
      console.error('OCR extraction failed:', err);
    } finally {
      setOcrScanning(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitClaim = async () => {
    if (modalType === 'mileage') {
      if (!modalFirmId || !modalDate || !mileageFrom.trim() || !mileageTo.trim() || !mileageDistance || !mileagePurpose.trim()) {
        setModalError('Firm, date, from, to, distance, and purpose are required.');
        return;
      }
    } else {
      if (!modalFirmId || !modalDate || !modalMerchant.trim() || !modalAmount || !modalCategory) {
        setModalError('Firm, date, merchant, amount, and category are required.');
        return;
      }
    }

    setModalSaving(true);
    setModalError('');

    try {
      const fd = new FormData();
      fd.append('firm_id', modalFirmId);
      fd.append('type', modalType);
      fd.append('claim_date', modalDate);

      if (modalType === 'mileage') {
        fd.append('from_location', mileageFrom.trim());
        fd.append('to_location', mileageTo.trim());
        fd.append('distance_km', mileageDistance);
        fd.append('trip_purpose', mileagePurpose.trim());
      } else {
        fd.append('merchant', modalMerchant.trim());
        fd.append('amount', modalAmount);
        fd.append('category_id', modalCategory);
        if (modalReceipt.trim()) fd.append('receipt_number', modalReceipt.trim());
        if (modalDesc.trim()) fd.append('description', modalDesc.trim());
        if (selectedFile) fd.append('file', selectedFile);
      }

      const res = await fetch('/api/claims', {
        method: 'POST',
        body: fd,
      });

      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to submit');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
      const labels: Record<string, string> = { claim: 'Claim', receipt: 'Receipt', mileage: 'Mileage claim' };
      setSuccessMsg(`${labels[modalType]} submitted successfully!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="accountant" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-gray-900 font-bold text-title-lg tracking-tight">Claims</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Tabs + Actions ────────────────────────────── */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {([['claim', 'Employee Claims', claimCount], ['receipt', 'Receipts', receiptCount], ['mileage', 'Mileage', mileageCount]] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => { setClaimTab(key); setPreviewClaim(null); gridApiRef.current?.deselectAll(); }}
                className={`px-4 py-1.5 rounded-full text-body-md font-medium transition-all ${
                  claimTab === key
                    ? 'text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                style={claimTab === key ? { backgroundColor: 'var(--sidebar)' } : undefined}
              >
                {label}
                <span className={`ml-1.5 text-label-sm px-1.5 py-0.5 rounded-full font-semibold ${
                  claimTab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{count}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={openModal}
                className="btn-primary text-sm px-4 py-2 rounded-lg font-semibold text-white"
              >
                + Submit New
              </button>
              <button
                onClick={exportCSV}
                className="text-sm px-4 py-2 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              >
                Export CSV
              </button>
            </div>
          </div>

          {/* ── Filter bar ────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            {firms.length > 1 && (
              <Select value={firmId} onChange={setFirmId}>
                <option value="">All Firms</option>
                {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            )}

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
              placeholder="Search merchant or employee…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} min-w-[210px]`}
            />

          </div>

          {/* ── Success message ──────────────────────────── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={claims.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── AG Grid ───────────────────────────────────── */}
          <div className="flex-1 min-h-0 ag-theme-alpine overflow-hidden rounded-lg border border-gray-200" style={{ height: '100%' }}>
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
              context={gridContext}
              overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:14px'>No claims found for the selected filters.</span>"
            />
          </div>

        </main>
      </div>

      {/* ═══════════════════════ SUBMIT MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900">Submit New {modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Fill in the details below.</p>

            {/* ── Type Toggle ── */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
              {(['claim', 'receipt', 'mileage'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setModalType(t)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${modalType === t ? 'bg-[var(--sidebar)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {t === 'claim' ? 'Claim' : t === 'receipt' ? 'Receipt' : 'Mileage'}
                </button>
              ))}
            </div>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Firm *</label>
                <select
                  value={modalFirmId}
                  onChange={(e) => setModalFirmId(e.target.value)}
                  className={`${inputCls} w-full`}
                >
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Date *</label>
                <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className={`${inputCls} w-full`} required />
              </div>

              {modalType === 'mileage' ? (
                <>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">From *</label>
                    <input type="text" value={mileageFrom} onChange={(e) => setMileageFrom(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. PJ Office" autoFocus />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">To *</label>
                    <input type="text" value={mileageTo} onChange={(e) => setMileageTo(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Shah Alam client office" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Distance (km) *</label>
                    <input type="number" value={mileageDistance} onChange={(e) => setMileageDistance(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. 25" step="0.1" min="0" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Purpose *</label>
                    <input type="text" value={mileagePurpose} onChange={(e) => setMileagePurpose(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Client meeting with ABC Sdn Bhd" />
                  </div>
                  {mileageDistance && parseFloat(mileageDistance) > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800 font-medium">
                        Amount: RM {(parseFloat(mileageDistance) * mileageRate).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">{mileageDistance} km x RM {mileageRate.toFixed(2)}/km</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Merchant Name *</label>
                    <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Petronas, Grab, etc." autoFocus />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Amount (RM) *</label>
                    <input type="number" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className={`${inputCls} w-full`} placeholder="0.00" step="0.01" min="0" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Category *</label>
                    <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className={`${inputCls} w-full`}>
                      <option value="">Select a category</option>
                      {modalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt Number</label>
                    <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className={`${inputCls} w-full`} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                    <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className={`${inputCls} w-full`} rows={2} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt</label>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {selectedFile ? (
                        <div className="space-y-2">
                          {selectedFile.type === 'application/pdf' ? (
                            <div className="mx-auto w-16 h-20 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
                              <span className="text-red-500 font-bold text-xs">PDF</span>
                            </div>
                          ) : previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="mx-auto max-h-32 rounded" />
                          ) : null}
                          <p className="text-sm text-gray-600">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-500">Click or drag to upload receipt</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF up to 10MB</p>
                        </div>
                      )}
                      <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                    </div>
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
                </>
              )}
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitClaim}
                disabled={modalSaving || ocrScanning}
                className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : `Submit ${modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}`}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════ BATCH BAR ═══════════════════════ */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl text-white" style={{ backgroundColor: 'var(--sidebar)' }}>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={() => batchAction(selectedRows.map((r) => r.id), 'approve')}
            className="btn-primary text-sm px-4 py-1.5 rounded-full font-medium transition-opacity hover:opacity-85"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Approve
          </button>
          <button
            onClick={() => setRejectModal({ open: true, claimIds: selectedRows.map((r) => r.id), reason: '' })}
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
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Receipt Preview</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (editMode) {
                      setEditMode(false);
                      setEditData(null);
                    } else {
                      setEditMode(true);
                      setEditData({
                        claim_date: previewClaim.claim_date.split('T')[0],
                        merchant: previewClaim.merchant,
                        amount: previewClaim.amount,
                        category_id: previewClaim.category_id,
                        receipt_number: previewClaim.receipt_number ?? '',
                        description: previewClaim.description ?? '',
                      });
                    }
                  }}
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${editMode ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                >
                  {editMode ? 'Cancel' : 'Edit'}
                </button>
                <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>
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
                <dl className="space-y-3">
                  <div>
                    <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">Date</dt>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">Merchant</dt>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <Field label="Employee" value={previewClaim.employee_name} />
                  <Field label="Firm" value={previewClaim.firm_name} />
                  <div>
                    <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">Category</dt>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className={`${inputCls} w-full mt-0.5`}>
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">Amount (RM)</dt>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">Receipt No.</dt>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">Description</dt>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                </dl>
              ) : (
                <dl className="space-y-3">
                  <Field label="Date"        value={formatDate(previewClaim.claim_date)} />
                  <Field label="Merchant"    value={previewClaim.merchant} />
                  <Field label="Employee"    value={previewClaim.employee_name} />
                  <Field label="Firm"        value={previewClaim.firm_name} />
                  <Field label="Category"    value={previewClaim.category_name} />
                  <Field label="Amount"      value={formatRM(previewClaim.amount)} />
                  <Field label="Receipt No." value={previewClaim.receipt_number} />
                  <Field label="Description" value={previewClaim.description} />
                </dl>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  STATUS_CFG[previewClaim.status],
                  APPROVAL_CFG[previewClaim.approval],
                  PAYMENT_CFG[previewClaim.payment_status],
                ].filter(Boolean).map((cfg) => (
                  <span key={cfg!.label} className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${cfg!.cls}`}>
                    {cfg!.label}
                  </span>
                ))}
              </div>

              {previewClaim.type === 'receipt' && previewClaim.linked_payments.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                  <p className="text-label-sm font-semibold text-blue-700 uppercase tracking-wide">Linked Payment</p>
                  {previewClaim.linked_payments.map((lp) => (
                    <div key={lp.payment_id} className="text-sm text-blue-800">
                      <p className="font-medium">{lp.supplier_name}</p>
                      <p className="text-xs text-blue-600">
                        {formatRM(lp.amount)} &middot; {formatDate(lp.payment_date)}
                        {lp.reference ? ` · ${lp.reference}` : ''}
                      </p>
                    </div>
                  ))}
                  <button
                    onClick={async () => {
                      if (!confirm('Unlink this receipt from its payment?')) return;
                      try {
                        const res = await fetch(`/api/claims/${previewClaim.id}/payment-link`, { method: 'DELETE' });
                        if (res.ok) { setPreviewClaim(null); refresh(); }
                      } catch (e) { console.error(e); }
                    }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Unlink from Payment
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-label-sm text-gray-400 uppercase tracking-wide font-medium">Confidence</span>
                <span className={`text-xs font-semibold ${
                  previewClaim.confidence === 'HIGH'   ? 'text-green-600' :
                  previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                }`}>{previewClaim.confidence}</span>
              </div>

              {previewClaim.rejection_reason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-label-sm font-semibold text-red-700 uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700">{previewClaim.rejection_reason}</p>
                </div>
              )}

              {previewClaim.file_url && (
                <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>

            <div className="p-4 flex gap-3 flex-shrink-0">
              {editMode ? (
                <button
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => batchAction([previewClaim.id], 'approve')}
                    disabled={previewClaim.approval === 'approved'}
                    className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectModal({ open: true, claimIds: [previewClaim.id], reason: '' })}
                    disabled={previewClaim.approval === 'not_approved'}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ REJECT MODAL ═══════════════════════ */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-base font-semibold text-gray-900">Reject {rejectModal.claimIds.length} Claim{rejectModal.claimIds.length !== 1 ? 's' : ''}</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">A reason is required and will be stored on the claim record.</p>
            <textarea
              value={rejectModal.reason}
              onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
              placeholder="Enter rejection reason…"
              rows={4}
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--sidebar)]/20 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={confirmReject}
                disabled={!rejectModal.reason.trim()}
                className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Confirm Reject
              </button>
              <button
                onClick={() => setRejectModal({ open: false, claimIds: [], reason: '' })}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
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

const inputCls = 'input-field';

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {children}
    </select>
  );
}
