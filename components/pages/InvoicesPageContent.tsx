'use client';

// Sales invoices are now merged into the main table (no separate tab)
import LoadMoreBanner from '@/components/LoadMoreBanner';
import { useBatchProcess } from '@/contexts/BatchProcessContext';
import { StatusCell, PaymentCell, LinkCell } from '@/components/table/StatusBadge';
import { Suspense, useState, useEffect, useRef } from 'react';
import { useTableSort } from '@/lib/use-table-sort';
import { usePageTitle } from '@/lib/use-page-title';
import { formatRM, getDateRange } from '@/lib/formatters';
import { useFilters } from '@/hooks/useFilters';
import { APPROVAL_CFG } from '@/lib/badge-config';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const InvoiceCreateModal = dynamic(() => import('@/components/invoices/InvoiceCreateModal'));
const InvoiceRejectModal = dynamic(() => import('@/components/invoices/InvoiceRejectModal'));
const InvoicePreviewPanel = dynamic(() => import('@/components/invoices/InvoicePreviewPanel'));
import SearchButton from '@/components/SearchButton';
import MobileInvoiceCard from '@/components/mobile/MobileInvoiceCard';
import { useIsMobile } from '@/hooks/useIsMobile';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceLineRow {
  id: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_amount: string;
  line_total: string;
  gl_account_id: string | null;
  gl_account_label: string | null;
  sort_order: number;
}

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
  lines: InvoiceLineRow[];
  /** Discriminator: 'purchase' for Invoice, 'sales' for SalesInvoice */
  _type?: 'purchase' | 'sales';
}

