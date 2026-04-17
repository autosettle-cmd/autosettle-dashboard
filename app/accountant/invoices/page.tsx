'use client';

import Sidebar from '@/components/Sidebar';
import SalesInvoicesContent from '@/components/SalesInvoicesContent';
import LoadMoreBanner from '@/components/LoadMoreBanner';
import Field from '@/components/forms/Field';
import { StatusCell, PaymentCell, LinkCell } from '@/components/table/StatusBadge';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { formatRM, getDateRange } from '@/lib/formatters';
import { useFilters } from '@/hooks/useFilters';
import { STATUS_CFG, PAYMENT_CFG, LINK_CFG, APPROVAL_CFG } from '@/lib/badge-config';
import FilterBar from '@/components/filters/FilterBar';
import { useSearchParams } from 'next/navigation';
import GlAccountSelect from '@/components/GlAccountSelect';
import { useFirm } from '@/contexts/FirmContext';

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
  firm_name: string;
  firm_id: string;
  confidence: string;
  file_url: string | null;
  thumbnail_url: string | null;
  notes: string | null;
  gl_account_id: string | null;
  gl_account_label: string | null;
  contra_gl_account_id: string | null;
  contra_gl_account_label: string | null;
  supplier_default_gl_id: string | null;
  supplier_default_contra_gl_id: string | null;
  approval: 'pending_approval' | 'approved' | 'not_approved';
  rejection_reason: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
  firm_id: string;
  default_gl_account_id?: string | null;
  default_contra_gl_account_id?: string | null;
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

export default function AccountantInvoicesPageWrapper() {
  return <Suspense><AccountantInvoicesPage /></Suspense>;
}

