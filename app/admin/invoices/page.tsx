'use client';

import Sidebar from '@/components/Sidebar';
import SalesInvoicesContent from '@/components/SalesInvoicesContent';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import Field from '@/components/forms/Field';
import { StatusCell, PaymentCell, LinkCell } from '@/components/table/StatusBadge';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDate, formatRM, getDateRange } from '@/lib/formatters';
import { useFilters } from '@/hooks/useFilters';
import { STATUS_CFG, PAYMENT_CFG, LINK_CFG } from '@/lib/badge-config';
import FilterBar from '@/components/filters/FilterBar';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

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
  confidence: string;
  file_url: string | null;
  thumbnail_url: string | null;
  notes: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminInvoicesPageWrapper() {
  return <Suspense><AdminInvoicesPage /></Suspense>;
}

function AdminInvoicesPage() {
  usePageTitle('Invoices');
  const pageSearchParams = useSearchParams();
  const activeTab: 'received' | 'issued' = pageSearchParams.get('tab') === 'issued' ? 'issued' : 'received';

  // Data
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [takeLimit, setTakeLimit] = useState<number | undefined>(undefined);

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
    vendor_name: '',
    supplier_id: '',
    invoice_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    due_date: '',
    total_amount: '',
    category_id: '',
    payment_terms: '',
    notes: '',
  });
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);
  const [newInvFile, setNewInvFile] = useState<File | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  // Batch review state — OCR all files first, then show for review before submit
  interface BatchItem {
    file: File;
    vendor_name: string;
    invoice_number: string;
    issue_date: string;
    due_date: string;
    total_amount: string;
    category_id: string;
    payment_terms: string;
    notes: string;
    supplier_id: string;
    ocrDone: boolean;
    ocrError: string;
  }
  const [showBatchReview, setShowBatchReview] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
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
      setShowNewInvoice(true);
      setNewInvFile(file);
      setNewInvError('');

      // Trigger OCR scan
      setOcrScanning(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('categories', JSON.stringify(categories.map((c) => c.name)));
        const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
        const json = await res.json();
        if (res.ok && json.fields) {
          const f = json.fields;
          const updates: typeof newInv = { ...newInv };
          if (json.documentType === 'invoice') {
            if (f.vendor) updates.vendor_name = f.vendor;
            if (f.invoiceNumber) updates.invoice_number = f.invoiceNumber;
            if (f.issueDate) updates.issue_date = f.issueDate;
            if (f.dueDate) updates.due_date = f.dueDate;
            if (f.totalAmount) updates.total_amount = String(f.totalAmount);
            if (f.paymentTerms) updates.payment_terms = f.paymentTerms;
            if (f.notes) updates.notes = f.notes;
          } else {
            if (f.merchant) updates.vendor_name = f.merchant;
            if (f.date) updates.issue_date = f.date;
            if (f.amount) updates.total_amount = String(f.amount);
            if (f.receiptNumber) updates.invoice_number = f.receiptNumber;
          }
          if (f.category) {
            const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) updates.category_id = match.id;
          }
          if (updates.vendor_name) {
            const vLower = updates.vendor_name.toLowerCase();
            const supplierMatch = suppliers.find((s) => s.name.toLowerCase() === vLower);
            if (supplierMatch) updates.supplier_id = supplierMatch.id;
          }
          setNewInv(updates);
        }
      } catch (err) {
        console.error('OCR extraction failed:', err);
      } finally {
        setOcrScanning(false);
      }
      return;
    }

    // Multiple files — OCR all first, then show batch review
    const items: BatchItem[] = droppedFiles.map(file => ({
      file,
      vendor_name: '',
      invoice_number: '',
      issue_date: new Date().toISOString().split('T')[0],
      due_date: '',
      total_amount: '',
      category_id: '',
      payment_terms: '',
      notes: '',
      supplier_id: '',
      ocrDone: false,
      ocrError: '',
    }));
    setBatchItems(items);
    setShowBatchReview(true);
    setBatchScanning(true);
    setBatchScanProgress({ current: 0, total: droppedFiles.length });

    // OCR each file sequentially
    for (let i = 0; i < droppedFiles.length; i++) {
      setBatchScanProgress({ current: i + 1, total: droppedFiles.length });
      try {
        const ocrFd = new FormData();
        ocrFd.append('file', droppedFiles[i]);
        ocrFd.append('categories', JSON.stringify(categories.map((c) => c.name)));
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();

        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          items[i].vendor_name = (isInvoice ? f.vendor : f.merchant) || '';
          items[i].invoice_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          items[i].issue_date = (isInvoice ? f.issueDate : f.date) || items[i].issue_date;
          items[i].due_date = (isInvoice ? f.dueDate : '') || '';
          items[i].total_amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          items[i].payment_terms = (isInvoice ? f.paymentTerms : '') || '';
          items[i].notes = f.notes || '';
          if (f.category) {
            const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) items[i].category_id = match.id;
          }
          const vendorName = items[i].vendor_name;
          if (vendorName) {
            const supplierMatch = suppliers.find((s) => s.name.toLowerCase() === vendorName.toLowerCase());
            if (supplierMatch) items[i].supplier_id = supplierMatch.id;
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

  // Fetch categories on mount (needed for drag-drop OCR matching)
  useEffect(() => {
    fetch('/api/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
  }, []);

  const submitBatch = async () => {
    setBatchSubmitting(true);
    let ok = 0;
    let fail = 0;
    const dupes: string[] = [];
    for (const item of batchItems) {
      try {
        const fd = new FormData();
        fd.append('file', item.file);
        fd.append('vendor_name', item.vendor_name || item.file.name.replace(/\.[^/.]+$/, ''));
        if (item.invoice_number) fd.append('invoice_number', item.invoice_number);
        fd.append('issue_date', item.issue_date || new Date().toISOString().split('T')[0]);
        if (item.due_date) fd.append('due_date', item.due_date);
        fd.append('total_amount', item.total_amount || '0');
        if (item.category_id) fd.append('category_id', item.category_id);
        if (item.payment_terms) fd.append('payment_terms', item.payment_terms);
        if (item.notes) fd.append('notes', item.notes);
        if (item.supplier_id) fd.append('supplier_id', item.supplier_id);

        const res = await fetch('/api/admin/invoices', { method: 'POST', body: fd });
        if (res.ok) {
          ok++;
        } else {
          const json = await res.json().catch(() => ({ error: 'Failed' }));
          dupes.push(`${item.file.name}: ${json.error}`);
          fail++;
        }
      } catch {
        fail++;
      }
    }
    setBatchSubmitting(false);
    setShowBatchReview(false);
    setBatchItems([]);
    let msg = `Batch upload: ${ok} submitted`;
    if (fail > 0) msg += `, ${fail} failed`;
    if (dupes.length > 0) msg += `\n\nDuplicates skipped:\n${dupes.join('\n')}`;
    alert(msg);
    refresh();
  };

  const handleInvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setNewInvFile(file);
    if (!file) return;

    setOcrScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categories', JSON.stringify(categories.map((c) => c.name)));

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();

      if (res.ok && json.fields) {
        const f = json.fields;
        const updates: typeof newInv = { ...newInv };
        if (json.documentType === 'invoice') {
          if (f.vendor) updates.vendor_name = f.vendor;
          if (f.invoiceNumber) updates.invoice_number = f.invoiceNumber;
          if (f.issueDate) updates.issue_date = f.issueDate;
          if (f.dueDate) updates.due_date = f.dueDate;
          if (f.totalAmount) updates.total_amount = String(f.totalAmount);
          if (f.paymentTerms) updates.payment_terms = f.paymentTerms;
        } else {
          // Receipt scanned on invoice form — map what we can
          if (f.merchant) updates.vendor_name = f.merchant;
          if (f.date) updates.issue_date = f.date;
          if (f.amount) updates.total_amount = String(f.amount);
          if (f.receiptNumber) updates.invoice_number = f.receiptNumber;
        }
        if (f.category) {
          const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
          if (match) updates.category_id = match.id;
        }
        // Try to match vendor to existing supplier
        if (updates.vendor_name) {
          const vLower = updates.vendor_name.toLowerCase();
          const supplierMatch = suppliers.find((s) => s.name.toLowerCase() === vLower);
          if (supplierMatch) updates.supplier_id = supplierMatch.id;
        }
        setNewInv(updates);
      }
    } catch (err) {
      console.error('OCR extraction failed:', err);
    } finally {
      setOcrScanning(false);
    }
  };

  const submitNewInvoice = async () => {
    if (!newInv.vendor_name || !newInv.issue_date || !newInv.total_amount || !newInv.category_id) {
      setNewInvError('Please fill in all required fields.');
      return;
    }
    setNewInvSubmitting(true);
    setNewInvError('');
    try {
      const fd = new FormData();
      fd.append('vendor_name', newInv.vendor_name);
      if (newInv.supplier_id) fd.append('supplier_id', newInv.supplier_id);
      if (newInv.invoice_number) fd.append('invoice_number', newInv.invoice_number);
      fd.append('issue_date', newInv.issue_date);
      if (newInv.due_date) fd.append('due_date', newInv.due_date);
      fd.append('total_amount', newInv.total_amount);
      fd.append('category_id', newInv.category_id);
      if (newInv.payment_terms) fd.append('payment_terms', newInv.payment_terms);
      if (newInv.notes) fd.append('notes', newInv.notes);
      if (newInvFile) fd.append('file', newInvFile);

      const res = await fetch('/api/admin/invoices', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { setNewInvError(j.error || 'Failed to create invoice'); return; }

      setShowNewInvoice(false);
      setNewInv({ vendor_name: '', supplier_id: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '' });
      setNewInvFile(null);
      refresh();
    } catch (e) { console.error(e); setNewInvError('Network error'); }
    finally { setNewInvSubmitting(false); }
  };

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); setCreatingSupplier(false); }, [previewInvoice]);

  // Fetch categories + suppliers for edit
  useEffect(() => {
    if (editMode) {
      fetch('/api/admin/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
    }
  }, [editMode]);

  useEffect(() => {
    fetch('/api/admin/suppliers').then((r) => r.json()).then((j) => setSuppliers((j.data ?? []).map((s: SupplierOption) => ({ id: s.id, name: s.name })))).catch(console.error);
  }, [refreshKey]);

  const saveEdit = async () => {
    if (!previewInvoice || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/invoices/${previewInvoice.id}`, {
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
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  const confirmSupplier = async (invoiceId: string, supplierId: string) => {
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, supplier_link_status: 'confirmed' }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      const res = await fetch('/api/invoices/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: id }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

  const createAndAssignSupplier = async () => {
    if (!previewInvoice || !newSupplierName.trim()) return;
    try {
      const res = await fetch('/api/admin/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim() }),
      });
      const j = await res.json();
      if (j.data?.id) {
        await confirmSupplier(previewInvoice.id, j.data.id);
        setCreatingSupplier(false);
        setNewSupplierName('');
      }
    } catch (e) { console.error(e); }
  };

  // Filters
  const initialStatus = pageSearchParams.get('status') ?? '';
  const initialPayment = pageSearchParams.get('paymentStatus') ?? '';

  const {
    dateRange, setDateRange,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    statusFilter, setStatusFilter,
    search, setSearch,
  } = useFilters({ initialStatus, initialDateRange: (initialStatus || initialPayment) ? '' : 'this_month' });
  const [paymentFilter, setPaymentFilter] = useState(initialPayment);

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Load invoices
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (from)          p.set('dateFrom',      from);
    if (to)            p.set('dateTo',        to);
    if (statusFilter)  p.set('status',        statusFilter);
    if (paymentFilter) p.set('paymentStatus', paymentFilter);
    if (search)        p.set('search',        search);
    if (takeLimit)     p.set('take',          String(takeLimit));

    fetch(`/api/admin/invoices?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setInvoices(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [dateRange, customFrom, customTo, statusFilter, paymentFilter, search, refreshKey, takeLimit]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const { sorted: sortedInvoices, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(invoices, 'issue_date', 'desc');
  useEffect(() => { setPage(0); }, [sortField, sortDir]);
  const pagedInvoices = sortedInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedInvoices.length / PAGE_SIZE);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={"flex h-screen overflow-hidden bg-[#F7F9FB]"}>

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="admin" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden relative" onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>

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

        <header className="flex-shrink-0 bg-white">
          <div className="h-16 flex items-center justify-between px-6">
            <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">Invoices</h1>
            <Link href="/admin/suppliers" className="text-body-sm font-medium hover:underline transition-colors" style={{ color: 'var(--primary)' }}>
              Aging Report &rarr;
            </Link>
          </div>
        </header>

        {activeTab === 'issued' ? (
          <main className="flex-1 overflow-hidden flex flex-col p-6 animate-in">
            <SalesInvoicesContent role="admin" />
          </main>
        ) : (
        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Filter bar ────────────────────────────────── */}
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
            paymentValue={paymentFilter}
            onPaymentChange={setPaymentFilter}
            showSearch
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search vendor or invoice #…"
          >
            <div className="ml-auto">
              <button
                onClick={() => setShowNewInvoice(true)}
                className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold"
              >
                + Submit New Invoice
              </button>
            </div>
          </FilterBar>

          {/* ── Load More ─────────────────────────────────── */}
          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={invoices.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Invoice Table ────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto bg-white rounded-lg">
            {loading ? (
              <div className="text-center text-sm text-[#8E9196] py-12">Loading...</div>
            ) : invoices.length === 0 ? (
              <div className="text-center text-sm text-[#8E9196] py-12">No invoices found for the selected filters.</div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-5 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('issue_date')}>Issue Date{sortIndicator('issue_date')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('vendor_name_raw')}>Vendor{sortIndicator('vendor_name_raw')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('invoice_number')}>Invoice #{sortIndicator('invoice_number')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('due_date')}>Due Date{sortIndicator('due_date')}</th>
                      <th className="px-3 py-2.5 text-right cursor-pointer select-none" onClick={() => toggleSort('total_amount')}>Amount (RM){sortIndicator('total_amount')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>
                      <th className="px-3 py-2.5 cursor-pointer select-none" onClick={() => toggleSort('supplier_link_status')}>Supplier{sortIndicator('supplier_link_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => setPreviewInvoice(inv)}
                        className="text-body-sm hover:bg-[#F2F4F6] transition-colors cursor-pointer border-b border-gray-50"
                      >
                        <td className="px-5 py-3 text-[#434654] tabular-nums">{formatDate(inv.issue_date)}</td>
                        <td className="px-3 py-3 text-[#191C1E] font-medium">{inv.vendor_name_raw}</td>
                        <td className="px-3 py-3 text-[#434654]">{inv.invoice_number ?? '-'}</td>
                        <td className="px-3 py-3 text-[#434654] tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                        <td className="px-3 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                        <td className="px-3 py-3"><StatusCell value={inv.status} /></td>
                        <td className="px-3 py-3"><PaymentCell value={inv.payment_status} /></td>
                        <td className="px-3 py-3"><LinkCell value={inv.supplier_link_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                    <p className="text-body-sm text-[#8E9196]">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sortedInvoices.length)} of {sortedInvoices.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                      <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="px-3 py-1.5 text-body-sm font-medium rounded-lg border border-gray-200 text-[#434654] hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </main>
        )}
      </div>

      {/* ═══ SUBMIT NEW INVOICE MODAL ═══ */}
      {showNewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50" onClick={() => setShowNewInvoice(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewInvoice(false)}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: 'var(--sidebar)' }}>
                <h2 className="text-white font-semibold text-sm">Submit New Invoice</h2>
                <button onClick={() => setShowNewInvoice(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>

              <div className="p-5 space-y-4">
                {newInvError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{newInvError}</p>}

                <div className="relative">
                  <label className="input-label">Vendor Name *</label>
                  <input
                    ref={vendorInputRef}
                    type="text"
                    value={newInv.vendor_name}
                    onChange={(e) => {
                      setNewInv({ ...newInv, vendor_name: e.target.value, supplier_id: '' });
                      setVendorDropdownOpen(true);
                    }}
                    onFocus={() => setVendorDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 150)}
                    className="input-field w-full"
                    placeholder="Type or select existing supplier"
                    autoComplete="off"
                  />
                  {newInv.supplier_id && (
                    <span className="absolute right-3 top-[calc(50%+4px)] badge-green text-label-sm">Linked</span>
                  )}
                  {vendorDropdownOpen && newInv.vendor_name.length >= 1 && (() => {
                    const q = newInv.vendor_name.toLowerCase();
                    const filtered = suppliers.filter((s) => s.name.toLowerCase().includes(q));
                    if (filtered.length === 0) return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                        <p className="text-xs text-[#8E9196]">No matching suppliers — a new one will be created</p>
                      </div>
                    );
                    return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {filtered.slice(0, 8).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewInv({ ...newInv, vendor_name: s.name, supplier_id: s.id });
                              setVendorDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
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
                  <label className="input-label">Notes</label>
                  <textarea
                    value={newInv.notes}
                    onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })}
                    className="input-field w-full text-sm"
                    rows={2}
                    placeholder="Phone number, account details, service period, etc."
                  />
                </div>

                <div>
                  <label className="input-label">Invoice Image</label>
                  {newInvFile ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-sm text-blue-700 truncate flex-1">{newInvFile.name}</span>
                      <button type="button" onClick={() => setNewInvFile(null)} className="text-xs text-blue-500 hover:text-blue-700">Remove</button>
                    </div>
                  ) : (
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleInvFileChange}
                      className="input-field w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-gray-100 file:text-[#434654] hover:file:bg-gray-200"
                    />
                  )}
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
              </div>

              <div className="flex gap-3 px-5 py-4">
                <button
                  onClick={submitNewInvoice}
                  disabled={newInvSubmitting || ocrScanning}
                  className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ocrScanning ? 'Scanning...' : newInvSubmitting ? 'Submitting...' : 'Submit Invoice'}
                </button>
                <button
                  onClick={() => setShowNewInvoice(false)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ INVOICE PREVIEW PANEL ═══ */}
      {/* ═══ BATCH REVIEW MODAL ═══ */}
      {showBatchReview && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>

            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">
                Batch Review — {batchItems.length} invoices
                {batchScanning && ` (Scanning ${batchScanProgress.current}/${batchScanProgress.total}...)`}
              </h2>
              <button onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); } }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            {/* Scanning progress */}
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

            {/* Batch items list */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
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
                        <label className="text-[10px] text-[#8E9196] uppercase">Vendor</label>
                        <input value={item.vendor_name} onChange={(e) => { const next = [...batchItems]; next[idx].vendor_name = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Invoice #</label>
                        <input value={item.invoice_number} onChange={(e) => { const next = [...batchItems]; next[idx].invoice_number = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Date</label>
                        <input type="date" value={item.issue_date} onChange={(e) => { const next = [...batchItems]; next[idx].issue_date = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Amount (RM)</label>
                        <input value={item.total_amount} onChange={(e) => { const next = [...batchItems]; next[idx].total_amount = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Category</label>
                        <select value={item.category_id} onChange={(e) => { const next = [...batchItems]; next[idx].category_id = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs">
                          <option value="">Select...</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Due Date</label>
                        <input type="date" value={item.due_date} onChange={(e) => { const next = [...batchItems]; next[idx].due_date = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] text-[#8E9196] uppercase">Terms</label>
                        <input value={item.payment_terms} onChange={(e) => { const next = [...batchItems]; next[idx].payment_terms = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] text-[#8E9196] uppercase">Notes</label>
                        <input value={item.notes} onChange={(e) => { const next = [...batchItems]; next[idx].notes = e.target.value; setBatchItems(next); }} className="input-field w-full text-xs" placeholder="Phone number, account details, etc." />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t flex gap-2 flex-shrink-0">
              <button
                onClick={() => { setShowBatchReview(false); setBatchItems([]); }}
                disabled={batchScanning || batchSubmitting}
                className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={submitBatch}
                disabled={batchScanning || batchSubmitting || batchItems.length === 0}
                className="flex-1 py-2 rounded-lg text-sm font-semibold btn-primary disabled:opacity-40"
              >
                {batchSubmitting ? 'Submitting...' : `Submit All (${batchItems.length})`}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.file_url ? (
                <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="block">
                  {previewInvoice.thumbnail_url && !previewInvoice.file_url.includes('.pdf') ? (
                    <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-64 object-contain rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                  ) : (
                    <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-100 transition-colors">
                      <div className="w-10 h-12 rounded bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-500 font-bold text-xs">PDF</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-blue-600 truncate">View document</p>
                        <p className="text-xs text-[#8E9196]">Opens in Google Drive</p>
                      </div>
                    </div>
                  )}
                </a>
              ) : (
                <div className="w-full h-20 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No document attached</div>
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
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-3">
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
                  </dl>

                  {/* Notes */}
                  {previewInvoice.notes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Notes</p>
                      <p className="text-sm text-amber-900 whitespace-pre-line">{previewInvoice.notes}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                  </div>

                  {/* Supplier link */}
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Supplier Account</span>
                      {(() => {
                        const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                        return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                      })()}
                    </div>
                    <p className="text-sm font-medium text-[#191C1E]">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
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
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                            <button onClick={() => setCreatingSupplier(false)} className="text-xs px-2 py-1.5 rounded-md font-medium text-[#434654] hover:text-[#434654] border border-gray-200">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-label-sm text-[#8E9196] uppercase tracking-wide font-medium">Confidence</span>
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

            <div className="p-4 flex-shrink-0 space-y-2">
              {editMode ? (
                <div className="flex gap-3">
                  <button onClick={saveEdit} disabled={editSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {/* ── Primary action based on status ── */}
                  <div className="flex gap-3">
                    {previewInvoice.status === 'pending_review' ? (
                      <button
                        onClick={() => markAsReviewed(previewInvoice.id)}
                        className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold"
                      >
                        Mark as Reviewed
                      </button>
                    ) : (
                      <div className="flex-1 flex items-center justify-center py-2 rounded-lg text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200">
                        Reviewed
                      </div>
                    )}
                  </div>
                  {/* ── Secondary actions ── */}
                  <div className="flex gap-3">
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
                      className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>
                    {previewInvoice.status === 'reviewed' && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/invoices/${previewInvoice.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'pending_review' }),
                            });
                            if (res.ok) {
                              refresh();
                              setPreviewInvoice({ ...previewInvoice, status: 'pending_review' });
                            }
                          } catch (e) { console.error(e); }
                        }}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
                      >
                        Revert Review
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t flex-shrink-0">
              <button
                onClick={() => deleteInvoice(previewInvoice.id)}
                className="text-xs text-red-400 hover:text-red-600 transition-colors"
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
