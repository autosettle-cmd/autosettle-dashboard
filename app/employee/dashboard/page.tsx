'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { usePageTitle } from '@/lib/use-page-title';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  totalSubmitted: number;
  pendingApproval: number;
  approvedThisMonth: number;
  approvedAmountThisMonth: string;
}

interface ClaimRow {
  id: string;
  claim_date: string;
  merchant: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  payment_status: string;
  category_name: string;
  receipt_number: string | null;
  description: string | null;
  rejection_reason: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  confidence: string;
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

function formatDate(val: string) {
  if (!val) return '';
  const d = new Date(val);
  return [
    d.getUTCDate().toString().padStart(2, '0'),
    (d.getUTCMonth() + 1).toString().padStart(2, '0'),
    d.getUTCFullYear(),
  ].join('/');
}

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid: { label: 'Unpaid', cls: 'badge-gray' },
  paid:   { label: 'Paid',   cls: 'badge-purple' },
};

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-label-sm uppercase text-ds-text-secondary">{label}</dt>
      <dd className="text-body-md text-ds-text mt-0.5">{value}</dd>
    </div>
  );
}


// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  usePageTitle('Dashboard');
  const { data: session } = useSession();

  const [stats, setStats] = useState<Stats | null>(null);
  const [recentClaims, setRecentClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<{ claim_date: string; merchant: string; amount: string; category_id: string; receipt_number: string; description: string } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState('');
  const [modalMerchant, setModalMerchant] = useState('');
  const [modalAmount, setModalAmount] = useState('');
  const [modalCategory, setModalCategory] = useState('');
  const [modalReceipt, setModalReceipt] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [modalError, setModalError] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [ocrScanning, setOcrScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  // Load categories once on mount (needed for OCR + edit mode)
  useEffect(() => {
    fetch('/api/employee/categories')
      .then((r) => r.json())
      .then((j) => setCategories(j.data ?? []))
      .catch(console.error);
  }, []);

  const saveEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/employee/claims/${previewClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) { setEditMode(false); setEditData(null); setPreviewClaim(null); refresh(); }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  // Cleanup blob URL on unmount
  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

  // Load stats
  useEffect(() => {
    fetch('/api/employee/stats')
      .then((r) => r.json())
      .then((j) => { if (j.data) setStats(j.data); })
      .catch(console.error);
  }, [refreshKey]);

  // Load recent claims (max 5)
  useEffect(() => {
    fetch('/api/employee/claims')
      .then((r) => r.json())
      .then((j) => {
        setRecentClaims((j.data ?? []).slice(0, 5));
        setLoadingClaims(false);
      })
      .catch((e) => { console.error(e); setLoadingClaims(false); });
  }, [refreshKey]);

  // ─── Drag & drop claim ─────────────────────────────────────────────────────

  const accepted = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif'];

  function todayStr() {
    const d = new Date();
    return [d.getFullYear(), (d.getMonth() + 1).toString().padStart(2, '0'), d.getDate().toString().padStart(2, '0')].join('-');
  }

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return accepted.includes(ext) || f.type.startsWith('image/') || f.type === 'application/pdf';
    });
    if (droppedFiles.length === 0) return;

    const file = droppedFiles[0];
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory(categories.length === 1 ? categories[0].id : '');
    setModalReceipt('');
    setModalDesc('');
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setModalError('');
    setModalSaving(false);
    setShowModal(true);

    // Trigger OCR scan
    setOcrScanning(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categories', JSON.stringify(categories.map((c: { name: string }) => c.name)));
        fd.append('context', 'claim');

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
        if (f.notes) setModalDesc(f.notes);
        if (f.category) {
          const match = categories.find((c: { id: string; name: string }) => c.name.toLowerCase() === f.category.toLowerCase());
          if (match) setModalCategory(match.id);
        }
      }
    } catch (err) {
      console.error('OCR extraction failed:', err);
    } finally {
      setOcrScanning(false);
    }
  };

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
      fd.append('categories', JSON.stringify(categories.map((c) => c.name)));
        fd.append('context', 'claim');

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

  const submitClaim = async () => {
    if (!modalDate || !modalMerchant.trim() || !modalAmount || !modalCategory || !selectedFile) {
      setModalError('Date, merchant, amount, category, and receipt photo are required.');
      return;
    }

    setModalSaving(true);
    setModalError('');

    try {
      const fd = new FormData();
      fd.append('claim_date', modalDate);
      fd.append('merchant', modalMerchant.trim());
      fd.append('amount', modalAmount);
      fd.append('category_id', modalCategory);
      if (modalReceipt.trim()) fd.append('receipt_number', modalReceipt.trim());
      if (modalDesc.trim()) fd.append('description', modalDesc.trim());
      if (selectedFile) fd.append('file', selectedFile);

      const res = await fetch('/api/employee/claims', { method: 'POST', body: fd });
      const json = await res.json();

      if (!res.ok) {
        setModalError(json.error || 'Failed to submit claim');
        setModalSaving(false);
        return;
      }

      setShowModal(false);
      refresh();
      setSuccessMsg('Claim submitted successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  // ─── Greeting based on time ────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = session?.user?.name?.split(' ')[0] ?? '';

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-surface-base">

      <Sidebar role="employee" />

      {/* ═══ MAIN ═══ */}
      <div
        className="flex-1 flex flex-col overflow-hidden relative"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node)) return; setDragOver(false); }}
        onDrop={handleDrop}
      >

        {dragOver && (
          <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-400 rounded-lg z-30 flex items-center justify-center pointer-events-none">
            <p className="text-blue-600 font-semibold text-lg">Drop receipt to submit claim</p>
          </div>
        )}

        {/* Header — tonal layering, no border */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 bg-surface-card">
          <div>
            <h1 className="text-title-md text-ds-text tracking-tight">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-label-sm text-ds-text-muted mt-0.5">
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <Link href="/employee/claims" className="btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Claim
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-8">

          {/* ── Stats ─────────────────────────────────────── */}
          <div className="card-stagger grid grid-cols-4 gap-5 mb-8">
            <StatCard
              label="Total Submitted"
              value={stats?.totalSubmitted ?? null}
              color="default"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              }
            />
            <StatCard
              label="Pending Approval"
              value={stats?.pendingApproval ?? null}
              color="amber"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              }
            />
            <StatCard
              label="Approved This Month"
              value={stats?.approvedThisMonth ?? null}
              color="green"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              }
            />
            <StatCard
              label="Total Approved"
              value={stats ? formatRM(stats.approvedAmountThisMonth) : null}
              sublabel="This month"
              color="green"
              icon={
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
          </div>

          {/* ── Recent Submissions ─────────────────────────── */}
          <div className="ds-card overflow-hidden p-0">
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-ds-md bg-surface-low flex items-center justify-center text-ds-text-muted">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-title-sm text-ds-text">Recent Submissions</h2>
                  <p className="text-label-sm text-ds-text-muted mt-0.5">Your latest expense claims</p>
                </div>
              </div>
              <Link
                href="/employee/claims"
                className="flex items-center gap-1.5 text-label-md text-primary transition-colors duration-200 hover:opacity-80"
              >
                View all
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>

            {loadingClaims ? (
              <div className="px-6 py-16 text-center">
                <div className="inline-flex items-center gap-2 text-body-md text-ds-text-muted">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading claims...
                </div>
              </div>
            ) : recentClaims.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="w-12 h-12 rounded-ds-lg bg-surface-low flex items-center justify-center mx-auto mb-3 text-ds-text-muted">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <p className="text-body-md font-medium text-ds-text-secondary">No claims submitted yet</p>
                <p className="text-body-sm text-ds-text-muted mt-1">Submit your first expense claim to get started.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="ds-table-header text-left">
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Merchant</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Approval</th>
                  </tr>
                </thead>
                <tbody className="table-stagger">
                  {recentClaims.map((c) => {
                    const sCfg = STATUS_CFG[c.status];
                    const aCfg = APPROVAL_CFG[c.approval];
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setPreviewClaim(c)}
                        className="ds-table-row text-body-md cursor-pointer group"
                      >
                        <td className="px-6 py-3.5 text-ds-text-secondary tabular-nums">{formatDate(c.claim_date)}</td>
                        <td className="px-6 py-3.5">
                          <span className="text-ds-text font-medium group-hover:text-primary transition-colors duration-200">
                            {c.merchant}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-ds-text font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-6 py-3.5">
                          {sCfg && <span className={sCfg.cls}>{sCfg.label}</span>}
                        </td>
                        <td className="px-6 py-3.5">
                          {aCfg && <span className={aCfg.cls}>{aCfg.label}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </main>
      </div>

      {/* ═══ SUCCESS TOAST ═══ */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-[70] bg-green-50 border border-green-200 rounded-lg p-3 shadow-lg">
          <p className="text-sm text-green-700">{successMsg}</p>
        </div>
      )}

      {/* ═══ SUBMIT CLAIM MODAL ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-[#191C1E]">Submit New Claim</h3>
            <p className="text-sm text-[#434654] mt-1 mb-4">Fill in the details below.</p>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Claim Date *</label>
                <input type="date" value={modalDate} onChange={(e) => setModalDate(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Merchant Name *</label>
                <input type="text" value={modalMerchant} onChange={(e) => setModalMerchant(e.target.value)} className="input-field w-full" placeholder="e.g. Grab, Shell, Apple" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Amount (RM) *</label>
                <input type="number" step="0.01" value={modalAmount} onChange={(e) => setModalAmount(e.target.value)} className="input-field w-full" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Category *</label>
                <select value={modalCategory} onChange={(e) => setModalCategory(e.target.value)} className="input-field w-full">
                  <option value="">Select a category</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Receipt Number</label>
                <input type="text" value={modalReceipt} onChange={(e) => setModalReceipt(e.target.value)} className="input-field w-full" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-label-sm font-semibold text-[#8E9196] uppercase tracking-wide mb-1">Description</label>
                <textarea value={modalDesc} onChange={(e) => setModalDesc(e.target.value)} className="input-field w-full" rows={2} placeholder="Optional" />
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
                      <button type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-[#434654]">Click or drag to upload receipt</p>
                      <p className="text-xs text-[#8E9196] mt-1">JPG, PNG, PDF up to 10MB</p>
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
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={submitClaim} disabled={modalSaving || ocrScanning} className="btn-primary flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
                {ocrScanning ? 'Scanning...' : modalSaving ? 'Submitting...' : 'Submit Claim'}
              </button>
              <button onClick={() => setShowModal(false)} disabled={modalSaving} className="flex-1 py-2.5 rounded-lg text-sm font-semibold border border-gray-300 text-[#434654] hover:bg-gray-50 transition-colors disabled:opacity-40">
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
              <h2 className="text-white font-semibold text-sm">Claim Details</h2>
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
                  <button
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="btn-primary w-full py-2.5 rounded-lg text-sm font-semibold"
                  >
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
                    {STATUS_CFG[previewClaim.status] && <span className={STATUS_CFG[previewClaim.status].cls}>{STATUS_CFG[previewClaim.status].label}</span>}
                    {APPROVAL_CFG[previewClaim.approval] && <span className={APPROVAL_CFG[previewClaim.approval].cls}>{APPROVAL_CFG[previewClaim.approval].label}</span>}
                    {PAYMENT_CFG[previewClaim.payment_status] && <span className={PAYMENT_CFG[previewClaim.payment_status].cls}>{PAYMENT_CFG[previewClaim.payment_status].label}</span>}
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, sublabel, value, color, icon }: {
  label: string;
  sublabel?: string;
  value: string | number | null;
  color: 'default' | 'amber' | 'green';
  icon?: React.ReactNode;
}) {
  const accent = {
    default: { iconBg: 'bg-[#E6E8EA]',    iconText: 'text-[#434654]',        value: 'text-ds-text' },
    amber:   { iconBg: 'bg-[#FFF3E0]',    iconText: 'text-[#E65100]',        value: 'text-[#E65100]' },
    green:   { iconBg: 'bg-[#E8F5E9]',    iconText: 'text-[#1B5E20]',        value: 'text-[#1B5E20]' },
  }[color];

  return (
    <div className="ds-card transition-all duration-300 hover:-translate-y-0.5 group">
      <div className="flex items-start justify-between mb-4">
        <p className="text-label-md text-ds-text-muted uppercase leading-tight">{label}</p>
        {icon && (
          <div className={`w-9 h-9 rounded-ds-md ${accent.iconBg} ${accent.iconText} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`text-[28px] font-extrabold tracking-tight ${accent.value} stat-number`}>
        {value ?? <span className="text-ds-text-muted">&mdash;</span>}
      </p>
      {sublabel && <p className="text-label-sm text-ds-text-muted mt-1">{sublabel}</p>}
    </div>
  );
}