function AccountantInvoicesPage() {
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
  const [glAccounts, setGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [selectedGlAccountId, setSelectedGlAccountId] = useState<string>('');
  const [selectedContraGlId, setSelectedContraGlId] = useState<string>('');
  const [_defaultContraGlId, setDefaultContraGlId] = useState<string>('');

  // Selection for batch actions
  const [selectedRows, setSelectedRows] = useState<InvoiceRow[]>([]);
  const toggleSelectOne = (row: InvoiceRow) => {
    setSelectedRows((prev) =>
      prev.some((r) => r.id === row.id) ? prev.filter((r) => r.id !== row.id) : [...prev, row]
    );
  };
  const toggleSelectAll = () => {
    const allOnPageSelected = pagedInvoices.length > 0 && pagedInvoices.every((inv) => selectedRows.some((r) => r.id === inv.id));
    setSelectedRows(allOnPageSelected ? [] : pagedInvoices);
  };

  const batchAction = async (invoiceIds: string[], action: 'approve' | 'reject' | 'revert', reason?: string, glAccountId?: string, contraGlId?: string) => {
    try {
      const res = await fetch('/api/invoices/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds, action, ...(reason && { reason }), ...(glAccountId && { gl_account_id: glAccountId }), ...(contraGlId && { contra_gl_account_id: contraGlId }) }),
      });
      if (res.ok) {
        refresh();
        setSelectedRows([]);
        if (previewInvoice && invoiceIds.includes(previewInvoice.id)) {
          // After approve, resolve GL labels for display
          const resolvedExpenseGlId = glAccountId || previewInvoice.gl_account_id || previewInvoice.supplier_default_gl_id;
          const resolvedContraGlId = contraGlId || previewInvoice.supplier_default_contra_gl_id;
          const expenseGl = resolvedExpenseGlId ? glAccounts.find(a => a.id === resolvedExpenseGlId) : null;
          const contraGl = resolvedContraGlId ? glAccounts.find(a => a.id === resolvedContraGlId) : null;
          setPreviewInvoice({
            ...previewInvoice,
            approval: action === 'approve' ? 'approved' : action === 'reject' ? 'not_approved' : 'pending_approval',
            ...(action === 'reject' && reason ? { rejection_reason: reason } : {}),
            ...(action === 'approve' ? {
              ...(resolvedExpenseGlId ? { gl_account_id: resolvedExpenseGlId, gl_account_label: expenseGl ? `${expenseGl.account_code} — ${expenseGl.name}` : previewInvoice.gl_account_label } : {}),
              ...(resolvedContraGlId ? { contra_gl_account_id: resolvedContraGlId, contra_gl_account_label: contraGl ? `${contraGl.account_code} — ${contraGl.name}` : null } : {}),
            } : {}),
          });
          if (action === 'approve' && resolvedContraGlId) setSelectedContraGlId(resolvedContraGlId);
        }
      } else {
        const json = await res.json().catch(() => ({ error: 'Unknown error' }));
        alert(json.error || `Failed to ${action}`);
      }
    } catch (e) { console.error(e); }
  };

  // Reject modal
  const [rejectModal, setRejectModal] = useState<{ open: boolean; invoiceIds: string[]; reason: string }>({ open: false, invoiceIds: [], reason: '' });
  const confirmReject = () => {
    batchAction(rejectModal.invoiceIds, 'reject', rejectModal.reason);
    setRejectModal({ open: false, invoiceIds: [], reason: '' });
  };

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
  const [depositWarning, setDepositWarning] = useState('');
  const [newInv, setNewInv] = useState({
    firm_id: '',
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
  const [newInvFile, setNewInvFile] = useState<File | null>(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [newInvGlAccounts, setNewInvGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [newInvExpenseGlId, setNewInvExpenseGlId] = useState('');
  const [newInvContraGlId, setNewInvContraGlId] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  // Batch review state (same pattern as admin invoices)
  interface BatchItem {
    _id: string;
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
    selected: boolean;
    dupMessage: string;
  }
  const [showBatchReview, setShowBatchReview] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchScanning, setBatchScanning] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [batchScanProgress, setBatchScanProgress] = useState({ current: 0, total: 0 });
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

    const targetFirmId = firmFilter || (firms.length === 1 ? firms[0].id : '');
    if (!targetFirmId) {
      alert('Please select a firm before uploading.');
      return;
    }

    if (droppedFiles.length === 1) {
      // Single file — open modal and trigger OCR
      const file = droppedFiles[0];
      setNewInv((prev) => ({ ...prev, firm_id: targetFirmId }));
      setShowNewInvoice(true);
      setNewInvFile(file);
      setNewInvError('');
      setDepositWarning('');

      // Check for duplicate file before OCR
      try {
        const dupFd = new FormData();
        dupFd.append('file', file);
        dupFd.append('firm_id', targetFirmId);
        const dupRes = await fetch('/api/invoices/check-duplicate', { method: 'POST', body: dupFd });
        const dupJson = await dupRes.json();
        if (dupJson.data?.isDuplicate) {
          setNewInvError(dupJson.data.message);
          return;
        }
      } catch { /* proceed with OCR if check fails */ }

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
          setNewInv((prev) => {
            const updates = { ...prev, firm_id: targetFirmId };
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
              const firmSuppliers = suppliers.filter((s) => s.firm_id === targetFirmId);
              const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
              if (supplierMatch) updates.supplier_id = supplierMatch.id;
            }
            return updates;
          });
          // Auto-fill GL from matched supplier defaults
          const vendorName = f.vendor || f.merchant;
          if (vendorName) {
            const vLower = vendorName.toLowerCase();
            const firmSuppliers = suppliers.filter((s) => s.firm_id === targetFirmId);
            const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
            if (supplierMatch?.default_gl_account_id) setNewInvExpenseGlId(supplierMatch.default_gl_account_id);
            if (supplierMatch?.default_contra_gl_account_id) setNewInvContraGlId(supplierMatch.default_contra_gl_account_id);
          }
          if (f.depositWarning) setDepositWarning(f.depositWarning);
        }
      } catch (err) {
        console.error('OCR extraction failed:', err);
      } finally {
        setOcrScanning(false);
      }
      return;
    }

    // Multiple files — batch review modal (OCR all first, then review before submit)
    if (droppedFiles.length > 20) {
      alert('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    const items: BatchItem[] = droppedFiles.map((file, i) => ({
      _id: `${Date.now()}-${i}`, file, vendor_name: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0],
      due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '', supplier_id: '',
      ocrDone: false, ocrError: '', selected: true, dupMessage: '',
    }));
    setBatchItems(items);
    setShowBatchReview(true);
    setBatchScanning(true);
    setBatchScanProgress({ current: 0, total: droppedFiles.length });

    for (let i = 0; i < items.length; i++) {
      const itemId = items[i]._id;
      setBatchScanProgress({ current: i + 1, total: items.length });
      try {
        // Check duplicate before OCR
        const dupFd = new FormData();
        dupFd.append('file', items[i].file);
        if (targetFirmId) dupFd.append('firm_id', targetFirmId);
        const dupRes = await fetch('/api/invoices/check-duplicate', { method: 'POST', body: dupFd });
        const dupJson = await dupRes.json();
        if (dupJson.data?.isDuplicate) {
          setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ocrDone: true, dupMessage: dupJson.data.message, selected: false } : it));
          continue;
        }

        const ocrFd = new FormData();
        ocrFd.append('file', items[i].file);
        ocrFd.append('categories', JSON.stringify(categories.map((c) => c.name)));
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        const updates: Partial<BatchItem> = { ocrDone: true };
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          updates.vendor_name = (isInvoice ? f.vendor : f.merchant) || '';
          updates.invoice_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          updates.issue_date = (isInvoice ? f.issueDate : f.date) || items[i].issue_date;
          updates.due_date = (isInvoice ? f.dueDate : '') || '';
          updates.total_amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          updates.payment_terms = (isInvoice ? f.paymentTerms : '') || '';
          updates.notes = f.notes || '';
          if (f.category) {
            const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) updates.category_id = match.id;
          }
          const vendorName = updates.vendor_name;
          if (vendorName) {
            const supplierMatch = suppliers.find((s) => s.name.toLowerCase() === vendorName.toLowerCase());
            if (supplierMatch) updates.supplier_id = supplierMatch.id;
          }
        }
        setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ...updates } : it));
      } catch (err) {
        setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ocrDone: true, ocrError: err instanceof Error ? err.message : 'OCR failed' } : it));
      }
    }
    setBatchScanning(false);
  };

  const submitBatch = async () => {
    const selected = batchItems.filter(i => i.selected);
    if (selected.length === 0) return;
    setBatchSubmitting(true);
    let ok = 0; let fail = 0;
    const dupes: string[] = [];
    for (const item of selected) {
      try {
        const fd = new FormData();
        fd.append('firm_id', newInv.firm_id || (firms.length === 1 ? firms[0].id : ''));
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
        fd.append('batch', 'true');
        const res = await fetch('/api/invoices', { method: 'POST', body: fd });
        if (res.ok) { ok++; } else {
          const json = await res.json().catch(() => ({ error: 'Failed' }));
          dupes.push(`${item.file.name}: ${json.error}`); fail++;
        }
      } catch { fail++; }
    }
    setBatchSubmitting(false);
    setShowBatchReview(false);
    setBatchItems([]);
    setBatchPreviewId(null);
    let msg = `Batch upload: ${ok} submitted`;
    if (fail > 0) msg += `, ${fail} failed`;
    if (dupes.length > 0) msg += `\n\nDuplicates skipped:\n${dupes.join('\n')}`;
    alert(msg);
    refresh();
  };

  // Fetch GL accounts when firm is selected in modal
  useEffect(() => {
    if (!showNewInvoice || !newInv.firm_id) { setNewInvGlAccounts([]); return; }
    fetch(`/api/gl-accounts?firmId=${newInv.firm_id}`).then((r) => r.json())
      .then((j) => setNewInvGlAccounts(j.data ?? []))
      .catch(console.error);
  }, [showNewInvoice, newInv.firm_id]);

  const handleInvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Single file — keep original OCR auto-fill flow
    if (files.length === 1) {
      const file = files[0];
      setNewInvFile(file);
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
            const firmSuppliers = newInv.firm_id ? suppliers.filter((s) => s.firm_id === newInv.firm_id) : suppliers;
            const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
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

    // Multiple files — batch upload with progress
    if (!newInv.firm_id) {
      setNewInvError('Please select a firm before batch uploading.');
      return;
    }

    const fileList = Array.from(files);
    if (fileList.length > 20) {
      setNewInvError('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    setShowNewInvoice(false);
    const bItems: BatchItem[] = fileList.map((file, i) => ({
      _id: `${Date.now()}-${i}`, file, vendor_name: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0],
      due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '', supplier_id: '',
      ocrDone: false, ocrError: '', selected: true, dupMessage: '',
    }));
    setBatchItems(bItems);
    setShowBatchReview(true);
    setBatchScanning(true);
    setBatchScanProgress({ current: 0, total: fileList.length });

    for (let i = 0; i < bItems.length; i++) {
      const itemId = bItems[i]._id;
      setBatchScanProgress({ current: i + 1, total: bItems.length });
      try {
        const dupFd = new FormData();
        dupFd.append('file', bItems[i].file);
        if (newInv.firm_id) dupFd.append('firm_id', newInv.firm_id);
        const dupRes = await fetch('/api/invoices/check-duplicate', { method: 'POST', body: dupFd });
        const dupJson = await dupRes.json();
        if (dupJson.data?.isDuplicate) {
          setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ocrDone: true, dupMessage: dupJson.data.message, selected: false } : it));
          continue;
        }

        const ocrFd = new FormData();
        ocrFd.append('file', bItems[i].file);
        ocrFd.append('categories', JSON.stringify(categories.map((c) => c.name)));
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        const updates: Partial<BatchItem> = { ocrDone: true };
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          updates.vendor_name = (isInvoice ? f.vendor : f.merchant) || '';
          updates.invoice_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          updates.issue_date = (isInvoice ? f.issueDate : f.date) || bItems[i].issue_date;
          updates.due_date = (isInvoice ? f.dueDate : '') || '';
          updates.total_amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          updates.payment_terms = (isInvoice ? f.paymentTerms : '') || '';
          updates.notes = f.notes || '';
          if (f.category) {
            const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) updates.category_id = match.id;
          }
          const vendorName = updates.vendor_name;
          if (vendorName) {
            const supplierMatch = suppliers.find((s) => s.name.toLowerCase() === vendorName.toLowerCase());
            if (supplierMatch) updates.supplier_id = supplierMatch.id;
          }
        }
        setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ...updates } : it));
      } catch (err) {
        setBatchItems(prev => prev.map(it => it._id === itemId ? { ...it, ocrDone: true, ocrError: err instanceof Error ? err.message : 'OCR failed' } : it));
      }
    }
    setBatchScanning(false);
  };

  const submitNewInvoice = async () => {
    if (!newInv.firm_id || !newInv.vendor_name || !newInv.issue_date || !newInv.total_amount) {
      setNewInvError('Please fill in all required fields including Firm.');
      return;
    }
    setNewInvSubmitting(true);
    setNewInvError('');
    try {
      const fd = new FormData();
      fd.append('firm_id', newInv.firm_id);
      fd.append('vendor_name', newInv.vendor_name);
      if (newInv.supplier_id) fd.append('supplier_id', newInv.supplier_id);
      if (newInv.invoice_number) fd.append('invoice_number', newInv.invoice_number);
      fd.append('issue_date', newInv.issue_date);
      if (newInv.due_date) fd.append('due_date', newInv.due_date);
      fd.append('total_amount', newInv.total_amount);
      if (newInv.category_id) fd.append('category_id', newInv.category_id);
      if (newInv.payment_terms) fd.append('payment_terms', newInv.payment_terms);
      if (newInv.notes) fd.append('notes', newInv.notes);
      if (newInvFile) fd.append('file', newInvFile);
      if (newInvExpenseGlId) fd.append('gl_account_id', newInvExpenseGlId);
      if (newInvContraGlId) fd.append('contra_gl_account_id', newInvContraGlId);

      const res = await fetch('/api/invoices', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { setNewInvError(j.error || 'Failed to create invoice'); return; }

      setShowNewInvoice(false);
      setDepositWarning('');
      setNewInv({ firm_id: '', vendor_name: '', supplier_id: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '' });
      setNewInvFile(null);
      setNewInvExpenseGlId('');
      setNewInvContraGlId('');
      refresh();
    } catch (e) { console.error(e); setNewInvError('Network error'); }
    finally { setNewInvSubmitting(false); }
  };

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); setCreatingSupplier(false); }, [previewInvoice]);

  // Fetch GL accounts + pre-fill suggestion
  useEffect(() => {
    if (previewInvoice) {
      Promise.all([
        fetch(`/api/gl-accounts?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
        fetch(`/api/categories?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
        fetch(`/api/accounting-settings?firmId=${previewInvoice.firm_id}`).then(r => r.json()),
      ])
        .then(([glJson, catJson, settingsJson]) => {
          setGlAccounts(glJson.data ?? []);
          if (previewInvoice.gl_account_id) {
            setSelectedGlAccountId(previewInvoice.gl_account_id);
          } else if (previewInvoice.supplier_default_gl_id) {
            // Auto-fill from supplier's saved GL (learned from first approval)
            setSelectedGlAccountId(previewInvoice.supplier_default_gl_id);
          } else {
            const catData = catJson.data ?? [];
            const match = catData.find((c: { id: string; gl_account_id?: string }) => c.id === previewInvoice.category_id);
            setSelectedGlAccountId(match?.gl_account_id ?? '');
          }
          // Contra GL: saved on invoice → supplier's sub-account → firm default → empty
          const contraId = previewInvoice.contra_gl_account_id || previewInvoice.supplier_default_contra_gl_id || settingsJson.data?.default_trade_payables_gl_id || '';
          setDefaultContraGlId(previewInvoice.supplier_default_contra_gl_id || settingsJson.data?.default_trade_payables_gl_id || '');
          setSelectedContraGlId(contraId);
        })
        .catch(console.error);
    } else {
      setGlAccounts([]);
      setSelectedGlAccountId('');
      setSelectedContraGlId('');
      setDefaultContraGlId('');
    }
  }, [previewInvoice]);

  // Fetch categories for edit (only if not already loaded)
  useEffect(() => {
    if (editMode && categories.length === 0) {
      fetch('/api/categories').then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
    }
  }, [editMode, categories.length]);

  // Fetch suppliers
  useEffect(() => {
    fetch('/api/suppliers').then((r) => r.json()).then((j) => setSuppliers((j.data ?? []).map((s: { id: string; name: string; firm_id: string; default_gl_account_id?: string; default_contra_gl_account_id?: string }) => ({ id: s.id, name: s.name, firm_id: s.firm_id, default_gl_account_id: s.default_gl_account_id, default_contra_gl_account_id: s.default_contra_gl_account_id })))).catch(console.error);
  }, [refreshKey]);

  const saveEdit = async () => {
    if (!previewInvoice || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/invoices/${previewInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editData,
          ...(selectedGlAccountId && { gl_account_id: selectedGlAccountId }),
        }),
      });
      if (res.ok) {
        await res.json();
        setEditMode(false);
        setEditData(null);
        // Stay in preview with updated data
        const newSupplier = editData.supplier_id ? suppliers.find(s => s.id === editData.supplier_id) : null;
        setPreviewInvoice({
          ...previewInvoice,
          ...editData,
          ...(newSupplier && { supplier_name: newSupplier.name, supplier_link_status: 'confirmed' as const }),
          ...(selectedGlAccountId && { gl_account_id: selectedGlAccountId }),
          gl_account_label: selectedGlAccountId ? (glAccounts.find(a => a.id === selectedGlAccountId)?.account_code + ' — ' + glAccounts.find(a => a.id === selectedGlAccountId)?.name) : previewInvoice.gl_account_label,
        });
        refresh();
      } else {
        const json = await res.json().catch(() => ({ error: 'Save failed' }));
        alert(json.error || 'Save failed');
      }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const markAsReviewed = async (id: string, glAccountId?: string) => {
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed', ...(glAccountId && { gl_account_id: glAccountId }) }),
      });
      if (res.ok) {
        refresh();
        if (previewInvoice) {
          const glMatch = glAccountId ? glAccounts.find(a => a.id === glAccountId) : null;
          setPreviewInvoice({
            ...previewInvoice,
            status: 'reviewed',
            ...(glAccountId ? { gl_account_id: glAccountId, gl_account_label: glMatch ? `${glMatch.account_code} — ${glMatch.name}` : null } : {}),
          });
          if (glAccountId) setSelectedGlAccountId(glAccountId);
        }
      }
    } catch (e) { console.error(e); }
  };

  const confirmSupplier = async (invoiceId: string, supplierId: string) => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: supplierId, supplier_link_status: 'confirmed' }),
      });
      if (res.ok) {
        if (previewInvoice && previewInvoice.id === invoiceId) {
          setPreviewInvoice({ ...previewInvoice, supplier_id: supplierId, supplier_link_status: 'confirmed' });
        }
        refresh();
      }
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
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSupplierName.trim(), firm_id: previewInvoice.firm_id }),
      });
      const j = await res.json();
      if (j.data?.id) {
        await confirmSupplier(previewInvoice.id, j.data.id);
        setCreatingSupplier(false);
        setNewSupplierName('');
      }
    } catch (e) { console.error(e); }
  };

  // Firms
  const { firms, firmId: firmFilter, firmsLoaded } = useFirm();

  // Filters
  const initialStatus = pageSearchParams.get('status') ?? '';
  const initialPayment = pageSearchParams.get('paymentStatus') ?? '';

  const {
    dateRange, setDateRange,
    customFrom, setCustomFrom,
    customTo, setCustomTo,
    statusFilter, setStatusFilter,
    approvalFilter, setApprovalFilter,
    search, setSearch,
  } = useFilters({ initialStatus, initialDateRange: (initialStatus || initialPayment) ? '' : 'this_month' });
  const [paymentFilter, setPaymentFilter] = useState(initialPayment);

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Load invoices
  useEffect(() => {
    if (!firmsLoaded) return;
    let cancelled = false;
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (firmFilter)    p.set('firmId',        firmFilter);
    if (from)          p.set('dateFrom',      from);
    if (to)            p.set('dateTo',        to);
    if (statusFilter)  p.set('status',        statusFilter);
    if (paymentFilter) p.set('paymentStatus', paymentFilter);
    if (search)        p.set('search',        search);
    if (takeLimit)     p.set('take',          String(takeLimit));

    fetch(`/api/invoices?${p}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setInvoices(j.data ?? []); setHasMore(j.hasMore ?? false); setTotalCount(j.totalCount ?? 0); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [firmsLoaded, firmFilter, dateRange, customFrom, customTo, statusFilter, paymentFilter, search, refreshKey, takeLimit]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const filteredInvoices = approvalFilter
    ? invoices.filter((inv) => inv.approval === approvalFilter)
    : invoices;
  const { sorted: sortedInvoices, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(filteredInvoices, 'issue_date', 'desc');
  useEffect(() => { setPage(0); }, [sortField, sortDir]);
  const pagedInvoices = sortedInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedInvoices.length / PAGE_SIZE);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

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
              <svg className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--primary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Drop files to upload</p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">Files will be processed with OCR automatically</p>
            </div>
          </div>
        )}

        <header className="flex-shrink-0 bg-white border-b border-[#E0E3E5]">
          <div className="h-16 flex items-center justify-between pl-14 pr-6">
            <h1 className="text-xl font-bold tracking-tighter text-[var(--text-primary)]">Invoices</h1>
            <p className="text-[var(--text-secondary)] text-xs">
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </header>

        {activeTab === 'issued' ? (
          <main className="flex-1 overflow-hidden flex flex-col p-8 pl-14 animate-in paper-texture ledger-binding">
            <SalesInvoicesContent role="accountant" />
          </main>
        ) : (
        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-8 pl-14 animate-in paper-texture ledger-binding">

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
            showApprovalFilter
            approvalValue={approvalFilter}
            onApprovalChange={setApprovalFilter}
            showPaymentFilter
            paymentValue={paymentFilter}
            onPaymentChange={setPaymentFilter}
            showSearch
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search vendor or invoice #..."
          >
            <div className="ml-auto">
              <button
                onClick={() => { setShowNewInvoice(true); if (firms.length === 1) setNewInv(prev => ({ ...prev, firm_id: firms[0].id })); }}
                className="btn-thick-navy px-4 py-2 text-sm font-semibold"
              >
                + Submit New Invoice
              </button>
            </div>
          </FilterBar>

          {/* ── Load More ─────────────────────────────────── */}
          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={invoices.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* ── Batch action bar ────────────────────────────── */}
          {selectedRows.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[var(--primary)]/5 flex-shrink-0">
              <span className="text-body-sm font-medium text-[var(--text-primary)]">{selectedRows.length} selected</span>
              <button
                onClick={() => batchAction(selectedRows.map((r) => r.id), 'approve')}
                className="btn-thick-green text-sm px-4 py-1.5"
              >
                Approve
              </button>
              <button
                onClick={() => setRejectModal({ open: true, invoiceIds: selectedRows.map((r) => r.id), reason: '' })}
                className="btn-thick-red text-sm px-4 py-1.5"
              >
                Reject
              </button>
              <button
                onClick={() => setSelectedRows([])}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          {/* ── Invoice Table ────────────────────────────── */}
          <div className="flex-1 min-h-0 overflow-auto bg-white">
            {loading ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
            ) : invoices.length === 0 ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-12">No invoices found for the selected filters.</div>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="bg-[var(--surface-header)] text-left">
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] w-10"><input type="checkbox" checked={pagedInvoices.length > 0 && pagedInvoices.every((inv) => selectedRows.some((r) => r.id === inv.id))} onChange={toggleSelectAll} /></th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('issue_date')}>Issue Date{sortIndicator('issue_date')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('vendor_name_raw')}>Vendor{sortIndicator('vendor_name_raw')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('invoice_number')}>Invoice #{sortIndicator('invoice_number')}</th>
                      {!firmFilter && <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('due_date')}>Due Date{sortIndicator('due_date')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right cursor-pointer select-none" onClick={() => toggleSort('total_amount')}>Amount (RM){sortIndicator('total_amount')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('approval')}>Approval{sortIndicator('approval')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('supplier_link_status')}>Supplier{sortIndicator('supplier_link_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedInvoices.map((inv, idx) => {
                      const isSelected = selectedRows.some((r) => r.id === inv.id);
                      const approvalCfg = APPROVAL_CFG[inv.approval];
                      return (
                      <tr
                        key={inv.id}
                        onClick={() => setPreviewInvoice(inv)}
                        className={`text-body-sm hover:bg-[var(--surface-header)] transition-colors cursor-pointer ${isSelected ? 'bg-blue-50/40' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}
                      >
                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(inv)} />
                        </td>
                        <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{formatDateDot(inv.issue_date)}</td>
                        <td className="px-3 py-3 text-[var(--text-primary)] font-medium">{inv.vendor_name_raw}</td>
                        <td className="px-3 py-3 text-[var(--text-secondary)]">{inv.invoice_number ?? '-'}</td>
                        {!firmFilter && <td className="px-3 py-3 text-[var(--text-secondary)]">{inv.firm_name}</td>}
                        <td className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{inv.due_date ? formatDateDot(inv.due_date) : '-'}</td>
                        <td className="px-3 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                        <td className="px-3 py-3"><StatusCell value={inv.status} /></td>
                        <td className="px-3 py-3">{approvalCfg && <span className={approvalCfg.cls}>{approvalCfg.label}</span>}</td>
                        <td className="px-3 py-3"><PaymentCell value={inv.payment_status} /></td>
                        <td className="px-3 py-3"><LinkCell value={inv.supplier_link_status} /></td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-[#E0E3E5]">
                    <p className="text-body-sm text-[var(--text-secondary)]">
                      {page * PAGE_SIZE + 1}--{Math.min((page + 1) * PAGE_SIZE, sortedInvoices.length)} of {sortedInvoices.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Previous</button>
                      <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
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
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-50" onClick={() => setShowNewInvoice(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowNewInvoice(false)}>
            <div className="bg-white shadow-2xl w-full max-w-[800px] max-h-[90vh] overflow-y-scroll" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4" style={{ backgroundColor: 'var(--primary)' }}>
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">Submit New Invoice</h2>
                <button onClick={() => setShowNewInvoice(false)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>

              <div className="p-5 space-y-4">

                {/* Document preview */}
                {newInvFile && (() => {
                  const url = URL.createObjectURL(newInvFile);
                  const isPdf = newInvFile.type === 'application/pdf' || newInvFile.name.toLowerCase().endsWith('.pdf');
                  return (
                    <div className="border border-[#E0E3E5] overflow-hidden bg-[var(--surface-low)]">
                      {isPdf ? (
                        <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-[300px]" title="Invoice preview" />
                      ) : (
                        <img src={url} alt="Invoice preview" className="w-full max-h-[300px] object-contain" />
                      )}
                    </div>
                  );
                })()}

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Firm *</label>
                  <select value={newInv.firm_id} onChange={(e) => setNewInv({ ...newInv, firm_id: e.target.value })} className="input-field w-full">
                    <option value="">Select firm</option>
                    {firms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>

                <div className="relative">
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Vendor Name *</label>
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
                    const firmSuppliers = newInv.firm_id ? suppliers.filter((s) => s.firm_id === newInv.firm_id) : suppliers;
                    const filtered = firmSuppliers.filter((s) => s.name.toLowerCase().includes(q));
                    if (filtered.length === 0) return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#E0E3E5] shadow-lg p-3">
                        <p className="text-xs text-[var(--text-secondary)]">No matching suppliers -- a new one will be created</p>
                      </div>
                    );
                    return (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-[#E0E3E5] shadow-lg max-h-40 overflow-y-auto">
                        {filtered.slice(0, 8).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setNewInv({ ...newInv, vendor_name: s.name, supplier_id: s.id });
                              setVendorDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--surface-low)] transition-colors"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice Number</label>
                  <input type="text" value={newInv.invoice_number} onChange={(e) => setNewInv({ ...newInv, invoice_number: e.target.value })} className="input-field w-full" placeholder="Optional" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Issue Date *</label>
                    <input type="date" value={newInv.issue_date} onChange={(e) => setNewInv({ ...newInv, issue_date: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Due Date</label>
                    <input type="date" value={newInv.due_date} onChange={(e) => setNewInv({ ...newInv, due_date: e.target.value })} className="input-field w-full" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total Amount (RM) *</label>
                    <input type="number" step="0.01" value={newInv.total_amount} onChange={(e) => setNewInv({ ...newInv, total_amount: e.target.value })} className="input-field w-full tabular-nums" placeholder="0.00" />
                    {parseFloat(newInv.total_amount) < 0 && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 mt-1">Credit Note -- negative amount will offset against this supplier</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Payment Terms</label>
                    <input type="text" value={newInv.payment_terms} onChange={(e) => setNewInv({ ...newInv, payment_terms: e.target.value })} className="input-field w-full" placeholder="e.g. Net 30" />
                  </div>
                </div>

                {/* GL Account Selection */}
                {newInvGlAccounts.length > 0 && (
                  <>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Expense GL (Debit)</label>
                      <GlAccountSelect
                        value={newInvExpenseGlId}
                        onChange={setNewInvExpenseGlId}
                        accounts={newInvGlAccounts}
                        firmId={newInv.firm_id}
                        placeholder="Select Expense GL"
                        preferredType="Expense"
                        defaultType="Expense"
                        onAccountCreated={(a) => setNewInvGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contra GL (Credit -- Trade Payables)</label>
                      <GlAccountSelect
                        value={newInvContraGlId}
                        onChange={setNewInvContraGlId}
                        accounts={newInvGlAccounts}
                        firmId={newInv.firm_id}
                        placeholder="Select Trade Payables GL"
                        preferredType="Liability"
                        defaultType="Liability"
                        defaultBalance="Credit"
                        onAccountCreated={(a) => setNewInvGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes</label>
                  <textarea
                    value={newInv.notes}
                    onChange={(e) => setNewInv({ ...newInv, notes: e.target.value })}
                    className="input-field w-full text-sm"
                    rows={2}
                    placeholder="Phone number, account details, service period, etc."
                  />
                </div>

                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice Image(s)</label>
                  {newInvFile ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200">
                      <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-sm text-blue-700 truncate flex-1">{newInvFile.name}</span>
                      <button type="button" onClick={() => setNewInvFile(null)} className="text-xs text-blue-500 hover:text-blue-700">Remove</button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        multiple
                        onChange={handleInvFileChange}
                        className="input-field w-full text-sm file:mr-3 file:py-1 file:px-3 file:border-0 file:text-sm file:font-medium file:bg-[var(--surface-low)] file:text-[var(--text-secondary)] hover:file:bg-[var(--surface-header)]"
                      />
                      <p className="text-xs text-[var(--text-secondary)] mt-1">Select multiple files to batch upload with auto OCR</p>
                    </>
                  )}
                  {ocrScanning && (
                    <div className="mt-2 flex items-center gap-2 text-sm" style={{ color: 'var(--primary)' }}>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Scanning document... fields will auto-fill shortly
                    </div>
                  )}
                </div>

              </div>

              {depositWarning && <div className="px-5 pt-3"><p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">{depositWarning}</p></div>}
              {newInvError && <div className="px-5 pt-3"><p className="text-sm text-[var(--reject-red)] bg-red-50 border border-red-200 px-3 py-2">{newInvError}</p></div>}
              <div className="flex gap-3 px-5 py-4 bg-[var(--surface-low)]">
                <button
                  onClick={submitNewInvoice}
                  disabled={newInvSubmitting || ocrScanning}
                  className="btn-thick-navy flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ocrScanning ? 'Scanning...' : newInvSubmitting ? 'Submitting...' : 'Submit Invoice'}
                </button>
                <button
                  onClick={() => setShowNewInvoice(false)}
                  className="btn-thick-white flex-1 py-2.5 text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ BATCH REVIEW MODAL ═══ */}
      {showBatchReview && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); } }}>
          <div className="bg-white shadow-2xl w-full max-w-[1200px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>

            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
              <div className="flex items-center gap-3">
                <h2 className="text-white font-bold text-sm uppercase tracking-widest">
                  Batch Review -- {batchItems.length} invoices
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
              <button onClick={() => { if (!batchScanning && !batchSubmitting) { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); } }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            {batchScanning && (
              <div className="px-5 pt-3">
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
                  <span>Scanning files with OCR...</span>
                  <span>{Math.round((batchScanProgress.current / batchScanProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-[var(--surface-low)] h-2">
                  <div className="h-2 transition-all" style={{ backgroundColor: 'var(--primary)', width: `${(batchScanProgress.current / batchScanProgress.total) * 100}%` }} />
                </div>
              </div>
            )}

            <div className="flex-1 overflow-hidden flex">
            <div className={`flex-1 overflow-y-scroll p-5 space-y-3 ${batchPreviewId ? 'max-w-[60%]' : ''}`}>
              {batchItems.map((item) => (
                <div key={item._id} className={`border p-4 cursor-pointer transition-colors ${batchPreviewId === item._id ? 'ring-2 ring-[var(--primary)]' : ''} ${item.dupMessage ? 'border-red-300 bg-red-50/50' : item.ocrDone ? (item.ocrError ? 'border-red-200 bg-red-50/30' : 'border-[#E0E3E5] hover:border-[var(--primary)]/40') : 'border-[var(--surface-low)] bg-[var(--surface-low)] opacity-60'}`} onClick={() => item.ocrDone && setBatchPreviewId(batchPreviewId === item._id ? null : item._id)}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {item.ocrDone && (
                        <input type="checkbox" checked={item.selected}
                          onChange={(e) => { e.stopPropagation(); setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, selected: e.target.checked } : it)); }}
                          onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-[var(--primary)] flex-shrink-0" />
                      )}
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">{item.file.name}</p>
                    </div>
                    {!item.ocrDone && <span className="text-xs text-[var(--text-secondary)] ml-2">Scanning...</span>}
                    {item.ocrError && <span className="text-xs text-[var(--reject-red)] ml-2">{item.ocrError}</span>}
                    <button onClick={(e) => { e.stopPropagation(); if (batchPreviewId === item._id) setBatchPreviewId(null); setBatchItems(prev => prev.filter(it => it._id !== item._id)); }} className="text-xs text-[var(--reject-red)] hover:opacity-80 ml-2">Remove</button>
                  </div>
                  {item.dupMessage && (
                    <p className="text-xs text-[var(--reject-red)] font-medium">{item.dupMessage}</p>
                  )}
                  {item.ocrDone && !item.dupMessage && (
                    <div className="grid grid-cols-4 gap-2" onClick={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') e.stopPropagation(); }}>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Vendor</label>
                        <input value={item.vendor_name} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, vendor_name: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice #</label>
                        <input value={item.invoice_number} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, invoice_number: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                        <input type="date" value={item.issue_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, issue_date: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                        <input value={item.total_amount} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, total_amount: v } : it)); }} className="input-field w-full text-xs tabular-nums" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                        <select value={item.category_id} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, category_id: v } : it)); }} className="input-field w-full text-xs">
                          <option value="">Select...</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Due Date</label>
                        <input type="date" value={item.due_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, due_date: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Terms</label>
                        <input value={item.payment_terms} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, payment_terms: v } : it)); }} className="input-field w-full text-xs" />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes</label>
                        <input value={item.notes} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, notes: v } : it)); }} className="input-field w-full text-xs" placeholder="Phone number, account details, etc." />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

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

            <div className="px-5 py-3 bg-[var(--surface-low)] flex items-center gap-2 flex-shrink-0 border-t border-[#E0E3E5]">
              <span className="text-xs text-[var(--text-secondary)] mr-auto">{batchItems.filter(i => i.selected).length} of {batchItems.length} selected</span>
              <button onClick={() => { setShowBatchReview(false); setBatchItems([]); setBatchPreviewId(null); }} disabled={batchScanning || batchSubmitting}
                className="btn-thick-white px-6 py-2 text-sm font-semibold disabled:opacity-40">Cancel</button>
              <button onClick={submitBatch} disabled={batchScanning || batchSubmitting || batchItems.filter(i => i.selected).length === 0}
                className="btn-thick-navy px-6 py-2 text-sm font-semibold disabled:opacity-40">
                {batchSubmitting ? 'Submitting...' : `Submit Selected (${batchItems.filter(i => i.selected).length})`}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ INVOICE PREVIEW PANEL ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewInvoice(null)}>
          <div className="bg-white shadow-2xl w-full max-w-[800px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0" style={{ backgroundColor: 'var(--primary)' }}>
              <h2 className="text-white font-bold text-sm uppercase tracking-widest">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-scroll p-5 space-y-4">
              {previewInvoice.file_url ? (
                <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="block">
                  {previewInvoice.thumbnail_url && !previewInvoice.file_url.includes('.pdf') ? (
                    <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-64 object-contain border border-[#E0E3E5] cursor-pointer hover:opacity-90 transition-opacity" />
                  ) : (
                    <div className="w-full border border-[#E0E3E5] bg-[var(--surface-low)] px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--surface-header)] transition-colors">
                      <div className="w-10 h-12 bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-red-500 font-bold text-xs">PDF</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--primary)' }}>View document</p>
                        <p className="text-xs text-[var(--text-secondary)]">Opens in Google Drive</p>
                      </div>
                    </div>
                  )}
                </a>
              ) : (
                <div className="w-full h-20 border border-[#E0E3E5] bg-[var(--surface-low)] flex items-center justify-center text-[var(--text-secondary)] text-sm">No document attached</div>
              )}

              {editMode && editData ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Vendor</label>
                    <input type="text" value={editData.vendor_name_raw} onChange={(e) => setEditData({ ...editData, vendor_name_raw: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice Number</label>
                    <input type="text" value={editData.invoice_number} onChange={(e) => setEditData({ ...editData, invoice_number: e.target.value })} className="input-field w-full" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Issue Date</label>
                      <input type="date" value={editData.issue_date} onChange={(e) => setEditData({ ...editData, issue_date: e.target.value })} className="input-field w-full" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Due Date</label>
                      <input type="date" value={editData.due_date} onChange={(e) => setEditData({ ...editData, due_date: e.target.value })} className="input-field w-full" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Payment Terms</label>
                    <input type="text" value={editData.payment_terms} onChange={(e) => setEditData({ ...editData, payment_terms: e.target.value })} className="input-field w-full" placeholder="e.g. Net 30" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Subtotal</label>
                      <input type="number" step="0.01" value={editData.subtotal} onChange={(e) => setEditData({ ...editData, subtotal: e.target.value })} className="input-field w-full tabular-nums" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Tax</label>
                      <input type="number" step="0.01" value={editData.tax_amount} onChange={(e) => setEditData({ ...editData, tax_amount: e.target.value })} className="input-field w-full tabular-nums" />
                    </div>
                    <div>
                      <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Total</label>
                      <input type="number" step="0.01" value={editData.total_amount} onChange={(e) => setEditData({ ...editData, total_amount: e.target.value })} className="input-field w-full tabular-nums" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-field w-full">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier Account</label>
                    {creatingSupplier ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newSupplierName}
                          onChange={(e) => setNewSupplierName(e.target.value)}
                          placeholder="New supplier name"
                          className="input-field flex-1"
                          autoFocus
                        />
                        <button
                          onClick={async () => {
                            if (!newSupplierName.trim()) return;
                            try {
                              const res = await fetch('/api/suppliers', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: newSupplierName.trim(), firm_id: previewInvoice.firm_id }),
                              });
                              const j = await res.json();
                              if (j.data?.id) {
                                setSuppliers(prev => [...prev, { id: j.data.id, name: j.data.name, firm_id: previewInvoice.firm_id }]);
                                setEditData({ ...editData, supplier_id: j.data.id });
                                setCreatingSupplier(false);
                                setNewSupplierName('');
                              }
                            } catch (e) { console.error(e); }
                          }}
                          className="btn-thick-green px-3 py-1.5 text-sm font-medium"
                        >
                          Create
                        </button>
                        <button onClick={() => { setCreatingSupplier(false); setNewSupplierName(''); }} className="btn-thick-white px-3 py-1.5 text-sm">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <select value={editData.supplier_id} onChange={(e) => setEditData({ ...editData, supplier_id: e.target.value })} className="input-field w-full">
                          <option value="">-- Not assigned --</option>
                          {suppliers.filter(s => s.firm_id === previewInvoice.firm_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button onClick={() => setCreatingSupplier(true)} className="text-xs hover:underline mt-1" style={{ color: 'var(--primary)' }}>+ Create new supplier</button>
                      </>
                    )}
                  </div>
                  {glAccounts.length > 0 && (
                    <>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Expense GL (Debit)</label>
                        <GlAccountSelect
                          value={selectedGlAccountId}
                          onChange={setSelectedGlAccountId}
                          accounts={glAccounts}
                          firmId={previewInvoice.firm_id}
                          placeholder="Select Expense GL"
                          preferredType="Expense"
                          defaultType="Expense"
                          onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Contra GL (Credit)</label>
                        <GlAccountSelect
                          value={selectedContraGlId}
                          onChange={setSelectedContraGlId}
                          accounts={glAccounts}
                          firmId={previewInvoice.firm_id}
                          placeholder="Select Contra GL"
                          preferredType="Liability"
                          defaultType="Liability"
                          defaultBalance="Credit"
                          onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-3">
                    <Field label="Vendor"        value={previewInvoice.vendor_name_raw} />
                    <Field label="Invoice No."   value={previewInvoice.invoice_number} />
                    <Field label="Issue Date"    value={formatDateDot(previewInvoice.issue_date)} />
                    <Field label="Due Date"      value={previewInvoice.due_date ? formatDateDot(previewInvoice.due_date) : null} />
                    <Field label="Payment Terms" value={previewInvoice.payment_terms} />
                    <Field label="Subtotal"      value={previewInvoice.subtotal ? formatRM(previewInvoice.subtotal) : null} />
                    <Field label="Tax"           value={previewInvoice.tax_amount ? formatRM(previewInvoice.tax_amount) : null} />
                    <Field label="Total Amount"  value={formatRM(previewInvoice.total_amount)} />
                    <Field label="Amount Paid"   value={formatRM(previewInvoice.amount_paid)} />
                    <Field label="Category"      value={previewInvoice.category_name} />
                    <Field label="Uploaded By"   value={previewInvoice.uploader_name} />
                    <Field label="Firm"          value={previewInvoice.firm_name} />
                  </dl>

                  {previewInvoice.notes && (
                    <div className="bg-amber-50 border border-amber-200 px-3 py-2 mt-2">
                      <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Notes</p>
                      <p className="text-sm text-amber-900 whitespace-pre-line">{previewInvoice.notes}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                    {APPROVAL_CFG[previewInvoice.approval] && (
                      <span className={APPROVAL_CFG[previewInvoice.approval].cls}>
                        {APPROVAL_CFG[previewInvoice.approval].label}
                      </span>
                    )}
                  </div>

                  {/* Supplier link */}
                  <div className="bg-[var(--surface-low)] p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier Account</span>
                      {(() => {
                        const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                        return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                      })()}
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
                    {previewInvoice.supplier_link_status !== 'confirmed' && (
                      <div className="flex gap-2 pt-1">
                        {previewInvoice.supplier_id && (
                          <button
                            onClick={() => confirmSupplier(previewInvoice.id, previewInvoice.supplier_id!)}
                            className="btn-thick-green text-xs px-3 py-1.5 font-medium"
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
                          {suppliers.filter((s) => s.firm_id === previewInvoice.firm_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
                            <button onClick={createAndAssignSupplier} className="btn-thick-green text-xs px-3 py-1.5 font-medium">
                              Create
                            </button>
                            <button onClick={() => setCreatingSupplier(false)} className="btn-thick-white text-xs px-2 py-1.5 font-medium">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewInvoice.confidence === 'HIGH' ? 'text-[var(--match-green)]' :
                      previewInvoice.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-[var(--reject-red)]'
                    }`}>{previewInvoice.confidence}</span>
                  </div>

                  {previewInvoice.file_url && (
                    <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline block" style={{ color: 'var(--primary)' }}>
                      View full document &rarr;
                    </a>
                  )}
                </>
              )}
            </div>

            {/* GL Account Assignment */}
            {!editMode && glAccounts.length > 0 && (
              <div className="px-5 pb-2 space-y-2">
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Expense GL (Debit)</label>
                  {previewInvoice.approval === 'approved' ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[#E0E3E5]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--match-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--text-primary)]">{previewInvoice.gl_account_label ?? 'Not assigned'}</span>
                    </div>
                  ) : (
                    <GlAccountSelect
                      value={selectedGlAccountId}
                      onChange={setSelectedGlAccountId}
                      accounts={glAccounts}
                      firmId={previewInvoice.firm_id}
                      placeholder="Select GL Account"
                      preferredType="Expense"
                      defaultType="Expense"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest block mb-1">Contra GL (Credit)</label>
                  {previewInvoice.approval === 'approved' ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--surface-low)] border border-[#E0E3E5]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--match-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                      </svg>
                      <span className="text-sm font-medium text-[var(--text-primary)]">{(() => {
                        if (previewInvoice.contra_gl_account_label) return previewInvoice.contra_gl_account_label;
                        const gl = glAccounts.find(a => a.id === selectedContraGlId);
                        return gl ? `${gl.account_code} — ${gl.name}` : 'Not assigned';
                      })()}</span>
                    </div>
                  ) : (
                    <GlAccountSelect
                      value={selectedContraGlId}
                      onChange={setSelectedContraGlId}
                      accounts={glAccounts}
                      firmId={previewInvoice.firm_id}
                      placeholder="Select Contra GL Account"
                      preferredType="Liability"
                      defaultType="Liability"
                      defaultBalance="Credit"
                      onAccountCreated={(a) => setGlAccounts(prev => [...prev, a].sort((x, y) => x.account_code.localeCompare(y.account_code)))}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="p-4 flex-shrink-0 bg-[var(--surface-low)] space-y-2">
              {editMode ? (
                <div className="flex gap-3">
                  <button onClick={saveEdit} disabled={editSaving} className="btn-thick-navy flex-1 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="btn-thick-white flex-1 py-2 text-sm font-semibold">
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  {/* ── Primary actions based on current state ── */}
                  <div className="flex gap-3">
                    {previewInvoice.status === 'pending_review' && previewInvoice.approval === 'pending_approval' && (
                      <>
                        <button
                          onClick={() => markAsReviewed(previewInvoice.id, selectedGlAccountId || undefined)}
                          className="btn-thick-navy flex-1 py-2 text-sm font-semibold"
                        >
                          Mark as Reviewed
                        </button>
                        <button
                          onClick={() => batchAction([previewInvoice.id], 'approve', undefined, selectedGlAccountId || undefined, selectedContraGlId || undefined)}
                          className="btn-thick-green flex-1 py-2 text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectModal({ open: true, invoiceIds: [previewInvoice.id], reason: '' })}
                          className="btn-thick-red flex-1 py-2 text-sm"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {previewInvoice.status === 'reviewed' && previewInvoice.approval === 'pending_approval' && (
                      <>
                        <button
                          onClick={() => batchAction([previewInvoice.id], 'approve', undefined, selectedGlAccountId || undefined, selectedContraGlId || undefined)}
                          className="btn-thick-green flex-1 py-2 text-sm"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectModal({ open: true, invoiceIds: [previewInvoice.id], reason: '' })}
                          className="btn-thick-red flex-1 py-2 text-sm"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {previewInvoice.approval === 'approved' && (
                      <div className="flex-1 flex items-center justify-center py-2 text-sm font-semibold text-[var(--match-green)] bg-green-50 border border-green-200">
                        Approved
                      </div>
                    )}
                    {previewInvoice.approval === 'not_approved' && (
                      <div className="flex-1 flex items-center justify-center py-2 text-sm font-semibold text-[var(--reject-red)] bg-red-50 border border-red-200">
                        Rejected
                      </div>
                    )}
                  </div>
                  {/* ── Secondary actions (edit, revert) ── */}
                  <div className="flex gap-3">
                    {previewInvoice.approval !== 'approved' && (
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
                      className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                    >
                      Edit
                    </button>
                    )}
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
                        className="btn-thick-white flex-1 py-2 text-sm font-semibold"
                      >
                        Revert Review
                      </button>
                    )}
                    {(previewInvoice.approval === 'approved' || previewInvoice.approval === 'not_approved') && (() => {
                      const hasBankRecon = previewInvoice.payment_status === 'paid' || previewInvoice.payment_status === 'partially_paid';
                      return (
                        <button
                          onClick={() => {
                            if (hasBankRecon) return;
                            batchAction([previewInvoice.id], 'revert');
                          }}
                          disabled={hasBankRecon}
                          title={hasBankRecon ? 'Cannot revert -- invoice has bank reconciliation payments. Unmatch in Bank Recon first.' : ''}
                          className={`btn-thick-white flex-1 py-2 text-sm font-semibold ${
                            hasBankRecon ? 'opacity-60 cursor-not-allowed' : ''
                          }`}
                        >
                          Revert Approval
                        </button>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[#E0E3E5] flex-shrink-0">
              <button
                onClick={() => deleteInvoice(previewInvoice.id)}
                className="btn-thick-red text-xs px-3 py-1 font-medium"
              >
                Delete
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ REJECT MODAL ═══ */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4" onClick={() => setRejectModal({ open: false, invoiceIds: [], reason: '' })}>
          <div className="bg-white shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4" style={{ backgroundColor: 'var(--primary)' }}>
              <h3 className="text-white font-bold text-sm uppercase tracking-widest">
                Reject {rejectModal.invoiceIds.length} Invoice{rejectModal.invoiceIds.length !== 1 ? 's' : ''}
              </h3>
            </div>
            <div className="p-5">
              <textarea
                value={rejectModal.reason}
                onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="Enter rejection reason..."
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>
            <div className="flex gap-3 px-5 py-4 bg-[var(--surface-low)]">
              <button onClick={confirmReject} disabled={!rejectModal.reason.trim()} className="btn-thick-red flex-1 py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                Confirm Reject
              </button>
              <button onClick={() => setRejectModal({ open: false, invoiceIds: [], reason: '' })} className="btn-thick-white flex-1 py-2.5 text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
