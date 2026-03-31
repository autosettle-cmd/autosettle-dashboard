'use client';

import { useSession } from 'next-auth/react';
import { useLogout } from '@/lib/use-logout';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClaimStats {
  total: number;
  totalAmount: string;
  pendingReview: number;
  pendingAmount: string;
  reviewedThisMonth: number;
  reviewedAmount: string;
}

interface InvoiceStats {
  total: number;
  totalAmount: string;
  pendingReview: number;
  overdueCount: number;
  overdueAmount: string;
}

interface ReceiptStats {
  total: number;
  totalAmount: string;
  unlinked: number;
  unlinkedAmount: string;
  linked: number;
  linkedAmount: string;
}

interface Stats {
  claims: ClaimStats;
  receipts: ReceiptStats;
  invoices: InvoiceStats;
}

interface ClaimRow {
  id: string;
  claim_date: string;
  employee_name: string;
  merchant: string;
  category_name: string;
  category_id: string;
  amount: string;
  status: 'pending_review' | 'reviewed';
  approval: string;
  payment_status: string;
  confidence: string;
  receipt_number: string | null;
  description: string | null;
  thumbnail_url: string | null;
  file_url: string | null;
  rejection_reason: string | null;
}

interface InvoiceRow {
  id: string;
  vendor_name_raw: string;
  invoice_number: string | null;
  issue_date: string;
  due_date: string | null;
  total_amount: string;
  amount_paid: string;
  category_name: string;
  status: string;
  payment_status: string;
  supplier_name: string | null;
  supplier_link_status: string;
  confidence: string;
  thumbnail_url: string | null;
  file_url: string | null;
}

const PAYMENT_CFG: Record<string, { label: string; cls: string }> = {
  unpaid:         { label: 'Unpaid',  cls: 'badge-gray'   },
  partially_paid: { label: 'Partial', cls: 'badge-amber'  },
  paid:           { label: 'Paid',    cls: 'badge-purple' },
};

const LINK_CFG: Record<string, { label: string; cls: string }> = {
  confirmed:    { label: 'Confirmed',   cls: 'badge-green' },
  auto_matched: { label: 'Suggested',   cls: 'badge-amber' },
  unmatched:    { label: 'Unconfirmed', cls: 'badge-red'   },
};

