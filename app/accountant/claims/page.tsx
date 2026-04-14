'use client';

import { Suspense, useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import Sidebar from '@/components/Sidebar';
import Field from '@/components/forms/Field';
import { StatusCell, ConfidenceCell, LinkedCell, PaymentStatusCell } from '@/components/table/StatusBadge';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { todayStr, formatDate, formatRM, getDateRange } from '@/lib/formatters';
import { useFilters } from '@/hooks/useFilters';
import { STATUS_CFG, PAYMENT_CFG } from '@/lib/badge-config';
import FilterBar from '@/components/filters/FilterBar';
import { useFirm } from '@/contexts/FirmContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_id: string;
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
  gl_account_id: string | null;
  gl_account_label: string | null;
  contra_gl_account_id: string | null;
  linked_payment_count: number;
  linked_payments: { payment_id: string; amount: string; payment_date: string; reference: string | null; supplier_name: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClaimsPageWrapper() {
  return <Suspense><ClaimsPage /></Suspense>;
}

function ClaimsPage() {
  usePageTitle('Claims');
  const { data: session } = useSession();
  const { firms, firmId, firmsLoaded } = useFirm();

  // Tab
  const [claimTab, setClaimTab] = useState<'claim' | 'receipt' | 'mileage'>('claim');


  // Data
  const [claims, setClaims]   = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

  // UI
  const [selectedRows, setSelectedRows] = useState<ClaimRow[]>([]);
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);
  // rejectModal removed — accountant no longer rejects claims

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{
    claim_date: string;
    merchant: string;
    amount: string;
    category_id: string;
    receipt_number: string;
    description: string;
    employee_id: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [glAccounts, _setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  // GL selection removed — GL assigned at bank recon, not claim approval
  const [_defaultContraGlId, _setDefaultContraGlId] = useState<string>('');

  // Submit modal
  const [showModal, setShowModal]               = useState(false);
  const [modalCategories, setModalCategories]   = useState<Category[]>([]);
  const [modalType, setModalType]               = useState<'claim' | 'receipt' | 'mileage'>('claim');
  const [modalFirmId, setModalFirmId]           = useState('');
  const [modalEmployeeId, setModalEmployeeId]   = useState('');
  const [modalEmployees, setModalEmployees]     = useState<{ id: string; name: string }[]>([]);
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
  // Batch review
  interface BatchClaimItem {
    file: File;
    merchant: string;
    amount: string;
    claim_date: string;
    receipt_number: string;
    category_id: string;
    description: string;
    ocrDone: boolean;
    ocrError: string;
  }
  const [showBatchReview, setShowBatchReview] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchClaimItem[]>([]);
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchScanProgress, setBatchScanProgress] = useState({ current: 0, total: 0 });
  const [batchFirmId, setBatchFirmId] = useState('');

  // Drag-and-drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);

    const accepted = ['.pdf', '.jpg', '.jpeg', '.png', '.heif'];
    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return accepted.includes(ext) || f.type.startsWith('image/') || f.type === 'application/pdf';
    });
    if (droppedFiles.length === 0) return;

    const targetFirmId = firmId || (firms.length === 1 ? firms[0].id : '');
    if (!targetFirmId) {
      alert('Please select a firm before uploading.');
      return;
    }

    if (droppedFiles.length === 1) {
      // Single file — open modal and trigger OCR
      const file = droppedFiles[0];
      setModalType(claimTab);
      setModalFirmId(targetFirmId);
      setModalDate(todayStr());
      setModalMerchant('');
      setModalAmount('');
      setModalCategory('');
      setModalReceipt('');
      setModalDesc('');
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setMileageFrom('');
      setMileageTo('');
      setMileageDistance('');
      setMileagePurpose('');
      setModalError('');
      setModalSaving(false);
      setShowModal(true);

      // Trigger OCR scan
      setOcrScanning(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        // Categories may not be loaded yet for this firm — fetch inline
        let cats = modalCategories;
        if (cats.length === 0) {
          try {
            const catRes = await fetch(`/api/categories?firmId=${targetFirmId}`);
            const catJson = await catRes.json();
            cats = catJson.data ?? [];
            setModalCategories(cats);
          } catch { /* ignore */ }
        }
        fd.append('categories', JSON.stringify(cats.map((c: Category) => c.name)));
        fd.append('context', 'claim');

        // Fetch employees inline — useEffect may not have completed yet
        let emps = modalEmployees;
        if (emps.length === 0) {
          try {
            const empRes = await fetch(`/api/employees?firmId=${targetFirmId}`);
            const empJson = await empRes.json();
            emps = (empJson.data ?? []).filter((e: { is_active: boolean }) => e.is_active);
            setModalEmployees(emps);
            if (emps.length === 1) setModalEmployeeId(emps[0].id);
          } catch { /* ignore */ }
        }

        const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
        const json = await res.json();

        if (res.ok && json.multipleReceipts && json.receipts?.length > 1) {
          // Multiple receipts in one image — switch to batch review
          setShowModal(false);
          setOcrScanning(false);
          const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }) => {
            let catId = '';
            if (r.category) {
              const match = cats.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
              if (match) catId = match.id;
            }
            return {
              file,
              merchant: r.merchant || '',
              amount: r.amount ? String(r.amount) : '',
              claim_date: r.date || todayStr(),
              receipt_number: r.receiptNumber || '',
              category_id: catId,
              description: r.notes || '',
              ocrDone: true,
              ocrError: '',
            };
          });
          setBatchItems(items);
          setBatchFirmId(targetFirmId);
          // Auto-match employee for batch
          const firstR = json.receipts[0];
          if (firstR.notes || firstR.merchant) {
            const text = `${firstR.notes || ''} ${firstR.merchant || ''}`.toLowerCase();
            const empMatch = emps.find(e => text.includes(e.name.toLowerCase()));
            if (empMatch) setModalEmployeeId(empMatch.id);
          }
          setShowBatchReview(true);
          setBatchScanning(false);
          return;
        }

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
          if (f.notes) setModalDesc(f.notes);
          if (f.category) {
            const match = cats.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) setModalCategory(match.id);
          }

          // Auto-match employee from notes/merchant
          if (f.notes || f.merchant || f.vendor) {
            const text = `${f.notes || ''} ${f.merchant || ''} ${f.vendor || ''}`.toLowerCase();
            const empMatch = emps.find(e => text.includes(e.name.toLowerCase()));
            if (empMatch) setModalEmployeeId(empMatch.id);
          }
        }
      } catch (err) {
        console.error('OCR extraction failed:', err);
      } finally {
        setOcrScanning(false);
      }
      return;
    }

    // Multiple files — OCR all first, then show batch review
    let batchCategories = modalCategories;
    if (batchCategories.length === 0) {
      try {
        const catRes = await fetch(`/api/categories?firmId=${targetFirmId}`);
        const catJson = await catRes.json();
        batchCategories = catJson.data ?? [];
        setModalCategories(batchCategories);
      } catch { /* ignore */ }
    }

    const items: BatchClaimItem[] = droppedFiles.map(file => ({
      file, merchant: '', amount: '', claim_date: todayStr(), receipt_number: '', category_id: '', description: '', ocrDone: false, ocrError: '',
    }));
    setBatchItems(items);
    setBatchFirmId(targetFirmId);
    setModalEmployeeId('');
    fetch(`/api/employees?firmId=${targetFirmId}`).then(r => r.json()).then(j => {
      const emps = (j.data ?? []).filter((e: { is_active: boolean }) => e.is_active);
      setModalEmployees(emps);
      if (emps.length === 1) setModalEmployeeId(emps[0].id);
    }).catch(console.error);
    setShowBatchReview(true);
    setBatchScanning(true);
    setBatchScanProgress({ current: 0, total: droppedFiles.length });

    for (let i = 0; i < droppedFiles.length; i++) {
      setBatchScanProgress({ current: i + 1, total: droppedFiles.length });
      try {
        const ocrFd = new FormData();
        ocrFd.append('file', droppedFiles[i]);
        ocrFd.append('categories', JSON.stringify(batchCategories.map((c) => c.name)));
        ocrFd.append('context', 'claim');
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          items[i].merchant = (isInvoice ? f.vendor : f.merchant) || '';
          items[i].receipt_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          items[i].claim_date = (isInvoice ? f.issueDate : f.date) || items[i].claim_date;
          items[i].amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          items[i].description = f.notes || '';
          if (f.category) {
            const match = batchCategories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) items[i].category_id = match.id;
          }
        }
        items[i].ocrDone = true;
      } catch (err) {
        items[i].ocrDone = true;
        items[i].ocrError = err instanceof Error ? err.message : 'OCR failed';
      }
      setBatchItems([...items]);
    }
    setBatchScanning(false);
  };

  const submitBatchClaims = async () => {
    setBatchSubmitting(true);
    const firmId = batchFirmId;
    let ok = 0;
    let fail = 0;
    for (const item of batchItems) {
      try {
        const fd = new FormData();
        fd.append('firm_id', firmId);
        if (modalEmployeeId) fd.append('employee_id', modalEmployeeId);
        fd.append('type', claimTab);
        fd.append('file', item.file);
        fd.append('claim_date', item.claim_date || todayStr());
        fd.append('merchant', item.merchant || item.file.name.replace(/\.[^/.]+$/, ''));
        fd.append('amount', item.amount || '0');
        if (item.receipt_number) fd.append('receipt_number', item.receipt_number);
        if (item.category_id) fd.append('category_id', item.category_id);
        if (item.description) fd.append('description', item.description);
        const res = await fetch('/api/claims', { method: 'POST', body: fd });
        if (res.ok) ok++; else fail++;
      } catch { fail++; }
    }
    setBatchSubmitting(false);
    setShowBatchReview(false);
    setBatchItems([]);
    alert(`Batch upload: ${ok} submitted${fail > 0 ? `, ${fail} failed` : ''}`);
    refresh();
  };

  // Mileage fields
  const [mileageFrom, setMileageFrom]       = useState('');
  const [mileageTo, setMileageTo]           = useState('');
  const [mileageDistance, setMileageDistance] = useState('');
  const [mileagePurpose, setMileagePurpose] = useState('');
  const mileageRate = 0.55;

  // Cleanup blob URL on unmount
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

  // Load categories + employees when modal firm changes
  useEffect(() => {
    if (showModal && modalFirmId) {
      Promise.all([
        fetch(`/api/categories?firmId=${modalFirmId}`).then((r) => r.json()),
        fetch(`/api/employees?firmId=${modalFirmId}`).then((r) => r.json()),
      ]).then(([catJson, empJson]) => {
        setModalCategories(catJson.data ?? []);
        setModalCategory('');
        const emps = (empJson.data ?? []).filter((e: { is_active: boolean }) => e.is_active);
        setModalEmployees(emps);
        // Auto-select: user's own record for receipts, only employee if just one
        const myEmpId = session?.user?.employee_id;
        if (modalType === 'receipt' && myEmpId && emps.find((e: { id: string }) => e.id === myEmpId)) {
          setModalEmployeeId(myEmpId);
        } else if (modalType === 'receipt' && emps.length > 0) {
          setModalEmployeeId(emps[0].id);
        } else {
          setModalEmployeeId(emps.length === 1 ? emps[0].id : '');
        }
      }).catch(console.error);
    } else {
      setModalCategories([]);
      setModalEmployees([]);
      setModalEmployeeId('');
    }
  }, [showModal, modalFirmId]);

  // Sync claimTab with URL ?type= param (reacts to sidebar navigation)
  const searchParams = useSearchParams();
  const urlType = searchParams.get('type');
  useEffect(() => {
    if (urlType === 'receipt') setClaimTab('receipt');
    else if (urlType === 'mileage') setClaimTab('mileage');
    else setClaimTab('claim');
  }, [urlType]);

  // Filters
  const {
    dateRange, setDateRange,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    approvalFilter, setApprovalFilter,
    search, setSearch,
  } = useFilters();

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Load claims
  useEffect(() => {
    if (!firmsLoaded) return;
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    p.set('type', claimTab);
    if (firmId)        p.set('firmId',   firmId);
    if (from)          p.set('dateFrom', from);
    if (to)            p.set('dateTo',   to);
    if (approvalFilter) p.set('paymentStatus', approvalFilter);
    if (search)        p.set('search',   search);
    if (takeLimit)     p.set('take',     String(takeLimit));

    fetch(`/api/claims?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setClaims(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [claimTab, firmId, dateRange, customFrom, customTo, approvalFilter, search, refreshKey, takeLimit, firmsLoaded]);



  // When previewClaim changes, exit edit mode
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  // Fetch categories + employees for the claim's firm when entering edit mode
  useEffect(() => {
    if (editMode && previewClaim) {
      fetch(`/api/categories?firmId=${previewClaim.firm_id}`)
        .then(r => r.json())
        .then(j => setCategories(j.data ?? []))
        .catch(console.error);
      fetch(`/api/employees?firmId=${previewClaim.firm_id}`)
        .then(r => r.json())
        .then(j => setModalEmployees((j.data ?? []).filter((e: { is_active: boolean }) => e.is_active)))
        .catch(console.error);
    }
  }, [editMode, previewClaim]);

  // GL selection removed — GL assigned at bank recon, not claim preview

  // Sort
  const { sorted, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(claims, 'status', 'asc', 'confidence', 'asc');

  // Reset page when tab changes
  useEffect(() => { setPage(0); }, [claimTab]);

  // Reset page when sort changes
  useEffect(() => { setPage(0); }, [sortField, sortDir]);

  // Paged data
  const showFirm = !firmId;
  const pagedClaims = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  // Selection helpers
  const allOnPageSelected = pagedClaims.length > 0 && pagedClaims.every((c) => selectedRows.some((r) => r.id === c.id));
  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelectedRows((prev) => prev.filter((r) => !pagedClaims.some((c) => c.id === r.id)));
    } else {
      setSelectedRows((prev) => {
        const existing = new Set(prev.map((r) => r.id));
        return [...prev, ...pagedClaims.filter((c) => !existing.has(c.id))];
      });
    }
  };
  const toggleSelectOne = (row: ClaimRow) => {
    setSelectedRows((prev) =>
      prev.some((r) => r.id === row.id) ? prev.filter((r) => r.id !== row.id) : [...prev, row]
    );
  };

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const _batchAction = async (claimIds: string[], action: 'approve' | 'reject', reason?: string, glAccountId?: string, contraGlId?: string) => {
    try {
      const res = await fetch('/api/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds, action, reason, ...(glAccountId && { gl_account_id: glAccountId }), ...(contraGlId && { contra_gl_account_id: contraGlId }) }),
      });
      if (res.ok) {
        refresh();
        setSelectedRows([]);
        // Update preview in-place instead of closing
        if (previewClaim && claimIds.includes(previewClaim.id)) {
          const glMatch = glAccountId ? glAccounts.find(a => a.id === glAccountId) : null;
          setPreviewClaim({
            ...previewClaim,
            approval: action === 'approve' ? 'approved' : 'not_approved',
            ...(action === 'reject' && reason ? { rejection_reason: reason } : {}),
            ...(action === 'approve' && glAccountId ? { gl_account_id: glAccountId, gl_account_label: glMatch ? `${glMatch.account_code} — ${glMatch.name}` : null } : {}),
            ...(action === 'approve' && contraGlId ? { contra_gl_account_id: contraGlId } : {}),
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteClaims = async (claimIds: string[]) => {
    const count = claimIds.length;
    if (!confirm(`Delete ${count} claim${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/claims/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Failed to delete'); return; }
      refresh();
      setSelectedRows([]);
      if (previewClaim && claimIds.includes(previewClaim.id)) setPreviewClaim(null);
    } catch (e) {
      console.error(e);
    }
  };

  const _exportCSV = () => {
    if (!claims.length) return;
    const headers = claimTab === 'claim'
      ? ['Date', 'Employee', 'Firm', 'Merchant', 'Category', 'Amount', 'Status', 'Reimbursed']
      : claimTab === 'mileage'
      ? ['Date', 'Employee', 'Firm', 'From', 'To', 'Distance (km)', 'Amount', 'Status', 'Reimbursed']
      : ['Date', 'Firm', 'Merchant', 'Receipt No.', 'Category', 'Amount', 'Status', 'Payment', 'Linked'];
    const rows = claims.map((c) => {
      if (claimTab === 'claim') return [c.claim_date, c.employee_name, c.firm_name, c.merchant, c.category_name, c.amount, c.status, c.approval];
      if (claimTab === 'mileage') return [c.claim_date, c.employee_name, c.firm_name, c.from_location ?? '', c.to_location ?? '', c.distance_km ?? '', c.amount, c.status, c.approval];
      return [c.claim_date, c.firm_name, c.merchant, c.receipt_number ?? '', c.category_name, c.amount, c.status, c.payment_status, c.linked_payment_count > 0 ? 'Linked' : 'Unlinked'];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `claims-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const _openModal = useCallback(() => {
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
    // Receipts: auto-select logged-in user's employee record (company transactions)
    if (claimTab === 'receipt') {
      const myEmpId = session?.user?.employee_id;
      if (myEmpId && modalEmployees.find(e => e.id === myEmpId)) {
        setModalEmployeeId(myEmpId);
      } else if (modalEmployees.length > 0) {
        setModalEmployeeId(modalEmployees[0].id);
      }
    }
    setShowModal(true);
  }, [claimTab, firmId, firms, modalEmployees, session]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Single file — keep original OCR auto-fill flow
    if (files.length === 1) {
      const file = files[0];
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(file ? URL.createObjectURL(file) : null);

      setOcrScanning(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('categories', JSON.stringify(modalCategories.map((c) => c.name)));
        fd.append('context', 'claim');

        const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
        const json = await res.json();

        if (res.ok && json.multipleReceipts && json.receipts?.length > 1) {
          // Multiple receipts in one image — switch to batch review
          setShowModal(false);
          setOcrScanning(false);
          const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }) => {
            let catId = '';
            if (r.category) {
              const match = modalCategories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
              if (match) catId = match.id;
            }
            return {
              file,
              merchant: r.merchant || '',
              amount: r.amount ? String(r.amount) : '',
              claim_date: r.date || todayStr(),
              receipt_number: r.receiptNumber || '',
              category_id: catId,
              description: r.notes || '',
              ocrDone: true,
              ocrError: '',
            };
          });
          setBatchItems(items);
          setBatchFirmId(modalFirmId);
          setShowBatchReview(true);
          setBatchScanning(false);
          return;
        }

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
          if (f.notes) setModalDesc(f.notes);
          if (f.category) {
            const match = modalCategories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) setModalCategory(match.id);
          }

          // Auto-match employee from notes/merchant
          if (f.notes || f.merchant || f.vendor) {
            const text = `${f.notes || ''} ${f.merchant || ''} ${f.vendor || ''}`.toLowerCase();
            const empMatch = modalEmployees.find(e => text.includes(e.name.toLowerCase()));
            if (empMatch) setModalEmployeeId(empMatch.id);
          }
        }
      } catch (err) {
        console.error('OCR extraction failed:', err);
      } finally {
        setOcrScanning(false);
      }
      return;
    }

    // Multiple files — switch to batch review
    if (!modalFirmId) {
      setModalError('Please select a firm before batch uploading.');
      return;
    }
    setShowModal(false);

    const fileList = Array.from(files);
    const items: BatchClaimItem[] = fileList.map(file => ({
      file, merchant: '', amount: '', claim_date: todayStr(), receipt_number: '', category_id: '', description: '', ocrDone: false, ocrError: '',
    }));
    setBatchItems(items);
    setBatchFirmId(modalFirmId);
    setShowBatchReview(true);
    setBatchScanning(true);
    setBatchScanProgress({ current: 0, total: fileList.length });

    for (let i = 0; i < fileList.length; i++) {
      setBatchScanProgress({ current: i + 1, total: fileList.length });
      try {
        const ocrFd = new FormData();
        ocrFd.append('file', fileList[i]);
        ocrFd.append('categories', JSON.stringify(modalCategories.map((c) => c.name)));
        ocrFd.append('context', 'claim');
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          items[i].merchant = (isInvoice ? f.vendor : f.merchant) || '';
          items[i].receipt_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          items[i].claim_date = (isInvoice ? f.issueDate : f.date) || items[i].claim_date;
          items[i].amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          items[i].description = f.notes || '';
          if (f.category) {
            const match = modalCategories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) items[i].category_id = match.id;
          }
        }
        items[i].ocrDone = true;
      } catch (err) {
        items[i].ocrDone = true;
        items[i].ocrError = err instanceof Error ? err.message : 'OCR failed';
      }
      setBatchItems([...items]);
    }
    setBatchScanning(false);
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
      if (modalEmployeeId) fd.append('employee_id', modalEmployeeId);
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
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >

        {isDragging && (
          <div className="absolute inset-0 z-50 bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-xl shadow-lg px-8 py-6 text-center">
              <svg className="w-10 h-10 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold text-[#191C1E]">Drop files to upload</p>
              <p className="text-xs text-[#8E9196] mt-1">Files will be processed with OCR automatically</p>
            </div>
          </div>
        )}

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">{claimTab === 'receipt' ? 'Receipts' : claimTab === 'mileage' ? 'Mileage' : 'Claims'}</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">



          {/* ── Filter bar ────────────────────────────────── */}
          <FilterBar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            showPaymentFilter
            paymentValue={approvalFilter}
            onPaymentChange={setApprovalFilter}
            paymentOptions={[{ value: '', label: 'All Reimbursement' }, { value: 'unpaid', label: 'Pending' }, { value: 'paid', label: 'Reimbursed' }]}
            showSearch
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search merchant, employee or receipt no…"
          />

          {/* ── Success message ──────────────────────────── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={claims.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Table ───────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-gray-200 bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-full text-sm text-[#8E9196]">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-[#8E9196]">{claimTab === 'receipt' ? 'No receipts' : claimTab === 'mileage' ? 'No mileage claims' : 'No claims'} found for the selected filters.</div>
            ) : (
              <table className="w-full">
                <thead>
                  {claimTab === 'claim' && (
                    <tr className="ds-table-header text-left">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('claim_date')}>Date{sortIndicator('claim_date')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('employee_name')}>Employee{sortIndicator('employee_name')}</th>
                      {showFirm && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('merchant')}>Merchant{sortIndicator('merchant')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('category_name')}>Category{sortIndicator('category_name')}</th>
                      <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount (RM){sortIndicator('amount')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Reimbursed{sortIndicator('payment_status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('confidence')}>Confidence{sortIndicator('confidence')}</th>
                    </tr>
                  )}
                  {claimTab === 'receipt' && (
                    <tr className="ds-table-header text-left">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('claim_date')}>Date{sortIndicator('claim_date')}</th>
                      {showFirm && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('merchant')}>Merchant{sortIndicator('merchant')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('receipt_number')}>Receipt No.{sortIndicator('receipt_number')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('category_name')}>Category{sortIndicator('category_name')}</th>
                      <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount (RM){sortIndicator('amount')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Reimbursed{sortIndicator('payment_status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('confidence')}>Confidence{sortIndicator('confidence')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('linked_payment_count')}>Linked{sortIndicator('linked_payment_count')}</th>
                    </tr>
                  )}
                  {claimTab === 'mileage' && (
                    <tr className="ds-table-header text-left">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('claim_date')}>Date{sortIndicator('claim_date')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('employee_name')}>Employee{sortIndicator('employee_name')}</th>
                      {showFirm && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('from_location')}>From{sortIndicator('from_location')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('to_location')}>To{sortIndicator('to_location')}</th>
                      <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('distance_km')}>Distance (km){sortIndicator('distance_km')}</th>
                      <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount (RM){sortIndicator('amount')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Reimbursed{sortIndicator('payment_status')}</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {pagedClaims.map((c) => {
                    const isSelected = selectedRows.some((r) => r.id === c.id);
                    if (claimTab === 'claim') return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className="text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50">
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                        <td className="px-5 py-3 text-[#434654]">{c.employee_name}</td>
                        {showFirm && <td className="px-5 py-3 text-[#434654]">{c.firm_name}</td>}
                        <td className="px-5 py-3 text-[#434654]">{c.merchant}</td>
                        <td className="px-5 py-3 text-[#434654]">{c.category_name}</td>
                        <td className="px-5 py-3 text-[#434654] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                        <td className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>
                      </tr>
                    );
                    if (claimTab === 'mileage') return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className="text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50">
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                        <td className="px-5 py-3 text-[#434654]">{c.employee_name}</td>
                        {showFirm && <td className="px-5 py-3 text-[#434654]">{c.firm_name}</td>}
                        <td className="px-5 py-3 text-[#434654]">{c.from_location}</td>
                        <td className="px-5 py-3 text-[#434654]">{c.to_location}</td>
                        <td className="px-5 py-3 text-[#434654] text-right tabular-nums">{c.distance_km}</td>
                        <td className="px-5 py-3 text-[#434654] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                      </tr>
                    );
                    // receipt tab
                    return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className="text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50">
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                        {showFirm && <td className="px-5 py-3 text-[#434654]">{c.firm_name}</td>}
                        <td className="px-5 py-3 text-[#434654]">{c.merchant}</td>
                        <td className="px-5 py-3 text-[#434654]">{c.receipt_number}</td>
                        <td className="px-5 py-3 text-[#434654]">{c.category_name}</td>
                        <td className="px-5 py-3 text-[#434654] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                        <td className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>
                        <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                        <td className="px-5 py-3"><LinkedCell value={c.linked_payment_count} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination ───────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between flex-shrink-0 text-sm text-[#434654]">
              <span>Page {page + 1} of {totalPages} ({sorted.length} total)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ═══════════════════════ SUBMIT MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-scroll">
            <h3 className="text-base font-semibold text-[#191C1E]">Submit New {modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}</h3>
            <p className="text-sm text-[#434654] mt-1 mb-4">Fill in the details below.</p>

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
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Firm *</label>
                <select
                  value={modalFirmId}
                  onChange={(e) => setModalFirmId(e.target.value)}
                  className={`${inputCls} w-full`}
                >
                  <option value="">Select a firm</option>
                  {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              {modalEmployees.length > 0 && modalType !== 'receipt' && (
                <div>
                  <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Employee *</label>
                  <select
                    value={modalEmployeeId}
                    onChange={(e) => setModalEmployeeId(e.target.value)}
                    className={`${inputCls} w-full`}
                  >
                    <option value="">Select employee</option>
                    {modalEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Date *</label>
                <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className={`${inputCls} w-full`} required />
              </div>

              {modalType === 'mileage' ? (
                <>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">From *</label>
                    <input type="text" value={mileageFrom} onChange={(e) => setMileageFrom(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. PJ Office" autoFocus />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">To *</label>
                    <input type="text" value={mileageTo} onChange={(e) => setMileageTo(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Shah Alam client office" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Distance (km) *</label>
                    <input type="number" value={mileageDistance} onChange={(e) => setMileageDistance(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. 25" step="0.1" min="0" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Purpose *</label>
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
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Merchant Name *</label>
                    <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Petronas, Grab, etc." autoFocus />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Amount (RM) *</label>
                    <input type="number" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className={`${inputCls} w-full`} placeholder="0.00" step="0.01" min="0" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Category *</label>
                    <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className={`${inputCls} w-full`}>
                      <option value="">Select a category</option>
                      {modalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt Number</label>
                    <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className={`${inputCls} w-full`} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Description</label>
                    <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className={`${inputCls} w-full`} rows={2} placeholder="Optional" />
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
                            <img src={previewUrl} alt="Preview" className="mx-auto max-h-32 rounded" />
                          ) : null}
                          <p className="text-sm text-[#434654]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-[#434654]">Click or drag to upload receipt</p>
                          <p className="text-xs text-[#8E9196] mt-1">JPG, PNG, PDF up to 10MB</p>
                        </div>
                      )}
                      <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                    </div>
                    <p className="text-xs text-[#8E9196] mt-1">Select multiple files to batch upload with auto OCR</p>
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
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BATCH REVIEW MODAL ═══ */}
      {showBatchReview && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">
                Batch Review — {batchItems.length} claims
                {batchScanning && ` (Scanning ${batchScanProgress.current}/${batchScanProgress.total}...)`}
              </h2>
              <button onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            {batchScanning && (
              <div className="px-5 pt-3">
                <div className="flex items-center justify-between text-xs text-[#8E9196] mb-1">
                  <span>Scanning files with OCR...</span>
                  <span>{Math.round((batchScanProgress.current / batchScanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(batchScanProgress.current / batchScanProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            {modalEmployees.length > 0 && (
              <div className="px-5 pt-3">
                <label className="text-[10px] text-[#8E9196] uppercase font-semibold">Employee for all claims</label>
                <select value={modalEmployeeId} onChange={(e) => setModalEmployeeId(e.target.value)} className="input-field w-full text-xs mt-1">
                  <option value="">Select employee</option>
                  {modalEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex-1 overflow-y-scroll p-5 space-y-3">
              {batchItems.map((item, idx) => (
                <div key={idx} className={`border rounded-lg p-4 ${item.ocrDone ? (item.ocrError ? 'border-red-200 bg-red-50/30' : 'border-gray-200') : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[#191C1E] truncate flex-1">{item.file.name}</p>
                    {!item.ocrDone && <span className="text-xs text-[#8E9196] ml-2">Scanning...</span>}
                    {item.ocrError && <span className="text-xs text-red-600 ml-2">{item.ocrError}</span>}
                    <button onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-500 hover:text-red-700 ml-2">Remove</button>
                  </div>
                  {item.ocrDone && (
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Merchant</label>
                        <input value={item.merchant} onChange={(e) => { const next = [...batchItems]; next[idx].merchant = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Amount (RM)</label>
                        <input value={item.amount} onChange={(e) => { const next = [...batchItems]; next[idx].amount = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Date</label>
                        <input type="date" value={item.claim_date} onChange={(e) => { const next = [...batchItems]; next[idx].claim_date = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Receipt #</label>
                        <input value={item.receipt_number} onChange={(e) => { const next = [...batchItems]; next[idx].receipt_number = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Category</label>
                        <select value={item.category_id} onChange={(e) => { const next = [...batchItems]; next[idx].category_id = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs">
                          <option value="">Select...</option>
                          {modalCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] text-[#8E9196] uppercase">Description / Notes</label>
                        <input value={item.description} onChange={(e) => { const next = [...batchItems]; next[idx].description = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" placeholder="Phone number, account details, etc." />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t flex gap-2 flex-shrink-0">
              <button onClick={() => { setShowBatchReview(false); setBatchItems([]); }} disabled={batchScanning || batchSubmitting}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
                Cancel
              </button>
              <button onClick={submitBatchClaims} disabled={batchScanning || batchSubmitting || batchItems.length === 0}
                className="flex-1 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40">
                {batchSubmitting ? 'Submitting...' : `Submit All (${batchItems.length})`}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══════════════════════ BATCH BAR ═══════════════════════ */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl text-white" style={{ backgroundColor: 'var(--sidebar)' }}>
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={() => deleteClaims(selectedRows.map((r) => r.id))}
            className="text-sm px-4 py-1.5 rounded-full font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedRows([])}
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">
                {previewClaim.type === 'mileage' ? 'Mileage Claim' : previewClaim.type === 'receipt' ? 'Receipt Details' : 'Claim Details'}
              </h2>
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
                        employee_id: previewClaim.employee_id ?? '',
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

            <div className="flex-1 overflow-y-scroll p-5 space-y-4">
              {previewClaim.thumbnail_url ? (
                previewClaim.file_url ? (
                  <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
                )
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">
                  No image available
                </div>
              )}

              {editMode && editData ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Date</dt>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Merchant</dt>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Employee</dt>
                    <select value={editData.employee_id} onChange={(e) => setEditData({ ...editData, employee_id: e.target.value })} className={`${inputCls} w-full mt-0.5`}>
                      {modalEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                  <Field label="Firm" value={previewClaim.firm_name} />
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Category</dt>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className={`${inputCls} w-full mt-0.5`}>
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Amount (RM)</dt>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Receipt No.</dt>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Description</dt>
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
                      if (!confirm('Unlink this receipt from its payment?\n\nThis will:\n• Remove the payment link\n• Unmatch the bank transaction (if matched)\n• Reverse any posted journal entries from bank reconciliation')) return;
                      try {
                        const res = await fetch(`/api/claims/${previewClaim.id}/payment-link`, { method: 'DELETE' });
                        if (res.ok) {
                          refresh();
                          setPreviewClaim({ ...previewClaim, linked_payment_count: 0, linked_payments: [], payment_status: 'unpaid' });
                        }
                      } catch (e) { console.error(e); }
                    }}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
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
                <button
                  onClick={() => setPreviewClaim(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              )}
              <button
                onClick={() => deleteClaims([previewClaim.id])}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* Reject modal removed — accountant no longer approves/rejects claims */}

    </div>
  );
}

// ─── Small reusable sub-components ────────────────────────────────────────────

const inputCls = 'input-field';
