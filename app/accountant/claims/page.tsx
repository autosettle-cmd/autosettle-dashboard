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
import { todayStr, formatRM, getDateRange } from '@/lib/formatters';
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

/** Dot-notation date: YYYY.MM.DD */
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
  const [batchWarning, setBatchWarning] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);
  const [batchPreviewId, _setBatchPreviewId] = useState<string | null>(null);
  const [batchPreviewUrl, setBatchPreviewUrl] = useState<string | null>(null);
  const [batchPreviewType, setBatchPreviewType] = useState<string>('');
  const setBatchPreviewId = (id: string | null) => {
    _setBatchPreviewId(id);
    if (batchPreviewUrl) URL.revokeObjectURL(batchPreviewUrl);
    if (id) {
      const found = batchItems.find(it => it._id === id);
      if (found) { setBatchPreviewUrl(URL.createObjectURL(found.file)); setBatchPreviewType(found.file.type); }
      else setBatchPreviewUrl(null);
    } else setBatchPreviewUrl(null);
  };

  useEffect(() => {
    if (!batchScanning && !batchSubmitting) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [batchScanning, batchSubmitting]);

  const cancelBatchScan = () => {
    if (!confirm('Cancel scanning? All scanned items will be discarded.')) return;
    batchCancelRef.current = true;
    setBatchScanning(false);
    setShowBatchReview(false);
    setBatchItems([]);
    setBatchPreviewId(null);
  };

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

    if (droppedFiles.length > 20) {
      alert('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    const items: BatchClaimItem[] = droppedFiles.map((file, fi) => ({
      _id: `${Date.now()}-${fi}`, file, merchant: '', amount: '', claim_date: todayStr(), receipt_number: '', category_id: '', description: '', ocrDone: false, ocrError: '', selected: true,
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
    batchCancelRef.current = false;
    setBatchScanProgress({ current: 0, total: droppedFiles.length });

    for (let i = 0; i < items.length; i++) {
      if (batchCancelRef.current) break;
      const itemId = items[i]._id;
      setBatchScanProgress({ current: i + 1, total: items.length });
      try {
        const ocrFd = new FormData();
        ocrFd.append('file', items[i].file);
        ocrFd.append('categories', JSON.stringify(batchCategories.map((c) => c.name)));
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
            const match = batchCategories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
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
    const firmId = batchFirmId;
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];
    for (let si = 0; si < selected.length; si++) {
      const item = selected[si];
      setBatchSubmitProgress({ current: si + 1, total: selected.length });
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
  useEffect(() => { setEditMode(false); setEditData(null); setInvoiceLinkSearch(''); setInvoiceLinkResults([]); }, [previewClaim]);

  // Fetch linked invoices + auto-link best match when previewing a receipt
  useEffect(() => {
    if (!previewClaim || previewClaim.type !== 'receipt') { setLinkedInvoices([]); setSuggestedInvoices([]); return; }
    let cancelled = false;
    (async () => {
      // Fetch existing links
      let existing: typeof linkedInvoices = [];
      try {
        const res = await fetch(`/api/receipt-invoice-links?claimId=${previewClaim.id}`);
        const j = await res.json();
        existing = j.data ?? [];
        if (!cancelled) setLinkedInvoices(existing);
      } catch { if (!cancelled) setLinkedInvoices([]); }

      // Search for matching invoices by merchant
      const merchant = previewClaim.merchant?.trim().replace(/[.\s]+$/, '');
      if (!merchant) return;
      const searchTerm = merchant.split(/\s+/).slice(0, 3).join(' ');
      try {
        const res = await fetch(`/api/invoices?search=${encodeURIComponent(searchTerm)}&firmId=${previewClaim.firm_id}&take=20`);
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

        // Best match is shown first in suggestions — user must confirm manually
      } catch { if (!cancelled) setSuggestedInvoices([]); }
    })();
    return () => { cancelled = true; };
  }, [previewClaim]);

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
      : ['Date', 'Firm', 'Merchant', 'Receipt No.', 'Category', 'Amount', 'Status', 'Confidence', 'Linked'];
    const rows = claims.map((c) => {
      if (claimTab === 'claim') return [c.claim_date, c.employee_name, c.firm_name, c.merchant, c.category_name, c.amount, c.status, c.approval];
      if (claimTab === 'mileage') return [c.claim_date, c.employee_name, c.firm_name, c.from_location ?? '', c.to_location ?? '', c.distance_km ?? '', c.amount, c.status, c.approval];
      return [c.claim_date, c.firm_name, c.merchant, c.receipt_number ?? '', c.category_name, c.amount, c.status, c.confidence, c.linked_payment_count > 0 ? 'Linked' : 'Unlinked'];
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
    if (fileList.length > 20) {
      alert('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    const items: BatchClaimItem[] = fileList.map((file, fi) => ({
      _id: `${Date.now()}-${fi}`, file, merchant: '', amount: '', claim_date: todayStr(), receipt_number: '', category_id: '', description: '', ocrDone: false, ocrError: '', selected: true,
    }));
    setBatchItems(items);
    setBatchFirmId(modalFirmId);
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
    <div className="flex h-screen overflow-hidden bg-[var(--surface-base)]">

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
            <p className="text-[10px] font-label text-[var(--text-secondary)] uppercase tracking-widest">{formatDateDot(todayStr())}</p>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">



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
            <div className="flex-shrink-0 bg-[var(--match-green)]/10 p-3">
              <p className="text-sm text-[var(--match-green)]">{successMsg}</p>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={claims.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Table ───────────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {loading ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-[var(--text-muted)]">{claimTab === 'receipt' ? 'No receipts' : claimTab === 'mileage' ? 'No mileage claims' : 'No claims'} found for the selected filters.</div>
            ) : (
              <table className="w-full">
                <thead>
                  {claimTab === 'claim' && (
                    <tr className="bg-[var(--surface-header)] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">
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
                    <tr className="bg-[var(--surface-header)] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">
                      <th className="px-3 py-2.5 w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} /></th>
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
                    <tr className="bg-[var(--surface-header)] text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-left">
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
                  {pagedClaims.map((c, idx) => {
                    const isSelected = selectedRows.some((r) => r.id === c.id);
                    const rowBg = idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white';
                    if (claimTab === 'claim') return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${rowBg}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(c.claim_date)}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.employee_name}</td>
                        {showFirm && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.firm_name}</td>}
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.merchant}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.category_name}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                        <td className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>
                      </tr>
                    );
                    if (claimTab === 'mileage') return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${rowBg}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(c.claim_date)}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.employee_name}</td>
                        {showFirm && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.firm_name}</td>}
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.from_location}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.to_location}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{c.distance_km}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>
                      </tr>
                    );
                    // receipt tab
                    return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${rowBg}`}>
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(c)} /></td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(c.claim_date)}</td>
                        {showFirm && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.firm_name}</td>}
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.merchant}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.receipt_number}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">{c.category_name}</td>
                        <td className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                        <td className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>
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

      {/* ═══════════════════════ SUBMIT MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h3 className="text-white font-bold text-sm uppercase tracking-widest">Submit New {modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}</h3>
              <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-scroll p-6 space-y-3">

            {/* Document preview */}
            {selectedFile && (() => {
              const url = URL.createObjectURL(selectedFile);
              const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
              return (
                <div className="overflow-hidden bg-[var(--surface-low)] mb-4">
                  {isPdf ? (
                    <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-[300px]" title="Document preview" />
                  ) : (
                    <img src={url} alt="Document preview" className="w-full max-h-[300px] object-contain" />
                  )}
                </div>
              );
            })()}

            {/* ── Type Toggle ── */}
            <div className="flex overflow-hidden mb-4">
              {(['claim', 'receipt', 'mileage'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setModalType(t)}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${modalType === t ? 'bg-[var(--primary)] text-white' : 'bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-low)]'}`}
                >
                  {t === 'claim' ? 'Claim' : t === 'receipt' ? 'Receipt' : 'Mileage'}
                </button>
              ))}
            </div>

            {modalError && (
              <div className="mb-4 bg-[var(--reject-red)]/10 p-3">
                <p className="text-sm text-[var(--reject-red)]">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Firm *</label>
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
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Employee *</label>
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
                <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Date *</label>
                <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className={`${inputCls} w-full`} required />
              </div>

              {modalType === 'mileage' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">From *</label>
                    <input type="text" value={mileageFrom} onChange={(e) => setMileageFrom(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. PJ Office" autoFocus />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">To *</label>
                    <input type="text" value={mileageTo} onChange={(e) => setMileageTo(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Shah Alam client office" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Distance (km) *</label>
                    <input type="number" value={mileageDistance} onChange={(e) => setMileageDistance(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. 25" step="0.1" min="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Purpose *</label>
                    <input type="text" value={mileagePurpose} onChange={(e) => setMileagePurpose(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Client meeting with ABC Sdn Bhd" />
                  </div>
                  {mileageDistance && parseFloat(mileageDistance) > 0 && (
                    <div className="bg-[var(--primary)]/10 p-3">
                      <p className="text-sm text-[var(--primary)] font-medium tabular-nums">
                        Amount: RM {(parseFloat(mileageDistance) * mileageRate).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-[var(--primary)]/70 mt-0.5 tabular-nums">{mileageDistance} km x RM {mileageRate.toFixed(2)}/km</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Merchant Name *</label>
                    <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className={`${inputCls} w-full`} placeholder="e.g. Petronas, Grab, etc." autoFocus />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Amount (RM) *</label>
                    <input type="number" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className={`${inputCls} w-full`} placeholder="0.00" step="0.01" min="0" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Category *</label>
                    <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className={`${inputCls} w-full`}>
                      <option value="">Select a category</option>
                      {modalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Receipt Number</label>
                    <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className={`${inputCls} w-full`} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Description</label>
                    <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className={`${inputCls} w-full`} rows={2} placeholder="Optional" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Receipt</label>
                    <div
                      className="border-2 border-dashed border-[var(--outline-ghost)] p-4 text-center cursor-pointer hover:border-[var(--outline)] transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {selectedFile ? (
                        <div className="space-y-2">
                          {selectedFile.type === 'application/pdf' ? (
                            <div className="mx-auto w-16 h-20 bg-[var(--reject-red)]/10 flex items-center justify-center">
                              <span className="text-[var(--reject-red)] font-bold text-xs">PDF</span>
                            </div>
                          ) : previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="mx-auto max-h-32" />
                          ) : null}
                          <p className="text-sm text-[var(--text-secondary)]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                          <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80">Remove</button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-[var(--text-secondary)]">Click or drag to upload receipt</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">JPG, PNG, PDF up to 10MB</p>
                        </div>
                      )}
                      <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Select multiple files to batch upload with auto OCR</p>
                    {ocrScanning && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-[var(--primary)]">
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
            </div>

            <div className="flex gap-3 px-5 py-3 bg-[var(--surface-low)]">
              <button
                onClick={submitClaim}
                disabled={modalSaving || ocrScanning}
                className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : `Submit ${modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}`}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="btn-thick-white flex-1 py-2.5 text-sm font-semibold disabled:opacity-40"
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
              <button onClick={() => { if (batchScanning) { cancelBatchScan(); } else if (!batchSubmitting && confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); } }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            {batchScanning && (
              <div className="px-5 pt-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                  <span>Scanning files with OCR...</span>
                  <span>{Math.round((batchScanProgress.current / batchScanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-[var(--surface-low)] h-2">
                  <div className="bg-[var(--primary)] h-2 transition-all" style={{ width: `${(batchScanProgress.current / batchScanProgress.total) * 100}%` }} />
                </div>
              </div>
            )}
            {modalEmployees.length > 0 && (
              <div className="px-5 pt-3">
                <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee for all claims</label>
                <select value={modalEmployeeId} onChange={(e) => setModalEmployeeId(e.target.value)} className="input-field w-full text-xs mt-1">
                  <option value="">Select employee</option>
                  {modalEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
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
                        <input value={item.merchant} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, merchant: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                        <input value={item.amount} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, amount: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                        <input type="date" value={item.claim_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, claim_date: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt #</label>
                        <input value={item.receipt_number} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, receipt_number: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                        <select value={item.category_id} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, category_id: v } : it)); }} className="input-field w-full text-xs">
                          <option value="">Select...</option>
                          {modalCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description / Notes</label>
                        <input value={item.description} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, description: v } : it)); }} className="input-field w-full text-xs" placeholder="Phone number, account details, etc." />
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

      {/* ═══ BATCH WARNING MODAL ═══ */}
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

      {/* ═══════════════════════ BATCH BAR ═══════════════════════ */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 shadow-2xl text-white bg-[var(--primary)]">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
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

      {/* ═══════════════════════ RECEIPT PREVIEW ═══════════════════════ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">
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
                  className={`text-sm px-2.5 py-1 transition-colors ${editMode ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
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
                    <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--outline-ghost)] cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain border border-[var(--outline-ghost)]" />
                )
              ) : (
                <div className="w-full h-40 border border-[var(--outline-ghost)] bg-[var(--surface-low)] flex items-center justify-center text-[var(--text-muted)] text-sm">
                  No image available
                </div>
              )}

              {editMode && editData ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</dt>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</dt>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</dt>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</dt>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className={`${inputCls} w-full mt-0.5`}>
                      <option value="">Select category</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt Number</dt>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description</dt>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className={`${inputCls} w-full mt-0.5`} />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee</dt>
                    <select value={editData.employee_id} onChange={(e) => setEditData({ ...editData, employee_id: e.target.value })} className={`${inputCls} w-full mt-0.5`}>
                      {modalEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                  <Field label="Firm" value={previewClaim.firm_name} />
                  {previewClaim.type === 'receipt' && (
                    <div className="bg-[var(--surface-low)] p-3 space-y-2">
                      <dt className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Linked Invoices</dt>
                      {linkedInvoices.length > 0 && (
                        <div className="space-y-1.5">
                          {linkedInvoices.map(li => (
                            <div key={li.id} className="flex items-center justify-between bg-white px-2.5 py-1.5">
                              <div className="text-sm">
                                <span className="font-medium text-[var(--text-secondary)]">{li.invoice_number || 'No number'}</span>
                                <span className="text-[var(--text-muted)] ml-1.5">{li.vendor_name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">{formatRM(li.amount)}</span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm('Unlink this receipt from the invoice?')) return;
                                    try {
                                      const res = await fetch(`/api/invoices/${li.invoice_id}/receipt-link`, {
                                        method: 'DELETE',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ claimId: previewClaim.id }),
                                      });
                                      if (res.ok) {
                                        setLinkedInvoices(prev => prev.filter(x => x.id !== li.id));
                                        refresh();
                                      }
                                    } catch (e) { console.error(e); }
                                  }}
                                  className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80"
                                >&times;</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        placeholder="Search invoice number or supplier..."
                        value={invoiceLinkSearch}
                        onChange={(e) => {
                          const q = e.target.value;
                          setInvoiceLinkSearch(q);
                          if (q.length < 2) { setInvoiceLinkResults([]); return; }
                          setInvoiceLinkLoading(true);
                          fetch(`/api/invoices?search=${encodeURIComponent(q)}&firmId=${previewClaim.firm_id}&take=10`)
                            .then(r => r.json())
                            .then(j => {
                              const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id));
                              setInvoiceLinkResults((j.data ?? []).filter((inv: { id: string }) => !alreadyLinked.has(inv.id)));
                            })
                            .catch(console.error)
                            .finally(() => setInvoiceLinkLoading(false));
                        }}
                        className="input-field w-full text-sm"
                      />
                      {(() => {
                        const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id));
                        const displayList = invoiceLinkSearch.length >= 2
                          ? invoiceLinkResults
                          : suggestedInvoices.filter(s => !alreadyLinked.has(s.id));
                        if (displayList.length === 0) return null;
                        return (
                          <div>
                            {invoiceLinkSearch.length < 2 && <p className="text-xs text-[var(--text-muted)] mb-1">Suggested matches:</p>}
                            <div className="max-h-36 overflow-y-auto space-y-1">
                              {displayList.map(inv => (
                                <button
                                  type="button"
                                  key={inv.id}
                                  onClick={() => setPendingLinkInvoice({ id: inv.id, invoice_number: inv.invoice_number, vendor_name_raw: inv.vendor_name_raw, total_amount: inv.total_amount, amount_paid: inv.amount_paid })}
                                  className={`w-full text-left px-2.5 py-1.5 transition-colors ${pendingLinkInvoice?.id === inv.id ? 'bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]' : 'hover:bg-[var(--primary)]/5'}`}
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-[var(--text-secondary)]">{inv.invoice_number || 'No number'}</span>
                                    <span className="text-xs text-[var(--text-muted)] tabular-nums">{formatRM(inv.total_amount)}</span>
                                  </div>
                                  <p className="text-xs text-[var(--text-muted)]">
                                    {inv.vendor_name_raw} &middot; Balance: {formatRM(Number(inv.total_amount) - Number(inv.amount_paid))}
                                    {'match_reason' in inv && inv.match_reason ? ` · ${inv.match_reason}` : ''}
                                  </p>
                                </button>
                              ))}
                            </div>
                            {pendingLinkInvoice && (
                              <button onClick={confirmLinkInvoice} disabled={linkingInvoice} className="btn-thick-green w-full py-2 mt-2 text-sm">
                                {linkingInvoice ? 'Linking...' : `Confirm Link to ${pendingLinkInvoice.invoice_number || 'Invoice'}`}
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </dl>
              ) : (
                <dl className="space-y-3">
                  <Field label="Date"        value={formatDateDot(previewClaim.claim_date)} />
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
                  <span key={cfg!.label} className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium ${cfg!.cls}`} style={{ boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.05)' }}>
                    {cfg!.label}
                  </span>
                ))}
              </div>

              {previewClaim.type === 'receipt' && previewClaim.linked_payments.length > 0 && (
                <div className="bg-[var(--primary)]/10 p-3 space-y-2">
                  <p className="text-[10px] font-label font-bold text-[var(--primary)] uppercase tracking-widest">Linked Payment</p>
                  {previewClaim.linked_payments.map((lp) => (
                    <div key={lp.payment_id} className="text-sm text-[var(--primary)]">
                      <p className="font-medium">{lp.supplier_name}</p>
                      <p className="text-xs text-[var(--primary)]/70 tabular-nums">
                        {formatRM(lp.amount)} &middot; {formatDateDot(lp.payment_date)}
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
                    className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80 font-medium"
                  >
                    Unlink from Payment
                  </button>
                </div>
              )}

              {/* Invoice Linking for receipts */}
              {previewClaim.type === 'receipt' && (
                <div className="bg-[var(--surface-low)] p-3 space-y-2">
                  <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Linked Invoices</p>
                  {linkedInvoices.length > 0 ? (
                    <div className="space-y-1.5">
                      {linkedInvoices.map(li => (
                        <div key={li.id} className="flex items-center justify-between bg-white px-2.5 py-1.5">
                          <div className="text-sm">
                            <span className="font-medium text-[var(--text-secondary)]">{li.invoice_number || 'No number'}</span>
                            <span className="text-[var(--text-muted)] ml-1.5">{li.vendor_name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">{formatRM(li.amount)}</span>
                            <button
                              onClick={async () => {
                                if (!confirm('Unlink this receipt from the invoice?')) return;
                                try {
                                  const res = await fetch(`/api/invoices/${li.invoice_id}/receipt-link`, {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ claimId: previewClaim.id }),
                                  });
                                  if (res.ok) {
                                    setLinkedInvoices(prev => prev.filter(x => x.id !== li.id));
                                    refresh();
                                  }
                                } catch (e) { console.error(e); }
                              }}
                              className="text-xs text-[var(--reject-red)] hover:text-[var(--reject-red)]/80"
                            >
                              &times;
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">No invoices linked yet.</p>
                  )}
                  {/* Search & link */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search invoice number or supplier..."
                      value={invoiceLinkSearch}
                      onChange={(e) => {
                        const q = e.target.value;
                        setInvoiceLinkSearch(q);
                        if (q.length < 2) { setInvoiceLinkResults([]); return; }
                        setInvoiceLinkLoading(true);
                        fetch(`/api/invoices?search=${encodeURIComponent(q)}&firmId=${previewClaim.firm_id}&paymentStatus=unpaid&take=10`)
                          .then(r => r.json())
                          .then(j => {
                            const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id));
                            setInvoiceLinkResults((j.data ?? []).filter((inv: { id: string }) => !alreadyLinked.has(inv.id)));
                          })
                          .catch(console.error)
                          .finally(() => setInvoiceLinkLoading(false));
                      }}
                      className="input-field w-full text-sm"
                    />
                    {invoiceLinkLoading && <span className="absolute right-2 top-2 text-xs text-[var(--text-muted)]">Searching...</span>}
                  </div>
                  {/* Show search results when typing, or auto-suggestions when idle */}
                  {(() => {
                    const alreadyLinked = new Set(linkedInvoices.map(li => li.invoice_id));
                    const displayList = invoiceLinkSearch.length >= 2
                      ? invoiceLinkResults
                      : suggestedInvoices.filter(s => !alreadyLinked.has(s.id));
                    if (displayList.length === 0) return null;
                    return (
                      <div>
                        {invoiceLinkSearch.length < 2 && <p className="text-xs text-[var(--text-muted)] mb-1">Suggested matches:</p>}
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {displayList.map(inv => (
                            <button
                              key={inv.id}
                              onClick={() => setPendingLinkInvoice({ id: inv.id, invoice_number: inv.invoice_number, vendor_name_raw: inv.vendor_name_raw, total_amount: inv.total_amount, amount_paid: inv.amount_paid })}
                              className={`w-full text-left px-2.5 py-1.5 transition-colors ${pendingLinkInvoice?.id === inv.id ? 'bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]' : 'hover:bg-[var(--primary)]/5'}`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-[var(--text-secondary)]">{inv.invoice_number || 'No number'}</span>
                                <span className="text-xs text-[var(--text-muted)] tabular-nums">{formatRM(inv.total_amount)}</span>
                              </div>
                              <p className="text-xs text-[var(--text-muted)]">
                                {inv.vendor_name_raw} &middot; Balance: {formatRM(Number(inv.total_amount) - Number(inv.amount_paid))}
                                {'match_reason' in inv && inv.match_reason ? ` · ${inv.match_reason}` : ''}
                              </p>
                            </button>
                          ))}
                        </div>
                        {pendingLinkInvoice && (
                          <button onClick={confirmLinkInvoice} disabled={linkingInvoice} className="btn-thick-green w-full py-2 mt-2 text-sm">
                            {linkingInvoice ? 'Linking...' : `Confirm Link to ${pendingLinkInvoice.invoice_number || 'Invoice'}`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-label text-[var(--text-secondary)] uppercase tracking-widest font-bold">Confidence</span>
                <span className={`text-xs font-semibold ${
                  previewClaim.confidence === 'HIGH'   ? 'text-[var(--match-green)]' :
                  previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'
                }`}>{previewClaim.confidence}</span>
              </div>

              {previewClaim.rejection_reason && (
                <div className="bg-[var(--reject-red)]/10 p-3">
                  <p className="text-[10px] font-label font-bold text-[var(--reject-red)] uppercase tracking-widest mb-1">Rejection Reason</p>
                  <p className="text-sm text-[var(--reject-red)]">{previewClaim.rejection_reason}</p>
                </div>
              )}

              {previewClaim.file_url && (
                <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-[var(--primary)] hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>

            <div className="p-4 flex gap-3 flex-shrink-0 bg-[var(--surface-low)]">
              {editMode ? (
                <button
                  onClick={saveEdit}
                  disabled={editSaving}
                  className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <button
                  onClick={() => setPreviewClaim(null)}
                  className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                >
                  Close
                </button>
              )}
              <button
                onClick={() => deleteClaims([previewClaim.id])}
                className="text-xs text-[var(--reject-red)]/60 hover:text-[var(--reject-red)] transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* Reject modal removed — accountant no longer approves/rejects claims */}

      {(batchSubmitting || (batchScanning && !showBatchReview)) && (
        <div className="fixed bottom-6 right-6 z-30 bg-white shadow-2xl border border-[#E0E3E5] w-[320px] animate-in cursor-pointer" onClick={() => { if (batchScanning && !showBatchReview) setShowBatchReview(true); }}>
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">{batchSubmitting ? 'Uploading claims...' : 'Scanning documents...'}</p>
              <p className="text-xs text-[var(--text-secondary)]">{batchSubmitting ? batchSubmitProgress.current : batchScanProgress.current} of {batchSubmitting ? batchSubmitProgress.total : batchScanProgress.total}</p>
            </div>
            <span className="text-sm font-bold tabular-nums text-[var(--primary)]">{Math.round(((batchSubmitting ? batchSubmitProgress.current : batchScanProgress.current) / (batchSubmitting ? batchSubmitProgress.total : batchScanProgress.total)) * 100)}%</span>
          </div>
          <div className="h-1 bg-[var(--surface-low)]">
            <div className="h-1 transition-all" style={{ backgroundColor: 'var(--primary)', width: `${((batchSubmitting ? batchSubmitProgress.current : batchScanProgress.current) / (batchSubmitting ? batchSubmitProgress.total : batchScanProgress.total)) * 100}%` }} />
          </div>
          {batchScanning && !showBatchReview && (
            <div className="px-4 pb-2 flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-secondary)]">Click to expand</span>
              <button onClick={(e) => { e.stopPropagation(); cancelBatchScan(); }} className="text-[10px] text-[var(--reject-red)] hover:opacity-80 font-medium">Cancel</button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Small reusable sub-components ────────────────────────────────────────────

const inputCls = 'input-field';
