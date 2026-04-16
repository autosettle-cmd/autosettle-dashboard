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
import FilterBar from '@/components/filters/FilterBar';
import { STATUS_CFG, PAYMENT_CFG } from '@/lib/badge-config';

// ─── Local formatDate (YYYY.MM.DD dot notation) ─────────────────────────────

function formatDate(val: string | null | undefined): string {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_id: string;
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminClaimsPageWrapper() {
  return <Suspense><AdminClaimsPage /></Suspense>;
}

function AdminClaimsPage() {
  usePageTitle('Claims');
  const { data: session } = useSession();
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
  const [editCategories, setEditCategories] = useState<{ id: string; name: string }[]>([]);

  // Invoice linking for receipts
  const [invoiceLinkSearch, setInvoiceLinkSearch] = useState('');
  const [invoiceLinkResults, setInvoiceLinkResults] = useState<{ id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number; issue_date: string }[]>([]);
  const [invoiceLinkLoading, setInvoiceLinkLoading] = useState(false);
  const [linkedInvoices, setLinkedInvoices] = useState<{ id: string; invoice_id: string; amount: number; invoice_number: string; vendor_name: string }[]>([]);
  const [suggestedInvoices, setSuggestedInvoices] = useState<{ id: string; invoice_number: string; vendor_name_raw: string; total_amount: number; amount_paid: number; issue_date: string; match_reason: string }[]>([]);

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
  const [modalEmployeeId, setModalEmployeeId] = useState('');
  const [modalEmployees, setModalEmployees]   = useState<{ id: string; name: string }[]>([]);
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

    if (droppedFiles.length === 1) {
      // Single file — open modal and trigger OCR
      const file = droppedFiles[0];
      setModalType(claimTab);
      setModalDate(todayStr());
      setModalMerchant('');
      setModalAmount('');
      setModalCategory(modalCategories.length === 1 ? modalCategories[0].id : '');
      setModalReceipt('');
      setModalDesc('');
      setModalSaving(false);
      setShowModal(true);
      setSelectedFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setModalError('');

      // Trigger OCR scan
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

    // Multiple files — OCR all first, then show batch review
    const items: BatchClaimItem[] = droppedFiles.map(file => ({
      file,
      merchant: '',
      amount: '',
      claim_date: todayStr(),
      receipt_number: '',
      category_id: '',
      description: '',
      ocrDone: false,
      ocrError: '',
    }));
    setBatchItems(items);
    setShowBatchReview(true);
    setBatchScanning(true);
    setBatchScanProgress({ current: 0, total: droppedFiles.length });

    for (let i = 0; i < droppedFiles.length; i++) {
      setBatchScanProgress({ current: i + 1, total: droppedFiles.length });
      try {
        const ocrFd = new FormData();
        ocrFd.append('file', droppedFiles[i]);
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

  const submitBatchClaims = async () => {
    setBatchSubmitting(true);
    let ok = 0;
    let fail = 0;
    for (const item of batchItems) {
      try {
        const fd = new FormData();
        if (modalEmployeeId) fd.append('employee_id', modalEmployeeId);
        fd.append('type', claimTab);
        fd.append('file', item.file);
        fd.append('claim_date', item.claim_date || todayStr());
        fd.append('merchant', item.merchant || item.file.name.replace(/\.[^/.]+$/, ''));
        fd.append('amount', item.amount || '0');
        if (item.receipt_number) fd.append('receipt_number', item.receipt_number);
        if (item.category_id) fd.append('category_id', item.category_id);
        if (item.description) fd.append('description', item.description);

        const res = await fetch('/api/admin/claims', { method: 'POST', body: fd });
        if (res.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
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

  // Reset edit mode when preview changes
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
        const res = await fetch(`/api/admin/invoices?search=${encodeURIComponent(searchTerm)}&take=20`);
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

        // Auto-link best match if no existing links and we have a good candidate (score >= 2)
        if (existing.length === 0 && scored.length > 0 && scored[0].score >= 2) {
          const best = scored[0];
          try {
            const linkRes = await fetch(`/api/invoices/${best.id}/receipt-link`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ claimId: previewClaim.id }),
            });
            const linkJ = await linkRes.json();
            if (linkRes.ok && !cancelled) {
              setLinkedInvoices([{
                id: `auto-${best.id}`,
                invoice_id: best.id,
                amount: linkJ.data?.amount ?? 0,
                invoice_number: best.invoice_number,
                vendor_name: best.vendor_name_raw,
              }]);
              setSuggestedInvoices(prev => prev.filter(s => s.id !== best.id));
              refresh();
            }
          } catch { /* auto-link failed, user can still link manually */ }
        }
      } catch { if (!cancelled) setSuggestedInvoices([]); }
    })();
    return () => { cancelled = true; };
  }, [previewClaim]);

  // Cleanup blob URL on unmount
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

  // Load categories + employees for modal + edit
  useEffect(() => {
    Promise.all([
      fetch('/api/admin/categories').then((r) => r.json()),
      fetch('/api/admin/employees').then((r) => r.json()),
    ]).then(([catJson, empJson]) => {
      setModalCategories(catJson.data ?? []);
      setEditCategories(catJson.data ?? []);
      const emps = (empJson.data ?? []).filter((e: { is_active: boolean }) => e.is_active);
      setModalEmployees(emps);
    }).catch(console.error);
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
  // Sync claimTab with URL ?type= param (reacts to sidebar navigation)
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
    search, setSearch,
  } = useFilters({ initialStatus });

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
    if (statusFilter)   p.set('status',   statusFilter);
    if (approvalFilter) p.set('paymentStatus', approvalFilter);
    if (search)         p.set('search',   search);
    if (takeLimit)      p.set('take',     String(takeLimit));

    fetch(`/api/admin/claims?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setClaims(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [claimTab, dateRange, customFrom, customTo, statusFilter, approvalFilter, search, refreshKey, takeLimit]);



  // Sort
  const { sorted, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(claims, 'status', 'asc', 'confidence', 'asc');

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

  const _openModal = useCallback(() => {
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
  }, [claimTab, modalCategories, modalEmployees, session]);

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
        fd.append('context', 'claim');

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();

      if (res.ok && json.multipleReceipts && json.receipts?.length > 1) {
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
        console.log('[Submit] Validation failed:', { modalDate, modalMerchant, modalAmount, modalCategory });
        setModalError('Date, merchant, amount, and category are required.');
        return;
      }
    }

    setModalSaving(true);
    setModalError('');

    try {
      const fd = new FormData();
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

  const deleteClaims = async (claimIds: string[]) => {
    const count = claimIds.length;
    if (!confirm(`Delete ${count} claim${count !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/admin/claims/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Failed to delete'); return; }
      refresh();
      setSelectedIds(new Set());
      if (previewClaim && claimIds.includes(previewClaim.id)) setPreviewClaim(null);
    } catch (e) {
      console.error(e);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--surface-base)]">

      {/* === SIDEBAR === */}
      <Sidebar role="admin" />

      {/* === MAIN === */}
      <div className="flex-1 flex flex-col overflow-hidden relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>

        {isDragging && (
          <div className="absolute inset-0 z-50 bg-blue-600/10 border-2 border-dashed border-blue-500 flex items-center justify-center pointer-events-none">
            <div className="bg-white shadow-lg px-8 py-6 text-center">
              <svg className="w-10 h-10 text-blue-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Drop files to upload</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Files will be processed with OCR automatically</p>
            </div>
          </div>
        )}

        <header className="h-16 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-[#E0E3E5] pl-14">
          <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">{claimTab === 'receipt' ? 'Receipts' : claimTab === 'mileage' ? 'Mileage' : 'Claims'}</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 paper-texture ledger-binding animate-in">



          {/* -- Filter bar ---------------------------------- */}
          <FilterBar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customFrom={customFrom}
            customTo={customTo}
            onCustomFromChange={setCustomFrom}
            onCustomToChange={setCustomTo}
            showStatusFilter
            statusValue={statusFilter}
            onStatusChange={setStatusFilter}
            showPaymentFilter
            paymentValue={approvalFilter}
            onPaymentChange={setApprovalFilter}
            paymentOptions={[{ value: '', label: 'All Reimbursement' }, { value: 'unpaid', label: 'Pending' }, { value: 'paid', label: 'Reimbursed' }]}
            showSearch
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search merchant, employee or receipt no..."
          />

          {/* -- Success message ------------------------------ */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={claims.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* -- Table ---------------------------------------- */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--surface-header)] text-left">
                  <th className="px-3 py-2.5 w-10 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]"><input type="checkbox" checked={pagedClaims.length > 0 && pagedClaims.every((c) => selectedIds.has(c.id))} onChange={toggleSelectAll} /></th>
                  <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('claim_date')}>Date{sortIndicator('claim_date')}</th>
                  {claimTab === 'claim' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('employee_name')}>Employee{sortIndicator('employee_name')}</th>}
                  {claimTab !== 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('merchant')}>Merchant{sortIndicator('merchant')}</th>}
                  {claimTab === 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('receipt_number')}>Receipt No.{sortIndicator('receipt_number')}</th>}
                  {claimTab !== 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('category_name')}>Category{sortIndicator('category_name')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('employee_name')}>Employee{sortIndicator('employee_name')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('from_location')}>From{sortIndicator('from_location')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('to_location')}>To{sortIndicator('to_location')}</th>}
                  {claimTab === 'mileage' && <th className="px-5 py-2.5 text-right cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('distance_km')}>Distance (km){sortIndicator('distance_km')}</th>}
                  <th className="px-5 py-2.5 text-right cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('amount')}>Amount (RM){sortIndicator('amount')}</th>
                  <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                  {claimTab !== 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('payment_status')}>Reimbursed{sortIndicator('payment_status')}</th>}
                  {claimTab !== 'mileage' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('confidence')}>Confidence{sortIndicator('confidence')}</th>}
                  {claimTab === 'receipt' && <th className="px-5 py-2.5 cursor-pointer select-none text-xs font-label uppercase tracking-widest text-[var(--text-secondary)]" onClick={() => toggleSort('linked_payment_count')}>Linked{sortIndicator('linked_payment_count')}</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={20} className="px-5 py-12 text-center text-body-sm text-[var(--text-muted)]">Loading...</td></tr>
                ) : pagedClaims.length === 0 ? (
                  <tr><td colSpan={20} className="px-5 py-12 text-center text-body-sm text-[var(--text-muted)]">{claimTab === 'receipt' ? 'No receipts' : claimTab === 'mileage' ? 'No mileage claims' : 'No claims'} found for the selected filters.</td></tr>
                ) : pagedClaims.map((c, idx) => (
                  <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}>
                    <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} /></td>
                    <td className="px-5 py-3 text-[var(--text-secondary)] tabular-nums">{formatDate(c.claim_date)}</td>
                    {claimTab === 'claim' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.employee_name}</td>}
                    {claimTab !== 'mileage' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.merchant}</td>}
                    {claimTab === 'receipt' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.receipt_number}</td>}
                    {claimTab !== 'mileage' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.category_name}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.employee_name}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.from_location}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[var(--text-secondary)]">{c.to_location}</td>}
                    {claimTab === 'mileage' && <td className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{c.distance_km}</td>}
                    <td className="px-5 py-3 text-[var(--text-secondary)] text-right tabular-nums">{Number(c.amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3"><StatusCell value={c.status} /></td>
                    {claimTab !== 'receipt' && <td className="px-5 py-3"><PaymentStatusCell value={c.payment_status} /></td>}
                    {claimTab !== 'mileage' && <td className="px-5 py-3"><ConfidenceCell value={c.confidence} /></td>}
                    {claimTab === 'receipt' && <td className="px-5 py-3"><LinkedCell value={c.linked_payment_count} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--outline-ghost)]">
                <p className="text-body-sm text-[var(--text-muted)] tabular-nums">{page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-thick-white px-3 py-1.5 text-body-sm disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                  <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="btn-thick-white px-3 py-1.5 text-body-sm disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                </div>
              </div>
            )}
          </div>

        </main>
      </div>

      {/* === SUBMIT MODAL === */}
      {showModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h3 className="text-sm font-bold text-white uppercase tracking-widest">Submit New {modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-scroll p-5 space-y-4">
              <p className="text-[10px] font-label text-[var(--text-secondary)] uppercase tracking-widest">Fill in the details below</p>

              {/* Document preview */}
              {selectedFile && (() => {
                const url = URL.createObjectURL(selectedFile);
                const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
                return (
                  <div className="border border-[var(--outline-ghost)] overflow-hidden bg-[var(--surface-low)] mb-4">
                    {isPdf ? (
                      <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-[300px]" title="Document preview" />
                    ) : (
                      <img src={url} alt="Document preview" className="w-full max-h-[300px] object-contain" />
                    )}
                  </div>
                );
              })()}

              {/* -- Type Toggle -- */}
              <div className="flex border border-[var(--outline-ghost)] overflow-hidden mb-4">
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
                <div className="mb-4 bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-700">{modalError}</p>
                </div>
              )}

              <div className="space-y-3">
                {modalEmployees.length > 0 && modalType !== 'receipt' && (
                  <div>
                    <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Employee *</label>
                    <select value={modalEmployeeId} onChange={(e) => setModalEmployeeId(e.target.value)} className="input-field w-full">
                      <option value="">Select employee</option>
                      {modalEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Date *</label>
                  <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className="input-field w-full" required />
                </div>

                {modalType === 'mileage' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">From *</label>
                      <input type="text" value={mileageFrom} onChange={(e) => setMileageFrom(e.target.value)} className="input-field w-full" placeholder="e.g. PJ Office" autoFocus />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">To *</label>
                      <input type="text" value={mileageTo} onChange={(e) => setMileageTo(e.target.value)} className="input-field w-full" placeholder="e.g. Shah Alam client office" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Distance (km) *</label>
                      <input type="number" value={mileageDistance} onChange={(e) => setMileageDistance(e.target.value)} className="input-field w-full" placeholder="e.g. 25" step="0.1" min="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Purpose *</label>
                      <input type="text" value={mileagePurpose} onChange={(e) => setMileagePurpose(e.target.value)} className="input-field w-full" placeholder="e.g. Client meeting with ABC Sdn Bhd" />
                    </div>
                    {mileageDistance && parseFloat(mileageDistance) > 0 && (
                      <div className="bg-blue-50 border border-blue-200 p-3">
                        <p className="text-sm text-blue-800 font-medium tabular-nums">
                          Amount: RM {(parseFloat(mileageDistance) * mileageRate).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-blue-600 mt-0.5 tabular-nums">{mileageDistance} km x RM {mileageRate.toFixed(2)}/km</p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Merchant Name *</label>
                      <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className="input-field w-full" placeholder="e.g. Petronas, Grab, etc." autoFocus />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Amount (RM) *</label>
                      <input type="number" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className="input-field w-full" placeholder="0.00" step="0.01" min="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Category *</label>
                      <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className="input-field w-full">
                        <option value="">Select a category</option>
                        {modalCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Receipt Number</label>
                      <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className="input-field w-full" placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Description</label>
                      <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className="input-field w-full" rows={2} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Receipt</label>
                      <div
                        className="border-2 border-dashed border-[var(--outline-ghost)] p-4 text-center cursor-pointer hover:border-[var(--text-muted)] transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {selectedFile ? (
                          <div className="space-y-2">
                            {selectedFile.type === 'application/pdf' ? (
                              <div className="mx-auto w-16 h-20 bg-red-50 border border-red-200 flex items-center justify-center">
                                <span className="text-red-500 font-bold text-xs">PDF</span>
                              </div>
                            ) : previewUrl ? (
                              <img src={previewUrl} alt="Preview" className="mx-auto max-h-32" />
                            ) : null}
                            <p className="text-sm text-[var(--text-secondary)]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                            <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-[var(--primary)] hover:opacity-80">Remove</button>
                          </div>
                        ) : (
                          <div>
                            <p className="text-sm text-[var(--text-secondary)]">Click or drag to upload receipt</p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">JPG, PNG, PDF up to 10MB</p>
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
            </div>

            <div className="flex gap-3 p-4 bg-[var(--surface-low)]">
              <button
                onClick={submitClaim}
                disabled={modalSaving || ocrScanning}
                className="btn-thick-navy flex-1 py-2.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : `Submit ${modalType === 'mileage' ? 'Mileage Claim' : modalType === 'claim' ? 'Claim' : 'Receipt'}`}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="btn-thick-white flex-1 py-2.5 text-sm disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === BATCH BAR === */}
      {selectedRows.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-5 py-3 shadow-2xl text-white bg-[var(--primary)]">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedRows.length} claim{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <span className="w-px h-5 bg-white/20" />
          <button
            onClick={() => batchReview(selectedRows.map((r) => r.id))}
            className="btn-thick-green text-sm px-4 py-1.5"
          >
            Mark as Reviewed
          </button>
          <button
            onClick={() => deleteClaims(selectedRows.map((r) => r.id))}
            className="btn-thick-red text-sm px-4 py-1.5"
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-white/55 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* === BATCH REVIEW MODAL === */}
      {showBatchReview && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }}>
          <div className="bg-white shadow-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>

            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">
                Batch Review — {batchItems.length} claims
                {batchScanning && ` (Scanning ${batchScanProgress.current}/${batchScanProgress.total}...)`}
              </h2>
              <button onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            {batchScanning && (
              <div className="px-5 pt-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1">
                  <span>Scanning files with OCR...</span>
                  <span className="tabular-nums">{Math.round((batchScanProgress.current / batchScanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 h-2">
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

            <div className="flex-1 overflow-y-scroll p-5 space-y-3">
              {batchItems.map((item, idx) => (
                <div key={idx} className={`border p-4 ${item.ocrDone ? (item.ocrError ? 'border-red-200 bg-red-50/30' : 'border-[var(--outline-ghost)]') : 'border-[var(--outline-ghost)] bg-[var(--surface-low)] opacity-60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">{item.file.name}</p>
                    {!item.ocrDone && <span className="text-xs text-[var(--text-muted)] ml-2">Scanning...</span>}
                    {item.ocrError && <span className="text-xs text-[var(--reject-red)] ml-2">{item.ocrError}</span>}
                    <button onClick={() => setBatchItems(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-[var(--reject-red)] hover:opacity-80 ml-2">Remove</button>
                  </div>
                  {item.ocrDone && (
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</label>
                        <input value={item.merchant} onChange={(e) => { const next = [...batchItems]; next[idx].merchant = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                        <input value={item.amount} onChange={(e) => { const next = [...batchItems]; next[idx].amount = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                        <input type="date" value={item.claim_date} onChange={(e) => { const next = [...batchItems]; next[idx].claim_date = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt #</label>
                        <input value={item.receipt_number} onChange={(e) => { const next = [...batchItems]; next[idx].receipt_number = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                        <select value={item.category_id} onChange={(e) => { const next = [...batchItems]; next[idx].category_id = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs">
                          <option value="">Select...</option>
                          {modalCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description / Notes</label>
                        <input value={item.description} onChange={(e) => { const next = [...batchItems]; next[idx].description = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" placeholder="Phone number, account details, etc." />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-3 flex gap-2 flex-shrink-0 bg-[var(--surface-low)]">
              <button
                onClick={() => { setShowBatchReview(false); setBatchItems([]); }}
                disabled={batchScanning || batchSubmitting}
                className="btn-thick-white flex-1 py-2 text-sm disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={submitBatchClaims}
                disabled={batchScanning || batchSubmitting || batchItems.length === 0}
                className="btn-thick-navy flex-1 py-2 text-sm disabled:opacity-40"
              >
                {batchSubmitting ? 'Submitting...' : `Submit All (${batchItems.length})`}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* === RECEIPT PREVIEW === */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-16 flex items-center justify-between px-5 flex-shrink-0 bg-[var(--primary)]">
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
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
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Merchant</label>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-field w-full">
                      {editCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Receipt Number</label>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Description</label>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Employee</label>
                    <select value={editData.employee_id} onChange={(e) => setEditData({ ...editData, employee_id: e.target.value })} className="input-field w-full">
                      {modalEmployees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                  {previewClaim.type === 'receipt' && (
                    <div className="bg-[var(--surface-low)] border border-[var(--outline-ghost)] p-3 space-y-2">
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Linked Invoices</label>
                      {linkedInvoices.length > 0 && (
                        <div className="space-y-1.5">
                          {linkedInvoices.map(li => (
                            <div key={li.id} className="flex items-center justify-between bg-white px-2.5 py-1.5 border border-[var(--outline-ghost)]">
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
                                  className="text-xs text-[var(--reject-red)] hover:opacity-80"
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
                          fetch(`/api/admin/invoices?search=${encodeURIComponent(q)}&take=10`)
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
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/invoices/${inv.id}/receipt-link`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ claimId: previewClaim.id }),
                                      });
                                      const j = await res.json();
                                      if (res.ok) {
                                        setLinkedInvoices(prev => [...prev, {
                                          id: `temp-${inv.id}`,
                                          invoice_id: inv.id,
                                          amount: j.data?.amount ?? 0,
                                          invoice_number: inv.invoice_number,
                                          vendor_name: inv.vendor_name_raw,
                                        }]);
                                        setSuggestedInvoices(prev => prev.filter(s => s.id !== inv.id));
                                        setInvoiceLinkSearch('');
                                        setInvoiceLinkResults([]);
                                        refresh();
                                      } else {
                                        alert(j.error || 'Failed to link');
                                      }
                                    } catch (e) { console.error(e); }
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 border border-[var(--outline-ghost)] transition-colors"
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
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-3 py-2">
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
                      PAYMENT_CFG[previewClaim.payment_status],
                    ].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>
                        {cfg!.label}
                      </span>
                    ))}
                  </div>

                  {previewClaim.type === 'receipt' && previewClaim.linked_payments.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 p-3 space-y-2">
                      <p className="text-[10px] font-label font-bold text-blue-700 uppercase tracking-widest">Linked Payment</p>
                      {previewClaim.linked_payments.map((lp) => (
                        <div key={lp.payment_id} className="text-sm text-blue-800">
                          <p className="font-medium">{lp.supplier_name}</p>
                          <p className="text-xs text-blue-600 tabular-nums">
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
                        className="text-xs text-[var(--primary)] hover:opacity-80 font-medium"
                      >
                        Unlink from Payment
                      </button>
                    </div>
                  )}

                  {/* Invoice Linking for receipts */}
                  {previewClaim.type === 'receipt' && (
                    <div className="bg-[var(--surface-low)] border border-[var(--outline-ghost)] p-3 space-y-2">
                      <p className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Linked Invoices</p>
                      {linkedInvoices.length > 0 ? (
                        <div className="space-y-1.5">
                          {linkedInvoices.map(li => (
                            <div key={li.id} className="flex items-center justify-between bg-white px-2.5 py-1.5 border border-[var(--outline-ghost)]">
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
                                  className="text-xs text-[var(--reject-red)] hover:opacity-80"
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
                            fetch(`/api/admin/invoices?search=${encodeURIComponent(q)}&paymentStatus=unpaid&take=10`)
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
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/invoices/${inv.id}/receipt-link`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ claimId: previewClaim.id }),
                                      });
                                      const j = await res.json();
                                      if (res.ok) {
                                        setLinkedInvoices(prev => [...prev, {
                                          id: `temp-${inv.id}`,
                                          invoice_id: inv.id,
                                          amount: j.data?.amount ?? 0,
                                          invoice_number: inv.invoice_number,
                                          vendor_name: inv.vendor_name_raw,
                                        }]);
                                        setSuggestedInvoices(prev => prev.filter(s => s.id !== inv.id));
                                        setInvoiceLinkSearch('');
                                        setInvoiceLinkResults([]);
                                        refresh();
                                      } else {
                                        alert(j.error || 'Failed to link');
                                      }
                                    } catch (e) { console.error(e); }
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 border border-[var(--outline-ghost)] transition-colors"
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
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-label text-[var(--text-secondary)] uppercase tracking-widest font-medium">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH'   ? 'text-[var(--match-green)]' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'
                    }`}>{previewClaim.confidence}</span>
                  </div>

                  {previewClaim.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 p-3">
                      <p className="text-[10px] font-label font-bold text-red-700 uppercase tracking-widest mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-700">{previewClaim.rejection_reason}</p>
                    </div>
                  )}

                  {previewClaim.file_url && (
                    <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-[var(--primary)] hover:underline block">
                      View full document &rarr;
                    </a>
                  )}
                </>
              )}
            </div>

            <div className="p-4 flex gap-3 flex-shrink-0 bg-[var(--surface-low)]">
              {editMode ? (
                <>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy flex-1 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="btn-thick-white flex-1 py-2 text-sm">
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
                        employee_id: previewClaim.employee_id ?? '',
                      });
                    }}
                    className="btn-thick-navy flex-1 py-2 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => batchReview([previewClaim.id])}
                    disabled={previewClaim.status === 'reviewed'}
                    className="btn-thick-green flex-1 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Mark as Reviewed
                  </button>
                </>
              )}
              <button
                onClick={() => deleteClaims([previewClaim.id])}
                className="btn-thick-red px-4 py-2 text-xs"
              >
                Delete
              </button>
            </div>
          </div>
          </div>
        </>
      )}

    </div>
  );
}
