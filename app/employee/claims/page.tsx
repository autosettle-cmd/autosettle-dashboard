'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

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

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-[#191C1E] mt-0.5">{value}</dd>
    </div>
  );
}

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

  const [batchSubmitting, setBatchSubmitting] = useState(false);

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
        const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }) => {
          let catId = '';
          if (r.category) {
            const match = categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
            if (match) catId = match.id;
          }
          return {
            file: file!,
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

  const submitBatchClaims = async () => {
    const valid = batchItems.filter((item) => item.merchant && item.amount && item.category_id);
    if (valid.length === 0) return;

    setBatchSubmitting(true);
    let submitted = 0;

    for (const item of valid) {
      try {
        const fd = new FormData();
        fd.append('claim_date', item.claim_date);
        fd.append('merchant', item.merchant.trim());
        fd.append('amount', item.amount);
        fd.append('category_id', item.category_id);
        if (item.receipt_number.trim()) fd.append('receipt_number', item.receipt_number.trim());
        if (item.description.trim()) fd.append('description', item.description.trim());
        fd.append('file', item.file);

        const res = await fetch('/api/employee/claims', { method: 'POST', body: fd });
        if (res.ok) submitted++;
      } catch (err) {
        console.error('Batch submit error:', err);
      }
    }

    setBatchSubmitting(false);
    setShowBatchReview(false);
    setBatchItems([]);
    refresh();
    setSuccessMsg(`${submitted} claim${submitted !== 1 ? 's' : ''} submitted!`);
    setTimeout(() => setSuccessMsg(''), 3000);
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
        const items: BatchClaimItem[] = json.receipts.map((r: { date?: string; merchant?: string; amount?: number; receiptNumber?: string; category?: string; notes?: string }) => {
          let catId = '';
          if (r.category) {
            const match = categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase());
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
    <div className={`flex h-screen overflow-hidden bg-[#F7F9FB]`}>

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="employee" />

      {/* ═══ MAIN ═══ */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragOver(false); }}
        onDrop={handleDrop}
      >

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <div>
            <h1 className="text-[#191C1E] font-bold text-title-lg tracking-tight">My Claims</h1>
            <p className="text-body-sm text-[#8E9196]">{formatDisplayDate()}</p>
          </div>
        </header>

        {dragOver && (
          <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-lg z-30 flex items-center justify-center pointer-events-none">
            <p className="text-blue-600 font-semibold text-lg">Drop receipt to submit claim</p>
          </div>
        )}

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Success toast ─────────────────────────────── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          {/* ── Top bar ───────────────────────────────────── */}
          <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-body-md font-semibold text-[#191C1E]">All Claims</h2>
            <button
              onClick={openModal}
              className="btn-primary text-sm px-4 py-2 rounded-lg font-medium"
            >
              Submit New Claim
            </button>
          </div>

          {/* ── Table ─────────────────────────────────────── */}
          <div className="bg-white rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="px-6 py-12 text-center text-sm text-[#8E9196]">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-[#8E9196]">No claims submitted yet.</div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full">
                  <thead>
                    <tr className="ds-table-header text-left">
                      <th className="px-6 py-2.5">Date</th>
                      <th className="px-6 py-2.5">Merchant</th>
                      <th className="px-6 py-2.5">Category</th>
                      <th className="px-6 py-2.5 text-right">Amount</th>
                      <th className="px-6 py-2.5">Status</th>
                      <th className="px-6 py-2.5">Reimbursed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((c) => {
                      const sCfg = STATUS_CFG[c.status];
                      const _aCfg = APPROVAL_CFG[c.approval];
                      return (
                        <tr key={c.id} onClick={() => setPreviewClaim(c)} className="group text-body-md hover:bg-[#F2F4F6] transition-colors cursor-pointer">
                          <td className="px-6 py-3 text-[#434654] tabular-nums">{formatDate(c.claim_date)}</td>
                          <td className="px-6 py-3 text-[#191C1E] font-medium group-hover:text-[var(--accent)] transition-colors duration-200">
                            {c.type === 'mileage' ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-blue-600 text-label-sm font-bold flex-shrink-0">M</span>
                                {c.from_location} &rarr; {c.to_location}
                              </span>
                            ) : c.merchant}
                          </td>
                          <td className="px-6 py-3 text-[#434654]">{c.category_name}</td>
                          <td className="px-6 py-3 text-[#191C1E] font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                          <td className="px-6 py-3">
                            {sCfg && <span className={sCfg.cls}>{sCfg.label}</span>}
                          </td>
                          <td className="px-6 py-3">
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
          </div>

        </main>
      </div>

      {/* ═══ SUBMIT CLAIM MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-[#191C1E]">Submit New Claim</h3>
            <p className="text-sm text-[#434654] mt-1 mb-4">Fill in the details below to submit a new expense claim.</p>

            {/* Document preview */}
            {selectedFile && (() => {
              const url = URL.createObjectURL(selectedFile);
              const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
              return (
                <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50 mb-4">
                  {isPdf ? (
                    <iframe src={`${url}#toolbar=0&navpanes=0`} className="w-full h-[300px]" title="Document preview" />
                  ) : (
                    <img src={url} alt="Document preview" className="w-full max-h-[300px] object-contain" />
                  )}
                </div>
              );
            })()}

            {/* ── Type Toggle ── */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
              <button
                onClick={() => setClaimType('receipt')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${claimType === 'receipt' ? 'bg-[var(--sidebar)] text-white' : 'bg-white text-[#434654] hover:bg-gray-50'}`}
              >
                Receipt Claim
              </button>
              <button
                onClick={() => setClaimType('mileage')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${claimType === 'mileage' ? 'bg-[var(--sidebar)] text-white' : 'bg-white text-[#434654] hover:bg-gray-50'}`}
              >
                Mileage Claim
              </button>
            </div>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Claim Date *</label>
                <input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="input-field w-full"
                  required
                />
              </div>

              {claimType === 'mileage' ? (
                <>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">From *</label>
                    <input
                      type="text"
                      value={mileageFrom}
                      onChange={(e) => setMileageFrom(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. PJ Office"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">To *</label>
                    <input
                      type="text"
                      value={mileageTo}
                      onChange={(e) => setMileageTo(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. Shah Alam client office"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Distance (km) *</label>
                    <input
                      type="number"
                      value={mileageDistance}
                      onChange={(e) => setMileageDistance(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. 25"
                      step="0.1"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Purpose *</label>
                    <input
                      type="text"
                      value={mileagePurpose}
                      onChange={(e) => setMileagePurpose(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. Client meeting with ABC Sdn Bhd"
                    />
                  </div>
                  {mileageDistance && parseFloat(mileageDistance) > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800 font-medium">
                        Amount: RM {(parseFloat(mileageDistance) * mileageRate).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        {mileageDistance} km x RM {mileageRate.toFixed(2)}/km
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Merchant Name *</label>
                    <input
                      type="text"
                      value={modalMerchant}
                      onChange={(e) => setModalMerchant(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. Petronas, Grab, etc."
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Amount (RM) *</label>
                    <input
                      type="number"
                      value={modalAmount}
                      onChange={(e) => setModalAmount(e.target.value)}
                      className="input-field w-full"
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Category *</label>
                    <select
                      value={modalCategory}
                      onChange={(e) => setModalCategory(e.target.value)}
                      className="input-field w-full"
                    >
                      <option value="">Select a category</option>
                      {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt Number</label>
                    <input
                      type="text"
                      value={modalReceipt}
                      onChange={(e) => setModalReceipt(e.target.value)}
                      className="input-field w-full"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Description</label>
                    <textarea
                      value={modalDesc}
                      onChange={(e) => setModalDesc(e.target.value)}
                      className="input-field w-full"
                      rows={2}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt *</label>
                    <div
                      className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors"
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
                            <div className="mx-auto w-16 h-20 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center">
                              <span className="text-red-500 font-bold text-xs">PDF</span>
                            </div>
                          ) : previewUrl ? (
                            <img src={previewUrl} alt="Preview" className="mx-auto max-h-32 rounded-lg" />
                          ) : null}
                          <p className="text-sm text-[#434654]">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); clearFile(); }}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-[#434654]">Click or drag to upload receipt</p>
                          <p className="text-xs text-[#8E9196] mt-1">JPG, PNG, PDF up to 10MB</p>
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
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : claimType === 'mileage' ? 'Submit Mileage Claim' : 'Submit Claim'}
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
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 rounded-t-lg" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">
                Review {batchItems.length} Receipts
                <span className="ml-2 text-white/60 font-normal">from 1 image</span>
              </h2>
              <button onClick={() => { setShowBatchReview(false); setBatchItems([]); }} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {batchItems.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#191C1E]">Receipt {idx + 1}</span>
                    <button onClick={() => setBatchItems(batchItems.filter((_, i) => i !== idx))} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Date</label>
                      <input type="date" value={item.claim_date} onChange={(e) => { const items = [...batchItems]; items[idx].claim_date = e.target.value; setBatchItems(items); }} className="input-field w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Amount (RM)</label>
                      <input type="number" step="0.01" value={item.amount} onChange={(e) => { const items = [...batchItems]; items[idx].amount = e.target.value; setBatchItems(items); }} className="input-field w-full text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Merchant</label>
                      <input type="text" value={item.merchant} onChange={(e) => { const items = [...batchItems]; items[idx].merchant = e.target.value; setBatchItems(items); }} className="input-field w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Category</label>
                      <select value={item.category_id} onChange={(e) => { const items = [...batchItems]; items[idx].category_id = e.target.value; setBatchItems(items); }} className="input-field w-full text-sm">
                        <option value="">Select</option>
                        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt No.</label>
                      <input type="text" value={item.receipt_number} onChange={(e) => { const items = [...batchItems]; items[idx].receipt_number = e.target.value; setBatchItems(items); }} className="input-field w-full text-sm" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Description</label>
                      <input type="text" value={item.description} onChange={(e) => { const items = [...batchItems]; items[idx].description = e.target.value; setBatchItems(items); }} className="input-field w-full text-sm" placeholder="Optional" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3 border-t">
              <button
                onClick={submitBatchClaims}
                disabled={batchSubmitting || batchItems.length === 0}
                className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
              >
                {batchSubmitting ? 'Submitting...' : `Submit All (${batchItems.length})`}
              </button>
              <button
                onClick={() => { setShowBatchReview(false); setBatchItems([]); }}
                disabled={batchSubmitting}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CLAIM PREVIEW ═══ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={() => setPreviewClaim(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[640px] max-h-[90vh] flex flex-col animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="h-14 flex items-center justify-between px-5 flex-shrink-0 border-b rounded-t-xl" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">
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
                  className={`text-sm px-2.5 py-1 rounded-md transition-colors ${editMode ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
                >
                  {editMode ? 'Cancel' : 'Edit'}
                </button>
                <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewClaim.type === 'mileage' ? (
                <div className="w-full rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-1.5">
                  <p className="text-label-sm font-semibold text-blue-700 uppercase tracking-wide">Mileage Claim</p>
                  <p className="text-sm text-blue-900">{previewClaim.from_location} &rarr; {previewClaim.to_location}</p>
                  <p className="text-sm text-blue-800">{previewClaim.distance_km} km</p>
                  {previewClaim.trip_purpose && <p className="text-xs text-blue-600">{previewClaim.trip_purpose}</p>}
                </div>
              ) : previewClaim.thumbnail_url ? (
                previewClaim.file_url ? (
                  <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer">
                    <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity" />
                  </a>
                ) : (
                  <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
                )
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-[#8E9196] text-sm">No image available</div>
              )}

              {editMode && editData ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Date</dt>
                    <input type="date" value={editData.claim_date} onChange={(e) => setEditData({ ...editData, claim_date: e.target.value })} className="input-field w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Merchant</dt>
                    <input type="text" value={editData.merchant} onChange={(e) => setEditData({ ...editData, merchant: e.target.value })} className="input-field w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Amount (RM)</dt>
                    <input type="number" step="0.01" value={editData.amount} onChange={(e) => setEditData({ ...editData, amount: e.target.value })} className="input-field w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Category</dt>
                    <select value={editData.category_id} onChange={(e) => setEditData({ ...editData, category_id: e.target.value })} className="input-field w-full mt-0.5">
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Receipt No.</dt>
                    <input type="text" value={editData.receipt_number} onChange={(e) => setEditData({ ...editData, receipt_number: e.target.value })} className="input-field w-full mt-0.5" />
                  </div>
                  <div>
                    <dt className="text-label-sm font-medium text-[#8E9196] uppercase tracking-wide">Description</dt>
                    <input type="text" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} className="input-field w-full mt-0.5" />
                  </div>
                  <div className="flex items-start gap-2.5 bg-[#FFF3E0] rounded-lg px-4 py-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E65100" strokeWidth="2" strokeLinecap="round" className="mt-0.5 flex-shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p className="text-body-sm text-[#E65100] leading-relaxed">
                      Saving will reset status to Pending Review and approval to Pending.
                    </p>
                  </div>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-primary w-full py-2.5 rounded-lg text-sm font-semibold">
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
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-[#FFEBEE] rounded-lg p-4">
                      <p className="text-label-md text-[#B71C1C] uppercase mb-1.5">Rejection Reason</p>
                      <p className="text-body-md text-[#B71C1C] leading-relaxed">{previewClaim.rejection_reason}</p>
                    </div>
                  )}
                  {previewClaim.file_url && (
                    <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-label-md text-primary hover:opacity-80">
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

    </div>
  );
}
