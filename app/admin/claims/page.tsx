'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import Sidebar from '@/components/Sidebar';
import { useTableSort } from '@/lib/use-table-sort';

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
  type: 'claim' | 'receipt' | 'mileage';
  from_location?: string | null;
  to_location?: string | null;
  distance_km?: string | null;
  trip_purpose?: string | null;
  linked_payment_count: number;
  linked_payments: { payment_id: string; amount: string; payment_date: string; reference: string | null; supplier_name: string }[];
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

// ─── Cell renderers ─────────────────────────────────────────────────────────

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

export default function AdminClaimsPageWrapper() {
  return <Suspense><AdminClaimsPage /></Suspense>;
}

function AdminClaimsPage() {
  // Tab
  const [claimTab, setClaimTab] = useState<'claim' | 'receipt' | 'mileage'>('claim');
  const [claimCount, setClaimCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [mileageCount, setMileageCount] = useState(0);

  // Data
  const [claims, setClaims]   = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

  // UI
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

  // Submit modal
  const [showModal, setShowModal]           = useState(false);
  const [modalCategories, setModalCategories] = useState<Category[]>([]);
  const [modalType, setModalType]           = useState<'claim' | 'receipt' | 'mileage'>('claim');
  const [modalDate, setModalDate]           = useState(todayStr());
  const [modalMerchant, setModalMerchant]   = useState('');
  const [modalAmount, setModalAmount]       = useState('');
  const [modalCategory, setModalCategory]   = useState('');
  const [modalReceipt, setModalReceipt]     = useState('');
  const [modalDesc, setModalDesc]           = useState('');
  const [selectedFile, setSelectedFile]     = useState<File | null>(null);
  const [previewUrl, setPreviewUrl]         = useState<string | null>(null);
  const [modalError, setModalError]         = useState('');
  const [modalSaving, setModalSaving]       = useState(false);
  const [successMsg, setSuccessMsg]         = useState('');
  const [ocrScanning, setOcrScanning]       = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mileage fields
  const [mileageFrom, setMileageFrom]       = useState('');
  const [mileageTo, setMileageTo]           = useState('');
  const [mileageDistance, setMileageDistance] = useState('');
  const [mileagePurpose, setMileagePurpose] = useState('');
  const mileageRate = 0.55;

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  // Load categories for modal + edit
  useEffect(() => {
    fetch('/api/admin/categories')
      .then((r) => r.json())
      .then((j) => { setModalCategories(j.data ?? []); setEditCategories(j.data ?? []); })
      .catch(console.error);
  }, []);

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
  const initialType = searchParams.get('type');

  // Set initial tab from URL
  useEffect(() => {
    if (initialType === 'receipt') setClaimTab('receipt');
    if (initialType === 'mileage') setClaimTab('mileage');
  }, [initialType]);

  // Filters
  const [dateRange,     setDateRange]    = useState(initialStatus ? '' : 'this_month');
  const [customFrom,    setCustomFrom]   = useState('');
  const [customTo,      setCustomTo]     = useState('');
  const [statusFilter,  setStatusFilter] = useState(initialStatus);
  const [search,        setSearch]       = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    if (takeLimit)    p.set('take',     String(takeLimit));

    fetch(`/api/admin/claims?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setClaims(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [claimTab, dateRange, customFrom, customTo, statusFilter, search, refreshKey, takeLimit]);

  // Fetch tab counts
  useEffect(() => {
    fetch('/api/admin/claims/counts')
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          setClaimCount(j.data.claim ?? 0);
          setReceiptCount(j.data.receipt ?? 0);
          setMileageCount(j.data.mileage ?? 0);
        }
      })
      .catch(console.error);
  }, [refreshKey]);

  // Sort
  const { sorted, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(claims, 'claim_date', 'desc');

  // Reset page when tab changes
  useEffect(() => { setPage(0); setSelectedIds(new Set()); }, [claimTab]);

  // Reset page when sort changes
  useEffect(() => { setPage(0); }, [sortField, sortDir]);

  // Paged data
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pagedClaims = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allOnPage = pagedClaims.map((c) => c.id);
    const allSelected = allOnPage.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allOnPage.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        allOnPage.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const selectedRows = claims.filter((c) => selectedIds.has(c.id));

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const openModal = useCallback(() => {
    setModalType(claimTab);
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory(modalCategories.length === 1 ? modalCategories[0].id : '');
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
  }, [claimTab, modalCategories]);

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
          // Invoice fields → map to claim form
          if (f.issueDate) setModalDate(f.issueDate);
          if (f.vendor) setModalMerchant(f.vendor);
          if (f.totalAmount) setModalAmount(String(f.totalAmount));
          if (f.invoiceNumber) setModalReceipt(f.invoiceNumber);
        } else {
          // Receipt fields
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
      if (!modalDate || !mileageFrom.trim() || !mileageTo.trim() || !mileageDistance || !mileagePurpose.trim()) {
        setModalError('Date, from, to, distance, and purpose are required.');
        return;
      }
    } else {
      if (!modalDate || !modalMerchant.trim() || !modalAmount || !modalCategory) {
        setModalError('Date, merchant, amount, and category are required.');
        return;
      }
    }

    setModalSaving(true);
    setModalError('');

    try {
      const fd = new FormData();
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

      const res = await fetch('/api/admin/claims', {
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

  const batchReview = async (claimIds: string[]) => {
    try {
      const res = await fetch('/api/admin/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds, action: 'review' }),
      });
      if (res.ok) {
        refresh();
        setSelectedIds(new Set());
        if (previewClaim && claimIds.includes(previewClaim.id)) setPreviewClaim(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={"flex h-screen overflow-hidden bg-[#F7F9FB]"}>

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="admin" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Claims</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Tabs + Actions ────────────────────────────── */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {([['claim', 'Employee Claims', claimCount], ['receipt', 'Receipts', receiptCount], ['mileage', 'Mileage', mileageCount]] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => { setClaimTab(key); setPreviewClaim(null); }}
                className={`px-4 py-1.5 rounded-lg text-body-md font-medium transition-all ${
                  claimTab === key
                    ? 'text-white shadow-sm'
                    : 'text-[#434654] hover:text-[#434654] hover:bg-gray-100'
                }`}
                style={claimTab === key ? { backgroundColor: 'var(--sidebar)' } : undefined}
              >
                {label}
                <span className={`ml-1.5 text-label-sm px-1.5 py-0.5 rounded-full font-semibold ${
                  claimTab === key ? 'bg-white/20 text-white' : 'bg-gray-100 text-[#434654]'
                }`}>{count}</span>
              </button>
            ))}
            <button
              onClick={openModal}
              className="btn-primary ml-auto text-sm px-4 py-2 rounded-lg font-semibold text-white"
            >
              + Submit New
            </button>
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
                <span className="text-[#8E9196] text-sm">–</span>
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
              placeholder="Search merchant, employee or receipt no…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field min-w-[210px]"
            />

          </div>

          {/* ── Success message ──────────────────────────── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={claims.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Table ────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto rounded-lg bg-white">
            <table className="w-full">
              <thead>
                <tr className="ds-table-header text-left">
                  <th className="px-3 py-2.5 w-10"><input type="checkbox" checked={pagedClaims.length > 0 && pagedClaims.every((c) => selectedIds.has(c.id))} onChange={toggleSelectAll} /></th>
                  <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('claim_date')}>Date{sortIndicator('claim_date')}</th>
                  {claimTab === 'claim' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('employee_name')}>Employee{sortIndicator('employee_name')}</th>}
                  {claimTab !== 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('merchant')}>Merchant{sortIndicator('merchant')}</th>}
                  {claimTab === 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('receipt_number')}>Receipt No.{sortIndicator('receipt_number')}</th>}
                  {claimTab !== 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('category_name')}>Category{sortIndicator('category_name')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('employee_name')}>Employee{sortIndicator('employee_name')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('from_location')}>From{sortIndicator('from_location')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('to_location')}>To{sortIndicator('to_location')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('distance_km')}>Distance (km){sortIndicator('distance_km')}</th>}
                  <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount (RM){sortIndicator('amount')}</th>
                  <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                  {claimTab !== 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('approval')}>Approval{sortIndicator('approval')}</th>}
                  {claimTab === 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>}
                  {claimTab === 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('linked_payment_count')}>Linked{sortIndicator('linked_payment_count')}</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={20} className="px-5 py-12 text-center text-body-sm text-[#8E9196]">Loading...</td></tr>
                ) : pagedClaims.length === 0 ? (
                  <tr><td colSpan={20} className="px-5 py-12 text-center text-body-sm text-[#8E9196]">No claims found for the selected filters.</td></tr>
                ) : pagedClaims.map((c) => (
                  <tr key={c.id} onClick={() => setPreviewClaim(c)} className="text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50">
                    <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                    {claimTab === 'claim' && <td className="px-5 py-3 text-[#434654]">{c.employee_name}</td>}
                    {claimTab !== 'mileage' && <td className="px-5 py-3 text-[#434654]">{c.merchant}</td>}
                    {claimTab === 'receipt' && <td className="px-5 py-3 text-[#434654]">{c.receipt_number}</td>}
                    {claimTab !== 'mileage' && <td className="px-5 py-3 text-[#434654]">{c.category_name}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[#434654]">{c.employee_name}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[#434654]">{c.from_location}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[#434654]">{c.to_location}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[#434654] text-right tabular-nums">{c.distance_km}</td>}
                    <td className="px-5 py-3 text-[#434654] text-right tabular-nums">{Number(c.amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                    {claimTab !== 'receipt' && <td className="px-5 py-3"><ApprovalCell value={c.approval} /></td>}
                    {claimTab === 'receipt' && <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>}
                    {claimTab === 'receipt' && <td className="px-5 py-3"><LinkedCell value={c.linked_payment_count} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <p className="text-body-sm text-[#8E9196]">{page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                  <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>

      {/* ═══ SUBMIT MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-[#191C1E]">Submit New {modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8E9196] hover:text-[#434654] hover:bg-gray-100 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-[#434654] mb-4">Fill in the details below.</p>

            {/* ── Type Toggle ── */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
              {(['claim', 'receipt', 'mileage'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setModalType(t)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${modalType === t ? 'bg-[var(--sidebar)] text-white' : 'bg-white text-[#434654] hover:bg-gray-50'}`}
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
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Date *</label>
                <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className="input-field w-full" required />
              </div>

              {modalType === 'mileage' ? (
                <>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">From *</label>
                    <input type="text" value={mileageFrom} onChange={(e) => setMileageFrom(e.target.value)} className="input-field w-full" placeholder="e.g. PJ Office" autoFocus />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">To *</label>
                    <input type="text" value={mileageTo} onChange={(e) => setMileageTo(e.target.value)} className="input-field w-full" placeholder="e.g. Shah Alam client office" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Distance (km) *</label>
                    <input type="number" value={mileageDistance} onChange={(e) => setMileageDistance(e.target.value)} className="input-field w-full" placeholder="e.g. 25" step="0.1" min="0" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Purpose *</label>
                    <input type="text" value={mileagePurpose} onChange={(e) => setMileagePurpose(e.target.value)} className="input-field w-full" placeholder="e.g. Client meeting with ABC Sdn Bhd" />
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
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Merchant Name *</label>
                    <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className="input-field w-full" placeholder="e.g. Petronas, Grab, etc." autoFocus />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Amount (RM) *</label>
                    <input type="number" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className="input-field w-full" placeholder="0.00" step="0.01" min="0" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Category *</label>
                    <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className="input-field w-full">
                      <option value="">Select a category</option>
                      {modalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt Number</label>
                    <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className="input-field w-full" placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Description</label>
                    <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className="input-field w-full" rows={2} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt</label>
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
                            <img src={previewUrl} alt="Preview" className="mx-auto max-h-32 rounded-lg" />
                          ) : null}
                          <p className="text-sm text-[#434654]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]">Remove</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-[#434654]">Click or drag to upload receipt</p>
                          <p className="text-xs text-[#8E9196] mt-1">JPG, PNG, PDF up to 10MB</p>
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
                className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : `Submit ${modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}`}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BATCH BAR ═══ */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-lg shadow-2xl text-white" style={{ backgroundColor: 'var(--sidebar)' }}>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={() => batchReview(selectedRows.map((r) => r.id))}
            className="btn-primary text-sm px-4 py-1.5 rounded-lg font-medium"
          >
            Mark as Reviewed
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-white/55 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* ═══ RECEIPT PREVIEW ═══ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-16 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-bold text-title-md tracking-tight">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewClaim.thumbnail_url ? (
                <img
                  src={previewClaim.thumbnail_url}
                  alt="Receipt"
                  className="w-full max-h-52 object-contain rounded-lg border border-gray-200"
                />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">
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
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
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
                            const res = await fetch(`/api/admin/claims/${previewClaim.id}/payment-link`, { method: 'DELETE' });
                            if (res.ok) { setPreviewClaim(null); refresh(); }
                          } catch (e) { console.error(e); }
                        }}
                        className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] font-medium"
                      >
                        Unlink from Payment
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span className="text-label-sm text-[#8E9196] uppercase tracking-wide font-medium">Confidence</span>
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
                </>
              )}
            </div>

            <div className="p-4 flex gap-3 flex-shrink-0">
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
                        claim_date: previewClaim.claim_date.split('T')[0],
                        merchant: previewClaim.merchant,
                        amount: previewClaim.amount,
                        category_id: previewClaim.category_id,
                        receipt_number: previewClaim.receipt_number ?? '',
                        description: previewClaim.description ?? '',
                      });
                    }}
                    className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => batchReview([previewClaim.id])}
                    disabled={previewClaim.status === 'reviewed'}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                    style={{ backgroundColor: 'var(--sidebar)' }}
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