interface SupplierOption {
  id: string;
  name: string;
  firm_id: string;
  default_gl_account_id?: string | null;
  default_contra_gl_account_id?: string | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface InvoicesPageConfig {
  role: 'accountant' | 'admin';
  apiInvoices: string;
  apiSalesInvoices?: string;
  apiBatch: string;
  apiDelete: string;
  apiCategories: string;
  apiSuppliers: string;
  linkPrefix: string;
  showFirmColumn: boolean;
  showApproval: boolean;
  showGlFields: boolean;
  showLineItems: boolean;
  firmId?: string;
  firmsLoaded: boolean;
  firms?: { id: string; name: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PI: { label: 'PI', color: '#234B6E', bg: '#E3EDF6' },
  SI: { label: 'SI', color: '#0E6027', bg: '#DEF2E4' },
  PV: { label: 'PV', color: '#7C3A00', bg: '#FEF0DB' },
  OR: { label: 'OR', color: '#5C2D91', bg: '#EEDDF9' },
};

function getInvoiceTypeBadge(row: InvoiceRow): { label: string; color: string; bg: string } | null {
  const num = row.invoice_number ?? '';
  const prefix = num.split('-')[0];
  if (TYPE_BADGE[prefix]) return TYPE_BADGE[prefix];
  if (row._type === 'sales') return TYPE_BADGE.SI;
  return TYPE_BADGE.PI;
}

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

export default function InvoicesPageContentWrapper({ config }: { config: InvoicesPageConfig }) {
  return <Suspense><InvoicesPageContent config={config} /></Suspense>;
}

function InvoicesPageContent({ config }: { config: InvoicesPageConfig }) {
  usePageTitle('Invoices');
  const pageSearchParams = useSearchParams();
  const isMobile = useIsMobile();

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

  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Cache GL accounts, categories, and accounting settings per firm (don't change mid-session)
  const glCacheRef = useRef<Record<string, {
    glAccounts: { id: string; account_code: string; name: string; account_type: string }[];
    categories: { id: string; gl_account_id?: string }[];
    firmDefaultContra: string;
  }>>({});

  // Selection for batch actions (accountant only)
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
    const scrollTop = tableScrollRef.current?.scrollTop ?? 0;
    try {
      const res = await fetch(config.apiBatch, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds, action, ...(reason && { reason }), ...(glAccountId && { gl_account_id: glAccountId }), ...(contraGlId && { contra_gl_account_id: contraGlId }) }),
      });
      if (res.ok) {
        refresh();
        requestAnimationFrame(() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = scrollTop; });
        setSelectedRows([]);
        if (previewInvoice && invoiceIds.includes(previewInvoice.id)) {
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
  const [firmSetupReady, setFirmSetupReady] = useState(true);
  const [firmSetupMessage, setFirmSetupMessage] = useState('');

  // Line items editor (accountant only)
  interface LineDraft { description: string; unit_price: string; tax_amount: string; line_total: string; gl_account_id: string }
  const [lineItems, setLineItems] = useState<LineDraft[]>([]);
  const [showLineItems, setShowLineItems] = useState(false);
  const [lineSaving, setLineSaving] = useState(false);
  const lineSavedRef = useRef(false);

  const addLineItem = () => setLineItems(prev => [...prev, { description: '', unit_price: '', tax_amount: '0', line_total: '', gl_account_id: '' }]);
  const removeLineItem = (idx: number) => setLineItems(prev => prev.filter((_, i) => i !== idx));
  const updateLineItem = (idx: number, field: keyof LineDraft, value: string) => {
    setLineItems(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === 'unit_price' || field === 'tax_amount') {
        updated.line_total = (Number(updated.unit_price || 0) + Number(updated.tax_amount || 0)).toFixed(2);
      }
      return updated;
    }));
  };
  const lineItemsTotal = lineItems.reduce((sum, l) => sum + Number(l.line_total || 0), 0);

  const saveLineItems = async () => {
    if (!previewInvoice) return;
    setLineSaving(true);
    try {
      const res = await fetch(`${config.apiInvoices}/${previewInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: lineItems.map((l, i) => ({
            description: l.description,
            unit_price: Number(l.unit_price || 0),
            tax_amount: Number(l.tax_amount || 0),
            line_total: Number(l.line_total || 0),
            gl_account_id: l.gl_account_id || null,
            sort_order: i,
          })),
        }),
      });
      if (res.ok) {
        const newLines: InvoiceLineRow[] = lineItems.map((l, i) => ({
          id: `temp-${i}`,
          description: l.description,
          quantity: '1',
          unit_price: l.unit_price,
          tax_amount: l.tax_amount,
          line_total: l.line_total,
          gl_account_id: l.gl_account_id || null,
          gl_account_label: l.gl_account_id ? (() => {
            const gl = glAccounts.find(a => a.id === l.gl_account_id);
            return gl ? `${gl.account_code} — ${gl.name}` : null;
          })() : null,
          sort_order: i,
        }));
        lineSavedRef.current = true;
        setShowLineItems(false);
        setPreviewInvoice({
          ...previewInvoice,
          total_amount: lineItemsTotal.toFixed(2),
          lines: newLines,
        });
        refresh();
      } else {
        const json = await res.json().catch(() => ({ error: 'Save failed' }));
        alert(json.error || 'Save failed');
      }
    } catch (e) { console.error(e); }
    finally { setLineSaving(false); }
  };

  const removeAllLineItems = async () => {
    if (!previewInvoice) return;
    setLineSaving(true);
    try {
      const res = await fetch(`${config.apiInvoices}/${previewInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: [] }),
      });
      if (res.ok) {
        setLineItems([]);
        setShowLineItems(false);
        setPreviewInvoice({ ...previewInvoice, lines: [] });
        refresh();
      }
    } catch (e) { console.error(e); }
    finally { setLineSaving(false); }
  };

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
    supplier_link_status: 'unmatched' as 'confirmed' | 'auto_matched' | 'unmatched',
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
  const [pvMatch, setPvMatch] = useState<{ id: string; invoice_number: string; vendor_name_raw: string; total_amount: string; issue_date: string } | null>(null);
  const [pvAttaching, setPvAttaching] = useState(false);
  const [newInvGlAccounts, setNewInvGlAccounts] = useState<{ id: string; account_code: string; name: string; account_type: string }[]>([]);
  const [newInvExpenseGlId, setNewInvExpenseGlId] = useState('');
  const [newInvContraGlId, setNewInvContraGlId] = useState('');
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  // Batch review state
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
  // Batch process context (scan/submit loops + overlay live here, survive navigation)
  const batch = useBatchProcess();
  const batchItems = batch.items as BatchItem[];
  const setBatchItems = batch.setItems as (updater: (prev: BatchItem[]) => BatchItem[]) => void;
  const batchScanning = batch.job.phase === 'scanning';
  const batchSubmitting = batch.job.phase === 'submitting';
  const batchScanProgress = batchScanning ? { current: batch.job.current, total: batch.job.total } : { current: 0, total: 0 };
  const batchSubmitProgress = batchSubmitting ? { current: batch.job.current, total: batch.job.total } : { current: 0, total: 0 };

  const [showBatchReview, setShowBatchReview] = useState(false);
  const [batchWarning, setBatchWarning] = useState<{ ok: number; fail: number; dupes: string[] } | null>(null);
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

  const cancelBatchScan = () => {
    if (!confirm('Cancel scanning? All scanned items will be discarded.')) return;
    batch.cancel();
    setShowBatchReview(false);
    setBatchItems(() => []);
    setBatchPreviewId(null);
  };

  // On mount: if scan already done (user navigated back), open review modal immediately
  useEffect(() => {
    if (batch.job.phase === 'scan_done' && batchItems.length > 0) {
      setShowBatchReview(true);
      batch.dismiss();
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // When submit completes via context, convert results to batchWarning and refresh
  useEffect(() => {
    if (batch.submitResults && batch.job.phase === 'submit_done') {
      const ok = batch.submitResults.filter(r => r.ok).length;
      const fail = batch.submitResults.filter(r => !r.ok).length;
      const dupes = batch.submitResults.filter(r => !r.ok).map(r => `${r.name}: ${r.msg}`);
      setBatchWarning({ ok, fail, dupes });
      batch.clear();
      refresh();
    }
  }, [batch.submitResults, batch.job.phase]);  // eslint-disable-line react-hooks/exhaustive-deps

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

  const getTargetFirmId = () => {
    if (config.role === 'admin') return ''; // admin doesn't need firm_id for uploads
    return config.firmId || (config.firms?.length === 1 ? config.firms[0].id : '');
  };

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

    const targetFirmId = getTargetFirmId();
    if (config.role === 'accountant' && !targetFirmId) {
      alert('Please select a firm before uploading.');
      return;
    }
    if (!firmSetupReady) {
      alert(firmSetupMessage || 'This firm needs to be set up before uploading. Go to Client Details.');
      return;
    }

    if (droppedFiles.length === 1) {
      const file = droppedFiles[0];
      if (config.role === 'accountant') setNewInv((prev) => ({ ...prev, firm_id: targetFirmId }));
      setShowNewInvoice(true);
      setNewInvFile(file);
      setNewInvError('');
      setDepositWarning('');

      // Check for duplicate file before OCR
      try {
        const dupFd = new FormData();
        dupFd.append('file', file);
        if (targetFirmId) dupFd.append('firm_id', targetFirmId);
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
          if (config.role === 'accountant') {
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
                if (supplierMatch) { updates.supplier_id = supplierMatch.id; updates.supplier_link_status = 'auto_matched'; }
              }
              return updates;
            });
            // Auto-fill GL from matched supplier defaults
            const vendorName = f.vendor || f.merchant;
            if (vendorName) {
              const vLower = vendorName.toLowerCase().trim();
              const firmSuppliers = suppliers.filter((s) => s.firm_id === targetFirmId);
              const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
              if (supplierMatch?.default_gl_account_id) {
                setNewInvExpenseGlId(supplierMatch.default_gl_account_id);
                if (supplierMatch?.default_contra_gl_account_id) setNewInvContraGlId(supplierMatch.default_contra_gl_account_id);
              } else {
                fetch(`/api/suppliers/by-alias?alias=${encodeURIComponent(vLower)}&firmId=${targetFirmId}`)
                  .then(r => r.json())
                  .then(j => {
                    if (j.data?.default_gl_account_id) setNewInvExpenseGlId(prev => prev || j.data.default_gl_account_id);
                    if (j.data?.default_contra_gl_account_id) setNewInvContraGlId(prev => prev || j.data.default_contra_gl_account_id);
                  })
                  .catch(() => {});
              }
            }
            if (f.depositWarning) setDepositWarning(f.depositWarning);
          } else {
            // Admin OCR handling
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
              if (supplierMatch) { updates.supplier_id = supplierMatch.id; updates.supplier_link_status = 'auto_matched'; }
            }
            setNewInv(updates);
          }
        }
      } catch (err) {
        console.error('OCR extraction failed:', err);
      } finally {
        setOcrScanning(false);
      }
      return;
    }

    // Multiple files — batch review modal
    if (droppedFiles.length > 20) {
      alert('Maximum 20 files per batch upload. Please upload in smaller batches.');
      return;
    }
    const items: BatchItem[] = droppedFiles.map((file, i) => ({
      _id: `${Date.now()}-${i}`, file, vendor_name: '', invoice_number: '', issue_date: new Date().toISOString().split('T')[0],
      due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '', supplier_id: '',
      ocrDone: false, ocrError: '', selected: true, dupMessage: '',
    }));
    setShowBatchReview(true);

    // Capture current categories/suppliers for the worker closure
    const catSnapshot = categories.map((c) => ({ id: c.id, name: c.name }));
    const supSnapshot = suppliers.map((s) => ({ id: s.id, name: s.name }));

    batch.startScan({
      label: 'Scanning invoices...',
      returnPath: `${config.linkPrefix}/invoices`,
      items,
      worker: async (item: BatchItem, _index: number, updateItem) => {
        // Duplicate check
        const dupFd = new FormData();
        dupFd.append('file', item.file);
        if (targetFirmId) dupFd.append('firm_id', targetFirmId);
        const dupRes = await fetch('/api/invoices/check-duplicate', { method: 'POST', body: dupFd });
        const dupJson = await dupRes.json();
        if (dupJson.data?.isDuplicate) {
          updateItem(item._id, { ocrDone: true, dupMessage: dupJson.data.message, selected: false });
          return;
        }

        // OCR extraction
        const ocrFd = new FormData();
        ocrFd.append('file', item.file);
        ocrFd.append('categories', JSON.stringify(catSnapshot.map((c) => c.name)));
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        const updates: Partial<BatchItem> = { ocrDone: true };
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          updates.vendor_name = (isInvoice ? f.vendor : f.merchant) || '';
          updates.invoice_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          updates.issue_date = (isInvoice ? f.issueDate : f.date) || item.issue_date;
          updates.due_date = (isInvoice ? f.dueDate : '') || '';
          updates.total_amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          updates.payment_terms = (isInvoice ? f.paymentTerms : '') || '';
          updates.notes = f.notes || '';
          if (f.category) {
            const match = catSnapshot.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) updates.category_id = match.id;
          }
          const vendorName = updates.vendor_name;
          if (vendorName) {
            const supplierMatch = supSnapshot.find((s) => s.name.toLowerCase() === vendorName.toLowerCase());
            if (supplierMatch) updates.supplier_id = supplierMatch.id;
          }
        }
        updateItem(item._id, updates);
      },
    });
  };

  const submitBatch = () => {
    const selected = batchItems.filter(i => i.selected);
    if (selected.length === 0) return;
    setShowBatchReview(false);
    setBatchPreviewId(null);

    // Capture values for worker closure
    const submitFirmId = newInv.firm_id || getTargetFirmId();
    const apiUrl = config.apiInvoices;
    const role = config.role;

    batch.startSubmit({
      label: 'Uploading invoices...',
      items: selected,
      worker: async (item: BatchItem) => {
        const fd = new FormData();
        if (role === 'accountant') fd.append('firm_id', submitFirmId);
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
        const res = await fetch(apiUrl, { method: 'POST', body: fd });
        if (res.ok) {
          return { name: item.file.name, ok: true, msg: 'Uploaded' };
        } else {
          const json = await res.json().catch(() => ({ error: 'Failed' }));
          return { name: item.file.name, ok: false, msg: json.error || 'Failed' };
        }
      },
    });
  };

  // Fetch GL accounts when firm is selected in modal (accountant only)
  useEffect(() => {
    if (!config.showGlFields || !showNewInvoice || !newInv.firm_id) { setNewInvGlAccounts([]); return; }
    fetch(`/api/gl-accounts?firmId=${newInv.firm_id}`).then((r) => r.json())
      .then((j) => setNewInvGlAccounts(j.data ?? []))
      .catch(console.error);
  }, [config.showGlFields, showNewInvoice, newInv.firm_id]);

  const handleInvFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

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
            const firmSuppliers = config.role === 'accountant' && newInv.firm_id ? suppliers.filter((s) => s.firm_id === newInv.firm_id) : suppliers;
            const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
            if (supplierMatch) { updates.supplier_id = supplierMatch.id; updates.supplier_link_status = 'auto_matched'; }
          }
          setNewInv(updates);

          // Check for matching payment voucher (PV-) to attach instead of creating new
          const ocrAmount = updates.total_amount;
          const ocrVendor = updates.vendor_name;
          const targetFirmId = getTargetFirmId();
          if (ocrAmount && targetFirmId) {
            try {
              const matchRes = await fetch(`/api/invoices/match-voucher?firmId=${targetFirmId}&totalAmount=${encodeURIComponent(ocrAmount)}${ocrVendor ? `&vendorName=${encodeURIComponent(ocrVendor)}` : ''}`);
              const matchJson = await matchRes.json();
              if (matchRes.ok && matchJson.data?.match) {
                setPvMatch(matchJson.data.match);
              }
            } catch { /* ignore */ }
          }

          // Auto-fill GL from matched supplier defaults (parity with drag-drop handler)
          if (config.showGlFields) {
            const vendorName = json.fields.vendor || json.fields.merchant;
            const targetFirm = newInv.firm_id || (config.firms?.length === 1 ? config.firms[0].id : '');
            if (vendorName && targetFirm) {
              const vLower = vendorName.toLowerCase().trim();
              const firmSuppliers = suppliers.filter((s) => s.firm_id === targetFirm);
              const supplierMatch = firmSuppliers.find((s) => s.name.toLowerCase() === vLower);
              if (supplierMatch?.default_gl_account_id) {
                setNewInvExpenseGlId(supplierMatch.default_gl_account_id);
                if (supplierMatch?.default_contra_gl_account_id) setNewInvContraGlId(supplierMatch.default_contra_gl_account_id);
              } else {
                fetch(`/api/suppliers/by-alias?alias=${encodeURIComponent(vLower)}&firmId=${targetFirm}`)
                  .then(r => r.json())
                  .then(j => {
                    if (j.data?.default_gl_account_id) setNewInvExpenseGlId(prev => prev || j.data.default_gl_account_id);
                    if (j.data?.default_contra_gl_account_id) setNewInvContraGlId(prev => prev || j.data.default_contra_gl_account_id);
                  })
                  .catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.error('OCR extraction failed:', err);
      } finally {
        setOcrScanning(false);
      }
      return;
    }

    // Multiple files — batch upload
    if (config.role === 'accountant' && !newInv.firm_id) {
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
    setShowBatchReview(true);

    const targetFirmId = getTargetFirmId();
    const catSnapshot = categories.map((c) => ({ id: c.id, name: c.name }));
    const supSnapshot = suppliers.map((s) => ({ id: s.id, name: s.name }));

    batch.startScan({
      label: 'Scanning invoices...',
      returnPath: `${config.linkPrefix}/invoices`,
      items: bItems,
      worker: async (item: BatchItem, _index: number, updateItem) => {
        const dupFd = new FormData();
        dupFd.append('file', item.file);
        if (targetFirmId) dupFd.append('firm_id', targetFirmId);
        const dupRes = await fetch('/api/invoices/check-duplicate', { method: 'POST', body: dupFd });
        const dupJson = await dupRes.json();
        if (dupJson.data?.isDuplicate) {
          updateItem(item._id, { ocrDone: true, dupMessage: dupJson.data.message, selected: false });
          return;
        }

        const ocrFd = new FormData();
        ocrFd.append('file', item.file);
        ocrFd.append('categories', JSON.stringify(catSnapshot.map((c) => c.name)));
        const ocrRes = await fetch('/api/ocr/extract', { method: 'POST', body: ocrFd });
        const ocrJson = await ocrRes.json();
        const updates: Partial<BatchItem> = { ocrDone: true };
        if (ocrRes.ok && ocrJson.fields) {
          const f = ocrJson.fields;
          const isInvoice = ocrJson.documentType === 'invoice';
          updates.vendor_name = (isInvoice ? f.vendor : f.merchant) || '';
          updates.invoice_number = (isInvoice ? f.invoiceNumber : f.receiptNumber) || '';
          updates.issue_date = (isInvoice ? f.issueDate : f.date) || item.issue_date;
          updates.due_date = (isInvoice ? f.dueDate : '') || '';
          updates.total_amount = String(isInvoice ? f.totalAmount : f.amount) || '';
          updates.payment_terms = (isInvoice ? f.paymentTerms : '') || '';
          updates.notes = f.notes || '';
          if (f.category) {
            const match = catSnapshot.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
            if (match) updates.category_id = match.id;
          }
          const vendorName = updates.vendor_name;
          if (vendorName) {
            const supplierMatch = supSnapshot.find((s) => s.name.toLowerCase() === vendorName.toLowerCase());
            if (supplierMatch) updates.supplier_id = supplierMatch.id;
          }
        }
        updateItem(item._id, updates);
      },
    });
  };

  const submitNewInvoice = async () => {
    if (config.role === 'accountant') {
      if (!newInv.firm_id || !newInv.vendor_name || !newInv.issue_date || !newInv.total_amount) {
        setNewInvError('Please fill in all required fields including Firm.');
        return;
      }
    } else {
      if (!newInv.vendor_name || !newInv.issue_date || !newInv.total_amount || !newInv.category_id) {
        setNewInvError('Please fill in all required fields.');
        return;
      }
    }
    setNewInvSubmitting(true);
    setNewInvError('');
    try {
      const fd = new FormData();
      if (config.role === 'accountant' && newInv.firm_id) fd.append('firm_id', newInv.firm_id);
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
      if (config.showGlFields) {
        if (newInvExpenseGlId) fd.append('gl_account_id', newInvExpenseGlId);
        if (newInvContraGlId) fd.append('contra_gl_account_id', newInvContraGlId);
      }

      const res = await fetch(config.apiInvoices, { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) { setNewInvError(j.error || 'Failed to create invoice'); return; }

      setShowNewInvoice(false);
      setDepositWarning('');
      setPvMatch(null);
      setNewInv({ firm_id: '', vendor_name: '', supplier_id: '', supplier_link_status: 'unmatched', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '' });
      setNewInvFile(null);
      setNewInvExpenseGlId('');
      setNewInvContraGlId('');
      refresh();
    } catch (e) { console.error(e); setNewInvError('Network error'); }
    finally { setNewInvSubmitting(false); }
  };

  const attachToPV = async () => {
    if (!pvMatch || !newInvFile) return;
    setPvAttaching(true);
    setNewInvError('');
    try {
      const fd = new FormData();
      fd.append('file', newInvFile);
      const res = await fetch(`/api/invoices/${pvMatch.id}/attach`, { method: 'PATCH', body: fd });
      const json = await res.json();
      if (!res.ok) { setNewInvError(json.error || 'Failed to attach document'); return; }
      if (json.data?.warnings?.length > 0) {
        setNewInvError(`Document attached with warnings: ${json.data.warnings.join('; ')}`);
      }
      setShowNewInvoice(false);
      setDepositWarning('');
      setPvMatch(null);
      setNewInv({ firm_id: '', vendor_name: '', supplier_id: '', supplier_link_status: 'unmatched', invoice_number: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', total_amount: '', category_id: '', payment_terms: '', notes: '' });
      setNewInvFile(null);
      setNewInvExpenseGlId('');
      setNewInvContraGlId('');
      refresh();
    } catch (e) { console.error(e); setNewInvError('Network error'); }
    finally { setPvAttaching(false); }
  };

  // Reset edit mode when preview changes
  useEffect(() => {
    setEditMode(false); setEditData(null); setCreatingSupplier(false);
    if (config.showLineItems) {
      if (lineSavedRef.current) {
        lineSavedRef.current = false;
        return;
      }
      if (previewInvoice && previewInvoice.lines.length > 0) {
        setShowLineItems(false);
        setLineItems(previewInvoice.lines.map(l => ({
          description: l.description,
          unit_price: l.unit_price,
          tax_amount: l.tax_amount,
          line_total: l.line_total,
          gl_account_id: l.gl_account_id || '',
        })));
      } else {
        setShowLineItems(false);
        setLineItems([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewInvoice, config.showLineItems]);

  // Fetch GL accounts + pre-fill suggestion (accountant only)
  // GL accounts, categories, and settings are cached per firm (they don't change mid-session)
  useEffect(() => {
    if (!config.showGlFields) return;
    if (!previewInvoice) {
      setGlAccounts([]);
      setSelectedGlAccountId('');
      setSelectedContraGlId('');
      setDefaultContraGlId('');
      return;
    }

    const firmId = previewInvoice.firm_id;
    const cached = glCacheRef.current[firmId];

    // Resolve GL suggestions using cached or fetched data
    const resolveGl = (
      glData: typeof glAccounts,
      catData: { id: string; gl_account_id?: string }[],
      firmDefaultContra: string,
      aliasJson: { data?: { default_gl_account_id?: string; default_contra_gl_account_id?: string } | null },
    ) => {
      setGlAccounts(glData);
      const aliasGl = aliasJson.data?.default_gl_account_id || '';
      const aliasContraGl = aliasJson.data?.default_contra_gl_account_id || '';

      // Expense GL: invoice -> supplier default -> alias match -> category -> empty
      if (previewInvoice.gl_account_id) {
        setSelectedGlAccountId(previewInvoice.gl_account_id);
      } else if (previewInvoice.supplier_default_gl_id) {
        setSelectedGlAccountId(previewInvoice.supplier_default_gl_id);
      } else if (aliasGl) {
        setSelectedGlAccountId(aliasGl);
      } else {
        const match = catData.find((c) => c.id === previewInvoice.category_id);
        setSelectedGlAccountId(match?.gl_account_id ?? '');
      }

      // Contra GL: invoice -> supplier default -> alias match -> name match -> firm default
      let resolvedContra = previewInvoice.contra_gl_account_id || previewInvoice.supplier_default_contra_gl_id || aliasContraGl;

      // If resolved contra is the firm's generic default, still try name matching for a supplier-specific sub-account
      if (!resolvedContra || resolvedContra === firmDefaultContra) {
        const vendorLower = previewInvoice.vendor_name_raw.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const vendorStripped = vendorLower.replace(/\s+/g, '');
        const vendorWords = vendorLower.split(/\s+/).filter(w => w.length > 2 && !['sdn', 'bhd', 'plt', 'sdn bhd'].includes(w));
        const liabilityGls = glData.filter((g) => g.account_type === 'Liability');
        let nameMatch = liabilityGls.find((g) => {
          const glStripped = g.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return glStripped.length > 2 && (vendorStripped.includes(glStripped) || glStripped.includes(vendorStripped));
        });
        if (!nameMatch && vendorWords.length >= 2) {
          nameMatch = liabilityGls.find((g) => {
            const glLower = g.name.toLowerCase();
            const hits = vendorWords.filter(w => glLower.includes(w));
            return hits.length >= 2;
          });
        }
        if (nameMatch) resolvedContra = nameMatch.id;
      }

      const contraId = resolvedContra || firmDefaultContra;
      setDefaultContraGlId(previewInvoice.supplier_default_contra_gl_id || aliasContraGl || firmDefaultContra);
      setSelectedContraGlId(contraId);
    };

    // Only alias lookup is per-invoice — GL/categories/settings are cached per firm
    const aliasFetch = fetch(`/api/suppliers/by-alias?alias=${encodeURIComponent(previewInvoice.vendor_name_raw.toLowerCase().trim())}&firmId=${firmId}`).then(r => r.json()).catch(() => ({ data: null }));

    if (cached) {
      // Firm data already cached — only fetch alias (per-invoice)
      setGlAccounts(cached.glAccounts); // instant
      aliasFetch.then((aliasJson) => {
        resolveGl(cached.glAccounts, cached.categories, cached.firmDefaultContra, aliasJson);
      });
    } else {
      // First invoice for this firm — fetch everything, then cache
      Promise.all([
        fetch(`/api/gl-accounts?firmId=${firmId}`).then(r => r.json()),
        fetch(`/api/categories?firmId=${firmId}`).then(r => r.json()),
        fetch(`/api/accounting-settings?firmId=${firmId}`).then(r => r.json()),
        aliasFetch,
      ])
        .then(([glJson, catJson, settingsJson, aliasJson]) => {
          const glData = glJson.data ?? [];
          const catData = catJson.data ?? [];
          const firmDefaultContra = settingsJson.data?.gl_defaults?.trade_payables?.id || '';
          glCacheRef.current[firmId] = { glAccounts: glData, categories: catData, firmDefaultContra };
          resolveGl(glData, catData, firmDefaultContra, aliasJson);
        })
        .catch(console.error);
    }
  }, [previewInvoice, config.showGlFields]);

  // Check firm setup status (blocks uploads if COA or fiscal year not configured)
  useEffect(() => {
    const firmId = config.firmId || (config.firms?.length === 1 ? config.firms[0].id : '');
    if (!firmId || config.role === 'admin') { setFirmSetupReady(true); return; }
    fetch(`/api/accountant/firms/${firmId}/setup-status`)
      .then((r) => r.json())
      .then((j) => {
        if (j.data) {
          const missing: string[] = [];
          if (!j.data.chartOfAccounts.complete) missing.push('Chart of Accounts');
          if (j.data.glDefaults && !j.data.glDefaults.complete) missing.push('GL Defaults');
          if (j.data.categories && !j.data.categories.complete) missing.push('Categories');
          if (!j.data.fiscalYear.complete) missing.push('Fiscal Year');
          if (missing.length > 0) {
            setFirmSetupReady(false);
            setFirmSetupMessage(`This firm needs ${missing.join(' and ')} before you can upload. Set up in Client Details.`);
          } else {
            setFirmSetupReady(true);
            setFirmSetupMessage('');
          }
        }
      })
      .catch(() => {});
  }, [config.firmId, config.firms, config.role]);

  // Fetch categories on mount (needed for OCR matching in drag-drop and batch upload)
  useEffect(() => {
    fetch(config.apiCategories).then((r) => r.json()).then((j) => setCategories(j.data ?? [])).catch(console.error);
  }, [config.apiCategories]);

  // Fetch suppliers
  useEffect(() => {
    fetch(config.apiSuppliers).then((r) => r.json()).then((j) => setSuppliers((j.data ?? []).map((s: SupplierOption) => ({
      id: s.id, name: s.name, firm_id: s.firm_id || '',
      default_gl_account_id: s.default_gl_account_id,
      default_contra_gl_account_id: s.default_contra_gl_account_id,
    })))).catch(console.error);
  }, [refreshKey, config.apiSuppliers]);

  const saveEdit = async () => {
    if (!previewInvoice || !editData) return;
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = { ...editData };
      if (config.showGlFields && selectedGlAccountId) {
        body.gl_account_id = selectedGlAccountId;
      }
      const res = await fetch(`${config.apiInvoices}/${previewInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        if (config.role === 'accountant') await res.json();
        setEditMode(false);
        setEditData(null);
        const newSupplier = editData.supplier_id ? suppliers.find(s => s.id === editData.supplier_id) : null;
        setPreviewInvoice({
          ...previewInvoice,
          ...editData,
          ...(newSupplier && { supplier_name: newSupplier.name, supplier_link_status: 'confirmed' as const }),
          ...(config.showGlFields && selectedGlAccountId && {
            gl_account_id: selectedGlAccountId,
            gl_account_label: selectedGlAccountId ? (glAccounts.find(a => a.id === selectedGlAccountId)?.account_code + ' — ' + glAccounts.find(a => a.id === selectedGlAccountId)?.name) : previewInvoice.gl_account_label,
          }),
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
      const body: Record<string, string> = { status: 'reviewed' };
      if (glAccountId) body.gl_account_id = glAccountId;
      const res = await fetch(`${config.apiInvoices}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
      const res = await fetch(`${config.apiInvoices}/${invoiceId}`, {
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
      const res = await fetch(config.apiDelete, {
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
      const body: Record<string, string> = { name: newSupplierName.trim() };
      if (config.role === 'accountant') body.firm_id = previewInvoice.firm_id;
      const res = await fetch(config.apiSuppliers, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
    approvalFilter, setApprovalFilter,
  } = useFilters({ initialStatus, initialDateRange: '' });
  const [paymentFilter, setPaymentFilter] = useState(initialPayment);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set(['PI', 'SI', 'PV', 'OR']));
  const toggleType = (t: string) => setActiveTypes(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Load invoices
  useEffect(() => {
    if (!config.firmsLoaded) return;
    const controller = new AbortController();
    setLoading(true);

    const { from, to } = getDateRange(dateRange, customFrom, customTo);
    const p = new URLSearchParams();
    if (config.firmId)   p.set('firmId',        config.firmId);
    if (from)            p.set('dateFrom',      from);
    if (to)              p.set('dateTo',        to);
    if (statusFilter)    p.set('status',        statusFilter);
    if (paymentFilter)   p.set('paymentStatus', paymentFilter);
    if (takeLimit)       p.set('take',          String(takeLimit));

    // Sales invoices params (subset — no status filter, sales invoices don't have review status)
    const sp = new URLSearchParams();
    if (config.firmId) sp.set('firmId', config.firmId);
    if (from)          sp.set('dateFrom', from);
    if (to)            sp.set('dateTo', to);
    if (paymentFilter) sp.set('paymentStatus', paymentFilter);
    if (takeLimit)     sp.set('take', String(takeLimit));

    Promise.all([
      fetch(`${config.apiInvoices}?${p}`, { signal: controller.signal }).then(r => r.json()),
      config.apiSalesInvoices
        ? fetch(`${config.apiSalesInvoices}?${sp}`, { signal: controller.signal }).then(r => r.json())
        : Promise.resolve({ data: [] }),
    ])
      .then(([purchaseJson, salesJson]) => {
        const purchaseRows: InvoiceRow[] = (purchaseJson.data ?? []).map((inv: InvoiceRow) => ({ ...inv, _type: 'purchase' as const }));

        // Normalize SalesInvoice rows into InvoiceRow shape
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const salesRows: InvoiceRow[] = (salesJson.data ?? []).map((si: any) => ({
          id: si.id,
          vendor_name_raw: si.buyer_name ?? '',
          invoice_number: si.invoice_number,
          issue_date: si.issue_date,
          due_date: si.due_date ?? null,
          payment_terms: null,
          subtotal: si.subtotal,
          tax_amount: si.tax_amount,
          total_amount: si.total_amount,
          amount_paid: si.amount_paid,
          category_name: si.category_name ?? '',
          category_id: si.category_id ?? '',
          status: 'reviewed' as const,
          payment_status: si.payment_status,
          supplier_id: si.supplier_id ?? null,
          supplier_name: si.buyer_name ?? null,
          supplier_link_status: 'confirmed' as const,
          uploader_name: '',
          firm_name: si.firm_name ?? '',
          firm_id: si.firm_id ?? '',
          confidence: 'HIGH',
          file_url: null,
          thumbnail_url: null,
          notes: si.notes ?? null,
          gl_account_id: si.gl_account_id ?? null,
          gl_account_label: null,
          contra_gl_account_id: null,
          contra_gl_account_label: null,
          supplier_default_gl_id: null,
          supplier_default_contra_gl_id: null,
          approval: si.approval,
          rejection_reason: null,
          lines: [],
          _type: 'sales' as const,
        }));

        const merged = [...purchaseRows, ...salesRows].sort((a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime());
        setInvoices(merged);
        setHasMore(purchaseJson.hasMore ?? false);
        setTotalCount((purchaseJson.totalCount ?? 0) + (salesJson.data?.length ?? 0));
        setLoading(false);
      })
      .catch((e) => { if ((e as Error).name !== 'AbortError') { console.error(e); setLoading(false); } });

    return () => controller.abort();
  }, [config.firmsLoaded, config.firmId, config.apiInvoices, config.apiSalesInvoices, dateRange, customFrom, customTo, statusFilter, paymentFilter, refreshKey, takeLimit]);

  // Auto-open preview from ?preview=id (global search navigation)
  const previewParam = pageSearchParams.get('preview');
  useEffect(() => {
    if (!previewParam) return;
    const match = invoices.find((inv) => inv.id === previewParam);
    if (match) {
      setPreviewInvoice(match);
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }
    if (!loading) {
      fetch(`/api/search/preview?type=invoice&id=${previewParam}`)
        .then((r) => r.json())
        .then((j) => { if (j.data) setPreviewInvoice(j.data); })
        .finally(() => window.history.replaceState(null, '', window.location.pathname));
    }
  }, [previewParam, loading, invoices]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const approvalFiltered = config.showApproval && approvalFilter
    ? invoices.filter((inv) => inv.approval === approvalFilter)
    : invoices;
  const allTypesActive = activeTypes.size === 4;
  const filteredInvoices = allTypesActive
    ? approvalFiltered
    : approvalFiltered.filter((inv) => {
        const badge = getInvoiceTypeBadge(inv);
        return badge ? activeTypes.has(badge.label) : true;
      });
  const { sorted: sortedInvoices, sortField, sortDir, toggleSort, sortIndicator } = useTableSort(filteredInvoices, 'issue_date', 'desc');
  useEffect(() => { setPage(0); }, [sortField, sortDir]);
  const pagedInvoices = sortedInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sortedInvoices.length / PAGE_SIZE);

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
            <div className="flex items-center gap-3">
              {!batchScanning && !batchSubmitting && <SearchButton />}
              {config.role === 'admin' && !batchScanning && !batchSubmitting && (
                <Link href="/admin/suppliers" className="text-body-sm font-medium hover:underline transition-colors" style={{ color: 'var(--primary)' }}>
                  Aging Report &rarr;
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 pt-8 px-8 pb-0 pl-14 animate-in paper-texture ledger-binding">

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
            <input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setDateRange('custom'); }} className="input-field" />
            <span className="text-[#8E9196] text-sm">–</span>
            <input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setDateRange('custom'); }} className="input-field" />

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field">
              <option value="">All Status</option>
              <option value="pending_review">Pending Review</option>
              <option value="reviewed">Reviewed</option>
            </select>

            {config.showApproval && (
              <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)} className="input-field">
                <option value="">All Approval</option>
                <option value="pending_approval">Pending</option>
                <option value="approved">Approved</option>
                <option value="not_approved">Not Approved</option>
              </select>
            )}

            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="input-field">
              <option value="">All Payment</option>
              <option value="unpaid">Unpaid</option>
              <option value="partially_paid">Partial</option>
              <option value="paid">Paid</option>
            </select>

            {/* Type toggle checkboxes — physical keycap style */}
            <div className="flex items-center gap-1.5">
              {(['PI', 'SI', 'PV', 'OR'] as const).map((t) => {
                const b = TYPE_BADGE[t];
                const on = activeTypes.has(t);
                return (
                  <button key={t} type="button" onClick={() => toggleType(t)}
                    className={`type-toggle-btn px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all duration-100 btn-texture ${on ? 'type-toggle-on' : 'type-toggle-off'}`}
                    style={{
                      '--tt-bg': on ? b.bg : undefined,
                      '--tt-color': on ? b.color : undefined,
                    } as React.CSSProperties}
                  >
                    {t}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto">
              <button
                onClick={() => {
                  setShowNewInvoice(true);
                  if (config.firms && config.firms.length === 1) setNewInv(prev => ({ ...prev, firm_id: config.firms![0].id }));
                }}
                disabled={batchScanning || batchSubmitting || !firmSetupReady}
                className="btn-thick-navy px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                + Submit New Invoice
              </button>
            </div>
          </div>

          {/* Firm setup warning */}
          {!firmSetupReady && (
            <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-sm text-amber-800 flex-1">{firmSetupMessage}</p>
              <a href={`/accountant/clients/${config.firmId || (config.firms?.length === 1 ? config.firms[0].id : '')}`} className="btn-thick-white text-xs px-3 py-1.5 font-medium flex-shrink-0">
                Go to Setup
              </a>
            </div>
          )}

          {/* Load More */}
          <LoadMoreBanner hasMore={hasMore} totalCount={totalCount} loadedCount={invoices.length} loading={loading} onLoadAll={() => { setTakeLimit(totalCount); setRefreshKey((k) => k + 1); }} />

          {/* Batch action bar (accountant only) */}
          {config.showApproval && selectedRows.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[var(--primary)]/5 flex-shrink-0">
              <span className="text-body-sm font-medium text-[var(--text-primary)]">{selectedRows.length} selected</span>
              <button
                onClick={() => {
                  const missingGl = selectedRows.filter(r => !r.gl_account_id && !r.supplier_default_gl_id);
                  const missingContra = selectedRows.filter(r => !r.contra_gl_account_id && !r.supplier_default_contra_gl_id);
                  const warnings: string[] = [];
                  if (missingGl.length > 0) warnings.push(`${missingGl.length} invoice(s) have no Expense GL — will use firm default if available.`);
                  if (missingContra.length > 0) warnings.push(`${missingContra.length} invoice(s) have no Contra GL — will use firm default Trade Payables.`);
                  if (warnings.length > 0) {
                    if (!confirm(`Batch Approve — GL Defaults\n\n${warnings.join('\n')}\n\nProceed with batch approval?`)) return;
                  }
                  batchAction(selectedRows.map((r) => r.id), 'approve');
                }}
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

          {/* Invoice Table */}
          <div ref={tableScrollRef} className="flex-1 min-h-0 overflow-auto bg-white">
            {loading ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-12">Loading...</div>
            ) : invoices.length === 0 ? (
              <div className="text-center text-sm text-[var(--text-secondary)] py-12">No invoices found for the selected filters.</div>
            ) : isMobile ? (
              <>
                <div>
                  {pagedInvoices.map((inv) => {
                    const isSelected = selectedRows.some((r) => r.id === inv.id);
                    return (
                      <MobileInvoiceCard
                        key={inv.id}
                        invoice={inv}
                        onClick={() => setPreviewInvoice(inv)}
                        selected={isSelected}
                        onSelect={config.showApproval ? () => toggleSelectOne(inv) : undefined}
                      />
                    );
                  })}
                  {/* Mobile sticky total */}
                  <div className="sticky bottom-0 px-4 py-2.5 bg-[var(--surface-header)] border-t-2 border-[var(--surface-highest)] flex items-center justify-between">
                    <span className="text-xs font-label font-bold uppercase tracking-widest text-[var(--text-secondary)]">
                      {filteredInvoices.length} item{filteredInvoices.length !== 1 ? 's' : ''}
                    </span>
                    <span className="font-bold text-[var(--text-primary)] tabular-nums text-sm">
                      {formatRM(filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0).toFixed(2))}
                    </span>
                  </div>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-[#E0E3E5]">
                    <p className="text-body-sm text-[var(--text-secondary)]">
                      {page * PAGE_SIZE + 1}--{Math.min((page + 1) * PAGE_SIZE, sortedInvoices.length)} of {sortedInvoices.length}
                    </p>
                    <div className="flex gap-1.5">
                      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Prev</button>
                      <button onClick={() => setPage(page + 1)} disabled={page + 1 >= totalPages} className="btn-thick-white px-3 py-1.5 text-body-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed">Next</button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="text-left">
                      {config.showApproval && (
                        <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] w-10"><input type="checkbox" className="ds-table-checkbox" checked={pagedInvoices.length > 0 && pagedInvoices.every((inv) => selectedRows.some((r) => r.id === inv.id))} onChange={toggleSelectAll} /></th>
                      )}
                      <th className={`${config.showApproval ? 'px-3' : 'px-5'} py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none`} onClick={() => toggleSort('issue_date')}>Issue Date{sortIndicator('issue_date')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('vendor_name_raw')}>Vendor{sortIndicator('vendor_name_raw')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('invoice_number')}>Invoice #{sortIndicator('invoice_number')}</th>
                      {config.showFirmColumn && !config.firmId && <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('firm_name')}>Firm{sortIndicator('firm_name')}</th>}
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('due_date')}>Due Date{sortIndicator('due_date')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] text-right cursor-pointer select-none" onClick={() => toggleSort('total_amount')}>Amount (RM){sortIndicator('total_amount')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
                      {config.showApproval && <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('approval')}>Approval{sortIndicator('approval')}</th>}
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('payment_status')}>Payment{sortIndicator('payment_status')}</th>
                      <th className="px-3 py-2.5 text-xs font-label uppercase tracking-widest text-[var(--text-secondary)] cursor-pointer select-none" onClick={() => toggleSort('supplier_link_status')}>Supplier{sortIndicator('supplier_link_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedInvoices.map((inv, idx) => {
                      const isSelected = selectedRows.some((r) => r.id === inv.id);
                      const approvalCfg = config.showApproval ? APPROVAL_CFG[inv.approval] : null;
                      return (
                      <tr
                        key={inv.id}
                        onClick={() => setPreviewInvoice(inv)}
                        className={`text-body-sm cursor-pointer hover:bg-[var(--surface-header)] transition-colors ${isSelected ? 'bg-blue-50/40' : idx % 2 === 1 ? 'bg-[var(--surface-low)]' : 'bg-white'}`}
                      >
                        {config.showApproval && (
                          <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="ds-table-checkbox" checked={isSelected} onChange={() => toggleSelectOne(inv)} />
                          </td>
                        )}
                        <td data-col="Issue Date" className={`${config.showApproval ? 'px-3' : 'px-5'} py-3 text-[var(--text-secondary)] tabular-nums`}>{formatDateDot(inv.issue_date)}</td>
                        <td data-col="Vendor" className="px-3 py-3 text-[var(--text-primary)] font-medium">
                          {(() => { const badge = getInvoiceTypeBadge(inv); return badge ? <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 mr-1.5 align-middle" style={{ color: badge.color, background: badge.bg }}>{badge.label}</span> : null; })()}
                          {inv.vendor_name_raw}
                        </td>
                        <td data-col="Invoice #" className="px-3 py-3 text-[var(--text-secondary)]">
                          {inv.invoice_number ?? '-'}
                          {inv.invoice_number?.startsWith('PV-') && !inv.file_url && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                              No doc
                            </span>
                          )}
                        </td>
                        {config.showFirmColumn && !config.firmId && <td data-col="Firm" className="px-3 py-3 text-[var(--text-secondary)]">{inv.firm_name}</td>}
                        <td data-col="Due Date" className="px-3 py-3 text-[var(--text-secondary)] tabular-nums">{inv.due_date ? formatDateDot(inv.due_date) : '-'}</td>
                        <td data-col="Amount" className="px-3 py-3 text-[var(--text-primary)] font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                        <td data-col="Status" className="px-3 py-3"><StatusCell value={inv.status} /></td>
                        {config.showApproval && <td data-col="Approval" className="px-3 py-3">{approvalCfg && <span className={approvalCfg.cls} data-tooltip={approvalCfg.tooltip}>{approvalCfg.label}</span>}</td>}
                        <td data-col="Payment" className="px-3 py-3"><PaymentCell value={inv.payment_status} /></td>
                        <td data-col="Supplier" className="px-3 py-3"><LinkCell value={inv.supplier_link_status} /></td>
                      </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="border-t-2 border-[var(--surface-highest)]">
                      {config.showApproval && <td className="bg-[var(--surface-header)]" />}
                      <td className={`${config.showApproval ? 'px-3' : 'px-5'} py-3 text-xs font-label font-bold uppercase tracking-widest text-[var(--text-secondary)] bg-[var(--surface-header)]`}>
                        {filteredInvoices.length} item{filteredInvoices.length !== 1 ? 's' : ''}
                      </td>
                      <td className="bg-[var(--surface-header)]" />
                      <td className="bg-[var(--surface-header)]" />
                      {config.showFirmColumn && !config.firmId && <td className="bg-[var(--surface-header)]" />}
                      <td className="bg-[var(--surface-header)]" />
                      <td className="px-3 py-3 text-right font-bold text-[var(--text-primary)] tabular-nums text-sm bg-[var(--surface-header)]">
                        {formatRM(filteredInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0).toFixed(2))}
                      </td>
                      <td className="bg-[var(--surface-header)]" />
                      {config.showApproval && <td className="bg-[var(--surface-header)]" />}
                      <td className="bg-[var(--surface-header)]" />
                      <td className="bg-[var(--surface-header)]" />
                    </tr>
                  </tfoot>
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
      </div>

      {/* SUBMIT NEW INVOICE MODAL */}
      {showNewInvoice && (
        <InvoiceCreateModal
          config={config}
          newInv={newInv}
          setNewInv={setNewInv}
          newInvFile={newInvFile}
          setNewInvFile={setNewInvFile}
          ocrScanning={ocrScanning}
          newInvSubmitting={newInvSubmitting}
          newInvError={newInvError}
          depositWarning={depositWarning}
          vendorDropdownOpen={vendorDropdownOpen}
          setVendorDropdownOpen={setVendorDropdownOpen}
          vendorInputRef={vendorInputRef}
          suppliers={suppliers}
          categories={categories}
          newInvGlAccounts={newInvGlAccounts}
          setNewInvGlAccounts={setNewInvGlAccounts}
          newInvExpenseGlId={newInvExpenseGlId}
          setNewInvExpenseGlId={setNewInvExpenseGlId}
          newInvContraGlId={newInvContraGlId}
          setNewInvContraGlId={setNewInvContraGlId}
          handleInvFileChange={handleInvFileChange}
          submitNewInvoice={submitNewInvoice}
          onClose={() => { setShowNewInvoice(false); setPvMatch(null); }}
          pvMatch={pvMatch}
          pvAttaching={pvAttaching}
          attachToPV={attachToPV}
          dismissPvMatch={() => setPvMatch(null)}
        />
      )}

      {/* BATCH REVIEW MODAL */}
      {showBatchReview && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => { if (batchScanning) { setShowBatchReview(false); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => { if (batchScanning) { setShowBatchReview(false); } }}>
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
              <button onClick={() => { if (batchScanning) { cancelBatchScan(); } else if (!batchSubmitting && confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems(() => []); setBatchPreviewId(null); } }} className="btn-thick-red w-7 h-7 !p-0" title="Close"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg></button>
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
                        <input value={item.vendor_name} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, vendor_name: v } : it)); }} className={`input-recessed w-full text-xs${item.vendor_name ? ' auto-suggested' : ''}`} />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Invoice #</label>
                        <input value={item.invoice_number} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, invoice_number: v } : it)); }} className={`input-recessed w-full text-xs${item.invoice_number ? ' auto-suggested' : ''}`} />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Date</label>
                        <input type="date" value={item.issue_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, issue_date: v } : it)); }} className={`input-recessed w-full text-xs${item.issue_date ? ' auto-suggested' : ''}`} />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Amount (RM)</label>
                        <input value={item.total_amount} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, total_amount: v } : it)); }} className={`input-recessed w-full text-xs tabular-nums${item.total_amount ? ' auto-suggested' : ''}`} />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Category</label>
                        <select value={item.category_id} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, category_id: v } : it)); }} className={`input-recessed w-full text-xs${item.category_id ? ' auto-suggested' : ''}`}>
                          <option value="">Select...</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Supplier</label>
                        <select value={item.supplier_id} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, supplier_id: v } : it)); }} className={`input-recessed w-full text-xs${item.supplier_id ? ' auto-suggested' : ''}`}>
                          <option value="">Auto-match</option>
                          {(config.role === 'accountant' ? suppliers.filter(s => s.firm_id === (config.firmId || newInv.firm_id || getTargetFirmId())) : suppliers).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Due Date</label>
                        <input type="date" value={item.due_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, due_date: v } : it)); }} className={`input-recessed w-full text-xs${item.due_date ? ' auto-suggested' : ''}`} />
                      </div>
                      <div>
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Terms</label>
                        <input value={item.payment_terms} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, payment_terms: v } : it)); }} className={`input-recessed w-full text-xs${item.payment_terms ? ' auto-suggested' : ''}`} />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] font-label font-bold text-[var(--text-secondary)] uppercase tracking-widest">Notes</label>
                        <input value={item.notes} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, notes: v } : it)); }} className={`input-recessed w-full text-xs${item.notes ? ' auto-suggested' : ''}`} placeholder="Phone number, account details, etc." />
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={batchPreviewId} src={batchPreviewUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                  )}
                </div>
              </div>
            )}
            </div>

            <div className="px-5 py-3 bg-[var(--surface-low)] flex items-center gap-2 flex-shrink-0 border-t border-[#E0E3E5]">
              <span className="text-xs text-[var(--text-secondary)] mr-auto">{batchItems.filter(i => i.selected).length} of {batchItems.length} selected</span>
              <button onClick={() => { if (batchScanning) { cancelBatchScan(); } else if (confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems(() => []); setBatchPreviewId(null); } }} disabled={batchSubmitting}
                className="btn-thick-white px-6 py-2 text-sm font-semibold disabled:opacity-40">Cancel</button>
              <button onClick={submitBatch} disabled={batchScanning || batchSubmitting || batchItems.filter(i => i.selected).length === 0 || batchItems.some(i => i.selected && !i.ocrDone)}
                className="btn-thick-navy px-6 py-2 text-sm font-semibold disabled:opacity-40">
                {batchSubmitting ? 'Submitting...' : `Submit Selected (${batchItems.filter(i => i.selected).length})`}
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* BATCH WARNING MODAL */}
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
                <span className="font-bold text-green-700">{batchWarning.ok}</span> invoice{batchWarning.ok !== 1 ? 's' : ''} submitted
                {batchWarning.fail > 0 && <>, <span className="font-bold text-[var(--reject-red)]">{batchWarning.fail}</span> failed</>}
              </p>
              {batchWarning.dupes.length > 0 && (
                <div className="bg-red-50 border border-red-200 p-3 space-y-1 max-h-[120px] overflow-y-auto">
                  <p className="text-xs font-bold text-[var(--reject-red)] uppercase tracking-widest">Duplicates Skipped</p>
                  {batchWarning.dupes.map((d, i) => <p key={i} className="text-xs text-red-700">{d}</p>)}
                </div>
              )}
              <div className="bg-amber-50 border border-amber-300 p-3">
                <p className="text-sm text-amber-800 font-medium">Please review the uploaded items to ensure all details are correct before approving.</p>
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

      {/* INVOICE PREVIEW PANEL */}
      {previewInvoice && (
        <InvoicePreviewPanel
          config={config}
          previewInvoice={previewInvoice}
          setPreviewInvoice={setPreviewInvoice}
          editMode={editMode}
          setEditMode={setEditMode}
          editData={editData}
          setEditData={setEditData}
          editSaving={editSaving}
          saveEdit={saveEdit}
          selectedGlAccountId={selectedGlAccountId}
          setSelectedGlAccountId={setSelectedGlAccountId}
          selectedContraGlId={selectedContraGlId}
          setSelectedContraGlId={setSelectedContraGlId}
          glAccounts={glAccounts}
          setGlAccounts={setGlAccounts}
          categories={categories}
          suppliers={suppliers}
          setSuppliers={setSuppliers}
          creatingSupplier={creatingSupplier}
          setCreatingSupplier={setCreatingSupplier}
          newSupplierName={newSupplierName}
          setNewSupplierName={setNewSupplierName}
          confirmSupplier={confirmSupplier}
          createAndAssignSupplier={createAndAssignSupplier}
          showLineItems={showLineItems}
          setShowLineItems={setShowLineItems}
          lineItems={lineItems}
          lineSaving={lineSaving}
          lineItemsTotal={lineItemsTotal}
          addLineItem={addLineItem}
          removeLineItem={removeLineItem}
          updateLineItem={updateLineItem}
          saveLineItems={saveLineItems}
          removeAllLineItems={removeAllLineItems}
          markAsReviewed={markAsReviewed}
          batchAction={batchAction}
          setRejectModal={setRejectModal}
          deleteInvoice={deleteInvoice}
          refresh={refresh}
          onPrev={(() => {
            const idx = sortedInvoices.findIndex(i => i.id === previewInvoice.id);
            return idx > 0 ? () => setPreviewInvoice(sortedInvoices[idx - 1]) : undefined;
          })()}
          onNext={(() => {
            const idx = sortedInvoices.findIndex(i => i.id === previewInvoice.id);
            return idx >= 0 && idx < sortedInvoices.length - 1 ? () => setPreviewInvoice(sortedInvoices[idx + 1]) : undefined;
          })()}
        />
      )}

      {/* REJECT MODAL (accountant only) */}
      <InvoiceRejectModal
        open={config.showApproval && rejectModal.open}
        invoiceCount={rejectModal.invoiceIds.length}
        reason={rejectModal.reason}
        onReasonChange={(reason) => setRejectModal(prev => ({ ...prev, reason }))}
        onConfirm={confirmReject}
        onClose={() => setRejectModal({ open: false, invoiceIds: [], reason: '' })}
      />


    </>
  );
}
