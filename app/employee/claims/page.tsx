'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimRow {
  id: string;
  claim_date: string;
  merchant: string;
  category_name: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: 'pending_approval' | 'approved' | 'not_approved';
  rejection_reason?: string;
}

interface Category {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  pending_review: { label: 'Pending Review', cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  reviewed:       { label: 'Reviewed',       cls: 'bg-blue-100  text-blue-800  border border-blue-200'  },
};

const APPROVAL_CFG: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Pending',  cls: 'bg-amber-100 text-amber-800 border border-amber-200' },
  approved:         { label: 'Approved', cls: 'bg-green-100 text-green-800 border border-green-200' },
  not_approved:     { label: 'Rejected', cls: 'bg-red-100   text-red-800   border border-red-200'   },
};

const inputCls = 'text-sm border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#152237]/20';

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/employee/dashboard' },
  { label: 'My Claims',  href: '/employee/claims'    },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeClaimsPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  // Data
  const [claims, setClaims]       = useState<ClaimRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal
  const [showModal, setShowModal]           = useState(false);
  const [categories, setCategories]         = useState<Category[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setModalDate(todayStr());
    setModalMerchant('');
    setModalAmount('');
    setModalCategory(categories.length === 1 ? categories[0].id : '');
    setModalReceipt('');
    setModalDesc('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setModalError('');
    setModalSaving(false);
    setShowModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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
      fd.append('receipt_photo', selectedFile);

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
      setSuccessMsg('Claim submitted successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setModalError('Network error. Please try again.');
      setModalSaving(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ═══════════════════════ SIDEBAR ═══════════════════════ */}
      <aside className="w-60 flex-shrink-0 flex flex-col" style={{ backgroundColor: '#152237' }}>
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <span className="text-white font-bold text-xl tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map(({ label, href }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center h-10 px-6 text-sm transition-colors ${
                  active ? 'text-white bg-white/10' : 'text-white/65 hover:text-white hover:bg-white/5'
                }`}
              >
                {active && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-r"
                    style={{ backgroundColor: '#A60201' }}
                  />
                )}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <p className="text-white text-sm font-medium truncate">{session?.user?.name ?? '—'}</p>
          <p className="text-white/50 text-xs mt-0.5 capitalize">{session?.user?.role ?? 'employee'}</p>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-xs text-white/60 hover:text-white py-1.5 px-3 rounded border border-white/20 hover:border-white/40 transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══════════════════════ MAIN ═══════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-16 flex-shrink-0 flex items-center px-6" style={{ backgroundColor: '#152237' }}>
          <h1 className="text-white font-semibold text-lg">My Claims</h1>
        </header>

        <main className="flex-1 overflow-hidden flex flex-col gap-4 p-6 bg-white">

          {/* ── Success toast ─────────────────────────────── */}
          {successMsg && (
            <div className="flex-shrink-0 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">{successMsg}</p>
            </div>
          )}

          {/* ── Top bar ───────────────────────────────────── */}
          <div className="flex items-center justify-between flex-shrink-0">
            <h2 className="text-sm font-semibold text-gray-900">All Claims</h2>
            <button
              onClick={openModal}
              className="text-sm px-4 py-2 rounded-md font-medium text-white transition-opacity hover:opacity-85"
              style={{ backgroundColor: '#A60201' }}
            >
              Submit New Claim
            </button>
          </div>

          {/* ── Table ─────────────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
            {loading ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">Loading...</div>
            ) : claims.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No claims submitted yet.</div>
            ) : (
              <div className="overflow-auto flex-1 min-h-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Merchant</th>
                      <th className="px-5 py-3">Category</th>
                      <th className="px-5 py-3 text-right">Amount</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Approval</th>
                      <th className="px-5 py-3">Rejection Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {claims.map((c) => {
                      const sCfg = STATUS_CFG[c.status];
                      const aCfg = APPROVAL_CFG[c.approval];
                      return (
                        <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                          <td className="px-5 py-3 text-gray-600">{formatDate(c.claim_date)}</td>
                          <td className="px-5 py-3 text-gray-900 font-medium">{c.merchant}</td>
                          <td className="px-5 py-3 text-gray-600">{c.category_name}</td>
                          <td className="px-5 py-3 text-gray-900 font-medium text-right">{formatRM(c.amount)}</td>
                          <td className="px-5 py-3">
                            {sCfg && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${sCfg.cls}`}>
                                {sCfg.label}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {aCfg && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${aCfg.cls}`}>
                                {aCfg.label}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3">
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

      {/* ═══════════════════════ SUBMIT CLAIM MODAL ═══════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-semibold text-gray-900">Submit New Claim</h3>
            <p className="text-sm text-gray-500 mt-1 mb-4">Fill in the details below to submit a new expense claim.</p>

            {modalError && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm text-red-700">{modalError}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Claim Date *</label>
                <input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className={`${inputCls} w-full`}
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Merchant Name *</label>
                <input
                  type="text"
                  value={modalMerchant}
                  onChange={(e) => setModalMerchant(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="e.g. Petronas, Grab, etc."
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Amount (RM) *</label>
                <input
                  type="number"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Category *</label>
                <select
                  value={modalCategory}
                  onChange={(e) => setModalCategory(e.target.value)}
                  className={`${inputCls} w-full`}
                >
                  <option value="">Select a category</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt Number</label>
                <input
                  type="text"
                  value={modalReceipt}
                  onChange={(e) => setModalReceipt(e.target.value)}
                  className={`${inputCls} w-full`}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Description</label>
                <textarea
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                  className={`${inputCls} w-full`}
                  rows={2}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Receipt Photo *</label>
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-gray-400 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {selectedFile ? (
                    <div className="space-y-2">
                      {previewUrl && <img src={previewUrl} alt="Preview" className="mx-auto max-h-32 rounded" />}
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
                      <p className="text-sm text-gray-500">Click or drag to upload receipt photo</p>
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG up to 10MB</p>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    ref={fileInputRef}
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={submitClaim}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                {modalSaving ? 'Submitting...' : 'Submit Claim'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={modalSaving}
                className="flex-1 py-2.5 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