interface EditData {
  claim_date?: string;
  merchant: string;
  amount: string;
  category_id: string;
  receipt_number: string;
  description: string;
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

function formatRM(val: string | number) {
  return `RM ${Number(val).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Dashboard',  href: '/admin/dashboard',  icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1' },
  { label: 'Claims',     href: '/admin/claims',     icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Invoices',   href: '/admin/invoices',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Suppliers',  href: '/admin/suppliers',  icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { label: 'Employees',  href: '/admin/employees',  icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197' },
  { label: 'Categories', href: '/admin/categories', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const handleLogout = useLogout();

  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingClaims, setPendingClaims] = useState<ClaimRow[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [pendingInvoices, setPendingInvoices] = useState<InvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [unlinkedReceipts, setUnlinkedReceipts] = useState<ClaimRow[]>([]);
  const [loadingReceipts, setLoadingReceipts] = useState(true);
  const [activeTab, setActiveTab] = useState<'claims' | 'receipts' | 'invoices'>('claims');
  const [page, setPage] = useState(0);
  const [previewClaim, setPreviewClaim] = useState<ClaimRow | null>(null);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRow | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const PAGE_SIZE = 20;

  const refresh = () => setRefreshKey((k) => k + 1);

  // Reset edit mode when preview changes
  useEffect(() => { setEditMode(false); setEditData(null); }, [previewClaim, previewInvoice]);

  // Fetch categories when entering edit mode
  useEffect(() => {
    if (editMode && categories.length === 0) {
      fetch('/api/admin/categories')
        .then((r) => r.json())
        .then((j) => setCategories(j.data ?? []))
        .catch(console.error);
    }
  }, [editMode, categories.length]);

  // Load stats
  useEffect(() => {
    fetch('/api/admin/claims/stats')
      .then((r) => r.json())
      .then((j) => { if (j.data) setStats(j.data); })
      .catch(console.error);
  }, [refreshKey]);

  // Load pending claims
  useEffect(() => {
    fetch('/api/admin/claims?status=pending_review&type=claim')
      .then((r) => r.json())
      .then((j) => {
        setPendingClaims(j.data ?? []);
        setLoadingClaims(false);
      })
      .catch((e) => { console.error(e); setLoadingClaims(false); });
  }, [refreshKey]);

  // Load unlinked receipts
  useEffect(() => {
    fetch('/api/admin/claims?type=receipt')
      .then((r) => r.json())
      .then((j) => {
        const all = j.data ?? [];
        setUnlinkedReceipts(all.filter((r: ClaimRow & { linked_payment_count: number }) => r.linked_payment_count === 0));
        setLoadingReceipts(false);
      })
      .catch((e) => { console.error(e); setLoadingReceipts(false); });
  }, [refreshKey]);

  // Load pending invoices
  useEffect(() => {
    fetch('/api/admin/invoices?status=pending_review')
      .then((r) => r.json())
      .then((j) => {
        setPendingInvoices(j.data ?? []);
        setLoadingInvoices(false);
      })
      .catch((e) => { console.error(e); setLoadingInvoices(false); });
  }, [refreshKey]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const saveClaimEdit = async () => {
    if (!previewClaim || !editData) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/admin/claims/${previewClaim.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        setEditMode(false);
        setEditData(null);
        setPreviewClaim(null);
        refresh();
      }
    } catch (e) { console.error(e); }
    finally { setEditSaving(false); }
  };

  const markAsReviewed = async (id: string) => {
    try {
      const res = await fetch('/api/admin/claims/batch', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimIds: [id], action: 'review' }),
      });
      if (res.ok) {
        setPreviewClaim(null);
        refresh();
      }
    } catch (e) { console.error(e); }
  };

  const markInvoiceReviewed = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'reviewed' }),
      });
      if (res.ok) { setPreviewInvoice(null); refresh(); }
    } catch (e) { console.error(e); }
  };

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
          <div className="grid grid-cols-3 gap-4 mb-2">
            <StatCard label="Total Claims"            value={stats?.claims.total ?? null}              amount={stats ? formatRM(stats.claims.totalAmount) : null}     color="default" href="/admin/claims" />
            <StatCard label="Pending Review (Claims)"  value={stats?.claims.pendingReview ?? null}     amount={stats ? formatRM(stats.claims.pendingAmount) : null}   color="amber"   href="/admin/claims?status=pending_review" />
            <StatCard label="Reviewed This Month"      value={stats?.claims.reviewedThisMonth ?? null} amount={stats ? formatRM(stats.claims.reviewedAmount) : null}  color="green"   href="/admin/claims?status=reviewed" />
          </div>
          <div className="grid grid-cols-3 gap-4 mb-2">
            <StatCard label="Total Receipts"  value={stats?.receipts.total ?? null}    amount={stats ? formatRM(stats.receipts.totalAmount) : null}    color="default" />
            <StatCard label="Unlinked"        value={stats?.receipts.unlinked ?? null} amount={stats ? formatRM(stats.receipts.unlinkedAmount) : null} color="amber"   />
            <StatCard label="Linked"          value={stats?.receipts.linked ?? null}   amount={stats ? formatRM(stats.receipts.linkedAmount) : null}   color="green"   />
          </div>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Invoices"          value={stats?.invoices.total ?? null}         amount={stats ? formatRM(stats.invoices.totalAmount) : null}   color="default" href="/admin/invoices" />
            <StatCard label="Pending Review (Invoices)" value={stats?.invoices.pendingReview ?? null} amount={null}                                                   color="amber"   href="/admin/invoices?status=pending_review" />
            <StatCard label="Overdue"                  value={stats?.invoices.overdueCount ?? null}  amount={stats ? formatRM(stats.invoices.overdueAmount) : null} color="green"   href="/admin/invoices?overdue=true" />
          </div>

          {/* ── Needs Attention ────────────────────────────── */}
          <div className="bg-white rounded-lg border border-gray-100 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {/* Tab header */}
            <div className="flex items-center justify-between px-5 border-b border-gray-100">
              <div className="flex gap-0">
                {([
                  ['claims', 'Claims', pendingClaims.length],
                  ['receipts', 'Receipts', unlinkedReceipts.length],
                  ['invoices', 'Invoices', pendingInvoices.length],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); setPage(0); }}
                    className={`relative px-4 py-3 text-[13px] font-semibold transition-colors ${
                      activeTab === key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        activeTab === key ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}
                      </span>
                    )}
                    {activeTab === key && (
                      <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-t-full" style={{ backgroundColor: '#A60201' }} />
                    )}
                  </button>
                ))}
              </div>
              <Link
                href={activeTab === 'claims' ? '/admin/claims' : activeTab === 'receipts' ? '/admin/claims' : '/admin/invoices'}
                className="text-[12px] font-medium hover:underline transition-colors"
                style={{ color: '#A60201' }}
              >
                View all {activeTab} &rarr;
              </Link>
            </div>

            {/* Claims tab */}
            {activeTab === 'claims' && (
              loadingClaims ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
              ) : pendingClaims.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-gray-400">No claims pending review</p>
                  <p className="text-xs text-gray-300 mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-2.5">Date</th>
                        <th className="px-5 py-2.5">Employee</th>
                        <th className="px-5 py-2.5">Merchant</th>
                        <th className="px-5 py-2.5">Category</th>
                        <th className="px-5 py-2.5 text-right">Amount</th>
                        <th className="px-5 py-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingClaims.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((c, i) => {
                        const cfg = STATUS_CFG[c.status];
                        return (
                          <tr key={c.id} onClick={() => setPreviewClaim(c)} className={`text-[13px] hover:bg-gray-50/50 transition-colors cursor-pointer ${i < PAGE_SIZE - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-5 py-3 text-gray-500 tabular-nums">{formatDate(c.claim_date)}</td>
                            <td className="px-5 py-3 text-gray-900 font-medium">{c.employee_name}</td>
                            <td className="px-5 py-3 text-gray-600">{c.merchant}</td>
                            <td className="px-5 py-3 text-gray-500">{c.category_name}</td>
                            <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{formatRM(c.amount)}</td>
                            <td className="px-5 py-3">
                              {cfg && <span className={cfg.cls}>{cfg.label}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination total={pendingClaims.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
              )
            )}

            {/* Receipts tab */}
            {activeTab === 'receipts' && (
              loadingReceipts ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
              ) : unlinkedReceipts.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-gray-400">No unlinked receipts</p>
                  <p className="text-xs text-gray-300 mt-1">All receipts have been linked to payments.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/60 border-b border-gray-100">
                        <th className="px-5 py-2.5 text-left">Date</th>
                        <th className="px-3 py-2.5 text-left">Merchant</th>
                        <th className="px-3 py-2.5 text-right">Amount</th>
                        <th className="px-5 py-2.5 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unlinkedReceipts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r) => (
                        <tr
                          key={r.id}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer text-[13px]"
                          onClick={() => setPreviewClaim(r)}
                        >
                          <td className="px-5 py-2.5 text-gray-500">{formatDate(r.claim_date)}</td>
                          <td className="px-3 py-2.5 text-gray-700 font-medium">{r.merchant}</td>
                          <td className="px-3 py-2.5 text-right text-gray-900 font-semibold tabular-nums">{formatRM(r.amount)}</td>
                          <td className="px-5 py-2.5"><span className="badge-amber">Unlinked</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination total={unlinkedReceipts.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
              )
            )}

            {/* Invoices tab */}
            {activeTab === 'invoices' && (
              loadingInvoices ? (
                <div className="px-5 py-12 text-center text-sm text-gray-400">Loading...</div>
              ) : pendingInvoices.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-sm text-gray-400">No invoices pending review</p>
                  <p className="text-xs text-gray-300 mt-1">You&apos;re all caught up.</p>
                </div>
              ) : (
                <>
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-2.5">Issue Date</th>
                        <th className="px-5 py-2.5">Vendor</th>
                        <th className="px-5 py-2.5">Invoice #</th>
                        <th className="px-5 py-2.5">Due Date</th>
                        <th className="px-5 py-2.5 text-right">Amount</th>
                        <th className="px-5 py-2.5">Payment</th>
                        <th className="px-5 py-2.5">Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingInvoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((inv, i) => {
                        const pmtCfg = PAYMENT_CFG[inv.payment_status];
                        const linkCfg = LINK_CFG[inv.supplier_link_status];
                        return (
                          <tr key={inv.id} onClick={() => setPreviewInvoice(inv)} className={`text-[13px] hover:bg-gray-50/50 transition-colors cursor-pointer ${i < PAGE_SIZE - 1 ? 'border-b border-gray-50' : ''}`}>
                            <td className="px-5 py-3 text-gray-500 tabular-nums">{formatDate(inv.issue_date)}</td>
                            <td className="px-5 py-3 text-gray-900 font-medium">{inv.vendor_name_raw}</td>
                            <td className="px-5 py-3 text-gray-600">{inv.invoice_number ?? '-'}</td>
                            <td className="px-5 py-3 text-gray-500 tabular-nums">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                            <td className="px-5 py-3 text-gray-900 font-semibold text-right tabular-nums">{formatRM(inv.total_amount)}</td>
                            <td className="px-5 py-3">{pmtCfg && <span className={pmtCfg.cls}>{pmtCfg.label}</span>}</td>
                            <td className="px-5 py-3">{linkCfg && <span className={linkCfg.cls}>{linkCfg.label}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <Pagination total={pendingInvoices.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
              )
            )}
          </div>

        </main>
      </div>

      {/* ═══ CLAIM PREVIEW PANEL ═══ */}
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
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image available</div>
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
                  <Field label="Employee" value={previewClaim.employee_name} />
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
                    Saving will reset status to Pending Review and approval to Pending.
                  </p>
                </div>
              ) : (
                <>
                  <dl className="space-y-3">
                    <Field label="Date"        value={formatDate(previewClaim.claim_date)} />
                    <Field label="Merchant"    value={previewClaim.merchant} />
                    <Field label="Employee"    value={previewClaim.employee_name} />
                    <Field label="Category"    value={previewClaim.category_name} />
                    <Field label="Amount"      value={formatRM(previewClaim.amount)} />
                    <Field label="Receipt No." value={previewClaim.receipt_number} />
                    <Field label="Description" value={previewClaim.description} />
                  </dl>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[STATUS_CFG[previewClaim.status], APPROVAL_CFG[previewClaim.approval]].filter(Boolean).map((cfg) => (
                      <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                    ))}
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
                  <button onClick={saveClaimEdit} disabled={editSaving} className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85" style={{ backgroundColor: '#A60201' }}>
                    {editSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button onClick={() => { setEditMode(false); setEditData(null); }} className="flex-1 py-2 rounded-md text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditMode(true);
                      setEditData({
                        claim_date: previewClaim.claim_date.split('T')[0],
                        merchant: previewClaim.merchant,
                        amount: previewClaim.amount,
                        category_id: previewClaim.category_id,
                        receipt_number: previewClaim.receipt_number ?? '',
                        description: previewClaim.description ?? '',
                      });
                    }}
                    className="flex-1 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-85"
                    style={{ backgroundColor: '#A60201' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => markAsReviewed(previewClaim.id)}
                    disabled={previewClaim.status === 'reviewed'}
                    className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                    style={{ backgroundColor: '#152237' }}
                  >
                    Mark as Reviewed
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ═══ INVOICE PREVIEW PANEL ═══ */}
      {previewInvoice && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPreviewInvoice(null)} />
          <div className="fixed right-0 top-0 h-screen w-[400px] bg-white shadow-2xl z-50 flex flex-col">
            <div className="h-14 flex items-center justify-between px-4 flex-shrink-0 border-b" style={{ backgroundColor: '#152237' }}>
              <h2 className="text-white font-semibold text-sm">Invoice Details</h2>
              <button onClick={() => setPreviewInvoice(null)} className="text-white/70 hover:text-white text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {previewInvoice.thumbnail_url ? (
                <img src={previewInvoice.thumbnail_url} alt="Invoice" className="w-full max-h-52 object-contain rounded-lg border border-gray-200" />
              ) : (
                <div className="w-full h-40 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 text-sm">No image available</div>
              )}
              <dl className="space-y-3">
                <Field label="Vendor"        value={previewInvoice.vendor_name_raw} />
                <Field label="Invoice No."   value={previewInvoice.invoice_number} />
                <Field label="Issue Date"    value={formatDate(previewInvoice.issue_date)} />
                <Field label="Due Date"      value={previewInvoice.due_date ? formatDate(previewInvoice.due_date) : null} />
                <Field label="Total Amount"  value={formatRM(previewInvoice.total_amount)} />
                <Field label="Amount Paid"   value={formatRM(previewInvoice.amount_paid)} />
                <Field label="Category"      value={previewInvoice.category_name} />
              </dl>
              <div className="flex flex-wrap gap-2 pt-1">
                {[STATUS_CFG[previewInvoice.status], PAYMENT_CFG[previewInvoice.payment_status]].filter(Boolean).map((cfg) => (
                  <span key={cfg!.label} className={cfg!.cls}>{cfg!.label}</span>
                ))}
              </div>
              {/* Supplier link */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Supplier</span>
                  {(() => {
                    const cfg = LINK_CFG[previewInvoice.supplier_link_status];
                    return cfg ? <span className={cfg.cls}>{cfg.label}</span> : null;
                  })()}
                </div>
                <p className="text-sm font-medium text-gray-900">{previewInvoice.supplier_name ?? previewInvoice.vendor_name_raw}</p>
              </div>
              {previewInvoice.file_url && (
                <a href={previewInvoice.file_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline block">
                  View full document &rarr;
                </a>
              )}
            </div>
            <div className="p-4 border-t flex-shrink-0 flex gap-3">
              <Link
                href="/admin/invoices"
                className="flex-1 py-2 rounded-md text-sm font-semibold text-white text-center transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#A60201' }}
              >
                Open in Invoices
              </Link>
              <button
                onClick={() => markInvoiceReviewed(previewInvoice.id)}
                disabled={previewInvoice.status === 'reviewed'}
                className="flex-1 py-2 rounded-md text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#152237' }}
              >
                Mark as Reviewed
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, amount, color, href }: {
  label: string;
  value: string | number | null;
  amount?: string | null;
  color: 'default' | 'amber' | 'green';
  href?: string;
}) {
  const accent = {
    default: { dot: 'bg-gray-300', value: 'text-gray-900' },
    amber:   { dot: 'bg-amber-400', value: 'text-amber-600' },
    green:   { dot: 'bg-emerald-400', value: 'text-emerald-600' },
  }[color];

  const content = (
    <div className={`bg-white rounded-lg border border-gray-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${href ? 'hover:border-gray-200 hover:shadow-md transition-all cursor-pointer' : ''}`}>
      <div className="flex items-center gap-1.5 mb-3">
        <div className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <div className="flex items-end justify-between">
        <p className={`text-2xl font-bold tracking-tight ${accent.value}`}>
          {value ?? <span className="text-gray-200">&mdash;</span>}
        </p>
        {amount && <p className="text-[13px] font-semibold text-gray-400">{amount}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function Pagination({ total, page, pageSize, onPageChange }: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  if (total <= pageSize) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-50">
      <p className="text-[12px] text-gray-400">
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ─── Field ───────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
    </div>
  );
}
