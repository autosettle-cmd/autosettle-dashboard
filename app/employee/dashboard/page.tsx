'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Sidebar from '@/components/Sidebar';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

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
      <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}


// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
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

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim]);

  useEffect(() => {
    if (editMode && categories.length === 0) {
      fetch('/api/employee/categories')
        .then((r) => r.json())
        .then((j) => setCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [editMode, categories.length]);

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

  // ─── Greeting based on time ────────────────────────────────────────────────
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = session?.user?.name?.split(' ')[0] ?? '';

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`flex h-screen overflow-hidden bg-[#F5F6F8] ${jakarta.className}`}>

      <Sidebar role="employee" />

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 bg-white border-b border-gray-100/80">
          <div>
            <h1 className="text-gray-900 font-bold text-[17px] tracking-tight">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-gray-400 text-[12px] mt-0.5">
              {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <Link
            href="/employee/claims"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-white text-[13px] font-semibold btn-primary transition-all duration-200"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
          <div
            className="bg-white rounded-xl border border-gray-100/80 overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)' }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-gray-900 tracking-tight">Recent Submissions</h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">Your latest expense claims</p>
                </div>
              </div>
              <Link
                href="/employee/claims"
                className="flex items-center gap-1.5 text-[12px] font-semibold transition-colors duration-200 hover:opacity-80"
                style={{ color: '#A60201' }}
              >
                View all
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>

            {loadingClaims ? (
              <div className="px-6 py-16 text-center">
                <div className="inline-flex items-center gap-2 text-sm text-gray-400">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading claims...
                </div>
              </div>
            ) : recentClaims.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3 text-gray-300">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-500">No claims submitted yet</p>
                <p className="text-xs text-gray-400 mt-1">Submit your first expense claim to get started.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/50">
                    <th className="px-6 py-3">Date</th>
                    <th className="px-6 py-3">Merchant</th>
                    <th className="px-6 py-3 text-right">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Approval</th>
                  </tr>
                </thead>
                <tbody className="table-stagger">
                  {recentClaims.map((c, i) => {
                    const sCfg = STATUS_CFG[c.status];
                    const aCfg = APPROVAL_CFG[c.approval];
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setPreviewClaim(c)}
                        className={`text-[13px] hover:bg-[#FAFBFC] transition-colors duration-150 cursor-pointer group ${
                          i < recentClaims.length - 1 ? 'border-b border-gray-50' : ''
                        }`}
                      >
                        <td className="px-6 py-3.5 text-gray-500 tabular-nums">{formatDate(c.claim_date)}</td>
                        <td className="px-6 py-3.5">
                          <span className="text-gray-900 font-medium group-hover:text-[#A60201] transition-colors duration-200">
                            {c.merchant}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-gray-900 font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
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

      {/* ═══ CLAIM PREVIEW ═══ */}
      {previewClaim && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 transition-opacity" onClick={() => setPreviewClaim(null)} />
          <div
            className="fixed right-0 top-0 h-screen w-[420px] bg-white z-50 flex flex-col preview-slide-in"
            style={{ boxShadow: '-8px 0 30px rgba(0,0,0,0.08)' }}
          >
            {/* Preview header */}
            <div
              className="h-16 flex items-center justify-between px-5 flex-shrink-0"
              style={{ backgroundColor: '#152237' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <h2 className="text-white font-bold text-[14px] tracking-tight">Claim Details</h2>
              </div>
              <button
                onClick={() => setPreviewClaim(null)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all duration-200"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Preview body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {previewClaim.thumbnail_url ? (
                <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
                  <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain" />
                </div>
              ) : (
                <div className="w-full h-40 rounded-xl border border-gray-100 bg-gray-50 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="text-xs">No image</span>
                </div>
              )}

              {editMode && editData ? (
                <div className="space-y-4">
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
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" className="mt-0.5 flex-shrink-0">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Saving will reset status to Pending Review and approval to Pending.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="space-y-4">
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
                  <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Confidence</span>
                    <span className={`text-xs font-bold ${
                      previewClaim.confidence === 'HIGH' ? 'text-green-600' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    }`}>{previewClaim.confidence}</span>
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                      <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-1.5">Rejection Reason</p>
                      <p className="text-sm text-red-700 leading-relaxed">{previewClaim.rejection_reason}</p>
                    </div>
                  )}
                  {previewClaim.file_url && (
                    <a
                      href={previewClaim.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs font-medium transition-colors duration-200 hover:opacity-80"
                      style={{ color: '#A60201' }}
                    >
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

            {/* Preview footer */}
            <div className="p-5 border-t flex-shrink-0 flex gap-3">
              {editMode ? (
                <>
                  <button
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all duration-200 btn-primary"
                  >
                    {editSaving ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Saving...
                      </span>
                    ) : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => { setEditMode(false); setEditData(null); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors duration-200"
                  >
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
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-200 btn-primary flex items-center justify-center gap-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit Claim
                </button>
              )}
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
    default: { iconBg: 'bg-gray-100', iconText: 'text-gray-500', value: 'text-gray-900', border: 'border-gray-100/80' },
    amber:   { iconBg: 'bg-amber-50', iconText: 'text-amber-500', value: 'text-amber-600', border: 'border-amber-100/50' },
    green:   { iconBg: 'bg-emerald-50', iconText: 'text-emerald-500', value: 'text-emerald-600', border: 'border-emerald-100/50' },
  }[color];

  return (
    <div
      className={`bg-white rounded-xl border ${accent.border} p-5 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 group`}
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.02)' }}
    >
      <div className="flex items-start justify-between mb-4">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider leading-tight">{label}</p>
        {icon && (
          <div className={`w-9 h-9 rounded-lg ${accent.iconBg} ${accent.iconText} flex items-center justify-center transition-transform duration-300 group-hover:scale-110`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`text-[26px] font-extrabold tracking-tight ${accent.value} stat-number`}>
        {value ?? <span className="text-gray-200">&mdash;</span>}
      </p>
      {sublabel && <p className="text-[11px] text-gray-400 mt-1">{sublabel}</p>}
    </div>
  );
}
