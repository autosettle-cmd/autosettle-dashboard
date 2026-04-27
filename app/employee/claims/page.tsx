'use client';

import { useState, useEffect, useRef } from 'react';
import { useBatchProcess } from '@/contexts/BatchProcessContext';
import { usePageTitle } from '@/lib/use-page-title';
import SearchButton from '@/components/SearchButton';
import { STATUS_CFG, APPROVAL_CFG, PAYMENT_CFG } from '@/lib/badge-config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_date: string;
  merchant: string;
  description: string | null;
  category_name: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  payment_status: 'unpaid' | 'paid';
  rejection_reason: string | null;
  receipt_number: string | null;
  file_url: string | null;
  thumbnail_url: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  type?: 'claim' | 'receipt' | 'mileage';
  from_location?: string | null;
  to_location?: string | null;
  distance_km?: string | null;
  trip_purpose?: string | null;
}

interface Category {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-label font-medium text-[#444650] uppercase tracking-widest">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCFullYear(),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCDate().toString().padStart(2, '0'),
  ].join('.');
}

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function todayStr() {
  const d = new Date();
  return [d.getFullYear(), (d.getMonth() + 1).toString().padStart(2, '0'), d.getDate().toString().padStart(2, '0')].join('-');
}

function formatDisplayDate() {
  return new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeClaimsPage() {
  usePageTitle('My Claims');
  // Data
  const [claims, setClaims]       = useState<ClaimRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Preview + Edit
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{ claim_date: string; merchant: string; amount: string; category_id: string; receipt_number: string; description: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  const saveEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/employee/claims/${previewClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) { setEditMode(false); setEditData(null); setPreviewClaim(null); setRefreshKey((k) => k + 1); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  // Modal
  const [showModal, setShowModal]           = useState(false);
  const [categories, setCategories]         = useState<Category[]>([]);
  const [claimType, setClaimType]           = useState<'receipt' | 'mileage'>('receipt');
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
  const [dragOver, setDragOver] = useState(false);

  // Batch review (multi-receipt in one image)
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
  // Batch process context (submit loop + overlay live here, survive navigation)
  const batch = useBatchProcess();
  const batchItems = batch.items as BatchClaimItem[];
  const setBatchItems = batch.setItems as (updater: (prev: BatchClaimItem[]) => BatchClaimItem[]) => void;
  const batchSubmitting = batch.job.phase === 'submitting';
  const batchSubmitProgress = batchSubmitting ? { current: batch.job.current, total: batch.job.total } : { current: 0, total: 0 };

  const [showBatchReview, setShowBatchReview] = useState(false);
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

  // When submit completes via context, convert results to batchWarning and refresh
  useEffect(() => {
    if (batch.submitResults && batch.job.phase === 'submit_done') {
      const ok = batch.submitResults.filter(r => r.ok).length;
      const fail = batch.submitResults.filter(r => !r.ok).length;
      const errors = batch.submitResults.filter(r => !r.ok).map(r => `${r.name}: ${r.msg}`);
      setBatchWarning({ ok, fail, errors });
      batch.clear();
      refresh();
    }
  }, [batch.submitResults, batch.job.phase]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Mileage-specific fields
  const [mileageFrom, setMileageFrom]       = useState('');
  const [mileageTo, setMileageTo]           = useState('');
  const [mileageDistance, setMileageDistance] = useState('');
  const [mileagePurpose, setMileagePurpose] = useState('');
  const mileageRate = 0.55;

  // Cleanup blob URL on unmount
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

  // Load claims
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch('/api/employee/claims')
      .then((r) => r.json())
      .then((j) => { if (!cancelled) { setClaims(j.data ?? []); setLoading(false); } })
      .catch((e) => { console.error(e); if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // Load categories (once)
  useEffect(() => {
    fetch('/api/employee/categories')
      .then((r) => r.json())
      .then((j) => { if (j.data) setCategories(j.data); })
      .catch(console.error);
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const refresh = () => setRefreshKey((k) => k + 1);

  const openModal = () => {
    setClaimType('receipt');
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory(categories.length === 1 ? categories[0].id : '');
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
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);

    if (!file) return;

    // Run OCR extraction
    setOcrScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categories', JSON.stringify(categories.map((c) => c.name)));
        fd.append('context', 'claim');

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();

      if (res.ok && json.multipleReceipts && json.receipts?.length > 1) {
        setShowModal(false);
        setOcrScanning(false);
        const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }, ridx: number) => {
          let catId = '';
          if (r.category) {
            const match = categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
            if (match) catId = match.id;
          }
          return {
            _id: `${Date.now()}-${ridx}`,
            file: file!,
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
        setBatchItems(() => items);
        setShowBatchReview(true);
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
          const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
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
    if (claimType === 'mileage') {
      if (!modalDate || !mileageFrom.trim() || !mileageTo.trim() || !mileageDistance || !mileagePurpose.trim()) {
        setModalError('Date, from, to, distance, and purpose are required.');
        return;
      }
    } else {
      if (!modalDate || !modalMerchant.trim() || !modalAmount || !modalCategory || !selectedFile) {
        setModalError('Date, merchant, amount, category, and receipt photo are required.');
        return;
      }
    }

    setModalSaving(true);
    setModalError('');

    try {
      const fd = new FormData();
      fd.append('claim_date', modalDate);

      if (claimType === 'mileage') {
        fd.append('type', 'mileage');
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

      const res = await fetch('/api/employee/claims', {
        method: 'POST',
        body: fd,
      });

      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to submit claim');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
      setSuccessMsg(claimType === 'mileage' ? 'Mileage claim submitted!' : 'Claim submitted successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  const submitBatchClaims = () => {
    const valid = batchItems.filter((item) => item.selected && item.merchant && item.amount && item.category_id);
    if (valid.length === 0) return;

    setShowBatchReview(false);
    setBatchPreviewId(null);

    batch.startSubmit({
      label: 'Uploading claims...',
      items: valid,
      worker: async (item: BatchClaimItem) => {
        const fd = new FormData();
        fd.append('claim_date', item.claim_date);
        fd.append('merchant', item.merchant.trim());
        fd.append('amount', item.amount);
        fd.append('category_id', item.category_id);
        if (item.receipt_number.trim()) fd.append('receipt_number', item.receipt_number.trim());
        if (item.description.trim()) fd.append('description', item.description.trim());
        fd.append('file', item.file);

        const res = await fetch('/api/employee/claims', { method: 'POST', body: fd });
        if (res.ok) {
          return { name: item.file.name, ok: true, msg: 'Uploaded' };
        } else {
          const json = await res.json().catch(() => ({ error: 'Failed' }));
          return { name: item.file.name, ok: false, msg: json.error || 'Failed' };
        }
      },
    });
  };

  // ─── Drag & drop on page ────────────────────────────────────────────────────

  const accepted = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif'];

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return accepted.includes(ext) || f.type.startsWith('image/') || f.type === 'application/pdf';
    });
    if (droppedFiles.length === 0) return;

    const file = droppedFiles[0];
    setClaimType('receipt');
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory(categories.length === 1 ? categories[0].id : '');
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
      fd.append('categories', JSON.stringify(categories.map((c) => c.name)));
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
            const match = categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
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
        setBatchItems(() => items);
        setShowBatchReview(true);
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
          const match = categories.find((c) => c.name.toLowerCase() === f.category.toLowerCase());
          if (match) setModalCategory(match.id);
        }
      }
    } catch (err) {
      console.error('OCR extraction failed:', err);
    } finally {
      setOcrScanning(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className="flex-1 flex flex-col overflow-hidden relative ledger-binding"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragOver(false); }}
        onDrop={handleDrop}
      >

        {/* ── Top Header ── */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 pl-14 bg-white border-b border-[#E0E3E5]">
          <div>
            <h1 className="text-xl font-bold tracking-tighter text-[#0D1B2A]">My Claims</h1>
            <p className="text-[10px] font-label text-[#444650] uppercase tracking-widest">{formatDisplayDate()}</p>
          </div>
          <SearchButton />
        </header>

        {/* ── Drag overlay ── */}
        {dragOver && (
          <div className="absolute inset-0 bg-[#234B6E]/10 border-2 border-dashed border-[#234B6E] z-30 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <span className="text-[#0D1B2A] font-bold text-sm uppercase tracking-wider">Drop receipt to submit claim</span>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col gap-6 p-8 pl-14 paper-texture animate-in">

          {/* ── Success toast ── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-[#D6E0F1] p-3 inset-shadow">
              <p className="text-sm font-medium text-[#0D1B2A]">{successMsg}</p>
            </div>
          )}

          {/* ── Top bar ── */}
          <div className="flex items-center justify-between flex-shrink-0">
            <div>
              <h2 className="text-4xl font-extrabold text-[#0D1B2A] tracking-tight">Expense Claims</h2>
              <p className="text-[10px] font-label text-[#444650] uppercase tracking-widest mt-1">{claims.length} total entries</p>
            </div>
            <button
              onClick={openModal}
              className="btn-thick-navy px-5 py-3 flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Claim
            </button>
          </div>

          {/* ── Table ── */}
          <div className="bg-white overflow-hidden flex-1 min-h-0 flex flex-col border border-[#C5C6D2]/30">
            {loading ? (
              <div className="px-6 py-12 text-center text-sm text-[#444650]">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-[#444650]">No claims submitted yet.</div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#E6E8EA] border-b border-[#C5C6D2]/30">
                      <th className="px-6 py-4 text-xs font-label uppercase tracking-widest text-[#444650]">Date</th>
                      <th className="px-6 py-4 text-xs font-label uppercase tracking-widest text-[#444650]">Description</th>
                      <th className="px-6 py-4 text-xs font-label uppercase tracking-widest text-[#444650]">Category</th>
                      <th className="px-6 py-4 text-xs font-label uppercase tracking-widest text-[#444650] text-right">Amount</th>
                      <th className="px-6 py-4 text-xs font-label uppercase tracking-widest text-[#444650] text-center">Status</th>
                      <th className="px-6 py-4 text-xs font-label uppercase tracking-widest text-[#444650] text-center">Reimbursed</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {claims.map((c, i) => {
                      const sCfg = STATUS_CFG[c.status];
                      const _aCfg = APPROVAL_CFG[c.approval];
                      return (
                        <tr
                          key={c.id}
                          onClick={() => setPreviewClaim(c)}
                          className={`group hover:bg-[#E6E8EA] transition-colors cursor-pointer align-middle border-b border-[#C5C6D2]/10 ${i % 2 === 0 ? 'bg-white' : 'bg-[#F2F4F6]'}`}
                        >
                          <td data-col="Date" className="px-6 py-5 tabular-nums text-[#444650]">{formatDate(c.claim_date)}</td>
                          <td data-col="Description" className="px-6 py-5 font-medium text-[#0D1B2A]">
                            {c.type === 'mileage' ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-flex items-center justify-center w-5 h-5 bg-[#D6E0F1] text-[#0D1B2A] text-[10px] font-bold flex-shrink-0">M</span>
                                {c.from_location} &rarr; {c.to_location}
                              </span>
                            ) : c.merchant}
                          </td>
                          <td data-col="Category" className="px-6 py-5 text-[#444650]">{c.category_name}</td>
                          <td data-col="Amount" className="px-6 py-5 font-medium text-right tabular-nums text-[#0D1B2A]">{formatRM(c.amount)}</td>
                          <td data-col="Status" className="px-6 py-5 text-center">
                            {sCfg && <span className={sCfg.cls} data-tooltip={sCfg.tooltip}>{sCfg.label}</span>}
                          </td>
                          <td data-col="Reimbursed" className="px-6 py-5 text-center">
                            <span className={c.payment_status === 'paid' ? 'badge-green' : 'badge-amber'}>
                              {c.payment_status === 'paid' ? 'Reimbursed' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Table footer */}
            {!loading && claims.length > 0 && (
              <div className="px-6 py-4 bg-[#E6E8EA] border-t border-[#C5C6D2]/30 flex justify-between items-center">
                <span className="text-[10px] font-label text-[#444650] uppercase tracking-widest">
                  Showing {claims.length} entries
                </span>
              </div>
            )}
          </div>

        </main>
      </div>

      {/* ═══ SUBMIT CLAIM MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className={`bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full ${selectedFile ? 'max-w-[1000px]' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
            {/* Modal header */}
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[#234B6E]">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider">Submit New Claim</h3>
              <button onClick={() => setShowModal(false)} className="text-white/50 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className={`flex-1 flex min-h-0 ${selectedFile ? '' : 'flex-col'}`}>
            {/* Left: Form */}
            <div className={`${selectedFile ? 'w-1/2 border-r border-[#E0E3E5]' : 'w-full'} flex flex-col min-h-0`}>
            <div className="flex-1 overflow-y-auto p-6">
              <p className="text-sm text-[#444650] mb-4">Fill in the details below to submit a new expense claim.</p>

              {/* ── Type Toggle ── */}
              <div className="flex overflow-hidden mb-4 gap-2">
                <button
                  onClick={() => setClaimType('receipt')}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${claimType === 'receipt' ? 'btn-thick-navy' : 'btn-thick-white'}`}
                >
                  Receipt Claim
                </button>
                <button
                  onClick={() => setClaimType('mileage')}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider transition-all ${claimType === 'mileage' ? 'btn-thick-navy' : 'btn-thick-white'}`}
                >
                  Mileage Claim
                </button>
              </div>

              {modalError && (
                <div className="mb-4 bg-[#FFDAD6] p-3 inset-shadow">
                  <p className="text-sm font-medium text-[#93000A]">{modalError}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Claim Date *</label>
                  <input
                    type="date"
                    value={modalDate}
                    onChange={(e) => setModalDate(e.target.value)}
                    className="input-recessed w-full"
                    required
                  />
                </div>

                {claimType === 'mileage' ? (
                  <>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">From *</label>
                      <input
                        type="text"
                        value={mileageFrom}
                        onChange={(e) => setMileageFrom(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="e.g. PJ Office"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">To *</label>
                      <input
                        type="text"
                        value={mileageTo}
                        onChange={(e) => setMileageTo(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="e.g. Shah Alam client office"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Distance (km) *</label>
                      <input
                        type="number"
                        value={mileageDistance}
                        onChange={(e) => setMileageDistance(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="e.g. 25"
                        step="0.1"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Purpose *</label>
                      <input
                        type="text"
                        value={mileagePurpose}
                        onChange={(e) => setMileagePurpose(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="e.g. Client meeting with ABC Sdn Bhd"
                      />
                    </div>
                    {mileageDistance && parseFloat(mileageDistance) > 0 && (
                      <div className="bg-[#D6E0F1] p-3 inset-shadow">
                        <p className="text-sm font-bold text-[#0D1B2A] tabular-nums">
                          Amount: RM {(parseFloat(mileageDistance) * mileageRate).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] font-label text-[#444650] uppercase tracking-widest mt-0.5">
                          {mileageDistance} km x RM {mileageRate.toFixed(2)}/km
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Merchant Name *</label>
                      <input
                        type="text"
                        value={modalMerchant}
                        onChange={(e) => setModalMerchant(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="e.g. Petronas, Grab, etc."
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Amount (RM) *</label>
                      <input
                        type="number"
                        value={modalAmount}
                        onChange={(e) => setModalAmount(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Category *</label>
                      <select
                        value={modalCategory}
                        onChange={(e) => setModalCategory(e.target.value)}
                        className="input-recessed w-full"
                      >
                        <option value="">Select a category</option>
                        {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Receipt Number</label>
                      <input
                        type="text"
                        value={modalReceipt}
                        onChange={(e) => setModalReceipt(e.target.value)}
                        className="input-recessed w-full"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Description</label>
                      <textarea
                        value={modalDesc}
                        onChange={(e) => setModalDesc(e.target.value)}
                        className="input-recessed w-full"
                        rows={2}
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Receipt *</label>
                      <div
                        className="border-2 border-dashed border-[#C5C6D2] p-6 text-center cursor-pointer hover:border-[#234B6E] transition-all group"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const file = Array.from(e.dataTransfer.files).find((f) => {
                            const ext = '.' + f.name.split('.').pop()?.toLowerCase();
                            return accepted.includes(ext) || f.type.startsWith('image/') || f.type === 'application/pdf';
                          });
                          if (file) {
                            const dt = new DataTransfer();
                            dt.items.add(file);
                            if (fileInputRef.current) {
                              fileInputRef.current.files = dt.files;
                              fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                          }
                        }}
                      >
                        {selectedFile ? (
                          <div className="space-y-2">
                            {selectedFile.type === 'application/pdf' ? (
                              <div className="mx-auto w-16 h-20 bg-[#FFDAD6] flex items-center justify-center inset-shadow">
                                <span className="text-[#93000A] font-bold text-xs">PDF</span>
                              </div>
                            ) : previewUrl ? (
                              <img src={previewUrl} alt="Preview" className="mx-auto max-h-32" />
                            ) : null}
                            <p className="text-sm text-[#444650]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); clearFile(); }}
                              className="text-xs font-bold text-[#F23545] hover:text-[#A81C28] uppercase tracking-wider"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <div>
                            <svg className="mx-auto mb-2 text-[#234B6E] group-hover:scale-110 transition-transform" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="17 8 12 3 7 8" />
                              <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <p className="text-xs font-bold text-[#234B6E] uppercase tracking-wider">Upload Receipt</p>
                            <p className="text-[10px] font-label text-[#444650] uppercase tracking-widest mt-1">JPG, PNG, PDF up to 10MB</p>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleFileChange}
                          className="hidden"
                          ref={fileInputRef}
                        />
                      </div>
                      {ocrScanning && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-[#0D1B2A]">
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

            {/* Modal footer */}
            <div className="p-4 flex-shrink-0 flex gap-3 bg-[#F2F4F6]">
              <button
                onClick={submitClaim}
                disabled={modalSaving || ocrScanning}
                className="btn-thick-green flex-1 py-3 text-sm"
              >
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : claimType === 'mileage' ? 'Submit Mileage' : 'Submit Claim'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="btn-thick-white flex-1 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
            </div>{/* close left form panel */}

            {/* Right: Document Preview */}
            {selectedFile && (() => {
              const url = URL.createObjectURL(selectedFile);
              const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
              return (
                <div className="w-1/2 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto bg-[#F2F4F6]">
                    {isPdf ? (
                      <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-full min-h-[400px]" title="Document preview" />
                    ) : (
                      <div className="flex items-center justify-center h-full p-5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Document preview" className="max-w-full max-h-[80vh] object-contain" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            </div>{/* close flex row */}
          </div>
        </div>
      )}

      {/* ═══ BATCH REVIEW MODAL ═══ */}
      {showBatchReview && (
        <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[60] flex items-center justify-center p-4">
          <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-[1200px] max-h-[90vh] flex flex-col">
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[#234B6E]">
              <div className="flex items-center gap-3">
                <h2 className="text-white font-bold text-sm uppercase tracking-wider">
                  Review {batchItems.length} Receipts
                  <span className="ml-2 text-white/50 font-normal normal-case tracking-normal">from 1 image</span>
                </h2>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={batchItems.every(i => i.selected)}
                    onChange={(e) => setBatchItems(prev => prev.map(i => ({ ...i, selected: e.target.checked })))}
                    className="w-3.5 h-3.5 accent-white"
                  />
                  <span className="text-white/70 text-xs">Select All</span>
                </label>
              </div>
              <button onClick={() => { if (!batchSubmitting && confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems(() => []); setBatchPreviewId(null); } }} className="text-white/50 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-hidden flex">
            <div className={`flex-1 overflow-y-auto p-5 space-y-4 ${batchPreviewId ? 'max-w-[60%]' : ''}`}>
              {batchItems.map((item, idx) => (
                <div key={item._id} className={`bg-[#F2F4F6] p-4 space-y-3 cursor-pointer transition-colors ${batchPreviewId === item._id ? 'ring-2 ring-[#234B6E]' : 'hover:bg-[#EBEEF1]'}`} onClick={() => setBatchPreviewId(batchPreviewId === item._id ? null : item._id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => { e.stopPropagation(); setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, selected: e.target.checked } : it)); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 accent-[#234B6E] flex-shrink-0"
                      />
                      <span className="text-xs font-label font-bold text-[#0D1B2A] uppercase tracking-widest">Receipt {idx + 1}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); if (batchPreviewId === item._id) setBatchPreviewId(null); setBatchItems(prev => prev.filter(it => it._id !== item._id)); }} className="text-xs font-bold text-[#F23545] hover:text-[#A81C28] uppercase tracking-wider">Remove</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3" onClick={(e) => { if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') e.stopPropagation(); }}>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Date</label>
                      <input type="date" value={item.claim_date} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, claim_date: v } : it)); }} className="input-recessed w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Amount (RM)</label>
                      <input type="number" step="0.01" value={item.amount} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, amount: v } : it)); }} className="input-recessed w-full text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Merchant</label>
                      <input type="text" value={item.merchant} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, merchant: v } : it)); }} className="input-recessed w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Category</label>
                      <select value={item.category_id} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, category_id: v } : it)); }} className="input-recessed w-full text-sm">
                        <option value="">Select</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Receipt No.</label>
                      <input type="text" value={item.receipt_number} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, receipt_number: v } : it)); }} className="input-recessed w-full text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest mb-1">Description</label>
                      <input type="text" value={item.description} onChange={(e) => { const v = e.target.value; setBatchItems(prev => prev.map(it => it._id === item._id ? { ...it, description: v } : it)); }} className="input-recessed w-full text-sm" placeholder="Optional" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* File preview panel */}
            {batchPreviewId && batchPreviewUrl && (
              <div className="w-[40%] border-l border-[#E0E3E5] flex flex-col bg-[#F2F4F6]">
                <div className="h-10 flex items-center justify-between px-4 border-b border-[#E0E3E5] bg-white">
                  <span className="text-xs font-bold text-[#444650] uppercase tracking-widest">Preview</span>
                  <button onClick={() => setBatchPreviewId(null)} className="text-[#444650] hover:text-[#0D1B2A] text-lg leading-none">&times;</button>
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

            <div className="p-4 flex-shrink-0 flex items-center gap-3 bg-[#F2F4F6] border-t border-[#E0E3E5]">
              <span className="text-xs text-[#444650] mr-auto">{batchItems.filter(i => i.selected).length} of {batchItems.length} selected</span>
              <button
                onClick={submitBatchClaims}
                disabled={batchSubmitting || batchItems.filter(i => i.selected).length === 0}
                className="btn-thick-green px-6 py-3 text-sm"
              >
                {batchSubmitting ? 'Submitting...' : `Submit Selected (${batchItems.filter(i => i.selected).length})`}
              </button>
              <button
                onClick={() => { if (confirm('Discard batch upload? Your reviewed items will be lost.')) { setShowBatchReview(false); setBatchItems(() => []); setBatchPreviewId(null); } }}
                disabled={batchSubmitting}
                className="btn-thick-white px-6 py-3 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ BATCH WARNING MODAL ═══ */}
      {batchWarning && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-[70]" onClick={() => setBatchWarning(null)} />
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" onClick={() => setBatchWarning(null)}>
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
                  <p className="text-xs font-bold text-[#F23545] uppercase tracking-widest">Failed Items</p>
                  {batchWarning.errors.map((d, i) => <p key={i} className="text-xs text-red-700">{d}</p>)}
                </div>
              )}
              <div className="bg-amber-50 border border-amber-300 p-3">
                <p className="text-sm text-amber-800 font-medium">Please review the uploaded claims to ensure all details are correct.</p>
              </div>
            </div>
            <div className="px-5 py-3 bg-[#F2F4F6]">
              <button onClick={() => setBatchWarning(null)} className="btn-thick-navy w-full py-2.5 text-sm font-semibold">
                Got it — I will review
              </button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ CLAIM PREVIEW ═══ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-[#070E1B]/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white shadow-[0px_24px_48px_rgba(26,50,87,0.08)] w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 bg-[#234B6E]">
              <h2 className="text-white font-bold text-sm uppercase tracking-wider">
                {previewClaim.type === 'mileage' ? 'Mileage Claim' : 'Claim Details'}
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
                        category_id: '',
                        receipt_number: previewClaim.receipt_number ?? '',
                        description: previewClaim.description ?? '',
                      });
                    }
                  }}
                  className={`text-xs font-bold uppercase tracking-wider px-3 py-1 transition-colors ${editMode ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
                >
                  {editMode ? 'Cancel' : 'Edit'}
                </button>
                <button onClick={() => setPreviewClaim(null)} className="text-white/50 hover:text-white text-xl leading-none">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewClaim.type === 'mileage' ? (
                <div className="w-full bg-[#D6E0F1] p-4 space-y-1.5 inset-shadow">
                  <p className="text-[10px] font-label font-bold text-[#0D1B2A] uppercase tracking-widest">Mileage Claim</p>
                  <p className="text-sm font-medium text-[#0D1B2A]">{previewClaim.from_location} &rarr; {previewClaim.to_location}</p>
                  <p className="text-sm tabular-nums text-[#0D1B2A]">{previewClaim.distance_km} km</p>
                  {previewClaim.trip_purpose && <p className="text-xs text-[#596372]">{previewClaim.trip_purpose}</p>}
                </div>
              ) : previewClaim.thumbnail_url ? (
                previewClaim.file_url ? (
                  <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain bg-[#F2F4F6] cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain bg-[#F2F4F6]" />
                )
              ) : (
                <div className="w-full h-40 bg-[#F2F4F6] flex items-center justify-center text-[#444650] text-sm inset-shadow">No image available</div>
              )}

              {editMode && editData ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Date</dt>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-recessed w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Merchant</dt>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-recessed w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Amount (RM)</dt>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-recessed w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Category</dt>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-recessed w-full mt-0.5">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Receipt No.</dt>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-recessed w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-[10px] font-label font-bold text-[#444650] uppercase tracking-widest">Description</dt>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-recessed w-full mt-0.5" />
                  </div>
                  <div className="flex items-start gap-2.5 bg-[#FFF3E0] px-4 py-3 inset-shadow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="2" strokeLinecap="round" className="mt-0.5 flex-shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p className="text-body-sm text-[#E65100] leading-relaxed">
                      Saving will reset status to Pending Review and approval to Pending.
                    </p>
                  </div>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-thick-green w-full py-3 text-sm">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </dl>
              ) : (
                <>
                  <dl className="space-y-3">
                    <Field label="Date" value={formatDate(previewClaim.claim_date)} />
                    <Field label="Merchant" value={previewClaim.merchant} />
                    <Field label="Amount" value={formatRM(previewClaim.amount)} />
                    <Field label="Category" value={previewClaim.category_name} />
                    <Field label="Receipt No." value={previewClaim.receipt_number} />
                    <Field label="Description" value={previewClaim.description} />
                  </dl>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[STATUS_CFG[previewClaim.status], PAYMENT_CFG[previewClaim.payment_status]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls} data-tooltip={cfg!.tooltip}>{cfg!.label}</span>
                    ))}
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-[#FFDAD6] p-4 inset-shadow">
                      <p className="text-[10px] font-label font-bold text-[#93000A] uppercase tracking-widest mb-1.5">Rejection Reason</p>
                      <p className="text-body-md text-[#93000A] leading-relaxed">{previewClaim.rejection_reason}</p>
                    </div>
                  )}
                  {previewClaim.file_url && (
                    <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-label-md text-[#234B6E] font-bold hover:opacity-80">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      View full document
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
          </div>
        </>
      )}


    </>
  );
}
