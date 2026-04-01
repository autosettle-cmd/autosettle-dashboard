'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

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

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/employee/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'My Claims',  href: '/employee/claims',    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function EmployeeDashboard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8F9FB]">

      {/* ═══ SIDEBAR ═══ */}
      <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-white/[0.06]" style={{ backgroundColor: '#152237' }}>
        <div className="h-14 flex items-center gap-2 px-5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#A60201' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="text-white font-bold text-base tracking-tight">Autosettle</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map(({ label, href, icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center gap-2.5 h-9 px-3 rounded-md text-[13px] font-medium transition-all duration-150 ${
                  active
                    ? 'text-white bg-white/[0.1]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full" style={{ backgroundColor: '#A60201' }} />
                )}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d={icon} />
                </svg>
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-xs font-bold">
              {(session?.user?.name ?? '?')[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-[13px] font-medium truncate">{session?.user?.name ?? '—'}</p>
              <p className="text-white/35 text-[11px] capitalize">{session?.user?.role ?? ''}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="mt-3 w-full text-[11px] text-white/40 hover:text-white/70 py-1.5 px-2 rounded-md border border-white/[0.08] hover:border-white/20 hover:bg-white/[0.03] transition-all text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 flex-shrink-0 flex items-center justify-between px-6 bg-white border-b border-gray-100">
          <h1 className="text-gray-900 font-semibold text-[15px]">Dashboard</h1>
          <p className="text-gray-400 text-xs">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-6 animate-in">

          {/* ── Stats ─────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Submitted"        value={stats?.totalSubmitted ?? null}    color="default"  />
            <StatCard label="Pending Approval"       value={stats?.pendingApproval ?? null}   color="amber" />
            <StatCard label="Approved This Month"    value={stats?.approvedThisMonth ?? null} color="green" />
            <StatCard label="Total Approved (RM)"    value={stats ? formatRM(stats.approvedAmountThisMonth) : null} color="green" />
          </div>

          {/* ── Recent Submissions ─────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
              <h2 className="text-[13px] font-semibold text-gray-900">Recent Submissions</h2>
              <Link
                href="/employee/claims"
                className="text-[12px] font-medium hover:underline transition-colors"
                style={{ color: '#A60201' }}
              >
                View all claims &rarr;
              </Link>
            </div>

            {loadingClaims ? (
              <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
            ) : recentClaims.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm text-gray-400">No claims submitted yet</p>
                <p className="text-xs text-gray-300 mt-1">Submit your first expense claim to get started.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-5 py-2.5">Merchant</th>
                    <th className="px-5 py-2.5 text-right">Amount</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5">Approval</th>
                  </tr>
                </thead>
                <tbody>
                  {recentClaims.map((c, i) => {
                    const sCfg = STATUS_CFG[c.status];
                    const aCfg = APPROVAL_CFG[c.approval];
                    return (
                      <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-[13px] hover:bg-gray-50/50 transition-colors cursor-pointer ${i < recentClaims.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <td className="px-5 py-3 text-gray-500 tabular-nums">{formatDate(c.claim_date)}</td>
                        <td className="px-5 py-3 text-gray-900 font-medium">{c.merchant}</td>
                        <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                        <td className="px-5 py-3">
                          {sCfg && <span className={sCfg.cls}>{sCfg.label}</span>}
                        </td>
                        <td className="px-5 py-3">
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
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPreviewClaim(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Claim Details</h2>
              <button onClick={() => setPreviewClaim(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewClaim.thumbnail_url ? (
                <img src={previewClaim.thumbnail_url} alt="Receipt" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image</div>
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
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
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
                    {STATUS_CFG[previewClaim.status] && <span className={STATUS_CFG[previewClaim.status].cls}>{STATUS_CFG[previewClaim.status].label}</span>}
                    {APPROVAL_CFG[previewClaim.approval] && <span className={APPROVAL_CFG[previewClaim.approval].cls}>{APPROVAL_CFG[previewClaim.approval].label}</span>}
                    {PAYMENT_CFG[previewClaim.payment_status] && <span className={PAYMENT_CFG[previewClaim.payment_status].cls}>{PAYMENT_CFG[previewClaim.payment_status].label}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">Confidence</span>
                    <span className={`text-xs font-semibold ${
                      previewClaim.confidence === 'HIGH' ? 'text-green-600' :
                      previewClaim.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-red-600'
                    }`}>{previewClaim.confidence}</span>
                  </div>
                  {previewClaim.rejection_reason && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-[11px] font-semibold text-red-700 uppercase tracking-wide mb-1">Rejection Reason</p>
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
            <div className="p-4 border-t flex-shrink-0 flex gap-3">
              {editMode ? (
                <>
                  <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-85" style={{ backgroundColor: '#A60201' }}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
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
                  className="flex-1 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-85"
                  style={{ backgroundColor: '#A60201' }}
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

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, sublabel, value, color }: {
  label: string;
  sublabel?: string;
  value: string | number | null;
  color: 'default' | 'amber' | 'green';
}) {
  const accent = {
    default: { dot: 'bg-gray-300', value: 'text-gray-900' },
    amber:   { dot: 'bg-amber-400', value: 'text-amber-600' },
    green:   { dot: 'bg-emerald-400', value: 'text-emerald-600' },
  }[color];

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className={`text-2xl font-bold tracking-tight ${accent.value}`}>
        {value ?? <span className="text-gray-200">&mdash;</span>}
      </p>
      {sublabel && <p className="text-[11px] text-gray-300 mt-0.5">{sublabel}</p>}
    </div>
  );
}
