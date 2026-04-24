'use client';

import { Suspense, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import { StatusCell, ConfidenceCell, LinkedCell, PaymentStatusCell } from '@/components/table/StatusBadge';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { todayStr, formatRM, getDateRange } from '@/lib/formatters';
import { useFilters } from '@/hooks/useFilters';
import FilterBar from '@/components/filters/FilterBar';
import dynamic from 'next/dynamic';
const ClaimCreateModal = dynamic(() => import('@/components/claims/ClaimCreateModal'));
const ClaimPreviewPanel = dynamic(() => import('@/components/claims/ClaimPreviewPanel'));
import BatchUploadOverlay from '@/components/BatchUploadOverlay';
import SearchButton from '@/components/SearchButton';

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
  gl_account_id?: string | null;
  gl_account_label?: string | null;
  contra_gl_account_id?: string | null;
  linked_payment_count: number;
  linked_payments: { payment_id: string; amount: string; payment_date: string; reference: string | null; supplier_name: string }[];
}

interface Category {
  id: string;
  name: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface ClaimsPageConfig {
  role: 'accountant' | 'admin';
  apiClaims: string;
  apiBatch: string;
  apiDelete: string;
  apiCategories: string;
  apiEmployees: string;
  apiInvoices: string;
  linkPrefix: string;
  showFirmColumn: boolean;
  showStatusFilter: boolean;
  showGlFields: boolean;
  firmId?: string;
  firmsLoaded: boolean;
  firms?: { id: string; name: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateDot(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClaimsPageContentWrapper({ config }: { config: ClaimsPageConfig }) {
  return <Suspense><ClaimsPageContent config={config} /></Suspense>;
}

function ClaimsPageContent({ config }: { config: ClaimsPageConfig }) {
  usePageTitle('Claims');
  const { data: session } = useSession();

  const isAccountant = config.role === 'accountant';
  const firms = useMemo(() => config.firms ?? [], [config.firms]);

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

  // Invoice linking for receipts
  const [invoiceLinkSearch, setInvoiceLinkSearch] = useState('');
  const [invoiceLinkResults, setInvoiceLinkResults] = useState<{ id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number; issue_date: string }[]>([]);
  const [invoiceLinkLoading, setInvoiceLinkLoading] = useState(false);
  const [linkedInvoices, setLinkedInvoices] = useState<{ id: string; invoice_id: string; amount: number; invoice_number: string; vendor_name: string }[]>([]);
  const [suggestedInvoices, setSuggestedInvoices] = useState<{ id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number; issue_date: string; match_reason: string }[]>([]);
  const [pendingLinkInvoice, setPendingLinkInvoice] = useState<{ id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number } | null>(null);
  const [linkingInvoice, setLinkingInvoice] = useState(false);

  const confirmLinkInvoice = async () => {
    if (!pendingLinkInvoice || !previewClaim) return;
    setLinkingInvoice(true);
    try {
      const res = await fetch(`/api/invoices/${pendingLinkInvoice.id}/receipt-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId: previewClaim.id }),
      });
      const j = await res.json();
      if (res.ok) {
        setLinkedInvoices(prev => [...prev, {
          id: `temp-${pendingLinkInvoice.id}`,
          invoice_id: pendingLinkInvoice.id,
          amount: j.data?.amount ?? 0,
          invoice_number: pendingLinkInvoice.invoice_number,
          vendor_name: pendingLinkInvoice.vendor_name_raw,
        }]);
        setSuggestedInvoices(prev => prev.filter(s => s.id !== pendingLinkInvoice.id));
        setInvoiceLinkSearch('');
        setInvoiceLinkResults([]);
        setPendingLinkInvoice(null);
        refresh();
      } else {
        alert(j.error || 'Failed to link');
      }
    } catch (e) { console.error(e); }
    finally { setLinkingInvoice(false); }
  };

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
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Batch review
  interface BatchClaimItem {
    _id: string;
    file: File;
    merchant: string;
    amount: string;
    claim_date: string;
    receipt_number: string;
    category_id: string;
    description: string;
    ocrDone: boolean;
    ocrError: string;
    selected: boolean;
  }
  const [showBatchReview, setShowBatchReview] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchClaimItem[]>([]);
  const [batchScanning, setBatchScanning] = useState(false);
  const batchCancelRef = useRef(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchSubmitProgress, setBatchSubmitProgress] = useState({ current: 0, total: 0 });
  const [batchScanProgress, setBatchScanProgress] = useState({ current: 0, total: 0 });
  const [batchWarning, setBatchWarning] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);
  const [batchPreviewId, _setBatchPreviewId] = useState<string | null>(null);
  const [batchPreviewUrl, setBatchPreviewUrl] = useState<string | null>(null);
  const [batchPreviewType, setBatchPreviewType] = useState<string>('');
  const [batchFirmId, setBatchFirmId] = useState('');
  const setBatchPreviewId = (id: string | null) => {
    _setBatchPreviewId(id);
    if (batchPreviewUrl) URL.revokeObjectURL(batchPreviewUrl);
    if (id) {
      const found = batchItems.find(it => it._id === id);
      if (found) { setBatchPreviewUrl(URL.createObjectURL(found.file)); setBatchPreviewType(found.file.type); }
      else setBatchPreviewUrl(null);
    } else setBatchPreviewUrl(null);
  };

  const cancelBatchScan = () => {
    if (!confirm('Cancel scanning? All scanned items will be discarded.')) return;
    batchCancelRef.current = true;
    setBatchScanning(false);
    setShowBatchReview(false);
    setBatchItems([]);
    setBatchPreviewId(null);
  };

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

    // Accountant needs a firm selected
    const targetFirmId = isAccountant
      ? (config.firmId || (firms.length === 1 ? firms[0].id : ''))
      : '';
    if (isAccountant && !targetFirmId) {
      alert('Please select a firm before uploading.');
      return;
    }

    if (droppedFiles.length === 1) {
      // Single file — open modal and trigger OCR
      const file = droppedFiles[0];
      setModalType(claimTab);
      if (isAccountant) setModalFirmId(targetFirmId);
      setModalDate(todayStr());
      setModalMerchant('');
      setModalAmount('');
      setModalCategory(isAccountant ? '' : (modalCategories.length === 1 ? modalCategories[0].id : ''));
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
        // Categories may not be loaded yet — fetch inline
        let cats = modalCategories;
        if (isAccountant && cats.length === 0) {
          try {
            const catRes = await fetch(`${config.apiCategories}?firmId=${targetFirmId}`);
            const catJson = await catRes.json();
            cats = catJson.data ?? [];
            setModalCategories(cats);
          } catch { /* ignore */ }
        }
        fd.append('categories', JSON.stringify(cats.map((c: Category) => c.name)));
        fd.append('context', 'claim');

        // Fetch employees inline
        let emps = modalEmployees;
        if (isAccountant && emps.length === 0) {
          try {
            const empRes = await fetch(`${config.apiEmployees}?firmId=${targetFirmId}`);
            const empJson = await empRes.json();
            emps = (empJson.data ?? []).filter((emp: { is_active: boolean }) => emp.is_active);
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
          const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }, ridx: number) => {
            let catId = '';
            if (r.category) {
              const match = cats.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
              if (match) catId = match.id;
            }
            return {
              _id: `${Date.now()}-${ridx}`,
              file,
              merchant: r.merchant || '',
              amount: r.amount ? String(r.amount) : '',
              claim_date: r.date || todayStr(),
              receipt_number: r.receiptNumber || '',
              category_id: catId,
              description: r.notes || '',
              ocrDone: true,
              ocrError: '',
              selected: true,
            };
          });
          setBatchItems(items);
          if (isAccountant) setBatchFirmId(targetFirmId);
          // Auto-match employee for batch
          const firstR = json.receipts[0];
          if (firstR.notes || firstR.merchant) {
            const text = `${firstR.notes || ''} ${firstR.merchant || ''}`.toLowerCase();
            const empMatch = emps.find((emp: { id: string; name: string }) => text.includes(emp.name.toLowerCase()));
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
            const empMatch = emps.find((emp: { id: string; name: string }) => text.includes(emp.name.toLowerCase()));
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
    if (isAccountant && batchCategories.length === 0) {
      try {
        const catRes = await fetch(`${config.apiCategories}?firmId=${targetFirmId}`);
        const catJson = await catRes.json();
        batchCategories = catJson.data ?? [];
        setModalCategories(batchCategories);
      } catch { /* ignore */ }
    }

    if (droppedFiles.length > 20) {
      alert('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    const items: BatchClaimItem[] = droppedFiles.map((file, fi) => ({
      _id: `${Date.now()}-${fi}`, file, merchant: '', amount: '', claim_date: todayStr(), receipt_number: '', category_id: '', description: '', ocrDone: false, ocrError: '', selected: true,
    }));
    setBatchItems(items);
    if (isAccountant) {
      setBatchFirmId(targetFirmId);
      setModalEmployeeId('');
      fetch(`${config.apiEmployees}?firmId=${targetFirmId}`).then(r => r.json()).then(j => {
        const emps = (j.data ?? []).filter((emp: { is_active: boolean }) => emp.is_active);
        setModalEmployees(emps);
        if (emps.length === 1) setModalEmployeeId(emps[0].id);
      }).catch(console.error);
    }
    setShowBatchReview(true);
    setBatchScanning(true);
    batchCancelRef.current = false;
    setBatchScanProgress({ current: 0, total: droppedFiles.length });

    for (let i = 0; i < items.length; i++) {
      if (batchCancelRef.current) break;
      const itemId = items[i]._id;
      setBatchScanProgress({ current: i + 1, total: items.length });
      try {
        const ocrFd = new FormData();
        ocrFd.append('file', items[i].file);
        ocrFd.append('categories', JSON.stringify((isAccountant ? batchCategories : modalCategories).map((c) => c.name)));
        ocrFd.append('context', 'claim');
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        const updates: Partial<BatchClaimItem> = { ocrDone: true };
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          updates.merchant = (isInvoice ? f.vendor : f.merchant) || '';
          updates.receipt_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          updates.claim_date = (isInvoice ? f.issueDate : f.date) || items[i].claim_date;
          updates.amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          updates.description = f.notes || '';
          if (f.category) {
            const match = (isAccountant ? batchCategories : modalCategories).find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) updates.category_id = match.id;
          }
        }
        setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ...updates } : it));
      } catch (err) {
        setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ocrDone: true, ocrError: err instanceof Error ? err.message : 'OCR failed' } : it));
      }
    }
    setBatchScanning(false);
    setShowBatchReview(true);
  };

  const submitBatchClaims = async () => {
    const selected = batchItems.filter(i => i.selected);
    if (selected.length === 0) return;
    setShowBatchReview(false);
    setBatchItems([]);
    setBatchPreviewId(null);
    setBatchSubmitting(true);
    setBatchSubmitProgress({ current: 0, total: selected.length });
    const firmIdForBatch = isAccountant ? batchFirmId : '';
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];
    for (let si = 0; si < selected.length; si++) {
      const item = selected[si];
      setBatchSubmitProgress({ current: si + 1, total: selected.length });
      try {
        const fd = new FormData();
        if (isAccountant && firmIdForBatch) fd.append('firm_id', firmIdForBatch);
        if (modalEmployeeId) fd.append('employee_id', modalEmployeeId);
        fd.append('type', claimTab);
        fd.append('file', item.file);
        fd.append('claim_date', item.claim_date || todayStr());
        fd.append('merchant', item.merchant || item.file.name.replace(/\.[^/.]+$/, ''));
        fd.append('amount', item.amount || '0');
        if (item.receipt_number) fd.append('receipt_number', item.receipt_number);
        if (item.category_id) fd.append('category_id', item.category_id);
        if (item.description) fd.append('description', item.description);
        const res = await fetch(config.apiClaims, { method: 'POST', body: fd });
        if (res.ok) ok++;
        else {
          const json = await res.json().catch(() => ({ error: 'Failed' }));
          errors.push(`${item.file.name}: ${json.error}`);
          fail++;
        }
      } catch { fail++; }
    }
    setBatchSubmitting(false);
    setBatchWarning({ ok, fail, errors });
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

  // Load categories + employees
  useEffect(() => {
    if (isAccountant) {
      // Accountant: load when modal opens with firm selected
      if (showModal && modalFirmId) {
        Promise.all([
          fetch(`${config.apiCategories}?firmId=${modalFirmId}`).then((r) => r.json()),
          fetch(`${config.apiEmployees}?firmId=${modalFirmId}`).then((r) => r.json()),
        ]).then(([catJson, empJson]) => {
          setModalCategories(catJson.data ?? []);
          setModalCategory('');
          const emps = (empJson.data ?? []).filter((emp: { is_active: boolean }) => emp.is_active);
          setModalEmployees(emps);
          const myEmpId = session?.user?.employee_id;
          if (modalType === 'receipt' && myEmpId && emps.find((emp: { id: string }) => emp.id === myEmpId)) {
            setModalEmployeeId(myEmpId);
          } else if (modalType === 'receipt' && emps.length > 0) {
            setModalEmployeeId(emps[0].id);
          } else {
            setModalEmployeeId(emps.length === 1 ? emps[0].id : '');
          }
        }).catch(console.error);
      } else if (isAccountant) {
        setModalCategories([]);
        setModalEmployees([]);
        setModalEmployeeId('');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, modalFirmId]);

  // Admin: load categories + employees globally on mount
  useEffect(() => {
    if (!isAccountant) {
      Promise.all([
        fetch(config.apiCategories).then((r) => r.json()),
        fetch(config.apiEmployees).then((r) => r.json()),
      ]).then(([catJson, empJson]) => {
        setModalCategories(catJson.data ?? []);
        setCategories(catJson.data ?? []);
        const emps = (empJson.data ?? []).filter((emp: { is_active: boolean }) => emp.is_active);
        setModalEmployees(emps);
      }).catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync claimTab with URL ?type= param
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') ?? '';
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
    statusFilter, setStatusFilter,
    approvalFilter, setApprovalFilter,
  } = useFilters(config.showStatusFilter ? { initialStatus } : {});

  // Pagination
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Load claims
  useEffect(() => {
    if (!config.firmsLoaded) return;
    const controller = new AbortController();
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    p.set('type', claimTab);
    if (isAccountant && config.firmId) p.set('firmId', config.firmId);
    if (from)            p.set('dateFrom', from);
    if (to)              p.set('dateTo',   to);
    if (config.showStatusFilter && statusFilter) p.set('status', statusFilter);
    if (approvalFilter)  p.set('paymentStatus', approvalFilter);
    if (takeLimit)       p.set('take',     String(takeLimit));

    fetch(`${config.apiClaims}?${p}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((j) => { setClaims(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { console.error(e); setLoading(false); } });

    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimTab, config.firmId, dateRange, customFrom, customTo, statusFilter, approvalFilter, refreshKey, takeLimit, config.firmsLoaded]);

  // Auto-open preview from ?preview=id (global search navigation)
  const previewParam = searchParams.get('preview');
  useEffect(() => {
    if (!previewParam) return;
    // Try table data first, then fetch directly
    const match = claims.find((c) => c.id === previewParam);
    if (match) {
      setPreviewClaim(match);
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    // Fetch from API if not in current table view
    if (!loading) {
      fetch(`/api/search/preview?type=claim&id=${previewParam}`)
        .then((r) => r.json())
        .then((j) => { if (j.data) setPreviewClaim(j.data); })
        .finally(() => window.history.replaceState(null, '', window.location.pathname));
    }
  }, [previewParam, loading, claims]);

  // When previewClaim changes, exit edit mode
  useEffect(() => { setEditMode(false); setEditData(null); setInvoiceLinkSearch(''); setInvoiceLinkResults([]); }, [previewClaim]);

  // Fetch linked invoices + suggested matches when previewing a receipt
  useEffect(() => {
    if (!previewClaim || previewClaim.type !== 'receipt') { setLinkedInvoices([]); setSuggestedInvoices([]); return; }
    let cancelled = false;
    (async () => {
      let existing: typeof linkedInvoices = [];
      try {
        const res = await fetch(`/api/receipt-invoice-links?claimId=${previewClaim.id}`);
        const j = await res.json();
        existing = j.data ?? [];
        if (!cancelled) setLinkedInvoices(existing);
      } catch { if (!cancelled) setLinkedInvoices([]); }

      const merchant = previewClaim.merchant?.trim().replace(/[.\s]+$/, '');
      if (!merchant) return;
      const searchTerm = merchant.split(/\s+/).slice(0, 3).join(' ');
      try {
        const invoiceSearchUrl = isAccountant
          ? `${config.apiInvoices}?search=${encodeURIComponent(searchTerm)}&firmId=${previewClaim.firm_id}&take=20`
          : `${config.apiInvoices}?search=${encodeURIComponent(searchTerm)}&take=20`;
        const res = await fetch(invoiceSearchUrl);
        const j = await res.json();
        if (cancelled) return;
        const allInvs = (j.data ?? []) as { id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number; issue_date: string }[];
        const candidates = allInvs.filter(inv => Number(inv.total_amount) - Number(inv.amount_paid) > 0.01);
        const receiptAmt = Number(previewClaim.amount);
        const receiptDesc = (previewClaim.description || '').toLowerCase();
        const receiptRef = (previewClaim.receipt_number || '').toLowerCase();
        const alreadyLinkedIds = new Set(existing.map(l => l.invoice_id));
        const scored = candidates.filter(inv => !alreadyLinkedIds.has(inv.id)).map(inv => {
          const balance = Number(inv.total_amount) - Number(inv.amount_paid);
          const reasons: string[] = [];
          if (Math.abs(balance - receiptAmt) < 0.01) reasons.push('Exact amount match');
          else if (receiptAmt <= balance) reasons.push('Amount within balance');
          const invNum = (inv.invoice_number || '').toLowerCase();
          if (invNum && (receiptDesc.includes(invNum) || receiptRef.includes(invNum))) reasons.push('Reference match');
          if (inv.vendor_name_raw.toLowerCase().includes(merchant.toLowerCase())) reasons.push('Supplier match');
          return { ...inv, match_reason: reasons.join(' · ') || 'Supplier match', score: reasons.length };
        });
        scored.sort((a, b) => b.score - a.score);
        if (!cancelled) setSuggestedInvoices(scored.slice(0, 10));
      } catch { if (!cancelled) setSuggestedInvoices([]); }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewClaim]);

  // Fetch categories + employees for the claim's firm when entering edit mode
  useEffect(() => {
    if (editMode && previewClaim) {
      if (isAccountant) {
        fetch(`${config.apiCategories}?firmId=${previewClaim.firm_id}`)
          .then(r => r.json())
          .then(j => setCategories(j.data ?? []))
          .catch(console.error);
        fetch(`${config.apiEmployees}?firmId=${previewClaim.firm_id}`)
          .then(r => r.json())
          .then(j => setModalEmployees((j.data ?? []).filter((emp: { is_active: boolean }) => emp.is_active)))
          .catch(console.error);
      }
      // Admin already has categories/employees loaded globally
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, previewClaim]);

  // Sort
  const { sorted, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(claims, 'status', 'asc', 'confidence', 'asc');

  // Reset page when tab changes
  useEffect(() => { setPage(0); setSelectedRows([]); }, [claimTab]);

  // Reset page when sort changes
  useEffect(() => { setPage(0); }, [sortField, sortDir]);

  // Paged data
  const showFirm = config.showFirmColumn && !config.firmId;
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

  const batchReview = async (claimIds: string[]) => {
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    try {
      const res = await fetch(config.apiBatch, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds, action: 'review' }),
      });
      if (res.ok) {
        refresh();
        requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
        setSelectedRows([]);
        if (previewClaim && claimIds.includes(previewClaim.id)) setPreviewClaim(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteClaims = async (claimIds: string[]) => {
    const count = claimIds.length;
    if (!confirm(`Delete ${count} claim${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    try {
      const res = await fetch(config.apiDelete, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Failed to delete'); return; }
      refresh();
      requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
      setSelectedRows([]);
      if (previewClaim && claimIds.includes(previewClaim.id)) setPreviewClaim(null);
    } catch (e) {
      console.error(e);
    }
  };

  const saveEdit = async () => {
    if (!previewClaim || !editData) return;
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    setEditSaving(true);
    try {
      const res = await fetch(`${config.apiClaims}/${previewClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditMode(false);
        setEditData(null);
        refresh();
        requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEditSaving(false);
    }
  };

  const _openModal = useCallback(() => {
    setModalType(claimTab);
    if (isAccountant) {
      setModalFirmId(config.firmId || (firms.length === 1 ? firms[0].id : ''));
    }
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory(isAccountant ? '' : (modalCategories.length === 1 ? modalCategories[0].id : ''));
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
    // Receipts: auto-select logged-in user's employee record
    if (claimTab === 'receipt') {
      const myEmpId = session?.user?.employee_id;
      if (myEmpId && modalEmployees.find(emp => emp.id === myEmpId)) {
        setModalEmployeeId(myEmpId);
      } else if (modalEmployees.length > 0) {
        setModalEmployeeId(modalEmployees[0].id);
      }
    }
    setShowModal(true);
  }, [claimTab, config.firmId, firms, modalCategories, modalEmployees, session, isAccountant]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

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
          setShowModal(false);
          setOcrScanning(false);
          const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }, ridx: number) => {
            let catId = '';
            if (r.category) {
              const match = modalCategories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
              if (match) catId = match.id;
            }
            return {
              _id: `${Date.now()}-${ridx}`,
              file,
              merchant: r.merchant || '',
              amount: r.amount ? String(r.amount) : '',
              claim_date: r.date || todayStr(),
              receipt_number: r.receiptNumber || '',
              category_id: catId,
              description: r.notes || '',
              ocrDone: true,
              ocrError: '',
              selected: true,
            };
          });
          setBatchItems(items);
          if (isAccountant) setBatchFirmId(modalFirmId);
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
            const empMatch = modalEmployees.find(emp => text.includes(emp.name.toLowerCase()));
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
    if (isAccountant && !modalFirmId) {
      setModalError('Please select a firm before batch uploading.');
      return;
    }
    setShowModal(false);

    const fileList = Array.from(files);
    if (fileList.length > 20) {
      alert('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    const items: BatchClaimItem[] = fileList.map((file, fi) => ({
      _id: `${Date.now()}-${fi}`, file, merchant: '', amount: '', claim_date: todayStr(), receipt_number: '', category_id: '', description: '', ocrDone: false, ocrError: '', selected: true,
    }));
    setBatchItems(items);
    if (isAccountant) setBatchFirmId(modalFirmId);
    setShowBatchReview(true);
    setBatchScanning(true);
    batchCancelRef.current = false;
    setBatchScanProgress({ current: 0, total: fileList.length });

    for (let i = 0; i < fileList.length; i++) {
      if (batchCancelRef.current) break;
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
          const isInvoiceDoc = ocrJson.documentType === 'invoice';
          items[i].merchant = (isInvoiceDoc ? f.vendor : f.merchant) || '';
          items[i].receipt_number = (isInvoiceDoc ? f.invoiceNumber : f.receiptNumber) || '';
          items[i].claim_date = (isInvoiceDoc ? f.issueDate : f.date) || items[i].claim_date;
          items[i].amount = String(isInvoiceDoc ? f.totalAmount : f.amount) || '';
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
    setShowBatchReview(true);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitClaim = async () => {
    if (modalType === 'mileage') {
      const requiredMissing = isAccountant
        ? (!modalFirmId || !modalDate || !mileageFrom.trim() || !mileageTo.trim() || !mileageDistance || !mileagePurpose.trim())
        : (!modalDate || !mileageFrom.trim() || !mileageTo.trim() || !mileageDistance || !mileagePurpose.trim());
      if (requiredMissing) {
        setModalError(isAccountant ? 'Firm, date, from, to, distance, and purpose are required.' : 'Date, from, to, distance, and purpose are required.');
        return;
      }
    } else {
      const requiredMissing = isAccountant
        ? (!modalFirmId || !modalDate || !modalMerchant.trim() || !modalAmount || !modalCategory)
        : (!modalDate || !modalMerchant.trim() || !modalAmount || !modalCategory);
      if (requiredMissing) {
        setModalError(isAccountant ? 'Firm, date, merchant, amount, and category are required.' : 'Date, merchant, amount, and category are required.');
        return;
      }
    }

    setModalSaving(true);
    setModalError('');

    try {
      const fd = new FormData();
      if (isAccountant) fd.append('firm_id', modalFirmId);
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

      const res = await fetch(config.apiClaims, {
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
    <>
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >

        {isDragging && (
          <div className="absolute inset-0 z-50 bg-[var(--primary)]/10 border-2 border-dashed border-[var(--primary)] flex items-center justify-center pointer-events-none">
            <div className="bg-white shadow-lg px-8 py-6 text-center">
              <svg className="w-10 h-10 text-[var(--primary)] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Drop files to upload</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Files will be processed with OCR automatically</p>
            </div>
          </div>
        )}

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 pl-14 bg-white border-b border-[#E0E3E5]">
          <div>
            <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">{claimTab === 'receipt' ? 'Receipts' : claimTab === 'mileage' ? 'Mileage' : 'Claims'}</h1>
            {isAccountant && <p className="text-[10px] font-label text-[var(--text-secondary)] uppercase tracking-widest">{formatDateDot(todayStr())}</p>}
          </div>
          {!batchScanning && !batchSubmitting && <SearchButton />}
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 pt-8 px-8 pb-0 pl-14 paper-texture ledger-binding animate-in">

          {/* -- Filter bar ---------------------------------- */}
          <FilterBar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            showStatusFilter={config.showStatusFilter}
            statusValue={statusFilter}
            onStatusChange={setStatusFilter}
            showPaymentFilter
            paymentValue={approvalFilter}
            onPaymentChange={setApprovalFilter}
            paymentOptions={[{ value: '', label: 'All Reimbursement' }, { value: 'unpaid', label: 'Pending' }, { value: 'paid', label: 'Reimbursed' }]}
          />

          {/* -- Success message ------------------------------ */}
          {successMsg && (
            <div className="flex-shrink-0 bg-[var(--match-green)]/10 p-3">
              <p className="text-sm text-[var(--match-green)]">{successMsg}</p>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={claims.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* -- Table ---------------------------------------- */}
          <div ref={tableScrollRef} className="flex-1 min-h-0 overflow-y-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">{claimTab === 'receipt' ? 'No receipts' : claimTab === 'mileage' ? 'No mileage claims' : 'No claims'} found for the selected filters.</div>
            ) : (
              <table className="w-full">
                <thead>
                  {claimTab === 'claim' && (
                    <tr className="ds-table-header text-left">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" className="ds-table-checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
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
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" className="ds-table-checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('claim_date')}>Date{sortIndicator('claim_date')}</th>
                      {showFirm && <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('merchant')}>Merchant{sortIndicator('merchant')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('receipt_number')}>Receipt No.{sortIndicator('receipt_number')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('category_name')}>Category{sortIndicator('category_name')}</th>
                      <th className="px-5 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('amount')}>Amount (RM){sortIndicator('amount')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('confidence')}>Confidence{sortIndicator('confidence')}</th>
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('linked_payment_count')}>Linked{sortIndicator('linked_payment_count')}</th>
                    </tr>
                  )}
                  {claimTab === 'mileage' && (
                    <tr className="ds-table-header text-left">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" className="ds-table-checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
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
                  {pagedClaims.map((c, idx) => {
                    const isSelected = selectedRows.some((r) => r.id === c.id);
                    const rowBg = idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white';
                    if (claimTab === 'claim') return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${rowBg}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="ds-table-checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td data-col="Date" className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(c.claim_date)}</td>
                        <td data-col="Employee" className="px-5 py-3 text-[var(--text-secondary)]">{c.employee_name}</td>
                        {showFirm && <td data-col="Firm" className="px-5 py-3 text-[var(--text-secondary)]">{c.firm_name}</td>}
                        <td data-col="Merchant" className="px-5 py-3 text-[var(--text-secondary)]">{c.merchant}</td>
                        <td data-col="Category" className="px-5 py-3 text-[var(--text-secondary)]">{c.category_name}</td>
                        <td data-col="Amount" className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td data-col="Status" className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td data-col="Reimbursed" className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                        <td data-col="Confidence" className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>
                      </tr>
                    );
                    if (claimTab === 'mileage') return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${rowBg}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="ds-table-checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td data-col="Date" className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(c.claim_date)}</td>
                        <td data-col="Employee" className="px-5 py-3 text-[var(--text-secondary)]">{c.employee_name}</td>
                        {showFirm && <td data-col="Firm" className="px-5 py-3 text-[var(--text-secondary)]">{c.firm_name}</td>}
                        <td data-col="From" className="px-5 py-3 text-[var(--text-secondary)]">{c.from_location}</td>
                        <td data-col="To" className="px-5 py-3 text-[var(--text-secondary)]">{c.to_location}</td>
                        <td data-col="Distance" className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{c.distance_km}</td>
                        <td data-col="Amount" className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td data-col="Status" className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td data-col="Reimbursed" className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                      </tr>
                    );
                    // receipt tab
                    return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${rowBg}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="ds-table-checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td data-col="Date" className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(c.claim_date)}</td>
                        {showFirm && <td data-col="Firm" className="px-5 py-3 text-[var(--text-secondary)]">{c.firm_name}</td>}
                        <td data-col="Merchant" className="px-5 py-3 text-[var(--text-secondary)]">{c.merchant}</td>
                        <td data-col="Receipt No." className="px-5 py-3 text-[var(--text-secondary)]">{c.receipt_number}</td>
                        <td data-col="Category" className="px-5 py-3 text-[var(--text-secondary)]">{c.category_name}</td>
                        <td data-col="Amount" className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td data-col="Status" className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td data-col="Confidence" className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>
                        <td data-col="Linked" className="px-5 py-3"><LinkedCell value={c.linked_payment_count} /></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-10">
                  <tr className="border-t-2 border-[var(--surface-highest)]">
                    <td className="bg-[var(--surface-header)]" />
                    <td className="px-5 py-3 text-xs font-label font-bold uppercase tracking-widest text-[var(--text-secondary)] bg-[var(--surface-header)]">
                      {sorted.length} item{sorted.length !== 1 ? 's' : ''}
                    </td>
                    {claimTab === 'claim' && <><td className="bg-[var(--surface-header)]" />{showFirm && <td className="bg-[var(--surface-header)]" />}<td className="bg-[var(--surface-header)]" /><td className="bg-[var(--surface-header)]" /></>}
                    {claimTab === 'receipt' && <>{showFirm && <td className="bg-[var(--surface-header)]" />}<td className="bg-[var(--surface-header)]" /><td className="bg-[var(--surface-header)]" /><td className="bg-[var(--surface-header)]" /></>}
                    {claimTab === 'mileage' && <><td className="bg-[var(--surface-header)]" />{showFirm && <td className="bg-[var(--surface-header)]" />}<td className="bg-[var(--surface-header)]" /><td className="bg-[var(--surface-header)]" /><td className="px-5 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums text-sm bg-[var(--surface-header)]">{sorted.reduce((s, c) => s + Number(c.distance_km ?? 0), 0).toFixed(1)} km</td></>}
                    {claimTab !== 'mileage' && <td className="bg-[var(--surface-header)]" />}
                    <td className="px-5 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums text-sm bg-[var(--surface-header)]">
                      {formatRM(sorted.reduce((s, c) => s + Number(c.amount), 0).toFixed(2))}
                    </td>
                    <td className="bg-[var(--surface-header)]" />
                    <td className="bg-[var(--surface-header)]" />
                    {claimTab === 'claim' && <td className="bg-[var(--surface-header)]" />}
                    {claimTab === 'receipt' && <td className="bg-[var(--surface-header)]" />}
                    {claimTab === 'mileage' && <td className="bg-[var(--surface-header)]" />}
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* -- Pagination ----------------------------------- */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between flex-shrink-0 text-sm text-[var(--text-secondary)]">
              <span>Page {page + 1} of {totalPages} ({sorted.length} total)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="btn-thick-white px-3 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="btn-thick-white px-3 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* === SUBMIT MODAL === */}
      {showModal && (
        <ClaimCreateModal
          config={config}
          firms={firms}
          modalType={modalType}
          setModalType={setModalType}
          modalFirmId={modalFirmId}
          setModalFirmId={setModalFirmId}
          modalEmployeeId={modalEmployeeId}
          setModalEmployeeId={setModalEmployeeId}
          modalEmployees={modalEmployees}
          modalDate={modalDate}
          setModalDate={setModalDate}
          modalMerchant={modalMerchant}
          setModalMerchant={setModalMerchant}
          modalAmount={modalAmount}
          setModalAmount={setModalAmount}
          modalCategory={modalCategory}
          setModalCategory={setModalCategory}
          modalCategories={modalCategories}
          modalReceipt={modalReceipt}
          setModalReceipt={setModalReceipt}
          modalDesc={modalDesc}
          setModalDesc={setModalDesc}
          selectedFile={selectedFile}
          previewUrl={previewUrl}
          modalError={modalError}
          modalSaving={modalSaving}
          ocrScanning={ocrScanning}
          fileInputRef={fileInputRef}
          mileageFrom={mileageFrom}
          setMileageFrom={setMileageFrom}
          mileageTo={mileageTo}
          setMileageTo={setMileageTo}
          mileageDistance={mileageDistance}
          setMileageDistance={setMileageDistance}
          mileagePurpose={mileagePurpose}
          setMileagePurpose={setMileagePurpose}
          mileageRate={mileageRate}
          handleFileChange={handleFileChange}
          clearFile={clearFile}
          submitClaim={submitClaim}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* === BATCH BAR === */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 shadow-2xl text-white bg-[var(--primary)]">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          {/* Admin: Mark as Reviewed */}
          {!isAccountant && (
            <button
              onClick={() => batchReview(selectedRows.map((r) => r.id))}
              className="btn-thick-green text-sm px-4 py-1.5"
            >
              Mark as Reviewed
            </button>
          )}
          <button
            onClick={() => deleteClaims(selectedRows.map((r) => r.id))}
            className="btn-thick-red text-sm px-4 py-1.5 font-medium"
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

      {/* === BATCH REVIEW MODAL === */}
      {showBatchReview && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => { if (batchScanning) { setShowBatchReview(false); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { if (batchScanning) { setShowBatchReview(false); } }}>
          <div className="bg-white shadow-2xl w-full max-w-[1200px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <div className="flex items-center gap-3">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">
                  Batch Review — {batchItems.length} claims
                  {batchScanning && ` (Scanning ${batchScanProgress.current}/${batchScanProgress.total}...)`}
                </h2>
                {!batchScanning && batchItems.some(i => i.ocrDone) && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={batchItems.filter(i => i.ocrDone).every(i => i.selected)}
                      onChange={(e) => setBatchItems(prev => prev.map(i => i.ocrDone ? { ...i, selected: e.target.checked } : i))}
                      className="w-3.5 h-3.5 accent-white"
                    />
                    <span className="text-white/70 text-xs">Select All</span>
                  </label>
                )}
              </div>
              <button onClick={() => { if (batchScanning) { cancelBatchScan(); } else if (!batchSubmitting && confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); } }} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
            </div>
            {batchScanning && (
              <div className="px-5 pt-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                  <span>Scanning files with OCR...</span>
                  <span className="tabular-nums">{Math.round((batchScanProgress.current / batchScanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-[var(--surface-low)] h-2">
                  <div className="bg-[var(--primary)] h-2 transition-all" style={{ width: `${(batchScanProgress.current / batchScanProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            {modalEmployees.length > 0 && (
              <div className="px-5 pt-3">
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee for all claims</label>
                <select value={modalEmployeeId} onChange={(e) => setModalEmployeeId(e.target.value)} className="input-recessed w-full text-xs mt-1">
                  <option value="">Select employee</option>
                  {modalEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
            )}
            <div className="flex-1 overflow-hidden flex">
            <div className={`flex-1 overflow-y-scroll p-5 space-y-3 ${batchPreviewId ? 'max-w-[60%]' : ''}`}>
              {batchItems.map((item) => (
                <div key={item._id} className={`p-4 cursor-pointer transition-colors ${batchPreviewId === item._id ? 'ring-2 ring-[var(--primary)]' : ''} ${item.ocrDone ? (item.ocrError ? 'bg-[var(--reject-red)]/5' : 'bg-white hover:bg-[var(--surface-low)]/50') : 'bg-[var(--surface-low)] opacity-60'}`} onClick={() => item.ocrDone && setBatchPreviewId(batchPreviewId === item._id ? null : item._id)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {item.ocrDone && (
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={(e) => { e.stopPropagation(); setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, selected: e.target.checked } : it)); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-[var(--primary)] flex-shrink-0"
                        />
                      )}
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">{item.file.name}</p>
                    </div>
                    {!item.ocrDone && <span className="text-xs text-[var(--text-muted)] ml-2">Scanning...</span>}
                    {item.ocrError && <span className="text-xs text-[var(--reject-red)] ml-2">{item.ocrError}</span>}
                    <button onClick={(e) => { e.stopPropagation(); if (batchPreviewId === item._id) setBatchPreviewId(null); setBatchItems(prev => prev.filter(it => it._id !== item._id)); }} className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80 ml-2">Remove</button>
                  </div>
                  {item.ocrDone && (
                    <div className="grid grid-cols-4 gap-2" onClick={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') e.stopPropagation(); }}>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</label>
                        <input value={item.merchant} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, merchant: v } : it)); }} className="input-recessed w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                        <input value={item.amount} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, amount: v } : it)); }} className="input-recessed w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                        <input type="date" value={item.claim_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, claim_date: v } : it)); }} className="input-recessed w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt #</label>
                        <input value={item.receipt_number} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, receipt_number: v } : it)); }} className="input-recessed w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                        <select value={item.category_id} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, category_id: v } : it)); }} className="input-recessed w-full text-xs">
                          <option value="">Select...</option>
                          {modalCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description / Notes</label>
                        <input value={item.description} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, description: v } : it)); }} className="input-recessed w-full text-xs" placeholder="Phone number, account details, etc." />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* File preview panel */}
            {batchPreviewId && batchPreviewUrl && (
              <div className="w-[40%] border-l border-[#E0E3E5] flex flex-col bg-[var(--surface-low)]">
                <div className="h-10 flex items-center justify-between px-4 border-b border-[#E0E3E5] bg-white">
                  <span className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Preview</span>
                  <button onClick={() => setBatchPreviewId(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none">&times;</button>
                </div>
                <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
                  {batchPreviewType === 'application/pdf' ? (
                    <iframe key={batchPreviewId} src={batchPreviewUrl} className="w-full h-full min-h-[500px]" title="PDF Preview" />
                  ) : (
                    <img key={batchPreviewId} src={batchPreviewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                  )}
                </div>
              </div>
            )}
            </div>
            <div className="px-5 py-3 flex items-center gap-2 flex-shrink-0 bg-[var(--surface-low)] border-t border-[#E0E3E5]">
              <span className="text-xs text-[var(--text-secondary)] mr-auto">{batchItems.filter(i => i.selected).length} of {batchItems.length} selected</span>
              <button onClick={() => { if (batchScanning) { cancelBatchScan(); } else if (confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); } }} disabled={batchSubmitting}
                className="btn-thick-white px-6 py-2 text-sm font-semibold disabled:opacity-40">
                Cancel
              </button>
              <button onClick={submitBatchClaims} disabled={batchScanning || batchSubmitting || batchItems.filter(i => i.selected).length === 0}
                className="btn-thick-navy px-6 py-2 text-sm font-semibold disabled:opacity-40">
                {batchSubmitting ? 'Submitting...' : `Submit Selected (${batchItems.filter(i => i.selected).length})`}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* === BATCH WARNING MODAL === */}
      {batchWarning && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setBatchWarning(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setBatchWarning(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[480px] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center px-5 flex-shrink-0 bg-amber-500">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Batch Upload Complete</h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-[var(--text-primary)]">
                <span className="font-bold text-green-700">{batchWarning.ok}</span> claim{batchWarning.ok !== 1 ? 's' : ''} submitted
                {batchWarning.fail > 0 && <>, <span className="font-bold text-[var(--reject-red)]">{batchWarning.fail}</span> failed</>}
              </p>
              {batchWarning.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3 space-y-1 max-h-[120px] overflow-y-auto">
                  <p className="text-xs font-bold text-[var(--reject-red)] uppercase tracking-widest">Failed Items</p>
                  {batchWarning.errors.map((d, i) => <p key={i} className="text-xs text-red-700">{d}</p>)}
                </div>
              )}
              <div className="bg-amber-50 border border-amber-300 p-3">
                <p className="text-sm text-amber-800 font-medium">Please review the uploaded claims to ensure all details are correct before approving.</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-[var(--surface-low)]">
              <button onClick={() => setBatchWarning(null)} className="btn-thick-navy w-full py-2.5 text-sm font-semibold">
                Got it — I will review
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* === RECEIPT PREVIEW === */}
      {previewClaim && (
        <ClaimPreviewPanel
          config={config}
          previewClaim={previewClaim}
          setPreviewClaim={setPreviewClaim}
          showFirm={showFirm}
          editMode={editMode}
          setEditMode={setEditMode}
          editData={editData}
          setEditData={setEditData}
          editSaving={editSaving}
          saveEdit={saveEdit}
          categories={categories}
          modalCategories={modalCategories}
          modalEmployees={modalEmployees}
          invoiceLinkSearch={invoiceLinkSearch}
          setInvoiceLinkSearch={setInvoiceLinkSearch}
          invoiceLinkResults={invoiceLinkResults}
          setInvoiceLinkResults={setInvoiceLinkResults}
          invoiceLinkLoading={invoiceLinkLoading}
          setInvoiceLinkLoading={setInvoiceLinkLoading}
          linkedInvoices={linkedInvoices}
          setLinkedInvoices={setLinkedInvoices}
          suggestedInvoices={suggestedInvoices}
          setSuggestedInvoices={setSuggestedInvoices}
          pendingLinkInvoice={pendingLinkInvoice}
          setPendingLinkInvoice={setPendingLinkInvoice}
          linkingInvoice={linkingInvoice}
          confirmLinkInvoice={confirmLinkInvoice}
          batchReview={batchReview}
          deleteClaims={deleteClaims}
          refresh={refresh}
          onPrev={(() => {
            const idx = sorted.findIndex(c => c.id === previewClaim.id);
            return idx > 0 ? () => setPreviewClaim(sorted[idx - 1]) : undefined;
          })()}
          onNext={(() => {
            const idx = sorted.findIndex(c => c.id === previewClaim.id);
            return idx >= 0 && idx < sorted.length - 1 ? () => setPreviewClaim(sorted[idx + 1]) : undefined;
          })()}
        />
      )}

      <BatchUploadOverlay
        active={batchSubmitting || (batchScanning && !showBatchReview)}
        label={batchSubmitting ? 'Uploading claims...' : 'Scanning documents...'}
        current={batchSubmitting ? batchSubmitProgress.current : batchScanProgress.current}
        total={batchSubmitting ? batchSubmitProgress.total : batchScanProgress.total}
        onExpand={batchScanning && !showBatchReview ? () => setShowBatchReview(true) : undefined}
        onCancel={batchScanning && !showBatchReview ? cancelBatchScan : undefined}
      />

    </>
  );
}
