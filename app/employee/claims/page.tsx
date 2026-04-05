'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';

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
      <dt className="text-label-sm font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
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

  // Mileage-specific fields
  const [mileageFrom, setMileageFrom]       = useState('');
  const [mileageTo, setMileageTo]           = useState('');
  const [mileageDistance, setMileageDistance] = useState('');
  const [mileagePurpose, setMileagePurpose] = useState('');
  const mileageRate = 0.55;

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

      const res = await fetch('/api/ocr/extract', { method: 'POST', body: fd });
      const json = await res.json();

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex h-screen overflow-hidden bg-[#F7F9FB]`}>

      {/* ═══ SIDEBAR ═══ */}
      <Sidebar role="employee" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white">
          <div>
            <h1 className="text-gray-900 font-bold text-title-lg tracking-tight">My Claims</h1>
            <p className="text-body-sm text-gray-400">{formatDisplayDate()}</p>
          </div>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 animate-in">

          {/* ── Success toast ─────────────────────────────── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          {/* ── Top bar ───────────────────────────────────── */}
          <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-body-md font-semibold text-gray-900">All Claims</h2>
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
              <div className="px-6 py-12 text-center text-sm text-gray-400">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-gray-400">No claims submitted yet.</div>
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
                      <th className="px-6 py-2.5">Approval</th>
                      <th className="px-6 py-2.5">Rejection Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((c) => {
                      const sCfg = STATUS_CFG[c.status];
                      const aCfg = APPROVAL_CFG[c.approval];
                      return (
                        <tr key={c.id} onClick={() => setPreviewClaim(c)} className="group text-body-md hover:bg-[#F2F4F6] transition-colors cursor-pointer">
                          <td className="px-6 py-3 text-gray-500 tabular-nums">{formatDate(c.claim_date)}</td>
                          <td className="px-6 py-3 text-gray-900 font-medium group-hover:text-[var(--accent)] transition-colors duration-200">
                            {c.type === 'mileage' ? (
                              <span className="flex items-center gap-1.5">
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-blue-100 text-blue-600 text-label-sm font-bold flex-shrink-0">M</span>
                                {c.from_location} &rarr; {c.to_location}
                              </span>
                            ) : c.merchant}
                          </td>
                          <td className="px-6 py-3 text-gray-500">{c.category_name}</td>
                          <td className="px-6 py-3 text-gray-900 font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                          <td className="px-6 py-3">
                            {sCfg && <span className={sCfg.cls}>{sCfg.label}</span>}
                          </td>
                          <td className="px-6 py-3">
                            {aCfg && <span className={aCfg.cls}>{aCfg.label}</span>}
                          </td>
                          <td className="px-6 py-3">
                            {c.approval === 'not_approved' && c.rejection_reason ? (
                              <span className="text-xs text-red-600">{c.rejection_reason}</span>
                            ) : (
                              <span className="text-xs text-gray-300">&mdash;</span>
                            )}
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
            <h3 className="text-base font-semibold text-gray-900">Submit New Claim</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Fill in the details below to submit a new expense claim.</p>

            {/* ── Type Toggle ── */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-4">
              <button
                onClick={() => setClaimType('receipt')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${claimType === 'receipt' ? 'bg-[var(--sidebar)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                Receipt Claim
              </button>
              <button
                onClick={() => setClaimType('mileage')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${claimType === 'mileage' ? 'bg-[var(--sidebar)] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
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
                <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Claim Date *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">From *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">To *</label>
                    <input
                      type="text"
                      value={mileageTo}
                      onChange={(e) => setMileageTo(e.target.value)}
                      className="input-field w-full"
                      placeholder="e.g. Shah Alam client office"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Distance (km) *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Purpose *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Merchant Name *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Amount (RM) *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Category *</label>
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
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt Number</label>
                    <input
                      type="text"
                      value={modalReceipt}
                      onChange={(e) => setModalReceipt(e.target.value)}
                      className="input-field w-full"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                    <textarea
                      value={modalDesc}
                      onChange={(e) => setModalDesc(e.target.value)}
                      className="input-field w-full"
                      rows={2}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-label-sm font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt *</label>
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
                          <p className="text-sm text-gray-600">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</p>
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
                          <p className="text-sm text-gray-500">Click or drag to upload receipt</p>
                          <p className="text-xs text-gray-400 mt-1">JPG, PNG, PDF up to 10MB</p>
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
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CLAIM PREVIEW PANEL ═══ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col preview-slide-in">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0" style={{ backgroundColor: 'var(--sidebar)' }}>
              <h2 className="text-white font-semibold text-sm">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
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
                <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg" />
              ) : (
                <div className="w-full h-40 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image available</div>
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
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Saving will reset status to Pending Review and approval to Pending.
                  </p>
                </div>
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
                    {[STATUS_CFG[previewClaim.status], APPROVAL_CFG[previewClaim.approval], PAYMENT_CFG[previewClaim.payment_status]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-label-sm text-gray-400 uppercase tracking-wide font-medium">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH' ? 'text-green-600' :
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
                    <a href={previewClaim.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                      View full document &rarr;
                    </a>
                  )}
                </>
              )}
            </div>

            <div className="p-4 flex-shrink-0 flex gap-3">
              {editMode ? (
                <>
                  <button onClick={saveEdit} disabled={editSaving} className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setEditMode(true);
                    setEditData({
                      claim_date: previewClaim.claim_date.split('T')[0],
                      merchant: previewClaim.merchant,
                      amount: previewClaim.amount,
                      category_id: '',
                      receipt_number: previewClaim.receipt_number ?? '',
                      description: previewClaim.description ?? '',
                    });
                  }}
                  className="btn-primary flex-1 py-2 rounded-lg text-sm font-semibold"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
